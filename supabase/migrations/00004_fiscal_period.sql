create type public.fiscal_period_status as enum ('OPEN', 'CLOSED');

create table public.fiscal_period (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status public.fiscal_period_status not null default 'OPEN',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (organization_id, name),
  exclude using gist (
    organization_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

create trigger fiscal_period_set_updated_at
  before update on public.fiscal_period
  for each row execute function public.set_updated_at();

create index fiscal_period_org_idx on public.fiscal_period (organization_id);
