-- Ensure new organizations get a default project, and inserts without project_id auto-create one

create or replace function public.set_default_project_id()
returns trigger
language plpgsql
as $$
declare
  v_project_id uuid;
begin
  if NEW.project_id is null then
    select id into v_project_id from public.project where organization_id = NEW.organization_id and status = 'ACTIVE' order by created_at limit 1;
    if v_project_id is null then
      -- auto-create default project for this org (handles isolated test orgs)
      insert into public.project (organization_id, name, client_name)
      values (NEW.organization_id, 'Default Project', 'Default Project')
      on conflict (organization_id, name) do update set name = excluded.name
      returning id into v_project_id;
      -- if conflict, re-select
      if v_project_id is null then
        select id into v_project_id from public.project where organization_id = NEW.organization_id order by created_at limit 1;
      end if;
    end if;
    if v_project_id is not null then
      NEW.project_id := v_project_id;
    end if;
  end if;
  return NEW;
end;
$$;

-- Recreate triggers to use updated function (already created, but ensure they exist)
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

-- Also handle organization insert to create default project immediately
create or replace function public.create_default_project_for_org()
returns trigger
language plpgsql
as $$
begin
  insert into public.project (organization_id, name, client_name)
  values (NEW.id, 'Default Project', 'Default Project')
  on conflict (organization_id, name) do nothing;
  return NEW;
end;
$$;

drop trigger if exists create_default_project_on_org_insert on public.organization;
create trigger create_default_project_on_org_insert
  after insert on public.organization
  for each row execute function public.create_default_project_for_org();
