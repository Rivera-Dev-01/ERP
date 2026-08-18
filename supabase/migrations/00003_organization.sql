create type public.membership_role as enum ('ACCOUNTANT');

create table public.organization (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text not null,
  currency_code text not null default 'PHP',
  timezone text not null default 'Asia/Manila',
  fiscal_year_start_month integer not null default 1 check (fiscal_year_start_month between 1 and 12),
  tin text,
  rdo text,
  tax_classification text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_set_updated_at
  before update on public.organization
  for each row execute function public.set_updated_at();

create table public.organization_membership (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  role public.membership_role not null default 'ACCOUNTANT',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_membership_user_idx on public.organization_membership (user_id);
