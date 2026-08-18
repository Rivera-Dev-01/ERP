create table public.audit_event (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  user_id uuid not null references public.profile (id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_event_org_created_idx on public.audit_event (organization_id, created_at);
