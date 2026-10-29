-- ===========================================================================
-- Migration: 20261030000200_content_publication_hardening.sql
-- Description: Additive migration hardening content publication:
--              1. Require explicit operator intent for vocabulary retirement
--                 (omission from CSV preserves existing active items).
--              2. Reject cross-course ID reuse before mutation with full rollback.
--              3. Reject natural-identity changes (written_form OR reading) for
--                 existing IDs to prevent detaching learner progress.
--              4. Reject stale stage versions if course version advanced.
--              5. Enforce boundary validation on input shapes and duplicate IDs.
-- ===========================================================================

begin;

-- 1. Hardened Staging RPC: public.s2s_stage_course_content
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
  v_item_count integer;
  v_current_version bigint;
  v_item jsonb;
  v_item_id text;
  v_written_form text;
  v_reading text;
  v_seen_ids text[] := array[]::text[];
  v_existing public.vocabulary%rowtype;
  v_retire_id text;
begin
  if p_course_id not in ('zh-hsk1', 'ja-n5') then
    raise exception 'UNSUPPORTED_COURSE' using errcode = '22023';
  end if;

  if p_source_checksum is null or char_length(p_source_checksum) <> 64 or p_source_checksum !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_CHECKSUM' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_ITEMS_ARRAY' using errcode = '22023';
  end if;

  v_item_count = jsonb_array_length(p_items);

  select content_version into v_current_version
    from public.courses
   where id = p_course_id;

  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = '02000';
  end if;

  -- Validate all items before staging
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'INVALID_ITEM_SHAPE: items must be objects' using errcode = '22023';
    end if;

    v_item_id := v_item->>'id';
    v_written_form := v_item->>'written_form';
    v_reading := coalesce(v_item->>'reading', '');

    if v_item_id is null or char_length(trim(v_item_id)) = 0 then
      raise exception 'INVALID_VOCABULARY_ID: id cannot be empty' using errcode = '22023';
    end if;

    if v_written_form is null or char_length(trim(v_written_form)) = 0 then
      raise exception 'INVALID_WRITTEN_FORM: written_form cannot be empty' using errcode = '22023';
    end if;

    if coalesce(v_item->>'course_id', '') <> p_course_id then
      raise exception 'COURSE_ALIGNMENT_MISMATCH: item % specifies course % but target is %',
        v_item_id, coalesce(v_item->>'course_id', 'null'), p_course_id
        using errcode = '22023';
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

      -- Check natural identity change: neither written_form NOR reading may change
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

  -- Insert new stage record
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

