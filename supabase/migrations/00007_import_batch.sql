create type public.import_type as enum ('CHART_OF_ACCOUNTS', 'JOURNAL_ENTRIES');
create type public.import_batch_status as enum ('UPLOADED', 'VALIDATED', 'IMPORTED', 'FAILED');

create table public.import_batch (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  file_name text not null,
  import_type public.import_type not null,
  status public.import_batch_status not null default 'UPLOADED',
  row_count integer not null default 0 check (row_count >= 0),
  valid_row_count integer not null default 0 check (valid_row_count >= 0),
  invalid_row_count integer not null default 0 check (invalid_row_count >= 0),
  created_by_id uuid not null references public.profile (id),
  created_at timestamptz not null default now()
);

create index import_batch_org_idx on public.import_batch (organization_id);
