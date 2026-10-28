-- Additive migration: Account deletion server foundation.
-- Establishes durable deletion lifecycle tracking and atomic row-locking RPCs.
-- Browser clients are granted ZERO access to this table or functions.
begin;

-- Durable record of account deletion requests and progression.
-- Retained even after auth.users row cascades and is removed.
create table if not exists private.account_deletions (
  user_id uuid primary key,
  status text not null check (status in ('pending', 'storage_cleaned', 'auth_deleted', 'finalized')),
  storage_cleaned_at timestamptz,
  auth_deleted_at timestamptz,
  finalized_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.account_deletions enable row level security;
revoke all on private.account_deletions from public, anon, authenticated;
grant all on private.account_deletions to service_role;

-- Atomically marks an account as deleting using the same account-row locking
-- protocol as import/snapshot. The transaction commits immediately so no
-- SQL transaction remains open during Storage/Auth network calls.
create or replace function public.s2s_begin_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  generation bigint;
  is_deleting boolean;
  deletion_rec private.account_deletions%rowtype;
begin
  if p_user_id is null then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  -- Lock the account state row
  select s.reset_version, s.deleting into generation, is_deleting
    from private.account_state s
    where s.user_id = p_user_id
    for update;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = '42501';
  end if;

  -- Mark as deleting immediately (locks out RLS reads/writes & snapshot/import)
  update private.account_state
    set deleting = true
    where user_id = p_user_id;

  -- Insert or record pending deletion in durable table
  insert into private.account_deletions (user_id, status)
    values (p_user_id, 'pending')
    on conflict (user_id) do update
      set updated_at = now()
    returning * into deletion_rec;

  return jsonb_build_object(
    'user_id', p_user_id,
    'status', deletion_rec.status,
    'reset_version', generation::text,
    'deleting', true
  );
end;
$$;

revoke all on function public.s2s_begin_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.s2s_begin_account_deletion(uuid) to service_role;

-- Records granular step completion (storage_cleaned, auth_deleted, finalized)
create or replace function public.s2s_record_deletion_progress(
  p_user_id uuid,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rec private.account_deletions%rowtype;
begin
  if p_user_id is null or p_status is null
    or p_status not in ('pending', 'storage_cleaned', 'auth_deleted', 'finalized') then
    raise exception 'INVALID_DELETION_STATUS' using errcode = '22023';
  end if;

  update private.account_deletions
    set status = p_status,
        storage_cleaned_at = case when p_status = 'storage_cleaned' then coalesce(storage_cleaned_at, now()) else storage_cleaned_at end,
        auth_deleted_at = case when p_status = 'auth_deleted' then coalesce(auth_deleted_at, now()) else auth_deleted_at end,
        finalized_at = case when p_status = 'finalized' then coalesce(finalized_at, now()) else finalized_at end,
        error = p_error,
        updated_at = now()
    where user_id = p_user_id
    returning * into updated_rec;

  if not found then
    -- Record may be created directly during operator reconciliation or if missing
    insert into private.account_deletions (user_id, status, error, finalized_at)
      values (p_user_id, p_status, p_error, case when p_status = 'finalized' then now() else null end)
      returning * into updated_rec;
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'status', updated_rec.status,
    'storage_cleaned_at', updated_rec.storage_cleaned_at,
    'auth_deleted_at', updated_rec.auth_deleted_at,
    'finalized_at', updated_rec.finalized_at,
    'error', updated_rec.error
  );
end;
$$;

revoke all on function public.s2s_record_deletion_progress(uuid, text, text) from public, anon, authenticated;
grant execute on function public.s2s_record_deletion_progress(uuid, text, text) to service_role;

-- Helper to retrieve durable deletion state for operators
create or replace function public.s2s_get_deletion_state(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_rec private.account_state%rowtype;
  del_rec private.account_deletions%rowtype;
begin
  select * into state_rec from private.account_state where user_id = p_user_id;
  select * into del_rec from private.account_deletions where user_id = p_user_id;

  return jsonb_build_object(
    'user_id', p_user_id,
    'account_exists', state_rec.user_id is not null,
    'deleting', coalesce(state_rec.deleting, false),
    'reset_version', state_rec.reset_version::text,
    'deletion_record', case when del_rec.user_id is not null then jsonb_build_object(
      'status', del_rec.status,
      'storage_cleaned_at', del_rec.storage_cleaned_at,
      'auth_deleted_at', del_rec.auth_deleted_at,
      'finalized_at', del_rec.finalized_at,
      'error', del_rec.error,
      'created_at', del_rec.created_at,
      'updated_at', del_rec.updated_at
    ) else null end
  );
end;
$$;

revoke all on function public.s2s_get_deletion_state(uuid) from public, anon, authenticated;
grant execute on function public.s2s_get_deletion_state(uuid) to service_role;

-- Durable, atomic account deletion attempt tracking across function instances.
create table if not exists private.account_deletion_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  throttled_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table private.account_deletion_attempts enable row level security;
revoke all on private.account_deletion_attempts from public, anon, authenticated;
grant all on private.account_deletion_attempts to service_role;

-- Atomically inspects attempt rate-limiting for an account.
create or replace function public.s2s_check_deletion_throttled(
  p_user_id uuid,
  p_max_attempts integer default 5,
  p_window_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec private.account_deletion_attempts%rowtype;
  now_ts timestamptz := now();
  retry_after integer := 0;
begin
  if p_user_id is null then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  select * into rec
    from private.account_deletion_attempts
    where user_id = p_user_id
    for update;

  if found then
    if rec.throttled_until is not null and rec.throttled_until > now_ts then
      retry_after := ceil(extract(epoch from (rec.throttled_until - now_ts)))::integer;
      return jsonb_build_object(
        'throttled', true,
        'retry_after_seconds', retry_after,
        'failed_attempts', rec.failed_attempts
      );
    end if;

    if rec.window_started_at + (p_window_seconds || ' seconds')::interval <= now_ts then
      update private.account_deletion_attempts
        set failed_attempts = 0,
            window_started_at = now_ts,
            throttled_until = null,
            updated_at = now_ts
        where user_id = p_user_id;
      return jsonb_build_object('throttled', false, 'retry_after_seconds', 0, 'failed_attempts', 0);
    end if;

    if rec.failed_attempts >= p_max_attempts then
      retry_after := ceil(extract(epoch from ((rec.window_started_at + (p_window_seconds || ' seconds')::interval) - now_ts)))::integer;
      if retry_after <= 0 then retry_after := p_window_seconds; end if;
      update private.account_deletion_attempts
        set throttled_until = now_ts + (retry_after || ' seconds')::interval,
            updated_at = now_ts
        where user_id = p_user_id;
      return jsonb_build_object('throttled', true, 'retry_after_seconds', retry_after, 'failed_attempts', rec.failed_attempts);
    end if;
  end if;

  return jsonb_build_object('throttled', false, 'retry_after_seconds', 0, 'failed_attempts', coalesce(rec.failed_attempts, 0));
end;
$$;

revoke all on function public.s2s_check_deletion_throttled(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.s2s_check_deletion_throttled(uuid, integer, integer) to service_role;

-- Atomically records a failed deletion attempt.
create or replace function public.s2s_record_deletion_attempt_failure(
  p_user_id uuid,
  p_max_attempts integer default 5,
  p_window_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec private.account_deletion_attempts%rowtype;
  now_ts timestamptz := now();
  new_count integer := 1;
  is_throttled boolean := false;
  retry_after integer := 0;
begin
  if p_user_id is null then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  select * into rec
    from private.account_deletion_attempts
    where user_id = p_user_id
    for update;

  if not found then
    insert into private.account_deletion_attempts (user_id, failed_attempts, window_started_at, updated_at)
      values (p_user_id, 1, now_ts, now_ts)
      returning * into rec;
  else
    if rec.window_started_at + (p_window_seconds || ' seconds')::interval <= now_ts then
      new_count := 1;
      update private.account_deletion_attempts
        set failed_attempts = new_count,
            window_started_at = now_ts,
            throttled_until = null,
            updated_at = now_ts
        where user_id = p_user_id
        returning * into rec;
    else
      new_count := rec.failed_attempts + 1;
      if new_count >= p_max_attempts then
        retry_after := ceil(extract(epoch from ((rec.window_started_at + (p_window_seconds || ' seconds')::interval) - now_ts)))::integer;
        if retry_after <= 0 then retry_after := p_window_seconds; end if;
        update private.account_deletion_attempts
          set failed_attempts = new_count,
              throttled_until = now_ts + (retry_after || ' seconds')::interval,
              updated_at = now_ts
          where user_id = p_user_id
          returning * into rec;
      else
        update private.account_deletion_attempts
          set failed_attempts = new_count,
              updated_at = now_ts
          where user_id = p_user_id
          returning * into rec;
      end if;
    end if;
  end if;

  is_throttled := rec.failed_attempts >= p_max_attempts or (rec.throttled_until is not null and rec.throttled_until > now_ts);
  if is_throttled and retry_after = 0 then
    retry_after := ceil(extract(epoch from (rec.throttled_until - now_ts)))::integer;
  end if;

  return jsonb_build_object(
    'failed_attempts', rec.failed_attempts,
    'throttled', is_throttled,
    'retry_after_seconds', greatest(0, retry_after)
  );
end;
$$;

revoke all on function public.s2s_record_deletion_attempt_failure(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.s2s_record_deletion_attempt_failure(uuid, integer, integer) to service_role;

-- Atomically resets attempt records upon successful reauthentication.
create or replace function public.s2s_reset_deletion_attempts(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.account_deletion_attempts where user_id = p_user_id;
end;
$$;

revoke all on function public.s2s_reset_deletion_attempts(uuid) from public, anon, authenticated;
grant execute on function public.s2s_reset_deletion_attempts(uuid) to service_role;

commit;
