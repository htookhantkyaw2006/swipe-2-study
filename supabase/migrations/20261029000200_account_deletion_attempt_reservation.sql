-- Additive migration: Account deletion attempt reservation.
-- Fixes race condition where concurrent requests could bypass rate limiting
-- by atomically reserving attempt capacity BEFORE password verification begins.
-- Uses short, row-locking database transaction with safe concurrent first-row insertion.
-- Enforces a conservative fixed-window reservation policy.
-- Browser clients are granted ZERO access to this function.

begin;

-- Ensure attempt_count column exists in private.account_deletion_attempts
alter table private.account_deletion_attempts
  add column if not exists attempt_count integer not null default 0;

-- Atomically reserves an attempt before password verification.
-- Commits immediately so no database transaction remains open during Auth network calls.
create or replace function public.s2s_reserve_deletion_attempt(
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
  now_ts timestamptz := clock_timestamp();
  retry_after integer := 0;
begin
  if p_user_id is null then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  -- 1. Safe concurrent first-row creation.
  -- Uses ON CONFLICT (user_id) DO NOTHING so concurrent calls never collide.
  insert into private.account_deletion_attempts (user_id, attempt_count, failed_attempts, window_started_at, updated_at)
    values (p_user_id, 0, 0, now_ts, now_ts)
    on conflict (user_id) do nothing;

  -- 2. Select and lock the row for update.
  select * into rec
    from private.account_deletion_attempts
    where user_id = p_user_id
    for update;

  -- 3. Fixed-window expiry check.
  -- If the window duration has elapsed, start a fresh fixed window.
  if rec.window_started_at + (p_window_seconds || ' seconds')::interval <= now_ts then
    rec.attempt_count := 0;
    rec.failed_attempts := 0;
    rec.window_started_at := now_ts;
    rec.throttled_until := null;
  end if;

  -- 4. Check if currently throttled.
  if rec.throttled_until is not null and rec.throttled_until > now_ts then
    retry_after := ceil(extract(epoch from (rec.throttled_until - now_ts)))::integer;
    return jsonb_build_object(
      'allowed', false,
      'attempt_count', rec.attempt_count,
      'remaining_attempts', 0,
      'retry_after_seconds', greatest(1, retry_after)
    );
  end if;

  -- 5. Capacity check: if attempt_count >= p_max_attempts, enforce throttling.
  if rec.attempt_count >= p_max_attempts then
    retry_after := ceil(extract(epoch from ((rec.window_started_at + (p_window_seconds || ' seconds')::interval) - now_ts)))::integer;
    if retry_after <= 0 then
      retry_after := p_window_seconds;
    end if;

    update private.account_deletion_attempts
      set throttled_until = now_ts + (retry_after || ' seconds')::interval,
          updated_at = now_ts
      where user_id = p_user_id;

    return jsonb_build_object(
      'allowed', false,
      'attempt_count', rec.attempt_count,
      'remaining_attempts', 0,
      'retry_after_seconds', greatest(1, retry_after)
    );
  end if;

  -- 6. Reserve attempt: increment attempt_count and update timestamp.
  rec.attempt_count := rec.attempt_count + 1;
  rec.updated_at := now_ts;

  update private.account_deletion_attempts
    set attempt_count = rec.attempt_count,
        window_started_at = rec.window_started_at,
        throttled_until = rec.throttled_until,
        updated_at = rec.updated_at
    where user_id = p_user_id;

  return jsonb_build_object(
    'allowed', true,
    'attempt_count', rec.attempt_count,
    'remaining_attempts', greatest(0, p_max_attempts - rec.attempt_count),
    'retry_after_seconds', 0
  );
end;
$$;

revoke all on function public.s2s_reserve_deletion_attempt(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.s2s_reserve_deletion_attempt(uuid, integer, integer) to service_role;

commit;
