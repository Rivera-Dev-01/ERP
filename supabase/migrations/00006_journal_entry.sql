create type public.journal_status as enum ('DRAFT', 'POSTED', 'REVERSED');
create type public.journal_entry_type as enum ('STANDARD', 'OPENING', 'ADJUSTING', 'REVERSAL');

create table public.journal_entry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  fiscal_period_id uuid not null references public.fiscal_period (id),
  entry_number bigint,
  entry_date date not null,
  reference text not null,
  description text not null,
  notes text,
  status public.journal_status not null default 'DRAFT',
  entry_type public.journal_entry_type not null default 'STANDARD',
  reversal_of_id uuid references public.journal_entry (id),
  total_debit numeric(19,4) not null default 0 check (total_debit >= 0),
  total_credit numeric(19,4) not null default 0 check (total_credit >= 0),
  created_by_id uuid not null references public.profile (id),
  posted_by_id uuid references public.profile (id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entry_number)
);

create trigger journal_entry_set_updated_at
  before update on public.journal_entry
  for each row execute function public.set_updated_at();

create index journal_entry_org_date_idx on public.journal_entry (organization_id, entry_date);
create index journal_entry_org_status_idx on public.journal_entry (organization_id, status);

create table public.journal_line (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entry (id) on delete cascade,
  account_id uuid not null references public.account (id),
  line_number integer not null check (line_number > 0),
  description text,
  debit numeric(19,4) not null default 0 check (debit >= 0),
  credit numeric(19,4) not null default 0 check (credit >= 0),
  tax_code text,
  check (debit = 0 or credit = 0),
  check (debit > 0 or credit > 0),
  unique (journal_entry_id, line_number)
);

create index journal_line_entry_idx on public.journal_line (journal_entry_id);
