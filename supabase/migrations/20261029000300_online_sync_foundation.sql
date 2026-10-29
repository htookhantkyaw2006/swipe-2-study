-- Additive migration: Online Learning Sync Server Foundation.
-- Establishes repeat-safe online synchronization, deletion tombstones,
-- and atomic learning reset for currently supported learning records.
-- Preserves existing user_items, account_state, snapshot, and import contracts.

begin;

-- ---------------------------------------------------------------------------
-- 1. Tombstones Table
-- ---------------------------------------------------------------------------
-- Retains server-side deletion records so that stale edits, out-of-order retries,
-- and subsequent guest imports cannot resurrect previously deleted learning records.
create table public.user_item_tombstones (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_key text not null check (char_length(item_key) = 64 and item_key ~ '^[a-f0-9]{64}$'),
  language text not null check (language in ('zh', 'ja', 'en')),
  kind text not null check (kind in ('saved_words', 'review_cards', 'search_history',
    'written_chars', 'learned_radicals', 'learned_kana', 'learned_sounds')),
  deleted_at timestamptz not null default now(),
  revision bigint not null check (revision > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

create index user_item_tombstones_owner_idx on public.user_item_tombstones
  (user_id, language, kind, deleted_at desc);

alter table public.user_item_tombstones enable row level security;
revoke all on public.user_item_tombstones from public, anon, authenticated;
grant select on public.user_item_tombstones to authenticated;
grant all on public.user_item_tombstones to service_role;

create policy user_item_tombstones_read_own on public.user_item_tombstones for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()));

-- ---------------------------------------------------------------------------
-- 2. Sync Mutation Receipts (Owner-Bound Idempotency)
-- ---------------------------------------------------------------------------
-- Binds each client mutation batch UUID to its complete result payload and input hash.
-- Prevents replaying duplicate effects on network retry while rejecting altered inputs.
create table private.sync_mutation_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  input_hash text not null check (char_length(input_hash) = 64 and input_hash ~ '^[a-f0-9]{64}$'),
  reset_version bigint not null check (reset_version >= 0),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table private.sync_mutation_receipts enable row level security;
revoke all on private.sync_mutation_receipts from public, anon, authenticated;
grant all on private.sync_mutation_receipts to service_role;

-- ---------------------------------------------------------------------------
-- 3. Learning Reset Receipts (Repeat-Safe Reset Idempotency)
-- ---------------------------------------------------------------------------
-- Records learning reset execution so network retries do not repeatedly increment
-- generation or re-wipe accounts.
create table private.learning_reset_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  from_reset_version bigint not null check (from_reset_version >= 0),
  to_reset_version bigint not null check (to_reset_version > from_reset_version),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table private.learning_reset_receipts enable row level security;
revoke all on private.learning_reset_receipts from public, anon, authenticated;
grant all on private.learning_reset_receipts to service_role;

