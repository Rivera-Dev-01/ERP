-- 00022 rename project → company (full rename incl. DB + code+routes)
-- Postgres RENAME is metadata-only (instant). Then recreate RLS/triggers/constraints/indexes under new names.

-- 1) Rename table + columns
alter table public.project rename to company;
alter table public.account rename column project_id to company_id;
alter table public.fiscal_period rename column project_id to company_id;
alter table public.journal_entry rename column project_id to company_id;
alter table public.import_batch rename column project_id to company_id;
alter table public.audit_event rename column project_id to company_id;

-- 2) Rename indexes (if exist) — use do blocks to avoid errors when old names missing
do $$ begin
  alter index if exists project_org_idx rename to company_org_idx;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists account_project_idx rename to account_company_idx;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists account_project_code_idx rename to account_company_code_idx;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists fiscal_period_project_idx rename to fiscal_period_company_idx;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists journal_entry_project_idx rename to journal_entry_company_idx;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists journal_entry_project_date_idx rename to journal_entry_company_date_idx;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists journal_entry_project_status_idx rename to journal_entry_company_status_idx;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists import_batch_project_idx rename to import_batch_company_idx;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists audit_event_project_idx rename to audit_event_company_idx;
exception when undefined_object then null; end $$;
-- 00021 indexes
do $$ begin
  alter index if exists idx_journal_entry_org_project_status_date rename to idx_journal_entry_org_company_status_date;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists idx_account_org_project_active_code rename to idx_account_org_company_active_code;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists idx_fiscal_period_org_project_status_start rename to idx_fiscal_period_org_company_status_start;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists idx_project_org_status_created rename to idx_company_org_status_created;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists idx_account_project_id rename to idx_account_company_id;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists idx_fiscal_period_project_id rename to idx_fiscal_period_company_id;
exception when undefined_object then null; end $$;
do $$ begin
  alter index if exists idx_journal_entry_project_id rename to idx_journal_entry_company_id;
exception when undefined_object then null; end $$;

-- 3) Rename constraints (unique, exclude, fk)
-- unique constraints
do $$ begin
  alter table public.account rename constraint account_project_code_key to account_company_code_key;
exception when undefined_object then null; end $$;
do $$ begin
  alter table public.fiscal_period rename constraint fiscal_period_project_name_key to fiscal_period_company_name_key;
exception when undefined_object then null; end $$;
do $$ begin
  alter table public.fiscal_period rename constraint fiscal_period_project_no_overlap to fiscal_period_company_no_overlap;
exception when undefined_object then null; end $$;
do $$ begin
  alter table public.company rename constraint project_organization_id_name_key to company_organization_id_name_key;
exception when undefined_object then null; end $$;
-- foreign keys
do $$ begin
  alter table public.account rename constraint account_project_id_fkey to account_company_id_fkey;
exception when undefined_object then null; end $$;
do $$ begin
  alter table public.fiscal_period rename constraint fiscal_period_project_id_fkey to fiscal_period_company_id_fkey;
exception when undefined_object then null; end $$;
do $$ begin
  alter table public.journal_entry rename constraint journal_entry_project_id_fkey to journal_entry_company_id_fkey;
exception when undefined_object then null; end $$;
do $$ begin
  alter table public.import_batch rename constraint import_batch_project_id_fkey to import_batch_company_id_fkey;
exception when undefined_object then null; end $$;
do $$ begin
  alter table public.audit_event rename constraint audit_event_project_id_fkey to audit_event_company_id_fkey;
exception when undefined_object then null; end $$;

-- 4) Drop old RLS policies (project-named) — if exists
drop policy if exists "project_select_member" on public.company;
drop policy if exists "project_insert_member" on public.company;
drop policy if exists "project_update_member" on public.company;
drop policy if exists "project_delete_member" on public.company;
drop policy if exists "account_select_project" on public.account;
drop policy if exists "fiscal_period_select_project" on public.fiscal_period;
drop policy if exists "fiscal_period_insert_project" on public.fiscal_period;
drop policy if exists "fiscal_period_update_project" on public.fiscal_period;
drop policy if exists "journal_entry_select_project" on public.journal_entry;
drop policy if exists "journal_entry_insert_project" on public.journal_entry;
drop policy if exists "journal_entry_update_project" on public.journal_entry;
drop policy if exists "import_batch_select_project" on public.import_batch;
drop policy if exists "import_batch_insert_project" on public.import_batch;
drop policy if exists "audit_event_select_project" on public.audit_event;
drop policy if exists "audit_event_insert_project" on public.audit_event;

