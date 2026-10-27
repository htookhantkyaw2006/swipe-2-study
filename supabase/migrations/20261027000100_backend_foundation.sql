-- First application migration. Apply to a reviewed, empty STAGING project.
-- This establishes profiles/content/storage only; progress sync ships separately.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
revoke create on schema public from public, anon, authenticated;

create table private.account_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  deleting boolean not null default false,
  reset_version bigint not null default 0 check (reset_version >= 0)
);
alter table private.account_state enable row level security;
revoke all on private.account_state from public, anon, authenticated;
grant all on private.account_state to service_role;

create function private.is_active_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.account_state
    where user_id = (select auth.uid()) and not deleting
  );
$$;
revoke all on function private.is_active_user() from public, anon;
grant execute on function private.is_active_user() to authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  avatar_path text check (
    avatar_path is null or (
      char_length(avatar_path) <= 256
      and left(avatar_path, 37) = id::text || '/'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy profiles_read_own on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select private.is_active_user()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.is_active_user()))
  with check (id = (select auth.uid()) and (select private.is_active_user()));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 16384),
  active_language text not null default 'zh' check (active_language in ('zh', 'ja', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from public, anon, authenticated;
grant select on public.user_preferences to authenticated;
grant insert (user_id, settings, active_language) on public.user_preferences to authenticated;
grant update (settings, active_language) on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;
create policy preferences_read_own on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()));
create policy preferences_insert_own on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
create policy preferences_update_own on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
create trigger preferences_updated_at before update on public.user_preferences
  for each row execute function private.set_updated_at();

create function private.create_account_records()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into private.account_state (user_id) values (new.id);
  insert into public.profiles (id, display_name) values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name', ''
    ), 100)
  );
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;
revoke all on function private.create_account_records() from public, anon, authenticated;
create trigger s2s_auth_user_created after insert on auth.users
  for each row execute function private.create_account_records();

-- Include any accounts the owner created while configuring Auth before migration.
insert into private.account_state (user_id) select id from auth.users;
insert into public.profiles (id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'full_name', ''), 100)
from auth.users;
insert into public.user_preferences (user_id) select id from auth.users;

create table public.courses (
  id text primary key check (char_length(id) between 1 and 100),
  language text not null check (language in ('zh', 'ja')),
  level_id text not null,
  title text not null,
  is_published boolean not null default false,
  content_version bigint not null default 1 check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (language, level_id)
);
create table public.vocabulary (
  id text primary key check (char_length(id) between 1 and 150),
  course_id text not null references public.courses(id) on delete restrict,
  written_form text not null check (char_length(written_form) between 1 and 500),
  reading text not null default '',
  meaning_english text not null default '',
  meaning_burmese text not null default '',
  audio_path text,
  examples jsonb not null default '[]'::jsonb
    check (jsonb_typeof(examples) = 'array' and jsonb_array_length(examples) <= 3),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vocabulary_course_order_idx on public.vocabulary (course_id, sort_order, id);
alter table public.courses enable row level security;
alter table public.vocabulary enable row level security;
revoke all on public.courses, public.vocabulary from public, anon, authenticated;
grant select on public.courses, public.vocabulary to anon, authenticated;
grant all on public.courses, public.vocabulary to service_role;
create policy courses_read_published on public.courses for select to anon, authenticated
  using (is_published);
-- Retired words stay readable for learning history; new sessions filter is_active.
create policy vocabulary_read_published on public.vocabulary for select to anon, authenticated
  using (exists (select 1 from public.courses where courses.id = vocabulary.course_id and is_published));
create trigger courses_updated_at before update on public.courses
  for each row execute function private.set_updated_at();
create trigger vocabulary_updated_at before update on public.vocabulary
  for each row execute function private.set_updated_at();

-- Files are private. Profile/avatar UI will request short-lived signed URLs.
-- Fail instead of silently altering an existing project's avatars bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/png', 'image/webp']);

create policy s2s_avatars_read_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_active_user()));
create policy s2s_avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_active_user()));
create policy s2s_avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_active_user()))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_active_user()));
create policy s2s_avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_active_user()));

commit;