-- ---------------------------------------------------------------------------
-- 4. Batch Mutation RPC: public.s2s_apply_mutations
-- ---------------------------------------------------------------------------
-- Authenticated, batch mutation endpoint supporting repeat-safe creates, updates,
-- and deletes for supported learning records. Enforces revision checks, tombstones,
-- strict schema validation, and atomic rollback on invalid batches.
create or replace function public.s2s_apply_mutations(
  p_expected_user_id uuid,
  p_request_id uuid,
  p_expected_reset_version bigint,
  p_mutations jsonb,
  p_atomic boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid = auth.uid();
  generation bigint;
  deleting boolean;
  request_hash text;
  receipt private.sync_mutation_receipts%rowtype;
  mutation jsonb;
  item_op text;
  item_language text;
  item_kind text;
  written text;
  pronunciation text;
  item_data jsonb;
  identity_key text;
  client_id text;
  base_rev bigint;
  new_rev bigint;
  observed timestamptz;
  field text;
  example jsonb;
  counter text;
  seen numeric;
  correct numeric;
  wrong numeric;
  streak numeric;
  previous public.user_items%rowtype;
  tombstone public.user_item_tombstones%rowtype;
  acknowledged jsonb = '[]'::jsonb;
  item_ack jsonb;
  applied_count integer = 0;
  deleted_count integer = 0;
  conflict_count integer = 0;
  result jsonb;
begin
  -- 1. Caller authentication and expected owner guard
  if owner is null then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;
  if p_expected_user_id is distinct from owner then
    raise exception 'ACCOUNT_CHANGED' using errcode = '42501';
  end if;

  -- 2. Lock account state row and verify availability & reset version
  select s.reset_version, s.deleting into generation, deleting
    from private.account_state s where s.user_id = owner for update;
  if not found or deleting then
    raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501';
  end if;
  if p_expected_reset_version is null or p_expected_reset_version <> generation then
    raise exception 'RESET_VERSION_CHANGED' using errcode = '40001';
  end if;

  -- 3. Validate request parameters & batch envelope
  if p_request_id is null or p_mutations is null or jsonb_typeof(p_mutations) <> 'array' then
    raise exception 'INVALID_MUTATION_REQUEST' using errcode = '22023';
  end if;
  if jsonb_array_length(p_mutations) > 500 or octet_length(p_mutations::text) > 1048576 then
    raise exception 'MUTATION_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  -- 4. Check owner-bound idempotency receipt
  request_hash = encode(sha256(convert_to(jsonb_build_object(
    'reset_version', generation::text,
    'mutations', p_mutations
  )::text, 'UTF8')), 'hex');

  select * into receipt from private.sync_mutation_receipts r
    where r.user_id = owner and r.request_id = p_request_id;
  if found then
    if receipt.input_hash <> request_hash then
      raise exception 'MUTATION_REQUEST_REUSED' using errcode = '22023';
    end if;
    return receipt.result || jsonb_build_object('replayed', true);
  end if;

  -- 5. Process each mutation in the batch
  for mutation in select value from jsonb_array_elements(p_mutations) loop
    if jsonb_typeof(mutation) <> 'object'
      or jsonb_typeof(mutation->'op') is distinct from 'string'
      or jsonb_typeof(mutation->'language') is distinct from 'string'
      or jsonb_typeof(mutation->'kind') is distinct from 'string'
      or jsonb_typeof(mutation->'written_form') is distinct from 'string' then
      raise exception 'INVALID_MUTATION_ITEM' using errcode = '22023';
    end if;

    item_op = mutation->>'op';
    item_language = mutation->>'language';
    item_kind = mutation->>'kind';
    written = normalize(btrim(mutation->>'written_form'), NFC);
    pronunciation = '';
    if mutation ? 'reading' and jsonb_typeof(mutation->'reading') = 'string' then
      pronunciation = normalize(btrim(mutation->>'reading'), NFC);
    end if;

    if item_op not in ('upsert', 'delete')
      or item_language not in ('zh', 'ja', 'en')
      or item_kind not in ('saved_words', 'review_cards', 'search_history',
        'written_chars', 'learned_radicals', 'learned_kana', 'learned_sounds')
      or char_length(written) not between 1 and 2000
      or private.s2s_item_text(written) = ''
      or char_length(pronunciation) > 2000 then
      raise exception 'INVALID_MUTATION_ITEM' using errcode = '22023';
    end if;

    if item_kind not in ('saved_words', 'review_cards') and pronunciation <> '' then
      raise exception 'INVALID_MUTATION_ITEM' using errcode = '22023';
    end if;

    client_id = null;
    if mutation ? 'client_id' and jsonb_typeof(mutation->'client_id') = 'string' then
      client_id = left(mutation->>'client_id', 128);
    end if;

    base_rev = null;
    if mutation ? 'base_revision' and jsonb_typeof(mutation->'base_revision') is distinct from 'null' then
      if jsonb_typeof(mutation->'base_revision') not in ('number', 'string') then
        raise exception 'INVALID_MUTATION_REVISION' using errcode = '22023';
      end if;
      base_rev = (mutation->>'base_revision')::bigint;
      if base_rev < 0 then
        raise exception 'INVALID_MUTATION_REVISION' using errcode = '22023';
      end if;
    end if;

    observed = now();
    if mutation ? 'observed_at' and jsonb_typeof(mutation->'observed_at') is distinct from 'null' then
      if jsonb_typeof(mutation->'observed_at') <> 'string' then
        raise exception 'INVALID_MUTATION_TIMESTAMP' using errcode = '22023';
      end if;
      observed = (mutation->>'observed_at')::timestamptz;
      if not isfinite(observed) then
        raise exception 'INVALID_MUTATION_TIMESTAMP' using errcode = '22023';
      end if;
      observed = greatest('1970-01-01T00:00:00Z'::timestamptz, least(observed, now()));
    end if;

    -- Strict validation for upsert payload data
    if item_op = 'upsert' then
      if not (mutation ? 'data') or jsonb_typeof(mutation->'data') <> 'object' then
        raise exception 'INVALID_MUTATION_ITEM' using errcode = '22023';
      end if;
      item_data = mutation->'data';

      if octet_length(item_data::text) > 16384
        or item_data ?| array['id','user_id','item_key','revision','reset_version','created_at','updated_at','language'] then
        raise exception 'INVALID_MUTATION_ITEM' using errcode = '22023';
      end if;

      foreach field in array array['english','burmese','definition','burmese_definition','kana','part_of_speech','level','lesson_name'] loop
        if item_data ? field and (jsonb_typeof(item_data->field) <> 'string' or char_length(item_data->>field) > 10000) then
          raise exception 'INVALID_MUTATION_DETAILS' using errcode = '22023';
        end if;
      end loop;

      if item_data ? 'examples' then
        if jsonb_typeof(item_data->'examples') <> 'array' or jsonb_array_length(item_data->'examples') > 3 then
          raise exception 'INVALID_MUTATION_EXAMPLES' using errcode = '22023';
        end if;
        for example in select value from jsonb_array_elements(item_data->'examples') loop
          if jsonb_typeof(example) <> 'object' then
            raise exception 'INVALID_MUTATION_EXAMPLES' using errcode = '22023';
          end if;
          foreach field in array array['text','chinese','reading','pinyin','english','burmese'] loop
            if example ? field and (jsonb_typeof(example->field) <> 'string' or char_length(example->>field) > 10000) then
              raise exception 'INVALID_MUTATION_EXAMPLES' using errcode = '22023';
            end if;
          end loop;
        end loop;
      end if;

      if item_kind in ('learned_radicals', 'learned_kana', 'learned_sounds') then
        if item_data ?| array['seen','correct','wrong','streak'] then
          foreach counter in array array['seen','correct','wrong','streak'] loop
            if jsonb_typeof(item_data->counter) is distinct from 'number'
              or (item_data->>counter)::numeric < 0
              or (item_data->>counter)::numeric > 9007199254740991
              or trunc((item_data->>counter)::numeric) <> (item_data->>counter)::numeric then
              raise exception 'INVALID_MUTATION_COUNTERS' using errcode = '22023';
            end if;
          end loop;
          seen = (item_data->>'seen')::numeric; correct = (item_data->>'correct')::numeric;
          wrong = (item_data->>'wrong')::numeric; streak = (item_data->>'streak')::numeric;
          if seen <> correct + wrong or streak > correct then
            raise exception 'INVALID_MUTATION_COUNTERS' using errcode = '22023';
          end if;
        end if;
      end if;
    end if;

    -- Compute stable item key
    identity_key = encode(sha256(convert_to(jsonb_build_array(
      item_language, item_kind,
      private.s2s_item_text(written),
      private.s2s_item_text(pronunciation)
    )::text, 'UTF8')), 'hex');

    if mutation ? 'item_key' and (mutation->>'item_key') <> identity_key then
      raise exception 'ITEM_KEY_MISMATCH' using errcode = '22023';
    end if;

    -- Look up existing row and tombstone
    select * into previous from public.user_items
      where user_id = owner and item_key = identity_key;
    select * into tombstone from public.user_item_tombstones
      where user_id = owner and item_key = identity_key;

    -- ---------------------------------------------------------------
    -- Operation 1: UPSERT
    -- ---------------------------------------------------------------
    if item_op = 'upsert' then
      if tombstone.user_id is not null then
        -- Item was previously deleted on the server.
        -- Reject stale edit if base_revision is prior to the deletion revision.
        if base_rev is null or base_rev < tombstone.revision then
          if p_atomic then
            raise exception 'REVISION_CONFLICT' using errcode = '40001';
          end if;
          item_ack = jsonb_build_object(
            'client_id', client_id,
            'item_key', identity_key,
            'language', item_language,
            'kind', item_kind,
            'status', 'conflict',
            'error', 'RECORD_DELETED',
            'server_revision', tombstone.revision::text
          );
          conflict_count = conflict_count + 1;
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        else
          -- Explicit re-creation at or above tombstone revision
          delete from public.user_item_tombstones
            where user_id = owner and item_key = identity_key;
          new_rev = tombstone.revision + 1;
          insert into public.user_items (
            user_id, item_key, language, kind, written_form, reading, data, observed_at, revision
          ) values (
            owner, identity_key, item_language, item_kind, written, pronunciation, item_data, observed, new_rev
          );
          item_ack = jsonb_build_object(
            'client_id', client_id,
            'item_key', identity_key,
            'language', item_language,
            'kind', item_kind,
            'status', 'applied',
            'revision', new_rev::text
          );
          applied_count = applied_count + 1;
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        end if;
      elsif previous.user_id is not null then
        -- Row already exists: compare revision to detect stale edits
        if base_rev is not null and base_rev < previous.revision then
          if p_atomic then
            raise exception 'REVISION_CONFLICT' using errcode = '40001';
          end if;
          item_ack = jsonb_build_object(
            'client_id', client_id,
            'item_key', identity_key,
            'language', item_language,
            'kind', item_kind,
            'status', 'conflict',
            'error', 'STALE_REVISION',
            'server_revision', previous.revision::text
          );
          conflict_count = conflict_count + 1;
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        else
          update public.user_items
            set written_form = written,
                reading = pronunciation,
                data = item_data,
                observed_at = observed
            where user_id = owner and item_key = identity_key
            returning revision into new_rev;
          item_ack = jsonb_build_object(
            'client_id', client_id,
            'item_key', identity_key,
            'language', item_language,
            'kind', item_kind,
            'status', 'applied',
            'revision', new_rev::text
          );
          applied_count = applied_count + 1;
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        end if;
      else
        -- Brand new record insertion
        insert into public.user_items (
          user_id, item_key, language, kind, written_form, reading, data, observed_at, revision
        ) values (
          owner, identity_key, item_language, item_kind, written, pronunciation, item_data, observed, 1
        );
        item_ack = jsonb_build_object(
          'client_id', client_id,
          'item_key', identity_key,
          'language', item_language,
          'kind', item_kind,
          'status', 'applied',
          'revision', '1'
        );
        applied_count = applied_count + 1;
        acknowledged = acknowledged || jsonb_build_array(item_ack);
        continue;
      end if;

    -- ---------------------------------------------------------------
    -- Operation 2: DELETE
    -- ---------------------------------------------------------------
    elsif item_op = 'delete' then
      if tombstone.user_id is not null then
        -- Already deleted; acknowledge repeat-safely
        item_ack = jsonb_build_object(
          'client_id', client_id,
          'item_key', identity_key,
          'language', item_language,
          'kind', item_kind,
          'status', 'deleted',
          'revision', tombstone.revision::text
        );
        deleted_count = deleted_count + 1;
        acknowledged = acknowledged || jsonb_build_array(item_ack);
        continue;
      elsif previous.user_id is not null then
        -- Reject stale delete if row has been updated past base_revision
        if base_rev is not null and base_rev < previous.revision then
          if p_atomic then
            raise exception 'REVISION_CONFLICT' using errcode = '40001';
          end if;
          item_ack = jsonb_build_object(
            'client_id', client_id,
            'item_key', identity_key,
            'language', item_language,
            'kind', item_kind,
            'status', 'conflict',
            'error', 'STALE_REVISION',
            'server_revision', previous.revision::text
          );
          conflict_count = conflict_count + 1;
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        else
          delete from public.user_items
            where user_id = owner and item_key = identity_key;
          new_rev = previous.revision + 1;
          insert into public.user_item_tombstones (
            user_id, item_key, language, kind, deleted_at, revision
          ) values (
            owner, identity_key, item_language, item_kind, now(), new_rev
          ) on conflict (user_id, item_key) do update
            set deleted_at = now(), revision = excluded.revision;
          item_ack = jsonb_build_object(
            'client_id', client_id,
            'item_key', identity_key,
            'language', item_language,
            'kind', item_kind,
            'status', 'deleted',
            'revision', new_rev::text
          );
          deleted_count = deleted_count + 1;
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        end if;
      else
        -- Item not present on server; create tombstone to prevent resurrection from older sync/import
        insert into public.user_item_tombstones (
          user_id, item_key, language, kind, deleted_at, revision
        ) values (
          owner, identity_key, item_language, item_kind, now(), 1
        ) on conflict (user_id, item_key) do nothing;
        item_ack = jsonb_build_object(
          'client_id', client_id,
          'item_key', identity_key,
          'language', item_language,
          'kind', item_kind,
          'status', 'deleted',
          'revision', '1'
        );
        deleted_count = deleted_count + 1;
        acknowledged = acknowledged || jsonb_build_array(item_ack);
        continue;
      end if;
    end if;
  end loop;

  -- 6. Enforce account learning capacity
  if (select count(*) from public.user_items where user_id = owner) > 20000
    or (select coalesce(sum(octet_length(data::text) + octet_length(written_form) + octet_length(reading)), 0)
      from public.user_items where user_id = owner) > 4194304 then
    raise exception 'ACCOUNT_MUTATION_CAPACITY_EXCEEDED' using errcode = '22023';
  end if;

  -- 7. Persist idempotency receipt and return canonical acknowledgement
  result = jsonb_build_object(
    'status', 'committed',
    'persistence', 'cloud',
    'schema_version', 1,
    'user_id', owner,
    'request_id', p_request_id,
    'reset_version', generation::text,
    'acknowledged', acknowledged,
    'applied_count', applied_count,
    'deleted_count', deleted_count,
    'conflict_count', conflict_count,
    'replayed', false
  );

  insert into private.sync_mutation_receipts (
    user_id, request_id, input_hash, reset_version, result
  ) values (
    owner, p_request_id, request_hash, generation, result
  );

  return result;
end;
$$;

revoke all on function public.s2s_apply_mutations(uuid, uuid, bigint, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.s2s_apply_mutations(uuid, uuid, bigint, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Atomic Learning Reset RPC: public.s2s_reset_learning
-- ---------------------------------------------------------------------------
-- Locks the account, advances reset_version, and wipes learning records and tombstones.
-- Idempotent by request_id: repeated calls return previous result without bumping reset_version.
-- Preserves auth user, profile, avatar, preferences, and account deletion tracking.
create or replace function public.s2s_reset_learning(
  p_expected_user_id uuid,
  p_request_id uuid,
  p_expected_reset_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid = auth.uid();
  generation bigint;
  deleting boolean;
  new_generation bigint;
  receipt private.learning_reset_receipts%rowtype;
  result jsonb;
begin
  if owner is null then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;
  if p_expected_user_id is distinct from owner then
    raise exception 'ACCOUNT_CHANGED' using errcode = '42501';
  end if;
  if p_request_id is null or p_expected_reset_version is null then
    raise exception 'INVALID_RESET_REQUEST' using errcode = '22023';
  end if;

  -- Check repeat-safe idempotency receipt first
  select * into receipt from private.learning_reset_receipts r
    where r.user_id = owner and r.request_id = p_request_id;
  if found then
    return receipt.result || jsonb_build_object('replayed', true);
  end if;

  -- Lock account state row
  select s.reset_version, s.deleting into generation, deleting
    from private.account_state s where s.user_id = owner for update;
  if not found or deleting then
    raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501';
  end if;
  if p_expected_reset_version <> generation then
    raise exception 'RESET_VERSION_CHANGED' using errcode = '40001';
  end if;

  -- Advance generation
  new_generation = generation + 1;
  update private.account_state
    set reset_version = new_generation
    where user_id = owner;

  -- Reset learning records and tombstones only
  delete from public.user_items where user_id = owner;
  delete from public.user_item_tombstones where user_id = owner;
  delete from private.guest_import_receipts where user_id = owner;
  delete from private.sync_mutation_receipts where user_id = owner;

  -- Profiles, user_preferences, avatars, and account_deletions remain completely intact.
  result = jsonb_build_object(
    'status', 'reset',
    'persistence', 'cloud',
    'schema_version', 1,
    'user_id', owner,
    'request_id', p_request_id,
    'reset_version', new_generation::text,
    'previous_reset_version', generation::text,
    'items_reset', true,
    'replayed', false
  );

  insert into private.learning_reset_receipts (
    user_id, request_id, from_reset_version, to_reset_version, result
  ) values (
    owner, p_request_id, generation, new_generation, result
  );

  return result;
end;
$$;

revoke all on function public.s2s_reset_learning(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.s2s_reset_learning(uuid, uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Additive Update: public.s2s_import_guest (Respect Tombstones)
-- ---------------------------------------------------------------------------
-- Updates s2s_import_guest so that items with existing server tombstones
-- are never resurrected as active learning rows.
create or replace function public.s2s_import_guest(
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
  tombstone public.user_item_tombstones%rowtype;
  original_revisions jsonb;
  added integer = 0;
  updated integer = 0;
  result jsonb;
begin
  if owner is null then raise exception 'ACCOUNT_REQUIRED' using errcode = '42501'; end if;
  if p_expected_user_id is distinct from owner then raise exception 'ACCOUNT_CHANGED' using errcode = '42501'; end if;
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
      if jsonb_typeof(item_data->'examples') <> 'array' or jsonb_array_length(item_data->'examples') > 3 then
        raise exception 'INVALID_IMPORT_EXAMPLES' using errcode = '22023';
      end if;
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

    -- Tombstone check: Deleted records must NEVER restore as active learning rows
    select * into tombstone from public.user_item_tombstones t
      where t.user_id = owner and t.item_key = identity_key;
    if found then
      continue;
    end if;

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

-- ---------------------------------------------------------------------------
-- 7. Additive Update: public.s2s_account_snapshot (Export & Tombstone Compatibility)
-- ---------------------------------------------------------------------------
-- Preserves existing snapshot contract (schema_version 1, user_id, reset_version, items)
-- while additively including tombstones for export and synchronization auditing.
create or replace function public.s2s_account_snapshot(p_expected_user_id uuid)
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

  select jsonb_build_object(
    'schema_version', 1,
    'user_id', owner,
    'reset_version', generation::text,
    'server_time', now(),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'item_key', i.item_key, 'language', i.language, 'kind', i.kind,
      'written_form', i.written_form, 'reading', i.reading, 'data', i.data,
      'observed_at', i.observed_at, 'revision', i.revision::text,
      'created_at', i.created_at, 'updated_at', i.updated_at
    ) order by i.language, i.kind, i.item_key), '[]'::jsonb),
    'tombstones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_key', t.item_key, 'language', t.language, 'kind', t.kind,
        'deleted_at', t.deleted_at, 'revision', t.revision::text
      ) order by t.language, t.kind, t.item_key)
      from public.user_item_tombstones t where t.user_id = owner
    ), '[]'::jsonb)
  ) into result
  from public.user_items i where i.user_id = owner;

  if result is null or not (result ? 'items') then
    result = jsonb_build_object(
      'schema_version', 1,
      'user_id', owner,
      'reset_version', generation::text,
      'server_time', now(),
      'items', '[]'::jsonb,
      'tombstones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'item_key', t.item_key, 'language', t.language, 'kind', t.kind,
          'deleted_at', t.deleted_at, 'revision', t.revision::text
        ) order by t.language, t.kind, t.item_key)
        from public.user_item_tombstones t where t.user_id = owner
      ), '[]'::jsonb)
    );
  end if;

  return result;
end;
$$;

revoke all on function public.s2s_account_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.s2s_account_snapshot(uuid) to authenticated;

commit;
