-- Apply AFTER the existing foundation, to the confirmed staging project only.
-- No production reset, Auth setting or existing user-data rewrite is performed.
begin;

create table public.user_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_key text not null check (char_length(item_key) = 64 and item_key ~ '^[a-f0-9]{64}$'),
  language text not null check (language in ('zh', 'ja', 'en')),
  kind text not null check (kind in ('saved_words', 'review_cards', 'search_history',
    'written_chars', 'learned_radicals', 'learned_kana', 'learned_sounds')),
  written_form text not null check (char_length(written_form) between 1 and 2000),
  reading text not null default '' check (char_length(reading) <= 2000),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 16384),
  observed_at timestamptz not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
create index user_items_owner_order_idx on public.user_items
  (user_id, language, kind, observed_at desc, item_key);
alter table public.user_items enable row level security;
revoke all on public.user_items from public, anon, authenticated;
grant select on public.user_items to authenticated;
grant all on public.user_items to service_role;
create policy user_items_read_own on public.user_items for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()));

-- Private receipts bind a retry UUID to its complete request, not to an
-- account-level "already imported" flag. Another device can import independently.
create table private.guest_import_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  source_fingerprint text not null check (char_length(source_fingerprint) = 64 and source_fingerprint ~ '^[a-f0-9]{64}$'),
  input_hash text not null check (char_length(input_hash) = 64 and input_hash ~ '^[a-f0-9]{64}$'),
  reset_version bigint not null check (reset_version >= 0),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table private.guest_import_receipts enable row level security;
revoke all on private.guest_import_receipts from public, anon, authenticated;
grant all on private.guest_import_receipts to service_role;