-- 2. Hardened Atomic Publication RPC: public.s2s_publish_staged_content
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

  -- Lock course row exclusively for atomic publication
  select * into v_course
    from public.courses
   where id = p_course_id
     for update;

  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = '02000';
  end if;

  -- Fetch and lock stage record
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

  -- Prevent stale staged version from overwriting a newer publication unnoticed
  if v_stage.stage_version <> v_course.content_version then
    raise exception 'STALE_STAGE_VERSION: stage was prepared for version %, but current course version is %',
      v_stage.stage_version, v_course.content_version
      using errcode = '40001';
  end if;

  -- 1. Create pre-update backup snapshot of current published state
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
    'is_active', v.is_active
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

    if v_item_id = any(v_incoming_ids) then
      raise exception 'DUPLICATE_VOCABULARY_ID: id % appears multiple times in staged items', v_item_id
        using errcode = '23505';
    end if;
    v_incoming_ids := array_append(v_incoming_ids, v_item_id);

    select * into v_existing
      from public.vocabulary
     where id = v_item_id;

    if found then
      -- Reject cross-course ID reuse
      if v_existing.course_id <> p_course_id then
        raise exception 'CROSS_COURSE_ID_CONFLICT: vocabulary id % belongs to course %, cannot be used by course %',
          v_item_id, v_existing.course_id, p_course_id
          using errcode = '23505';
      end if;

      -- Reject natural identity change
      if v_existing.written_form <> v_written_form or v_existing.reading <> v_reading then
        raise exception 'NATURAL_IDENTITY_CHANGE: vocabulary id % cannot change written_form from % to % or reading from % to %',
          v_item_id, v_existing.written_form, v_written_form, v_existing.reading, v_reading
          using errcode = '22023';
      end if;
    end if;
  end loop;

  -- 3. Apply insertions and updates
  for v_item in select value from jsonb_array_elements(v_stage.items) loop
    v_item_id := v_item->>'id';
    v_written_form := v_item->>'written_form';
    v_reading := coalesce(v_item->>'reading', '');

    select * into v_existing
      from public.vocabulary
     where id = v_item_id;

    if not found then
      insert into public.vocabulary (
        id, course_id, written_form, reading, meaning_english, meaning_burmese,
        audio_path, examples, sort_order, is_active
      ) values (
        v_item_id, p_course_id, v_written_form, v_reading,
        coalesce(v_item->>'meaning_english', ''),
        coalesce(v_item->>'meaning_burmese', ''),
        nullif(v_item->>'audio_path', ''),
        coalesce(v_item->'examples', '[]'::jsonb),
        coalesce((v_item->>'sort_order')::integer, 0),
        true
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
          updated_at = now()
        where id = v_item_id
          and course_id = p_course_id;
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  -- 4. Explicit retirement: ONLY items identified in metadata.retired_ids are retired
  -- Omission alone preserves existing items active!
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

  -- 7. Record publication in history
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
    'is_active', v.is_active
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

-- 3. Hardened Rollback RPC: public.s2s_rollback_course_content
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

  -- Pre-validate snapshot items: reject any cross-course ID conflict
  for v_item in select value from jsonb_array_elements(v_history.snapshot) loop
    v_item_id := v_item->>'id';
    if exists (select 1 from public.vocabulary where id = v_item_id and course_id <> p_course_id) then
      raise exception 'CROSS_COURSE_ID_CONFLICT: vocabulary id % belongs to another course, cannot rollback into course %',
        v_item_id, p_course_id
        using errcode = '23505';
    end if;
  end loop;

  -- Restore items from snapshot
  for v_item in select value from jsonb_array_elements(v_history.snapshot) loop
    v_item_id := v_item->>'id';
    v_snapshot_ids := array_append(v_snapshot_ids, v_item_id);

    insert into public.vocabulary (
      id, course_id, written_form, reading, meaning_english, meaning_burmese,
      audio_path, examples, sort_order, is_active
    ) values (
      v_item_id, p_course_id, v_item->>'written_form', coalesce(v_item->>'reading', ''),
      coalesce(v_item->>'meaning_english', ''), coalesce(v_item->>'meaning_burmese', ''),
      nullif(v_item->>'audio_path', ''), coalesce(v_item->'examples', '[]'::jsonb),
      coalesce((v_item->>'sort_order')::integer, 0),
      coalesce((v_item->>'is_active')::boolean, true)
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
      updated_at = now()
    where public.vocabulary.course_id = p_course_id;

    v_restored_count := v_restored_count + 1;
  end loop;

  -- Deactivate any items active in course that were not in target snapshot
  update public.vocabulary
     set is_active = false,
         updated_at = now()
   where course_id = p_course_id
     and is_active = true
     and not (id = any(v_snapshot_ids));

  -- Update course version
  update public.courses
     set content_version = p_target_version,
         is_published = true,
         updated_at = now()
   where id = p_course_id;

  -- Record rollback action in history
  insert into private.content_publication_history (
    course_id, version, action, snapshot, item_count,
    active_count, retired_count, operator, reason
  ) values (
    p_course_id, p_target_version, 'rollback', v_history.snapshot,
    jsonb_array_length(v_history.snapshot),
    (select count(*)::int from public.vocabulary where course_id = p_course_id and is_active),
    (select count(*)::int from public.vocabulary where course_id = p_course_id and not is_active),
    coalesce(p_operator, 'operator'), coalesce(p_reason, 'Rollback to prior version')
  );

  return jsonb_build_object(
    'status', 'rolled_back',
    'course_id', p_course_id,
    'version', p_target_version,
    'restored_items', v_restored_count,
    'total_active', (select count(*)::int from public.vocabulary where course_id = p_course_id and is_active)
  );
end;
$$;

commit;
