-- 00027 reconciliation workspace — statement import + matching

create table if not exists public.reconciliation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  account_id uuid not null references public.account(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  statement_balance numeric(19,4) not null,
  status text not null default 'OPEN' check (status in ('OPEN','COMPLETE')),
  created_by_id uuid references public.profile(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists reconciliation_company_idx on public.reconciliation (company_id);
create index if not exists reconciliation_account_idx on public.reconciliation (account_id);

create table if not exists public.reconciliation_item (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.reconciliation(id) on delete cascade,
  item_date date not null,
  description text not null,
  amount numeric(19,4) not null,
  matched_line_id uuid references public.journal_line(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists recon_item_recon_idx on public.reconciliation_item (reconciliation_id);
create index if not exists recon_item_matched_idx on public.reconciliation_item (matched_line_id);

alter table public.reconciliation enable row level security;
alter table public.reconciliation_item enable row level security;

create policy "recon_select_member" on public.reconciliation for select using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=reconciliation.company_id and om.user_id=auth.uid())
);
create policy "recon_insert_member" on public.reconciliation for insert with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=reconciliation.company_id and om.user_id=auth.uid())
);
create policy "recon_update_member" on public.reconciliation for update using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=reconciliation.company_id and om.user_id=auth.uid())
) with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=reconciliation.company_id and om.user_id=auth.uid())
);
create policy "recon_delete_member" on public.reconciliation for delete using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=reconciliation.company_id and om.user_id=auth.uid())
);

create policy "recon_item_select_member" on public.reconciliation_item for select using (
  exists (select 1 from public.reconciliation r join public.company c on c.id=r.company_id join public.organization_membership om on om.organization_id=c.organization_id where r.id=reconciliation_item.reconciliation_id and om.user_id=auth.uid())
);
create policy "recon_item_insert_member" on public.reconciliation_item for insert with check (
  exists (select 1 from public.reconciliation r join public.company c on c.id=r.company_id join public.organization_membership om on om.organization_id=c.organization_id where r.id=reconciliation_item.reconciliation_id and om.user_id=auth.uid())
);
create policy "recon_item_update_member" on public.reconciliation_item for update using (
  exists (select 1 from public.reconciliation r join public.company c on c.id=r.company_id join public.organization_membership om on om.organization_id=c.organization_id where r.id=reconciliation_item.reconciliation_id and om.user_id=auth.uid())
) with check (
  exists (select 1 from public.reconciliation r join public.company c on c.id=r.company_id join public.organization_membership om on om.organization_id=c.organization_id where r.id=reconciliation_item.reconciliation_id and om.user_id=auth.uid())
);
create policy "recon_item_delete_member" on public.reconciliation_item for delete using (
  exists (select 1 from public.reconciliation r join public.company c on c.id=r.company_id join public.organization_membership om on om.organization_id=c.organization_id where r.id=reconciliation_item.reconciliation_id and om.user_id=auth.uid())
);
