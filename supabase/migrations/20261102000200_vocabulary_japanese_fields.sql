-- Add optional linguistic fields for multi-script courses (Japanese kana, romaji, part_of_speech)
-- to public.vocabulary table and sense_id to public.user_item_tombstones.
-- Extend publication, rollback, mutation, and guest import RPCs with linguistic and sense identity support.

begin;

-- 1. Schema Extensions
alter table public.vocabulary
  add column if not exists kana text default null,
  add column if not exists romaji text default null,
  add column if not exists part_of_speech text default null;

create table if not exists public.user_item_tombstones (
  user_id uuid not null,
  item_key text not null,
  language text not null,
  kind text not null,
  written_form text not null default '',
  reading text not null default '',
  sense_id text not null default '',
  deleted_at timestamptz not null default now(),
  revision bigint not null default 1,
  primary key (user_id, item_key)
);

alter table public.user_item_tombstones
  add column if not exists sense_id text not null default '';

-- Drop erroneous function from previous draft if present
drop function if exists public.s2s_publish_course_content(text, uuid, text, text);

-- 2. Extended Stage RPC: public.s2s_stage_course_content
create or replace function public.s2s_stage_course_content(
  p_course_id text,
  p_source_checksum text,
  p_items jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_operator text default 'operator'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_id uuid;
  v_current_version bigint;
  v_item jsonb;
  v_item_id text;
  v_written_form text;
  v_reading text;
  v_kana text;
  v_romaji text;
  v_pos text;
  v_existing public.vocabulary%rowtype;
  v_seen_ids text[] := array[]::text[];
  v_retire_id text;
  v_item_count integer;
begin
  if p_course_id not in ('zh-hsk1', 'ja-n5') then
    raise exception 'UNSUPPORTED_COURSE' using errcode = '22023';
  end if;

  if p_source_checksum is null or char_length(p_source_checksum) <> 64
     or p_source_checksum !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_CHECKSUM' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_STAGED_ITEMS' using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(p_items);

  select content_version into v_current_version
    from public.courses
   where id = p_course_id;

  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = '02000';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_id := v_item->>'id';
    v_written_form := v_item->>'written_form';
    v_reading := coalesce(v_item->>'reading', '');
    v_kana := nullif(btrim(coalesce(v_item->>'kana', '')), '');
    v_romaji := nullif(btrim(coalesce(v_item->>'romaji', '')), '');
    v_pos := nullif(btrim(coalesce(v_item->>'part_of_speech', '')), '');

    if v_item_id is null or v_item_id = '' or v_written_form is null or v_written_form = '' then
      raise exception 'MALFORMED_STAGED_ITEM: item requires non-empty id and written_form'
        using errcode = '22023';
    end if;

    if coalesce(v_item->>'course_id', '') <> p_course_id then
      raise exception 'COURSE_ALIGNMENT_MISMATCH: item % specifies course % but target is %',
        v_item_id, coalesce(v_item->>'course_id', 'null'), p_course_id
        using errcode = '22023';
    end if;

    -- N5 companion metadata prerequisite check
    if p_course_id = 'ja-n5' then
      if v_kana is null or v_romaji is null or v_pos is null then
        raise exception 'MISSING_COMPANION_METADATA: vocabulary id % in course ja-n5 requires kana, romaji, and part_of_speech', v_item_id
          using errcode = '22023';
      end if;
    end if;

    -- Check duplicate IDs within stage
    if v_item_id = any(v_seen_ids) then
      raise exception 'DUPLICATE_VOCABULARY_ID: id % appears multiple times in staged items', v_item_id
        using errcode = '23505';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_item_id);

    -- Check cross-course ID reuse in public.vocabulary
    select * into v_existing
      from public.vocabulary
     where id = v_item_id;

    if found then
      if v_existing.course_id <> p_course_id then
        raise exception 'CROSS_COURSE_ID_CONFLICT: vocabulary id % belongs to course %, cannot be used by course %',
          v_item_id, v_existing.course_id, p_course_id
          using errcode = '23505';
      end if;

      if v_existing.written_form <> v_written_form or v_existing.reading <> v_reading then
        raise exception 'NATURAL_IDENTITY_CHANGE: vocabulary id % cannot change written_form from % to % or reading from % to %',
          v_item_id, v_existing.written_form, v_written_form, v_existing.reading, v_reading
          using errcode = '22023';
      end if;
    end if;
  end loop;

  -- Validate explicit retired IDs if present in metadata
  if p_metadata is not null and p_metadata ? 'retired_ids' then
    if jsonb_typeof(p_metadata->'retired_ids') <> 'array' then
      raise exception 'INVALID_RETIRED_IDS: retired_ids must be a JSON array' using errcode = '22023';
    end if;

    for v_retire_id in select jsonb_array_elements_text(p_metadata->'retired_ids') loop
      if v_retire_id = any(v_seen_ids) then
        raise exception 'RETIRE_CONFLICT: cannot both publish and retire id % in the same stage', v_retire_id
          using errcode = '22023';
      end if;

      if not exists (select 1 from public.vocabulary where id = v_retire_id and course_id = p_course_id) then
        raise exception 'RETIRE_TARGET_NOT_FOUND: retired id % does not exist in course %', v_retire_id, p_course_id
          using errcode = '02000';
      end if;
    end loop;
  end if;

  -- Mark existing 'staged' entries for this course as 'superseded'
  update private.content_stages
     set status = 'superseded',
         updated_at = now()
   where course_id = p_course_id
     and status = 'staged';

  insert into private.content_stages (
    course_id, stage_version, status, source_checksum,
    items, item_count, metadata, staged_by
  ) values (
    p_course_id, v_current_version, 'staged', p_source_checksum,
    p_items, v_item_count, coalesce(p_metadata, '{}'::jsonb), coalesce(p_operator, 'operator')
  ) returning id into v_stage_id;

  return jsonb_build_object(
    'stage_id', v_stage_id,
    'course_id', p_course_id,
    'status', 'staged',
    'item_count', v_item_count,
    'checksum', p_source_checksum
  );