-- 5) Recreate RLS policies with company names
create policy "company_select_member" on public.company for select using (
  exists (select 1 from public.organization_membership om where om.organization_id = company.organization_id and om.user_id = auth.uid())
);
create policy "company_insert_member" on public.company for insert with check (
  exists (select 1 from public.organization_membership om where om.organization_id = company.organization_id and om.user_id = auth.uid())
);
create policy "company_update_member" on public.company for update using (
  exists (select 1 from public.organization_membership om where om.organization_id = company.organization_id and om.user_id = auth.uid())
) with check (
  exists (select 1 from public.organization_membership om where om.organization_id = company.organization_id and om.user_id = auth.uid())
);
create policy "company_delete_member" on public.company for delete using (
  exists (select 1 from public.organization_membership om where om.organization_id = company.organization_id and om.user_id = auth.uid())
);

create policy "account_select_company" on public.account for select using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = account.company_id and om.user_id = auth.uid())
);
create policy "fiscal_period_select_company" on public.fiscal_period for select using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = fiscal_period.company_id and om.user_id = auth.uid())
);
create policy "fiscal_period_insert_company" on public.fiscal_period for insert with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = fiscal_period.company_id and om.user_id = auth.uid())
);
create policy "fiscal_period_update_company" on public.fiscal_period for update using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = fiscal_period.company_id and om.user_id = auth.uid())
) with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = fiscal_period.company_id and om.user_id = auth.uid())
);
create policy "journal_entry_select_company" on public.journal_entry for select using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = journal_entry.company_id and om.user_id = auth.uid())
);
create policy "journal_entry_insert_company" on public.journal_entry for insert with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = journal_entry.company_id and om.user_id = auth.uid())
);
create policy "journal_entry_update_company" on public.journal_entry for update using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = journal_entry.company_id and om.user_id = auth.uid())
) with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = journal_entry.company_id and om.user_id = auth.uid())
);
create policy "import_batch_select_company" on public.import_batch for select using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = import_batch.company_id and om.user_id = auth.uid())
);
create policy "import_batch_insert_company" on public.import_batch for insert with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = import_batch.company_id and om.user_id = auth.uid())
);
create policy "audit_event_select_company" on public.audit_event for select using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = audit_event.company_id and om.user_id = auth.uid())
);
create policy "audit_event_insert_company" on public.audit_event for insert with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id = c.organization_id where c.id = audit_event.company_id and om.user_id = auth.uid())
);

-- 6) Recreate triggers/functions with company names (drop old first)
drop trigger if exists set_default_project_account on public.account;
drop trigger if exists set_default_project_fiscal_period on public.fiscal_period;
drop trigger if exists set_default_project_journal_entry on public.journal_entry;
drop trigger if exists set_default_project_import_batch on public.import_batch;
drop trigger if exists create_default_project_on_org_insert on public.organization;
drop function if exists public.set_default_project_id();
drop function if exists public.create_default_project_for_org();

create or replace function public.set_default_company_id()
returns trigger
language plpgsql
as $$
declare
  v_company_id uuid;
begin
  if NEW.company_id is null then
    select id into v_company_id from public.company where organization_id = NEW.organization_id and status = 'ACTIVE' order by created_at limit 1;
    if v_company_id is null then
      insert into public.company (organization_id, name, client_name)
      values (NEW.organization_id, 'Default Project', 'Default Project')
      on conflict (organization_id, name) do update set name = excluded.name
      returning id into v_company_id;
      if v_company_id is null then
        select id into v_company_id from public.company where organization_id = NEW.organization_id order by created_at limit 1;
      end if;
    end if;
    if v_company_id is not null then
      NEW.company_id := v_company_id;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger set_default_company_account
  before insert on public.account
  for each row execute function public.set_default_company_id();
create trigger set_default_company_fiscal_period
  before insert on public.fiscal_period
  for each row execute function public.set_default_company_id();
create trigger set_default_company_journal_entry
  before insert on public.journal_entry
  for each row execute function public.set_default_company_id();
create trigger set_default_company_import_batch
  before insert on public.import_batch
  for each row execute function public.set_default_company_id();

create or replace function public.create_default_company_for_org()
returns trigger
language plpgsql
as $$
begin
  insert into public.company (organization_id, name, client_name)
  values (NEW.id, 'Default Project', 'Default Project')
  on conflict (organization_id, name) do nothing;
  return NEW;
end;
$$;

create trigger create_default_company_on_org_insert
  after insert on public.organization
  for each row execute function public.create_default_company_for_org();

-- 7) Recreate 00021 indexes that were renamed above but ensure they exist with new column names (create if not exists with company_id)
create index if not exists idx_journal_entry_org_company_status_date on public.journal_entry (organization_id, company_id, status, entry_date desc);
create index if not exists idx_account_org_company_active_code on public.account (organization_id, company_id, is_active, code);
create index if not exists idx_fiscal_period_org_company_status_start on public.fiscal_period (organization_id, company_id, status, start_date desc);
create index if not exists idx_company_org_status_created on public.company (organization_id, status, created_at);
-- keep old ones if they were not renamed above (idempotent)
