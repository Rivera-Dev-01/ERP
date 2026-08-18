alter table public.profile enable row level security;
alter table public.organization enable row level security;
alter table public.organization_membership enable row level security;
alter table public.fiscal_period enable row level security;
alter table public.account enable row level security;
alter table public.journal_entry enable row level security;
alter table public.journal_line enable row level security;
alter table public.import_batch enable row level security;
alter table public.audit_event enable row level security;

-- profile: users may read and update only their own profile row
create policy "profile_select_own" on public.profile
  for select using (id = auth.uid());
create policy "profile_insert_own" on public.profile
  for insert with check (id = auth.uid());
create policy "profile_update_own" on public.profile
  for update using (id = auth.uid());

-- membership: users may read their own membership rows (used by all other policies)
create policy "membership_select_own" on public.organization_membership
  for select using (user_id = auth.uid());

-- organization: readable when the user is a member
create policy "organization_select_member" on public.organization
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = organization.id
        and om.user_id = auth.uid()
    )
  );

-- fiscal_period
create policy "fiscal_period_select_org" on public.fiscal_period
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = fiscal_period.organization_id
        and om.user_id = auth.uid()
    )
  );

-- account
create policy "account_select_org" on public.account
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = account.organization_id
        and om.user_id = auth.uid()
    )
  );
create policy "account_insert_org" on public.account
  for insert with check (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = account.organization_id
        and om.user_id = auth.uid()
    )
  );
create policy "account_update_org" on public.account
  for update using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = account.organization_id
        and om.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = account.organization_id
        and om.user_id = auth.uid()
    )
  );

-- journal_entry
create policy "journal_entry_select_org" on public.journal_entry
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = journal_entry.organization_id
        and om.user_id = auth.uid()
    )
  );
create policy "journal_entry_insert_org" on public.journal_entry
  for insert with check (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = journal_entry.organization_id
        and om.user_id = auth.uid()
    )
  );
create policy "journal_entry_update_org" on public.journal_entry
  for update using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = journal_entry.organization_id
        and om.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = journal_entry.organization_id
        and om.user_id = auth.uid()
    )
  );

-- journal_line: access through the owning entry's organization
create policy "journal_line_select_org" on public.journal_line
  for select using (
    exists (
      select 1 from public.journal_entry je
      join public.organization_membership om on om.organization_id = je.organization_id
      where je.id = journal_line.journal_entry_id
        and om.user_id = auth.uid()
    )
  );
create policy "journal_line_insert_org" on public.journal_line
  for insert with check (
    exists (
      select 1 from public.journal_entry je
      join public.organization_membership om on om.organization_id = je.organization_id
      where je.id = journal_line.journal_entry_id
        and om.user_id = auth.uid()
    )
  );
create policy "journal_line_update_org" on public.journal_line
  for update using (
    exists (
      select 1 from public.journal_entry je
      join public.organization_membership om on om.organization_id = je.organization_id
      where je.id = journal_line.journal_entry_id
        and om.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.journal_entry je
      join public.organization_membership om on om.organization_id = je.organization_id
      where je.id = journal_line.journal_entry_id
        and om.user_id = auth.uid()
    )
  );

-- import_batch
create policy "import_batch_select_org" on public.import_batch
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = import_batch.organization_id
        and om.user_id = auth.uid()
    )
  );
create policy "import_batch_insert_org" on public.import_batch
  for insert with check (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = import_batch.organization_id
        and om.user_id = auth.uid()
    )
  );

-- audit_event
create policy "audit_event_select_org" on public.audit_event
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = audit_event.organization_id
        and om.user_id = auth.uid()
    )
  );
