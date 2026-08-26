-- Temporary: make project_id nullable for incremental P2 fixes (keeps typecheck green after P1)
-- P2 will re-add NOT NULL after app code threads projectId
alter table public.account alter column project_id drop not null;
alter table public.fiscal_period alter column project_id drop not null;
alter table public.journal_entry alter column project_id drop not null;
-- import_batch already conditional not null; ensure nullable
do $$ begin
  alter table public.import_batch alter column project_id drop not null;
exception when others then null; end $$;
