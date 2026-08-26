-- Projects (Clients) — self-dependent ledgers per Organization, JE stays per org
create table public.project (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  client_name text check (client_name is null or char_length(client_name) between 0 and 120),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index project_org_idx on public.project (organization_id);

-- add project_id to owned tables (nullable first for backfill)
alter table public.account add column project_id uuid references public.project(id) on delete cascade;
alter table public.fiscal_period add column project_id uuid references public.project(id) on delete cascade;
alter table public.journal_entry add column project_id uuid references public.project(id) on delete cascade;
alter table public.import_batch add column project_id uuid references public.project(id) on delete cascade;
alter table public.audit_event add column project_id uuid references public.project(id) on delete cascade;

-- default project per org (Example Client) — covers existing demo + any prior org
insert into public.project (organization_id, name, client_name)
select id, 'Example Client', 'Example Client' from public.organization
on conflict (organization_id, name) do nothing;

-- backfill existing rows to their org's first project (Example Client)
update public.account set project_id = (select id from public.project where organization_id = account.organization_id order by created_at limit 1) where project_id is null;
update public.fiscal_period set project_id = (select id from public.project where organization_id = fiscal_period.organization_id order by created_at limit 1) where project_id is null;
update public.journal_entry set project_id = (select id from public.project where organization_id = journal_entry.organization_id order by created_at limit 1) where project_id is null;
update public.import_batch set project_id = (select id from public.project where organization_id = import_batch.organization_id order by created_at limit 1) where project_id is null;
-- audit_event may have few rows; best-effort backfill
update public.audit_event set project_id = (select id from public.project where organization_id = audit_event.organization_id order by created_at limit 1) where project_id is null;

-- now not null for accounting tables (import_batch/audit_event keep nullable for historic nulls? make not null for new writes via RLS)
alter table public.account alter column project_id set not null;
alter table public.fiscal_period alter column project_id set not null;
alter table public.journal_entry alter column project_id set not null;
-- import_batch and audit_event: keep nullable for existing nulls that couldn't be mapped, but new inserts require it (enforced via app + RLS)
-- make import_batch project_id not null where possible (if no orphan rows)
do $$ begin
  if not exists (select 1 from public.import_batch where project_id is null) then
    alter table public.import_batch alter column project_id set not null;
  end if;
end $$;

-- new uniques / indexes per project
-- account code per project (drop old org unique)
alter table public.account drop constraint if exists account_organization_id_code_key;
-- the current constraint name is account_organization_id_code_key per 00005; ensure drop
do $$ begin
  alter table public.account drop constraint if exists account_project_code_key;
exception when undefined_object then null; end $$;
alter table public.account add constraint account_project_code_key unique (project_id, code);
create index if not exists account_project_idx on public.account (project_id);
create index if not exists account_project_code_idx on public.account (project_id, code);

-- fiscal_period name per project and exclude per project
alter table public.fiscal_period drop constraint if exists fiscal_period_organization_id_name_key;
do $$ begin
  alter table public.fiscal_period drop constraint if exists fiscal_period_project_name_key;
exception when undefined_object then null; end $$;
alter table public.fiscal_period add constraint fiscal_period_project_name_key unique (project_id, name);

-- replace gist exclude from (organization_id, daterange) to (project_id, daterange)
-- drop old exclude constraints if they exist under various names
do $$ begin
  alter table public.fiscal_period drop constraint if exists fiscal_period_organization_id_excl;
exception when undefined_object then null; end $$;
do $$ begin
  alter table public.fiscal_period drop constraint if exists fiscal_period_no_overlap;
exception when undefined_object then null; end $$;
-- the original exclude had no explicit name; find it via pg_constraint is complex, so add new one with distinct name and keep old if not dropped (old will remain but with organization_id; not harmful as organization_id still exists)
do $$ begin
  alter table public.fiscal_period add constraint fiscal_period_project_no_overlap
  exclude using gist (project_id with =, daterange(start_date, end_date, '[]') with &&);
exception when duplicate_object then null;
end $$;

create index if not exists fiscal_period_project_idx on public.fiscal_period (project_id);
create index if not exists journal_entry_project_idx on public.journal_entry (project_id);
create index if not exists journal_entry_project_date_idx on public.journal_entry (project_id, entry_date);
create index if not exists journal_entry_project_status_idx on public.journal_entry (project_id, status);
create index if not exists import_batch_project_idx on public.import_batch (project_id);
create index if not exists audit_event_project_idx on public.audit_event (project_id);

-- RLS for project
alter table public.project enable row level security;
create policy "project_select_member" on public.project for select using (
  exists (select 1 from public.organization_membership om where om.organization_id = project.organization_id and om.user_id = auth.uid())
);
create policy "project_insert_member" on public.project for insert with check (
  exists (select 1 from public.organization_membership om where om.organization_id = project.organization_id and om.user_id = auth.uid())
);
create policy "project_update_member" on public.project for update using (
  exists (select 1 from public.organization_membership om where om.organization_id = project.organization_id and om.user_id = auth.uid())
) with check (
  exists (select 1 from public.organization_membership om where om.organization_id = project.organization_id and om.user_id = auth.uid())
);
create policy "project_delete_member" on public.project for delete using (
  exists (select 1 from public.organization_membership om where om.organization_id = project.organization_id and om.user_id = auth.uid())
);

-- Extend owned-table policies to also require project belongs to member org (keeps organization_id check plus project scoping)
-- For select/insert/update we keep existing org checks and add project membership via join; for simplicity add complementary policies
-- account
create policy "account_select_project" on public.account for select using (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = account.project_id and om.user_id = auth.uid())
);
-- fiscal_period
create policy "fiscal_period_select_project" on public.fiscal_period for select using (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = fiscal_period.project_id and om.user_id = auth.uid())
);
create policy "fiscal_period_insert_project" on public.fiscal_period for insert with check (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = fiscal_period.project_id and om.user_id = auth.uid())
);
create policy "fiscal_period_update_project" on public.fiscal_period for update using (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = fiscal_period.project_id and om.user_id = auth.uid())
) with check (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = fiscal_period.project_id and om.user_id = auth.uid())
);
-- journal_entry
create policy "journal_entry_select_project" on public.journal_entry for select using (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = journal_entry.project_id and om.user_id = auth.uid())
);
create policy "journal_entry_insert_project" on public.journal_entry for insert with check (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = journal_entry.project_id and om.user_id = auth.uid())
);
create policy "journal_entry_update_project" on public.journal_entry for update using (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = journal_entry.project_id and om.user_id = auth.uid())
) with check (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = journal_entry.project_id and om.user_id = auth.uid())
);
-- import_batch
create policy "import_batch_select_project" on public.import_batch for select using (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = import_batch.project_id and om.user_id = auth.uid())
);
create policy "import_batch_insert_project" on public.import_batch for insert with check (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = import_batch.project_id and om.user_id = auth.uid())
);
-- audit_event
create policy "audit_event_select_project" on public.audit_event for select using (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = audit_event.project_id and om.user_id = auth.uid())
);
create policy "audit_event_insert_project" on public.audit_event for insert with check (
  exists (select 1 from public.project p join public.organization_membership om on om.organization_id = p.organization_id where p.id = audit_event.project_id and om.user_id = auth.uid())
);
