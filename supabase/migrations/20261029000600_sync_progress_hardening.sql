-- ===========================================================================
-- Migration: 20261029000600_sync_progress_hardening.sql
-- Description: Strengthen sync CAS revision checks, tombstone identity mapping,
--              and streak qualification guards.
-- ===========================================================================

begin;

-- 1. Add written_form and reading columns to user_item_tombstones
alter table public.user_item_tombstones
  add column if not exists written_form text,
  add column if not exists reading text;

-- 2. Update public.s2s_apply_mutations
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
  receipt record;
  mutation jsonb;
  item_op text;
  item_language text;
  item_kind text;
  written text;
  pronunciation text;
  client_id text;
  base_rev bigint;
  observed timestamptz;
  item_data jsonb;
  identity_key text;
  previous public.user_items%rowtype;
  tombstone public.user_item_tombstones%rowtype;
  new_rev bigint;
  applied_count integer = 0;
  study_action_count integer = 0;
  deleted_count integer = 0;
  conflict_count integer = 0;
  acknowledged jsonb = '[]'::jsonb;
  item_ack jsonb;
  field text;
  example jsonb;
  seen numeric;
  correct numeric;
  wrong numeric;
  streak numeric;
  counter text;
  streak_info jsonb;
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
    if item_op not in ('upsert', 'delete') then
      raise exception 'INVALID_MUTATION_ITEM' using errcode = '22023';
    end if;

    item_language = mutation->>'language';
    if item_language not in ('zh', 'ja', 'en') then
      raise exception 'INVALID_MUTATION_ITEM' using errcode = '22023';
    end if;

    item_kind = mutation->>'kind';
    if item_kind not in ('saved_words', 'review_cards', 'search_history',
      'written_chars', 'learned_radicals', 'learned_kana', 'learned_sounds', 'learned_words') then
      raise exception 'INVALID_MUTATION_ITEM' using errcode = '22023';
    end if;

    written = mutation->>'written_form';
    if char_length(written) not between 1 and 2000
      or private.s2s_item_text(written) = '' then
      raise exception 'INVALID_MUTATION_WRITTEN' using errcode = '22023';
    end if;

    pronunciation = coalesce(mutation->>'reading', '');
    if char_length(pronunciation) > 2000 then
      raise exception 'INVALID_MUTATION_READING' using errcode = '22023';
    end if;

    client_id = mutation->>'client_id';
    if client_id is not null and char_length(client_id) > 255 then
      raise exception 'INVALID_MUTATION_CLIENT_ID' using errcode = '22023';
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

      foreach field in array array['english','burmese','definition','burmese_definition','kana','part_of_speech','level','lesson_name','status','last_action','last_reviewed_at','card_id'] loop
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
      elsif item_kind = 'learned_words' then
        if item_data ? 'seen' then
          if jsonb_typeof(item_data->'seen') is distinct from 'number'
            or (item_data->>'seen')::numeric < 0
            or (item_data->>'seen')::numeric > 9007199254740991
            or trunc((item_data->>'seen')::numeric) <> (item_data->>'seen')::numeric then
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
    -- Operation 1: UPSERT (Exact CAS Matching)
    -- ---------------------------------------------------------------
    if item_op = 'upsert' then
      if tombstone.user_id is not null then
        -- Overwriting a tombstone requires exact match with tombstone revision
        if base_rev is null or base_rev <> tombstone.revision then
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
          if item_kind in ('learned_words', 'review_cards', 'learned_radicals', 'learned_kana', 'learned_sounds', 'written_chars') then
            study_action_count = study_action_count + 1;
          end if;
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        end if;
      elsif previous.user_id is not null then
        -- Updating an existing row requires exact match with previous revision
        if base_rev is null or base_rev <> previous.revision then
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
          if item_kind in ('learned_words', 'review_cards', 'learned_radicals', 'learned_kana', 'learned_sounds', 'written_chars') then
            study_action_count = study_action_count + 1;
          end if;
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        end if;
      else
        -- Creating a new record: base_revision must be null or 0
        if base_rev is not null and base_rev <> 0 then
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
            'server_revision', '0'
          );
          conflict_count = conflict_count + 1;
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        end if;

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
        if item_kind in ('learned_words', 'review_cards', 'learned_radicals', 'learned_kana', 'learned_sounds', 'written_chars') then
          study_action_count = study_action_count + 1;
        end if;
        acknowledged = acknowledged || jsonb_build_array(item_ack);
        continue;
      end if;

    -- ---------------------------------------------------------------
    -- Operation 2: DELETE (Exact CAS Matching)
    -- ---------------------------------------------------------------
    elsif item_op = 'delete' then
      if tombstone.user_id is not null then
        if base_rev is not null and base_rev <> tombstone.revision then
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
        end if;

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
        -- Deleting an existing row requires exact match with previous revision
        if base_rev is null or base_rev <> previous.revision then
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
            user_id, item_key, language, kind, written_form, reading, deleted_at, revision
          ) values (
            owner, identity_key, item_language, item_kind, written, pronunciation, now(), new_rev
          ) on conflict (user_id, item_key) do update
            set revision = excluded.revision,
                deleted_at = excluded.deleted_at,
                written_form = excluded.written_form,
                reading = excluded.reading;

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
        -- Record not found on server
        if base_rev is not null and base_rev <> 0 then
          if p_atomic then
            raise exception 'REVISION_CONFLICT' using errcode = '40001';
          end if;
          item_ack = jsonb_build_object(
            'client_id', client_id,
            'item_key', identity_key,
            'language', item_language,
            'kind', item_kind,
            'status', 'conflict',
            'error', 'RECORD_NOT_FOUND',
            'server_revision', '0'
          );
          conflict_count = conflict_count + 1;
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        end if;

        insert into public.user_item_tombstones (
          user_id, item_key, language, kind, written_form, reading, deleted_at, revision
        ) values (
          owner, identity_key, item_language, item_kind, written, pronunciation, now(), 1
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

  -- 7. Transactionally record study activity in Asia/Yangon if non-replayed qualifying actions applied
  streak_info = private.s2s_record_study_action(owner, study_action_count);

  -- 8. Persist idempotency receipt and return canonical acknowledgement
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
    'streak', streak_info,
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

-- 3. Update public.s2s_account_snapshot to emit written_form and reading for tombstones
create or replace function public.s2s_account_snapshot(p_expected_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid = auth.uid();
  generation bigint;
  deleting boolean;
  streak_info jsonb;
  result jsonb;
begin
  if owner is null then raise exception 'ACCOUNT_REQUIRED' using errcode = '42501'; end if;
  if p_expected_user_id is distinct from owner then raise exception 'ACCOUNT_CHANGED' using errcode = '42501'; end if;
  select s.reset_version, s.deleting into generation, deleting
    from private.account_state s where s.user_id = owner for share;
  if not found or deleting then raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501'; end if;

  streak_info = private.s2s_record_study_action(owner, 0);

  select jsonb_build_object(
    'schema_version', 1,
    'user_id', owner,
    'reset_version', generation::text,
    'server_time', now(),
    'streak', streak_info,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'item_key', i.item_key, 'language', i.language, 'kind', i.kind,
      'written_form', i.written_form, 'reading', i.reading, 'data', i.data,
      'observed_at', i.observed_at, 'revision', i.revision::text,
      'created_at', i.created_at, 'updated_at', i.updated_at
    ) order by i.language, i.kind, i.item_key), '[]'::jsonb),
    'tombstones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_key', t.item_key, 'language', t.language, 'kind', t.kind,
        'written_form', coalesce(t.written_form, ''), 'reading', coalesce(t.reading, ''),
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
      'streak', streak_info,
      'items', '[]'::jsonb,
      'tombstones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'item_key', t.item_key, 'language', t.language, 'kind', t.kind,
          'written_form', coalesce(t.written_form, ''), 'reading', coalesce(t.reading, ''),
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
