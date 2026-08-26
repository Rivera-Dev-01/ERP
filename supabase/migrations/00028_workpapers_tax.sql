-- 00028 workpapers + tax center

create table if not exists public.workpaper_note (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  schedule_key text not null check (schedule_key in ('PREPAID','ACCRUED','FIXED_ASSETS','LOANS_PAYABLE','ADVANCES','RECEIVABLES','PAYABLES','VAT','WITHHOLDING','ADJUSTING')),
  period_end date not null,
  notes text not null default '',
  updated_by_id uuid references public.profile(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, schedule_key, period_end)
);
create index if not exists workpaper_company_idx on public.workpaper_note (company_id);

create table if not exists public.filing_status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  form text not null check (char_length(form) between 1 and 30),
  period_label text not null,
  due_date date not null,
  status text not null default 'NOT_STARTED' check (status in ('NOT_STARTED','FILED')),
  filed_at timestamptz,
  proof_attachment_id uuid references public.attachment(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, form, period_label)
);
create index if not exists filing_company_idx on public.filing_status (company_id);

alter table public.workpaper_note enable row level security;
alter table public.filing_status enable row level security;

create policy "workpaper_select_member" on public.workpaper_note for select using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=workpaper_note.company_id and om.user_id=auth.uid())
);
create policy "workpaper_upsert_member" on public.workpaper_note for insert with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=workpaper_note.company_id and om.user_id=auth.uid())
);
create policy "workpaper_update_member" on public.workpaper_note for update using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=workpaper_note.company_id and om.user_id=auth.uid())
) with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=workpaper_note.company_id and om.user_id=auth.uid())
);

create policy "filing_select_member" on public.filing_status for select using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=filing_status.company_id and om.user_id=auth.uid())
);
create policy "filing_insert_member" on public.filing_status for insert with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=filing_status.company_id and om.user_id=auth.uid())
);
create policy "filing_update_member" on public.filing_status for update using (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=filing_status.company_id and om.user_id=auth.uid())
) with check (
  exists (select 1 from public.company c join public.organization_membership om on om.organization_id=c.organization_id where c.id=filing_status.company_id and om.user_id=auth.uid())
);
