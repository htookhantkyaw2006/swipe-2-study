-- Add optional linguistic fields for multi-script courses (Japanese kana, romaji, part_of_speech)
-- to public.vocabulary table.
-- Preserves existing Chinese records with null defaults.

begin;

alter table public.vocabulary
  add column if not exists kana text default null,
  add column if not exists romaji text default null,
  add column if not exists part_of_speech text default null;

-- Update publication function to preserve optional linguistic fields if present in staged items
create or replace function public.s2s_publish_course_content(
  p_course_id text,
  p_stage_id uuid,
  p_operator text default 'operator',
  p_reason text default 'New publication'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_stage private.content_stages%rowtype;
  v_course public.courses%rowtype;
  v_item jsonb;
  v_item_id text;
  v_written_form text;
  v_reading text;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_retired integer := 0;
  v_unchanged integer := 0;
  v_staged_ids text[] := array[]::text[];
  v_retired_ids text[] := array[]::text[];
  v_new_version integer;
  v_existing public.vocabulary%rowtype;
  v_pub_id uuid;
begin
  if p_course_id not in ('zh-hsk1', 'ja-n5') then
    raise exception 'UNSUPPORTED_COURSE' using errcode = '22023';
  end if;

  select * into v_stage
    from private.content_stages
   where id = p_stage_id and course_id = p_course_id;

  if not found then
    raise exception 'STAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_stage.status <> 'staged' then
    raise exception 'INVALID_STAGE_STATUS' using errcode = '22023';
  end if;

  select * into v_course
    from public.courses
   where id = p_course_id
   for update;

  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_stage.source_checksum = v_course.content_checksum and v_course.is_published then
    raise exception 'IDENTICAL_CONTENT_ALREADY_PUBLISHED' using errcode = '22023';
  end if;

  if v_stage.metadata ? 'retired_ids' then
    select array_agg(elem::text) into v_retired_ids
      from jsonb_array_elements_text(v_stage.metadata->'retired_ids') as elem;
  end if;

  for v_item in select * from jsonb_array_elements(v_stage.items)
  loop
    v_item_id := v_item->>'id';
    v_written_form := v_item->>'written_form';
    v_reading := coalesce(v_item->>'reading', '');

    if v_item_id is null or v_written_form is null then
      raise exception 'MALFORMED_STAGED_ITEM' using errcode = '22023';
    end if;

    v_staged_ids := array_append(v_staged_ids, v_item_id);

    select * into v_existing
      from public.vocabulary
     where id = v_item_id;

    if not found then
      insert into public.vocabulary (
        id, course_id, written_form, reading, meaning_english, meaning_burmese,
        audio_path, examples, sort_order, is_active, kana, romaji, part_of_speech
      ) values (
        v_item_id, p_course_id, v_written_form, v_reading,
        coalesce(v_item->>'meaning_english', ''),
        coalesce(v_item->>'meaning_burmese', ''),
        nullif(v_item->>'audio_path', ''),
        coalesce(v_item->'examples', '[]'::jsonb),
        coalesce((v_item->>'sort_order')::integer, 0),
        true,
        nullif(v_item->>'kana', ''),
        nullif(v_item->>'romaji', ''),
        nullif(v_item->>'part_of_speech', '')
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
         and coalesce(v_existing.kana, '') = coalesce(v_item->>'kana', '')
         and coalesce(v_existing.romaji, '') = coalesce(v_item->>'romaji', '')
         and coalesce(v_existing.part_of_speech, '') = coalesce(v_item->>'part_of_speech', '')
         and v_existing.is_active = true then
        v_unchanged := v_unchanged + 1;
      else
        update public.vocabulary
           set written_form = v_written_form,
               reading = v_reading,
               meaning_english = coalesce(v_item->>'meaning_english', ''),
               meaning_burmese = coalesce(v_item->>'meaning_burmese', ''),
               audio_path = nullif(v_item->>'audio_path', ''),
               examples = coalesce(v_item->'examples', '[]'::jsonb),
               sort_order = coalesce((v_item->>'sort_order')::integer, 0),
               kana = nullif(v_item->>'kana', ''),
               romaji = nullif(v_item->>'romaji', ''),
               part_of_speech = nullif(v_item->>'part_of_speech', ''),
               is_active = true,
               updated_at = now()
         where id = v_item_id;
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  if v_retired_ids is not null and array_length(v_retired_ids, 1) > 0 then
    update public.vocabulary
       set is_active = false,
           updated_at = now()
     where course_id = p_course_id
       and id = any(v_retired_ids)
       and is_active = true;
    get diagnostics v_retired = row_count;
  end if;

  v_new_version := coalesce(v_course.content_version, 0) + 1;

  update public.courses
     set is_published = true,
         content_version = v_new_version,
         content_checksum = v_stage.source_checksum,
         updated_at = now(),
         publication_seq = coalesce(v_course.publication_seq, 0) + 1
   where id = p_course_id;

  update private.content_stages
     set status = 'published',
         applied_at = now()
   where id = p_stage_id;

  insert into private.content_publications (
    stage_id, course_id, content_version, content_checksum,
    operator, reason, items_count
  ) values (
    p_stage_id, p_course_id, v_new_version, v_stage.source_checksum,
    p_operator, p_reason, jsonb_array_length(v_stage.items)
  ) returning id into v_pub_id;

  return jsonb_build_object(
    'publication_id', v_pub_id,
    'course_id', p_course_id,
    'content_version', v_new_version,
    'inserted', v_inserted,
    'updated', v_updated,
    'retired', v_retired,
    'unchanged', v_unchanged,
    'total_active', (select count(*) from public.vocabulary where course_id = p_course_id and is_active = true)
  );
end;
$$;

commit;
