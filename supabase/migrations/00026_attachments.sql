-- 00026 attachments — private storage bucket + attachment table
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create table if not exists public.attachment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  journal_entry_id uuid references public.journal_entry(id) on delete cascade,
  entity_type text not null default 'JOURNAL_ENTRY' check (entity_type in ('JOURNAL_ENTRY','FILING')),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_path text not null unique,
  uploaded_by_id uuid references public.profile(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists attachment_company_idx on public.attachment (company_id);
create index if not exists attachment_entry_idx on public.attachment (journal_entry_id);

alter table public.attachment enable row level security;

create policy "attachment_select_member" on public.attachment for select using (
  exists (
    select 1 from public.company c
    join public.organization_membership om on om.organization_id = c.organization_id
    where c.id = attachment.company_id and om.user_id = auth.uid()
  )
);
create policy "attachment_insert_member" on public.attachment for insert with check (
  exists (
    select 1 from public.company c
    join public.organization_membership om on om.organization_id = c.organization_id
    where c.id = attachment.company_id and om.user_id = auth.uid()
  )
);
create policy "attachment_delete_member" on public.attachment for delete using (
  exists (
    select 1 from public.company c
    join public.organization_membership om on om.organization_id = c.organization_id
    where c.id = attachment.company_id and om.user_id = auth.uid()
  )
);

-- Storage object policies scoped to the attachments bucket + org path prefix
create policy "storage_attachment_read" on storage.objects for select using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = 'org'
  and exists (
    select 1 from public.organization_membership om
    where om.user_id = auth.uid()
      and (storage.foldername(name))[2] = om.organization_id::text
  )
);
create policy "storage_attachment_write" on storage.objects for insert with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = 'org'
  and exists (
    select 1 from public.organization_membership om
    where om.user_id = auth.uid()
      and (storage.foldername(name))[2] = om.organization_id::text
  )
);
create policy "storage_attachment_delete" on storage.objects for delete using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = 'org'
  and exists (
    select 1 from public.organization_membership om
    where om.user_id = auth.uid()
      and (storage.foldername(name))[2] = om.organization_id::text
  )
);
