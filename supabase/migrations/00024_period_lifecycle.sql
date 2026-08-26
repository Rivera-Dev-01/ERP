-- 00024 period lifecycle — reopen support + audit trail
-- Any CLOSED period may be reopened with a recorded reason; Close remains one-way by default but audited.

alter table public.fiscal_period add column if not exists reopened_at timestamptz;
alter table public.fiscal_period add column if not exists reopened_by_id uuid references public.profile(id) on delete set null;
alter table public.fiscal_period add column if not exists reopened_reason text check (reopened_reason is null or char_length(reopened_reason) between 5 and 500);

create index if not exists fiscal_period_company_status_idx on public.fiscal_period (company_id, status);