end;
$$;

revoke all on function public.s2s_stage_course_content(text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.s2s_stage_course_content(text, text, jsonb, jsonb, text) to service_role;

create or replace function private.s2s_stage_course_content(
  p_course_id text,
  p_source_checksum text,
  p_items jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_operator text default 'operator'
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.s2s_stage_course_content(p_course_id, p_source_checksum, p_items, p_metadata, p_operator);
$$;

revoke all on function private.s2s_stage_course_content(text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function private.s2s_stage_course_content(text, text, jsonb, jsonb, text) to service_role;

-- 3. Extended Hardened Publication RPC: public.s2s_publish_staged_content
create or replace function public.s2s_publish_staged_content(
  p_course_id text,
  p_stage_id uuid,
  p_operator text default 'operator',
  p_reason text default 'New publication'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage private.content_stages%rowtype;
  v_course public.courses%rowtype;
  v_new_version bigint;
  v_item jsonb;
  v_item_id text;
  v_written_form text;
  v_reading text;
  v_kana text;
  v_romaji text;
  v_pos text;
  v_existing public.vocabulary%rowtype;
  v_incoming_ids text[] := array[]::text[];
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_retired integer := 0;
  v_total_active integer := 0;
  v_pre_snapshot jsonb;
  v_post_snapshot jsonb;
  v_retire_id text;
begin
  if p_course_id not in ('zh-hsk1', 'ja-n5') then
    raise exception 'UNSUPPORTED_COURSE' using errcode = '22023';
  end if;

  select * into v_course
    from public.courses
   where id = p_course_id
     for update;

  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = '02000';
  end if;

  select * into v_stage
    from private.content_stages
   where id = p_stage_id
     and course_id = p_course_id
     for update;

  if not found then
    raise exception 'STAGE_NOT_FOUND' using errcode = '02000';
  end if;

  if v_stage.status <> 'staged' then
    raise exception 'STAGE_NOT_ACTIVE' using errcode = '22023';
  end if;

  if v_stage.stage_version <> v_course.content_version then
    raise exception 'STALE_STAGE_VERSION: stage was prepared for version %, but current course version is %',
      v_stage.stage_version, v_course.content_version
      using errcode = '40001';
  end if;

  -- 1. Create pre-update backup snapshot preserving linguistic fields
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'course_id', v.course_id,
    'written_form', v.written_form,
    'reading', v.reading,
    'meaning_english', v.meaning_english,
    'meaning_burmese', v.meaning_burmese,
    'audio_path', v.audio_path,
    'examples', v.examples,
    'sort_order', v.sort_order,
    'is_active', v.is_active,
    'kana', v.kana,
    'romaji', v.romaji,
    'part_of_speech', v.part_of_speech
  ) order by v.sort_order, v.id), '[]'::jsonb) into v_pre_snapshot
    from public.vocabulary v
   where v.course_id = p_course_id;

  if v_course.is_published then
    if jsonb_array_length(v_pre_snapshot) > 0 and not exists (
      select 1 from private.content_publication_history
       where course_id = p_course_id and version = v_course.content_version
    ) then
      insert into private.content_publication_history (
        course_id, version, action, snapshot, item_count,
        active_count, retired_count, operator, reason
      ) values (
        p_course_id, v_course.content_version, 'publish', v_pre_snapshot,
        jsonb_array_length(v_pre_snapshot),
        (select count(*)::int from public.vocabulary where course_id = p_course_id and is_active),
        (select count(*)::int from public.vocabulary where course_id = p_course_id and not is_active),
        coalesce(p_operator, 'operator'), 'Pre-update snapshot'
      );
    end if;

    v_new_version := greatest(
      v_course.content_version,
      coalesce((select max(version) from private.content_publication_history where course_id = p_course_id), 0)
    ) + 1;
  else
    v_new_version := v_course.content_version;
  end if;

  -- 2. Pre-validate all items before mutating table
  for v_item in select value from jsonb_array_elements(v_stage.items) loop
    v_item_id := v_item->>'id';
    v_written_form := v_item->>'written_form';
    v_reading := coalesce(v_item->>'reading', '');
    v_kana := nullif(btrim(coalesce(v_item->>'kana', '')), '');
    v_romaji := nullif(btrim(coalesce(v_item->>'romaji', '')), '');
    v_pos := nullif(btrim(coalesce(v_item->>'part_of_speech', '')), '');

    if p_course_id = 'ja-n5' then
      if v_kana is null or v_romaji is null or v_pos is null then
        raise exception 'MISSING_COMPANION_METADATA: vocabulary id % in course ja-n5 requires kana, romaji, and part_of_speech', v_item_id
          using errcode = '22023';
      end if;
    end if;

    if v_item_id = any(v_incoming_ids) then
      raise exception 'DUPLICATE_VOCABULARY_ID: id % appears multiple times in staged items', v_item_id
        using errcode = '23505';
    end if;
    v_incoming_ids := array_append(v_incoming_ids, v_item_id);

    select * into v_existing
      from public.vocabulary
     where id = v_item_id;

    if found then
      if v_existing.course_id <> p_course_id then
        raise exception 'CROSS_COURSE_ID_CONFLICT: vocabulary id % belongs to course %, cannot be used by course %',
          v_item_id, v_existing.course_id, p_course_id
          using errcode = '23505';
      end if;

      if v_existing.written_form <> v_written_form or v_existing.reading <> v_reading then
        raise exception 'NATURAL_IDENTITY_CHANGE: vocabulary id % cannot change written_form from % to % or reading from % to %',
          v_item_id, v_existing.written_form, v_written_form, v_existing.reading, v_reading
          using errcode = '22023';
      end if;
    end if;
  end loop;

  -- 3. Apply insertions and updates with linguistic fields
  for v_item in select value from jsonb_array_elements(v_stage.items) loop
    v_item_id := v_item->>'id';
    v_written_form := v_item->>'written_form';
    v_reading := coalesce(v_item->>'reading', '');
    v_kana := nullif(btrim(coalesce(v_item->>'kana', '')), '');
    v_romaji := nullif(btrim(coalesce(v_item->>'romaji', '')), '');
    v_pos := nullif(btrim(coalesce(v_item->>'part_of_speech', '')), '');

    select * into v_existing
      from public.vocabulary
     where id = v_item_id;

    if not found then
      insert into public.vocabulary (
        id, course_id, written_form, reading, meaning_english, meaning_burmese,
        audio_path, examples, sort_order, is_active,
        kana, romaji, part_of_speech
      ) values (
        v_item_id, p_course_id, v_written_form, v_reading,
        coalesce(v_item->>'meaning_english', ''),
        coalesce(v_item->>'meaning_burmese', ''),
        nullif(v_item->>'audio_path', ''),
        coalesce(v_item->'examples', '[]'::jsonb),
        coalesce((v_item->>'sort_order')::integer, 0),
        true,
        v_kana,
        v_romaji,
        v_pos
      );
      v_inserted := v_inserted + 1;
    else
      if v_existing.written_form = v_written_form
         and v_existing.reading = v_reading
         and v_existing.meaning_english = coalesce(v_item->>'meaning_english', '')
         and v_existing.meaning_burmese = coalesce(v_item->>'meaning_burmese', '')
         and coalesce(v_existing.audio_path, '') = coalesce(v_item->>'audio_path', '')
         and v_existing.examples = coalesce(v_item->'examples', '[]'::jsonb)
         and v_existing.sort_order = coalesce((v_item->>'sort_order')::integer, 0)
         and coalesce(v_existing.kana, '') = coalesce(v_kana, '')
         and coalesce(v_existing.romaji, '') = coalesce(v_romaji, '')
         and coalesce(v_existing.part_of_speech, '') = coalesce(v_pos, '')
         and v_existing.is_active = true then
        v_unchanged := v_unchanged + 1;
      else
        update public.vocabulary set
          written_form = v_written_form,
          reading = v_reading,
          meaning_english = coalesce(v_item->>'meaning_english', ''),
          meaning_burmese = coalesce(v_item->>'meaning_burmese', ''),
          audio_path = nullif(v_item->>'audio_path', ''),
          examples = coalesce(v_item->'examples', '[]'::jsonb),
          sort_order = coalesce((v_item->>'sort_order')::integer, 0),
          is_active = true,
          kana = v_kana,
          romaji = v_romaji,
          part_of_speech = v_pos,
          updated_at = now()
        where id = v_item_id
          and course_id = p_course_id;
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  -- 4. Explicit retirement
  if v_stage.metadata is not null and v_stage.metadata ? 'retired_ids' and jsonb_typeof(v_stage.metadata->'retired_ids') = 'array' then
    for v_retire_id in select jsonb_array_elements_text(v_stage.metadata->'retired_ids') loop
      update public.vocabulary
         set is_active = false,
             updated_at = now()
       where id = v_retire_id
         and course_id = p_course_id
         and is_active = true;
      if found then
        v_retired := v_retired + 1;
      end if;
    end loop;
  end if;

  -- 5. Advance course version and publish
  update public.courses
     set is_published = true,
         content_version = v_new_version,
         updated_at = now()
   where id = p_course_id;

  -- 6. Mark stage published
  update private.content_stages
     set status = 'published',
         updated_at = now()
   where id = p_stage_id;

  -- 7. Record publication in history preserving linguistic fields in snapshot
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'course_id', v.course_id,
    'written_form', v.written_form,
    'reading', v.reading,
    'meaning_english', v.meaning_english,
    'meaning_burmese', v.meaning_burmese,
    'audio_path', v.audio_path,
    'examples', v.examples,
    'sort_order', v.sort_order,
    'is_active', v.is_active,
    'kana', v.kana,
    'romaji', v.romaji,
    'part_of_speech', v.part_of_speech
  ) order by v.sort_order, v.id), '[]'::jsonb) into v_post_snapshot
    from public.vocabulary v
   where v.course_id = p_course_id;

  select count(*)::int into v_total_active
    from public.vocabulary
   where course_id = p_course_id and is_active = true;

  insert into private.content_publication_history (
    course_id, version, action, snapshot, item_count,
    active_count, retired_count, operator, reason
  ) values (
    p_course_id, v_new_version, 'publish', v_post_snapshot,
    jsonb_array_length(v_post_snapshot),
    v_total_active,
    (select count(*)::int from public.vocabulary where course_id = p_course_id and not is_active),
    coalesce(p_operator, 'operator'), coalesce(p_reason, 'New publication')
  );

  return jsonb_build_object(
    'status', 'published',
    'course_id', p_course_id,
    'version', v_new_version,
    'stage_id', p_stage_id,
    'inserted', v_inserted,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'retired', v_retired,
    'total_active', v_total_active
  );
