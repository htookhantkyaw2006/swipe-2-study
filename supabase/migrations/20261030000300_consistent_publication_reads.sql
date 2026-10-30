-- ===========================================================================
-- Migration: 20261030000300_consistent_publication_reads.sql
-- Description: Additive publication sequence counter on public.courses
--              to detect publication and rollback changes during paging.
-- ===========================================================================

begin;

alter table public.courses add column if not exists publication_seq bigint not null default 1;

create or replace function public.courses_advance_publication_seq()
returns trigger language plpgsql as $$
begin
  new.publication_seq := coalesce(old.publication_seq, 0) + 1;
  return new;
end;
$$;

drop trigger if exists courses_advance_publication_seq_trg on public.courses;
create trigger courses_advance_publication_seq_trg
  before update on public.courses
  for each row execute function public.courses_advance_publication_seq();

commit;