create function private.s2s_item_text(value text)
returns text language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(normalize(value, NFC),
    U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g')));
$$;
revoke all on function private.s2s_item_text(text) from public, anon, authenticated;

create function private.s2s_item_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision = old.revision + 1;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.s2s_item_revision() from public, anon, authenticated;
create trigger user_items_revision before update on public.user_items
  for each row execute function private.s2s_item_revision();

-- Definer access is required because clients cannot write learning rows or read
-- private lifecycle state directly. Identity always comes from verified JWT uid.
create function public.s2s_account_snapshot(p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid = auth.uid();
  generation bigint;
  deleting boolean;
  result jsonb;
begin
  if owner is null then raise exception 'ACCOUNT_REQUIRED' using errcode = '42501'; end if;
  if p_expected_user_id is distinct from owner then raise exception 'ACCOUNT_CHANGED' using errcode = '42501'; end if;
  select s.reset_version, s.deleting into generation, deleting
    from private.account_state s where s.user_id = owner for share;
  if not found or deleting then raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501'; end if;
  select jsonb_build_object('schema_version', 1, 'user_id', owner,
    'reset_version', generation::text, 'server_time', now(), 'items',
    coalesce(jsonb_agg(jsonb_build_object(
      'item_key', i.item_key, 'language', i.language, 'kind', i.kind,
      'written_form', i.written_form, 'reading', i.reading, 'data', i.data,
      'observed_at', i.observed_at, 'revision', i.revision::text,
      'created_at', i.created_at, 'updated_at', i.updated_at
    ) order by i.language, i.kind, i.item_key), '[]'::jsonb)) into result
    from public.user_items i where i.user_id = owner;
  return result;
end;
$$;
revoke all on function public.s2s_account_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.s2s_account_snapshot(uuid) to authenticated;

create function public.s2s_import_guest(
  p_expected_user_id uuid,
  p_request_id uuid,
  p_expected_reset_version bigint,
  p_source_fingerprint text,
  p_choice text,
  p_items jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid = auth.uid();
  generation bigint;
  deleting boolean;
  request_hash text;
  receipt private.guest_import_receipts%rowtype;
  item jsonb;
  item_data jsonb;
  item_language text;
  item_kind text;
  written text;
  pronunciation text;
  identity_key text;
  observed timestamptz;
  counter text;
  field text;
  example jsonb;
  seen numeric;
  correct numeric;
  wrong numeric;
  streak numeric;
  previous public.user_items%rowtype;
  original_revisions jsonb;
  added integer = 0;
  updated integer = 0;
  result jsonb;
begin
  if owner is null then raise exception 'ACCOUNT_REQUIRED' using errcode = '42501'; end if;
  -- SDK request authentication can change after client verification but before
  -- fetch selects its token. This is a guard, NEVER a caller-selected write owner.
  if p_expected_user_id is distinct from owner then raise exception 'ACCOUNT_CHANGED' using errcode = '42501'; end if;
  -- Future reset/deletion operations must lock this same row before acting.
  select s.reset_version, s.deleting into generation, deleting
    from private.account_state s where s.user_id = owner for update;
  if not found or deleting then raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501'; end if;
  if p_expected_reset_version is null or p_expected_reset_version <> generation then
    raise exception 'RESET_VERSION_CHANGED' using errcode = '40001';
  end if;
  if p_request_id is null or p_source_fingerprint is null
    or char_length(p_source_fingerprint) <> 64 or p_source_fingerprint !~ '^[a-f0-9]{64}$'
    or p_choice is null or p_choice not in ('merge', 'account-only')
    or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_IMPORT_REQUEST' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 5000 or octet_length(p_items::text) > 2097152
    or (p_choice = 'account-only' and jsonb_array_length(p_items) <> 0) then
    raise exception 'IMPORT_LIMIT_OR_CHOICE_INVALID' using errcode = '22023';
  end if;
  request_hash = encode(sha256(convert_to(jsonb_build_object(
    'source', p_source_fingerprint, 'choice', p_choice,
    'reset_version', generation::text, 'items', p_items)::text, 'UTF8')), 'hex');
  select * into receipt from private.guest_import_receipts r
    where r.user_id = owner and r.request_id = p_request_id;
  if found then
    if receipt.input_hash <> request_hash then
      raise exception 'IMPORT_REQUEST_REUSED' using errcode = '22023';
    end if;
    return receipt.result || jsonb_build_object('replayed', true);
  end if;
  select coalesce(jsonb_object_agg(item_key, revision::text), '{}'::jsonb)
    into original_revisions from public.user_items where user_id = owner;

  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) <> 'object' or item - array['language','kind','written_form','reading','data','observed_at'] <> '{}'::jsonb
      or jsonb_typeof(item->'language') is distinct from 'string'
      or jsonb_typeof(item->'kind') is distinct from 'string'
      or jsonb_typeof(item->'written_form') is distinct from 'string'
      or jsonb_typeof(item->'reading') is distinct from 'string'
      or jsonb_typeof(item->'data') is distinct from 'object' then
      raise exception 'INVALID_IMPORT_ITEM' using errcode = '22023';
    end if;
    item_language = item->>'language'; item_kind = item->>'kind';
    written = normalize(btrim(item->>'written_form'), NFC);
    pronunciation = normalize(btrim(item->>'reading'), NFC);
    item_data = item->'data';
    if item_language not in ('zh', 'ja', 'en') or item_kind not in (
      'saved_words','review_cards','search_history','written_chars','learned_radicals','learned_kana','learned_sounds')
      or char_length(written) not between 1 and 2000 or private.s2s_item_text(written) = ''
      or char_length(pronunciation) > 2000 or octet_length(item_data::text) > 16384
      or item_data ?| array['id','user_id','item_key','revision','reset_version','created_at','updated_at','language'] then
      raise exception 'INVALID_IMPORT_ITEM' using errcode = '22023';
    end if;
    foreach field in array array['english','burmese','definition','burmese_definition','kana','part_of_speech','level','lesson_name'] loop
      if item_data ? field and (jsonb_typeof(item_data->field) <> 'string' or char_length(item_data->>field) > 10000) then
        raise exception 'INVALID_IMPORT_DETAILS' using errcode = '22023';
      end if;
    end loop;
    if item_data ? 'examples' then
      if jsonb_typeof(item_data->'examples') <> 'array' then raise exception 'INVALID_IMPORT_EXAMPLES' using errcode = '22023'; end if;
      if jsonb_array_length(item_data->'examples') > 3 then raise exception 'INVALID_IMPORT_EXAMPLES' using errcode = '22023'; end if;
      for example in select value from jsonb_array_elements(item_data->'examples') loop
        if jsonb_typeof(example) <> 'object' then raise exception 'INVALID_IMPORT_EXAMPLES' using errcode = '22023'; end if;
        foreach field in array array['text','chinese','reading','pinyin','english','burmese'] loop
          if example ? field and (jsonb_typeof(example->field) <> 'string' or char_length(example->>field) > 10000) then
            raise exception 'INVALID_IMPORT_EXAMPLES' using errcode = '22023';
          end if;
        end loop;
      end loop;
    end if;
    if item_kind not in ('saved_words', 'review_cards') then pronunciation = ''; end if;
    observed = now();
    if item ? 'observed_at' and jsonb_typeof(item->'observed_at') <> 'null' then
      if jsonb_typeof(item->'observed_at') <> 'string' then
        raise exception 'INVALID_IMPORT_TIMESTAMP' using errcode = '22023';
      end if;
      observed = (item->>'observed_at')::timestamptz;
      if not isfinite(observed) then raise exception 'INVALID_IMPORT_TIMESTAMP' using errcode = '22023'; end if;
      -- Local timestamps select among imported drill/history records only. They
      -- are never server-confirmed study activity and cannot create streaks.
      observed = greatest('1970-01-01T00:00:00Z'::timestamptz, least(observed, now()));
    end if;
    if item_kind in ('learned_radicals', 'learned_kana', 'learned_sounds') then
      if item_data ?| array['seen','correct','wrong','streak'] then
        foreach counter in array array['seen','correct','wrong','streak'] loop
          if jsonb_typeof(item_data->counter) is distinct from 'number'
            or (item_data->>counter)::numeric < 0
            or (item_data->>counter)::numeric > 9007199254740991
            or trunc((item_data->>counter)::numeric) <> (item_data->>counter)::numeric then
            raise exception 'INVALID_IMPORT_COUNTERS' using errcode = '22023';
          end if;
        end loop;
        seen = (item_data->>'seen')::numeric; correct = (item_data->>'correct')::numeric;
        wrong = (item_data->>'wrong')::numeric; streak = (item_data->>'streak')::numeric;
        if seen <> correct + wrong or streak > correct then
          raise exception 'INVALID_IMPORT_COUNTERS' using errcode = '22023';
        end if;
      end if;
    end if;
    identity_key = encode(sha256(convert_to(jsonb_build_array(item_language, item_kind,
      private.s2s_item_text(written), private.s2s_item_text(pronunciation))::text, 'UTF8')), 'hex');
    select * into previous from public.user_items i where i.user_id = owner and i.item_key = identity_key;
    if not found then
      insert into public.user_items (user_id,item_key,language,kind,written_form,reading,data,observed_at)
        values (owner,identity_key,item_language,item_kind,written,pronunciation,item_data,observed);
      added = added + 1;
    elsif (item_kind in ('learned_radicals','learned_kana','learned_sounds')
      and (coalesce((item_data->>'seen')::numeric, 0) > coalesce((previous.data->>'seen')::numeric, 0)
        or (coalesce((item_data->>'seen')::numeric, 0) = coalesce((previous.data->>'seen')::numeric, 0)
          and observed > previous.observed_at)))
      or (item_kind = 'search_history' and observed > previous.observed_at) then
      update public.user_items set data = item_data, observed_at = observed
        where user_id = owner and item_key = identity_key;
      updated = updated + 1;
    end if;
  end loop;

  -- Match the existing per-language search history limit, without deleting any
  -- saved/review/progress items or changing another user's history.
  if p_choice = 'merge' then
  delete from public.user_items i using (
    select item_key, row_number() over (partition by language order by observed_at desc, item_key) as position
    from public.user_items where user_id = owner and kind = 'search_history'
  ) history where i.user_id = owner and i.kind = 'search_history'
    and i.item_key = history.item_key and history.position > 10;
  if (select count(*) from public.user_items where user_id = owner) > 20000
    or (select coalesce(sum(octet_length(data::text) + octet_length(written_form) + octet_length(reading)), 0)
      from public.user_items where user_id = owner) > 4194304 then
    raise exception 'ACCOUNT_IMPORT_CAPACITY_EXCEEDED' using errcode = '22023';
  end if;
  end if;
  -- Counts describe retained distinct records, not duplicate input/upsert attempts.
  select count(*) into added from public.user_items i
    where i.user_id = owner and not (original_revisions ? i.item_key);
  select count(*) into updated from public.user_items i where i.user_id = owner
    and original_revisions ? i.item_key and (original_revisions->>i.item_key)::bigint <> i.revision;
  result = jsonb_build_object('status','committed','persistence','cloud','schema_version',1,
    'user_id',owner,'request_id',p_request_id,'reset_version',generation::text,
    'source_fingerprint',p_source_fingerprint,'choice',p_choice,
    'accepted_count',jsonb_array_length(p_items),'added_count',added,'updated_count',updated,'replayed',false);
  insert into private.guest_import_receipts (user_id,request_id,source_fingerprint,input_hash,reset_version,result)
    values (owner,p_request_id,p_source_fingerprint,request_hash,generation,result);
  return result;
end;
$$;
revoke all on function public.s2s_import_guest(uuid,uuid,bigint,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.s2s_import_guest(uuid,uuid,bigint,text,text,jsonb) to authenticated;

commit;