end;
$$;

revoke all on function public.s2s_publish_staged_content(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.s2s_publish_staged_content(text, uuid, text, text) to service_role;

create or replace function private.s2s_publish_staged_content(
  p_course_id text,
  p_stage_id uuid,
  p_operator text default 'operator',
  p_reason text default 'New publication'
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.s2s_publish_staged_content(p_course_id, p_stage_id, p_operator, p_reason);
$$;

revoke all on function private.s2s_publish_staged_content(text, uuid, text, text) from public, anon, authenticated;
grant execute on function private.s2s_publish_staged_content(text, uuid, text, text) to service_role;

-- 4. Extended Hardened Rollback RPC: public.s2s_rollback_course_content
create or replace function public.s2s_rollback_course_content(
  p_course_id text,
  p_target_version bigint,
  p_operator text default 'operator',
  p_reason text default 'Rollback to prior version'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_history private.content_publication_history%rowtype;
  v_course public.courses%rowtype;
  v_item jsonb;
  v_item_id text;
  v_snapshot_ids text[] := array[]::text[];
  v_restored_count integer := 0;
begin
  if p_course_id not in ('zh-hsk1', 'ja-n5') then
    raise exception 'UNSUPPORTED_COURSE' using errcode = '22023';
  end if;

  select * into v_course
    from public.courses
   where id = p_course_id
     for update;

  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = '02000';
  end if;

  select * into v_history
    from private.content_publication_history
   where course_id = p_course_id
     and version = p_target_version
     and action = 'publish'
   order by created_at desc
   limit 1;

  if not found then
    raise exception 'VERSION_NOT_FOUND: no publication snapshot for version % of course %',
      p_target_version, p_course_id
      using errcode = '02000';
  end if;

  -- Pre-validate snapshot items: reject cross-course ID conflict
  for v_item in select value from jsonb_array_elements(v_history.snapshot) loop
    v_item_id := v_item->>'id';
    if exists (select 1 from public.vocabulary where id = v_item_id and course_id <> p_course_id) then
      raise exception 'CROSS_COURSE_ID_CONFLICT: vocabulary id % belongs to another course, cannot rollback into course %',
        v_item_id, p_course_id
        using errcode = '23505';
    end if;
  end loop;

  -- Restore items from snapshot including linguistic fields
  for v_item in select value from jsonb_array_elements(v_history.snapshot) loop
    v_item_id := v_item->>'id';
    v_snapshot_ids := array_append(v_snapshot_ids, v_item_id);

    insert into public.vocabulary (
      id, course_id, written_form, reading, meaning_english, meaning_burmese,
      audio_path, examples, sort_order, is_active,
      kana, romaji, part_of_speech
    ) values (
      v_item_id, p_course_id, v_item->>'written_form', coalesce(v_item->>'reading', ''),
      coalesce(v_item->>'meaning_english', ''), coalesce(v_item->>'meaning_burmese', ''),
      nullif(v_item->>'audio_path', ''), coalesce(v_item->'examples', '[]'::jsonb),
      coalesce((v_item->>'sort_order')::integer, 0),
      coalesce((v_item->>'is_active')::boolean, true),
      nullif(v_item->>'kana', ''),
      nullif(v_item->>'romaji', ''),
      nullif(v_item->>'part_of_speech', '')
    )
    on conflict (id) do update set
      written_form = excluded.written_form,
      reading = excluded.reading,
      meaning_english = excluded.meaning_english,
      meaning_burmese = excluded.meaning_burmese,
      audio_path = excluded.audio_path,
      examples = excluded.examples,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active,
      kana = excluded.kana,
      romaji = excluded.romaji,
      part_of_speech = excluded.part_of_speech,
      updated_at = now()
    where public.vocabulary.course_id = p_course_id;

    v_restored_count := v_restored_count + 1;
  end loop;

  -- Deactivate items not in target snapshot
  update public.vocabulary
     set is_active = false,
         updated_at = now()
   where course_id = p_course_id
     and is_active = true
     and not (id = any(v_snapshot_ids));

  -- Update course version
  update public.courses
     set content_version = p_target_version,
         updated_at = now()
   where id = p_course_id;

  insert into private.content_publication_history (
    course_id, version, action, snapshot, item_count,
    active_count, retired_count, operator, reason
  ) values (
    p_course_id, p_target_version, 'rollback', v_history.snapshot,
    v_history.item_count, v_history.active_count, v_history.retired_count,
    coalesce(p_operator, 'operator'), coalesce(p_reason, 'Rollback to prior version')
  );

  return jsonb_build_object(
    'status', 'rolled_back',
    'course_id', p_course_id,
    'version', p_target_version,
    'target_version', p_target_version,
    'restored_items', v_restored_count,
    'total_active', (select count(*)::int from public.vocabulary where course_id = p_course_id and is_active)
  );
end;
$$;

revoke all on function public.s2s_rollback_course_content(text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.s2s_rollback_course_content(text, bigint, text, text) to service_role;

create or replace function private.s2s_rollback_course_content(
  p_course_id text,
  p_target_version bigint,
  p_operator text default 'operator',
  p_reason text default 'Rollback to prior version'
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.s2s_rollback_course_content(p_course_id, p_target_version, p_operator, p_reason);
$$;

revoke all on function private.s2s_rollback_course_content(text, bigint, text, text) from public, anon, authenticated;
grant execute on function private.s2s_rollback_course_content(text, bigint, text, text) to service_role;

-- 5. Extended Batch Mutation RPC with Sense Disambiguation
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
  sense_id text;
  client_id text;
  base_rev bigint;
  item_data jsonb;
  observed timestamptz;
  identity_key text;
  previous public.user_items%rowtype;
  tombstone public.user_item_tombstones%rowtype;
  new_rev bigint;
  acknowledged jsonb = '[]'::jsonb;
  item_ack jsonb;
  applied_count integer = 0;
  deleted_count integer = 0;
  conflict_count integer = 0;
  result jsonb;
  counter text;
  field text;
  example jsonb;
  seen numeric;
  correct numeric;
  wrong numeric;
  streak numeric;
begin
  if owner is null then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  if p_expected_user_id is distinct from owner then
    raise exception 'ACCOUNT_CHANGED' using errcode = '42501';
  end if;

  select s.reset_version, s.deleting into generation, deleting
    from private.account_state s
   where s.user_id = owner
     for update;

  if not found or deleting then
    raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501';
  end if;

  if p_expected_reset_version is null or p_expected_reset_version <> generation then
    raise exception 'RESET_VERSION_CHANGED' using errcode = '40001';
  end if;

  if p_request_id is null or p_mutations is null or jsonb_typeof(p_mutations) <> 'array' then
    raise exception 'INVALID_MUTATION_REQUEST' using errcode = '22023';
  end if;

  if jsonb_array_length(p_mutations) > 500 or octet_length(p_mutations::text) > 1048576 then
    raise exception 'MUTATION_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  request_hash = encode(sha256(convert_to(jsonb_build_object(
    'reset_version', generation::text,
    'mutations', p_mutations
  )::text, 'UTF8')), 'hex');

  select * into receipt
    from private.sync_mutation_receipts r
   where r.user_id = owner
     and r.request_id = p_request_id;

  if found then
    if receipt.input_hash <> request_hash then
      raise exception 'MUTATION_REQUEST_REUSED' using errcode = '22023';
    end if;
    return receipt.result || jsonb_build_object('replayed', true);
  end if;

  for mutation in select value from jsonb_array_elements(p_mutations) loop
    if jsonb_typeof(mutation) <> 'object'
       or mutation - array['op','language','kind','written_form','reading','client_id','base_revision','observed_at','data','item_key','sense_id'] <> '{}'::jsonb
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
    pronunciation = coalesce(mutation->>'reading', '');
    client_id = coalesce(mutation->>'client_id', '');
    base_rev = null;

    if mutation ? 'base_revision' and jsonb_typeof(mutation->'base_revision') <> 'null' then
      if jsonb_typeof(mutation->'base_revision') = 'number' then
        base_rev = (mutation->>'base_revision')::bigint;
      elsif jsonb_typeof(mutation->'base_revision') = 'string' and mutation->>'base_revision' ~ '^[0-9]+$' then
        base_rev = (mutation->>'base_revision')::bigint;
      else
        raise exception 'INVALID_BASE_REVISION' using errcode = '22023';
      end if;
      if base_rev < 0 then
        raise exception 'INVALID_BASE_REVISION' using errcode = '22023';
      end if;
    end if;

    if item_op not in ('upsert', 'delete')
       or item_language not in ('zh', 'ja', 'en')
       or item_kind not in ('saved_words', 'review_cards', 'learned_radicals', 'learned_kana', 'learned_sounds', 'learned_words')
       or char_length(written) not between 1 and 2000
       or private.s2s_item_text(written) = ''
       or char_length(pronunciation) > 2000
       or char_length(client_id) > 256 then
      raise exception 'INVALID_MUTATION_ITEM' using errcode = '22023';
    end if;

    if item_kind not in ('saved_words', 'review_cards', 'learned_words') then
      pronunciation = '';
    end if;

    observed = now();
    if mutation ? 'observed_at' and jsonb_typeof(mutation->'observed_at') <> 'null' then
      if jsonb_typeof(mutation->'observed_at') <> 'string' then
        raise exception 'INVALID_MUTATION_TIMESTAMP' using errcode = '22023';
      end if;
      observed = (mutation->>'observed_at')::timestamptz;
      if not isfinite(observed) then
        raise exception 'INVALID_MUTATION_TIMESTAMP' using errcode = '22023';
      end if;
      observed = greatest('1970-01-01T00:00:00Z'::timestamptz, least(observed, now()));
    end if;

    item_data = '{}'::jsonb;
    if item_op = 'upsert' then
      if not (mutation ? 'data') or jsonb_typeof(mutation->'data') <> 'object' then
        raise exception 'INVALID_MUTATION_ITEM' using errcode = '22023';
      end if;
      item_data = mutation->'data';

      if octet_length(item_data::text) > 16384
         or item_data ?| array['id','user_id','item_key','revision','reset_version','created_at','updated_at','language'] then
        raise exception 'INVALID_MUTATION_DATA' using errcode = '22023';
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
          seen = (item_data->>'seen')::numeric;
          correct = (item_data->>'correct')::numeric;
          wrong = (item_data->>'wrong')::numeric;
          streak = (item_data->>'streak')::numeric;
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

    -- Extract stable canonical sense identity
    -- Preserve four-part identities for HSK and ordinary N5 entries.
    -- Card ID alone must not change an ordinary word's cloud identity.
    -- Canonical sense identity is used ONLY where disambiguation is required:
    -- 1) Intentional homonyms: written in ('あの', 'ある', 'かける', 'キロ', 'もう')
    -- 2) Explicit sense_id or sense_key provided on mutation or item_data
    if written in ('あの', 'ある', 'かける', 'キロ', 'もう') then
      sense_id := coalesce(
        nullif(btrim(mutation->>'sense_id'), ''),
        nullif(btrim(item_data->>'sense_id'), ''),
        nullif(btrim(item_data->>'sense_key'), ''),
        nullif(btrim(item_data->>'card_id'), '')
      );
    elsif (mutation ? 'sense_id' and nullif(btrim(mutation->>'sense_id'), '') is not null)
       or (item_data ? 'sense_id' and nullif(btrim(item_data->>'sense_id'), '') is not null)
       or (item_data ? 'sense_key' and nullif(btrim(item_data->>'sense_key'), '') is not null) then
      sense_id := coalesce(
        nullif(btrim(mutation->>'sense_id'), ''),
        nullif(btrim(item_data->>'sense_id'), ''),
        nullif(btrim(item_data->>'sense_key'), '')
      );
    else
      sense_id := null;
    end if;

    if sense_id is not null and sense_id <> '' then
      identity_key = encode(sha256(convert_to(jsonb_build_array(
        item_language, item_kind,
        private.s2s_item_text(written),
        private.s2s_item_text(pronunciation),
        sense_id
      )::text, 'UTF8')), 'hex');
    else
      identity_key = encode(sha256(convert_to(jsonb_build_array(
        item_language, item_kind,
        private.s2s_item_text(written),
        private.s2s_item_text(pronunciation)
      )::text, 'UTF8')), 'hex');
    end if;

    if mutation ? 'item_key' and (mutation->>'item_key') <> identity_key then
      raise exception 'ITEM_KEY_MISMATCH' using errcode = '22023';
    end if;

    select * into previous from public.user_items
      where user_id = owner and item_key = identity_key;
    select * into tombstone from public.user_item_tombstones
      where user_id = owner and item_key = identity_key;

    if item_op = 'upsert' then
      if tombstone.user_id is not null then
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
          acknowledged = acknowledged || jsonb_build_array(item_ack);
          continue;
        end if;
      end if;

      if previous.user_id is not null then
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
          new_rev = previous.revision + 1;
          update public.user_items
             set data = item_data,
                 observed_at = observed,
                 revision = new_rev,
                 updated_at = now()
           where user_id = owner and item_key = identity_key;
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
        else
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
      end if;
    elsif item_op = 'delete' then
      if tombstone.user_id is not null then
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
      end if;

      if previous.user_id is not null then
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
            user_id, item_key, language, kind, written_form, reading, sense_id, deleted_at, revision
          ) values (
            owner, identity_key, item_language, item_kind, written, pronunciation, coalesce(sense_id, ''), now(), new_rev
          ) on conflict (user_id, item_key) do update
            set revision = excluded.revision,
                deleted_at = excluded.deleted_at,
                written_form = excluded.written_form,
                reading = excluded.reading,
                sense_id = excluded.sense_id;

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
        else
          insert into public.user_item_tombstones (
            user_id, item_key, language, kind, written_form, reading, sense_id, deleted_at, revision
          ) values (
            owner, identity_key, item_language, item_kind, written, pronunciation, coalesce(sense_id, ''), now(), 1
          ) on conflict (user_id, item_key) do update
            set revision = excluded.revision,
                deleted_at = excluded.deleted_at,
                written_form = excluded.written_form,
                reading = excluded.reading,
                sense_id = excluded.sense_id;

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
    end if;
  end loop;

  result = jsonb_build_object(
    'status', 'committed',
    'user_id', owner,
    'request_id', p_request_id,
    'reset_version', generation::text,
    'applied_count', applied_count,
    'deleted_count', deleted_count,
    'conflict_count', conflict_count,
    'replayed', false,
    'acknowledged', acknowledged
  );

  insert into private.sync_mutation_receipts (
    user_id, request_id, input_hash, reset_version, result
  ) values (
    owner, p_request_id, request_hash, generation, result
  );

  return result;
