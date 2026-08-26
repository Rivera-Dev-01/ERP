-- Auto-assign project_id to first ACTIVE project for backward compat with old tests (strict DB)
-- Keeps NOT NULL but allows inserts without project_id to succeed by defaulting

create or replace function public.set_default_project_id()
returns trigger
language plpgsql
as $$
declare
  v_project_id uuid;
begin
  if NEW.project_id is null then
    select id into v_project_id from public.project where organization_id = NEW.organization_id and status = 'ACTIVE' order by created_at limit 1;
    if v_project_id is not null then
      NEW.project_id := v_project_id;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists set_default_project_account on public.account;
create trigger set_default_project_account
  before insert on public.account
  for each row execute function public.set_default_project_id();

drop trigger if exists set_default_project_fiscal_period on public.fiscal_period;
create trigger set_default_project_fiscal_period
  before insert on public.fiscal_period
  for each row execute function public.set_default_project_id();

drop trigger if exists set_default_project_journal_entry on public.journal_entry;
create trigger set_default_project_journal_entry
  before insert on public.journal_entry
  for each row execute function public.set_default_project_id();

drop trigger if exists set_default_project_import_batch on public.import_batch;
create trigger set_default_project_import_batch
  before insert on public.import_batch
  for each row execute function public.set_default_project_id();
