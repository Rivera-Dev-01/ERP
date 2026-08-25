create table public.journal_entry_sequence (
  organization_id uuid primary key references public.organization(id) on delete cascade,
  last_number bigint not null default 0,
  updated_at timestamptz not null default now()
);

create trigger journal_entry_sequence_set_updated_at
  before update on public.journal_entry_sequence
  for each row execute function public.set_updated_at();