end;
$$;

revoke all on function public.s2s_apply_mutations(uuid, uuid, bigint, jsonb, boolean) from public, anon;
grant execute on function public.s2s_apply_mutations(uuid, uuid, bigint, jsonb, boolean) to authenticated, service_role;

-- 6. Extended Guest Import RPC with Sense Disambiguation
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
  sense_id text;
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
    if jsonb_typeof(item) <> 'object' or item - array['language','kind','written_form','reading','data','observed_at','sense_id'] <> '{}'::jsonb
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
      'saved_words','review_cards','search_history','written_chars','learned_radicals','learned_kana','learned_sounds','learned_words')
      or char_length(written) not between 1 and 2000 or private.s2s_item_text(written) = ''
      or char_length(pronunciation) > 2000 or octet_length(item_data::text) > 16384
      or item_data ?| array['id','user_id','item_key','revision','reset_version','created_at','updated_at','language'] then
      raise exception 'INVALID_IMPORT_ITEM' using errcode = '22023';
    end if;
    foreach field in array array['english','burmese','definition','burmese_definition','kana','part_of_speech','level','lesson_name','status','last_action','last_reviewed_at','card_id'] loop
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
    if item_kind not in ('saved_words', 'review_cards', 'learned_words') then pronunciation = ''; end if;
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
    elsif item_kind = 'learned_words' then
      if item_data ? 'seen' then
        if jsonb_typeof(item_data->'seen') is distinct from 'number'
          or (item_data->>'seen')::numeric < 0
          or (item_data->>'seen')::numeric > 9007199254740991
          or trunc((item_data->>'seen')::numeric) <> (item_data->>'seen')::numeric then
          raise exception 'INVALID_IMPORT_COUNTERS' using errcode = '22023';
        end if;
      end if;
    end if;

    -- Extract stable canonical sense identity
    -- Preserve four-part identities for HSK and ordinary N5 entries.
    -- Card ID alone must not change an ordinary word's cloud identity.
    -- Canonical sense identity is used ONLY where disambiguation is required:
    -- 1) Intentional homonyms: written in ('あの', 'ある', 'かける', 'キロ', 'もう')
    -- 2) Explicit sense_id or sense_key provided on item or item_data
    if written in ('あの', 'ある', 'かける', 'キロ', 'もう') then
      sense_id := coalesce(
        nullif(btrim(item->>'sense_id'), ''),
        nullif(btrim(item_data->>'sense_id'), ''),
        nullif(btrim(item_data->>'sense_key'), ''),
        nullif(btrim(item_data->>'card_id'), '')
      );
    elsif (item ? 'sense_id' and nullif(btrim(item->>'sense_id'), '') is not null)
       or (item_data ? 'sense_id' and nullif(btrim(item_data->>'sense_id'), '') is not null)
       or (item_data ? 'sense_key' and nullif(btrim(item_data->>'sense_key'), '') is not null) then
      sense_id := coalesce(
        nullif(btrim(item->>'sense_id'), ''),
        nullif(btrim(item_data->>'sense_id'), ''),
        nullif(btrim(item_data->>'sense_key'), '')
      );
    else
      sense_id := null;
    end if;

    if sense_id is not null and sense_id <> '' then
      identity_key = encode(sha256(convert_to(jsonb_build_array(item_language, item_kind,
        private.s2s_item_text(written), private.s2s_item_text(pronunciation), sense_id)::text, 'UTF8')), 'hex');
    else
      identity_key = encode(sha256(convert_to(jsonb_build_array(item_language, item_kind,
        private.s2s_item_text(written), private.s2s_item_text(pronunciation))::text, 'UTF8')), 'hex');
    end if;

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
    else
      if observed > previous.observed_at then
        update public.user_items
          set data = item_data, observed_at = observed, updated_at = now(),
              revision = previous.revision + 1
          where user_id = owner and item_key = identity_key;
        updated = updated + 1;
      end if;
    end if;
  end loop;

  delete from public.user_items i using (
    select item_key, row_number() over (partition by language order by observed_at desc, item_key) as position
    from public.user_items where user_id = owner and kind = 'search_history'
  ) history
  where i.user_id = owner and i.kind = 'search_history'
    and i.item_key = history.item_key and history.position > 10;

  result = jsonb_build_object('status','imported','added',added,'updated',updated,'replayed',false);
  insert into private.guest_import_receipts (user_id,request_id,source_fingerprint,input_hash,reset_version,result)
    values (owner,p_request_id,p_source_fingerprint,request_hash,generation,result);

  return result;
