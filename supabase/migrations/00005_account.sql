create type public.account_type as enum ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
create type public.normal_balance as enum ('DEBIT', 'CREDIT');

create table public.account (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  code text not null,
  name text not null,
  type public.account_type not null,
  normal_balance public.normal_balance not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create trigger account_set_updated_at
  before update on public.account
  for each row execute function public.set_updated_at();

create index account_org_idx on public.account (organization_id);
