-- ===========================================================================
-- Migration: 20261030000100_content_publication_foundation.sql
-- Description: Establish restricted content storage (HSK1 and JLPT N5 only),
--              staging tables, atomic publication, publication history, and
--              rollback functions with explicit retirement and RLS protection.
-- ===========================================================================

begin;

-- 1. Initialize supported course shells in public.courses (HSK1 and JLPT N5 only)
insert into public.courses (id, language, level_id, title, is_published, content_version)
values
  ('zh-hsk1', 'zh', 'HSK1', 'Chinese HSK 1', false, 1),
  ('ja-n5', 'ja', 'N5', 'Japanese JLPT N5', false, 1)
on conflict (id) do update set
  language = excluded.language,
  level_id = excluded.level_id,
  title = excluded.title;

-- 2. Restrict public.courses to supported scope
alter table public.courses drop constraint if exists courses_supported_scope;
alter table public.courses add constraint courses_supported_scope check (id in ('zh-hsk1', 'ja-n5'));

-- 3. Staging table for content imports
create table if not exists private.content_stages (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  stage_version bigint not null default 1 check (stage_version > 0),
  status text not null default 'staged' check (status in ('staged', 'published', 'superseded', 'discarded')),
  source_checksum text not null check (char_length(source_checksum) = 64 and source_checksum ~ '^[a-f0-9]{64}$'),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  item_count integer not null check (item_count >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  staged_by text not null default 'operator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_stages_course_status_idx
  on private.content_stages (course_id, status, created_at desc);

alter table private.content_stages enable row level security;
revoke all on private.content_stages from public, anon, authenticated;
grant all on private.content_stages to service_role;

-- 4. Publication and rollback history table
create table if not exists private.content_publication_history (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  version bigint not null check (version > 0),
  action text not null check (action in ('publish', 'rollback')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'array'),
  item_count integer not null check (item_count >= 0),
  active_count integer not null check (active_count >= 0),
  retired_count integer not null check (retired_count >= 0),
  operator text not null default 'operator',
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists content_pub_history_course_ver_idx
  on private.content_publication_history (course_id, version desc, created_at desc);

alter table private.content_publication_history enable row level security;
revoke all on private.content_publication_history from public, anon, authenticated;
grant all on private.content_publication_history to service_role;

-- 5. Stored function: Stage course content
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

  -- Mark existing 'staged' entries for this course as 'superseded'
  update private.content_stages
     set status = 'superseded',
         updated_at = now()
   where course_id = p_course_id
     and status = 'staged';

  -- Insert new stage
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

-- 6. Stored function: Publish staged course content atomically
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

  -- 1. Create backup snapshot of current published state
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

  -- Determine next version and preserve pre-update snapshot if already published
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

  -- 2. Process all incoming staged items
  for v_item in select value from jsonb_array_elements(v_stage.items) loop
    v_item_id := v_item->>'id';
    v_written_form := v_item->>'written_form';
    v_reading := coalesce(v_item->>'reading', '');
    v_incoming_ids := array_append(v_incoming_ids, v_item_id);

    select * into v_existing
      from public.vocabulary
     where id = v_item_id;

    if not found then
      -- New item insertion
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
      -- Verify stable identity: existing ID cannot change both written_form and reading to an unrelated word
      if v_existing.written_form <> v_written_form and v_existing.reading <> v_reading then
        raise exception 'AMBIGUOUS_IDENTITY_CHANGE: vocabulary id % cannot change written_form from % to % and reading from % to %',
          v_item_id, v_existing.written_form, v_written_form, v_existing.reading, v_reading
          using errcode = '22023';
      end if;

      -- Check if any content changed
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
        where id = v_item_id;
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  -- 3. Explicit retirement: items absent from incoming staged list are set is_active = false
  -- They are NEVER deleted to protect learner records and history!
  with retired_items as (
    update public.vocabulary
       set is_active = false,
           updated_at = now()
     where course_id = p_course_id
       and is_active = true
       and not (id = any(v_incoming_ids))
    returning id
  )
  select count(*)::int into v_retired from retired_items;

  -- 4. Advance course version and publish
  update public.courses
     set is_published = true,
          content_version = v_new_version,
          updated_at = now()
    where id = p_course_id;

  -- 5. Mark stage published
  update private.content_stages
     set status = 'published',
         updated_at = now()
   where id = p_stage_id;

  -- 6. Record newly published version in history
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

  v_total_active := (select count(*)::int from public.vocabulary where course_id = p_course_id and is_active);

  insert into private.content_publication_history (
    course_id, version, action, snapshot, item_count,
    active_count, retired_count, operator, reason
  ) values (
    p_course_id, v_new_version, 'publish', v_post_snapshot,
    jsonb_array_length(v_post_snapshot),
    v_total_active,
    (select count(*)::int from public.vocabulary where course_id = p_course_id and not is_active),
    coalesce(p_operator, 'operator'), coalesce(p_reason, 'Published version ' || v_new_version)
  );

  return jsonb_build_object(
    'course_id', p_course_id,
    'version', v_new_version,
    'status', 'published',
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

-- 7. Stored function: Rollback course content to a prior published version
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

  -- Look up target version snapshot in publication history
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
      updated_at = now();

    v_restored_count := v_restored_count + 1;
  end loop;

  -- Deactivate any items currently active that were not in the target snapshot
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
    v_history.item_count, v_history.active_count, v_history.retired_count,
    coalesce(p_operator, 'operator'), coalesce(p_reason, 'Rollback to version ' || p_target_version)
  );

  return jsonb_build_object(
    'course_id', p_course_id,
    'version', p_target_version,
    'status', 'rolled_back',
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

-- 8. Stored function: Get Course Content Status (for operator tooling)
create or replace function public.s2s_get_course_content_status(
  p_course_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.courses%rowtype;
  v_active_count integer;
  v_retired_count integer;
  v_latest_stage jsonb;
  v_latest_publish jsonb;
begin
  if p_course_id not in ('zh-hsk1', 'ja-n5') then
    raise exception 'UNSUPPORTED_COURSE' using errcode = '22023';
  end if;

  select * into v_course
    from public.courses
   where id = p_course_id;

  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = '02000';
  end if;

  select count(*)::int into v_active_count
    from public.vocabulary
   where course_id = p_course_id and is_active = true;

  select count(*)::int into v_retired_count
    from public.vocabulary
   where course_id = p_course_id and is_active = false;

  select to_jsonb(s) into v_latest_stage
    from (
      select id, stage_version, status, source_checksum, item_count, staged_by, created_at, updated_at
        from private.content_stages
       where course_id = p_course_id
       order by created_at desc
       limit 1
    ) s;

  select to_jsonb(h) into v_latest_publish
    from (
      select id, version, action, item_count, active_count, retired_count, operator, reason, created_at
        from private.content_publication_history
       where course_id = p_course_id
       order by created_at desc
       limit 1
    ) h;

  return jsonb_build_object(
    'course_id', v_course.id,
    'language', v_course.language,
    'level_id', v_course.level_id,
    'title', v_course.title,
    'is_published', v_course.is_published,
    'content_version', v_course.content_version,
    'active_count', coalesce(v_active_count, 0),
    'retired_count', coalesce(v_retired_count, 0),
    'latest_stage', v_latest_stage,
    'latest_publication', v_latest_publish
  );
end;
$$;

revoke all on function public.s2s_get_course_content_status(text) from public, anon, authenticated;
grant execute on function public.s2s_get_course_content_status(text) to service_role;

commit;