end;
$$;

revoke all on function public.s2s_import_guest(uuid, uuid, bigint, text, text, jsonb) from public, anon;
grant execute on function public.s2s_import_guest(uuid, uuid, bigint, text, text, jsonb) to authenticated, service_role;

-- 7. Extended Account Snapshot RPC: public.s2s_account_snapshot (emits sense_id in tombstones)
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
  result jsonb;
  streak_info jsonb;
begin
  if owner is null then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  if p_expected_user_id is distinct from owner then
    raise exception 'ACCOUNT_CHANGED' using errcode = '42501';
  end if;

  select s.reset_version, s.deleting into generation, deleting
    from private.account_state s
   where s.user_id = owner for share;

  if not found or deleting then
    raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501';
  end if;

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
        'sense_id', coalesce(t.sense_id, ''),
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
          'sense_id', coalesce(t.sense_id, ''),
          'deleted_at', t.deleted_at, 'revision', t.revision::text
        ) order by t.language, t.kind, t.item_key)
        from public.user_item_tombstones t where t.user_id = owner
      ), '[]'::jsonb)
    );
  end if;

  return result;
end;
$$;

revoke all on function public.s2s_account_snapshot(uuid) from public, anon;
grant execute on function public.s2s_account_snapshot(uuid) to authenticated, service_role;

commit;
