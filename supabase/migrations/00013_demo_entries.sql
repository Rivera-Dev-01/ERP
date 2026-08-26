-- Idempotent demo fixture for V0 Accounting Demo 22222222-2222-2222-2222-222222222222
-- July 2026 Test Period 2026-07-01..31 OPEN, 6 accounts, 5 POSTED entries -> Trial 120000 halves
-- Assumes 00010_sequences already created journal_entry_sequence
-- Bump sequence to 5 if not already
insert into public.journal_entry_sequence (organization_id, last_number)
values ('22222222-2222-2222-2222-222222222222', 5)
on conflict (organization_id) do update set last_number = greatest(public.journal_entry_sequence.last_number, excluded.last_number);

-- Upsert the 5 entries only if JE-2026-0001..0005 not yet present for this org
-- (we check one; the rest are inserted together inside the same DO block)
do $$
declare
  v_period_id uuid;
  v_exists integer;
  v_demo_org uuid := '22222222-2222-2222-2222-222222222222';
  v_accountant uuid := '11111111-1111-1111-1111-111111111111';
begin
  select id into v_period_id from public.fiscal_period where organization_id=v_demo_org and name='July 2026 Test Period' limit 1;
  if v_period_id is null then return; end if;

  select count(*) into v_exists from public.journal_entry where organization_id=v_demo_org and entry_number in (1,2,3,4,5);
  if v_exists = 5 then return; end if;

  -- ensure accounts exist (Phase 2 backfill may have already inserted them; upsert is fine but we only need ids)
  -- entries are inserted with status POSTED, entry_number 1..5, reference JE-2026-0001..0005, entry_type STANDARD
  -- 1) Owner investment 2026-07-01 100000: Debit 1000 / Credit 3000
  insert into public.journal_entry (id, organization_id, fiscal_period_id, entry_number, entry_date, reference, description, status, entry_type, total_debit, total_credit, created_by_id, posted_by_id, posted_at)
  values (gen_random_uuid(), v_demo_org, v_period_id, 1, '2026-07-01', 'JE-2026-0001', 'Owner investment', 'POSTED', 'STANDARD', 100000, 100000, v_accountant, v_accountant, now())
  on conflict (organization_id, entry_number) do nothing;

  -- lines for entry 1 are inserted below via account code lookups; we use subqueries so the block stays idempotent
  insert into public.journal_line (journal_entry_id, account_id, line_number, debit, credit)
  select je.id, a1000.id, 1, 100000, 0 from public.journal_entry je, public.account a1000 where je.organization_id=v_demo_org and je.entry_number=1 and a1000.organization_id=v_demo_org and a1000.code='1000'
  on conflict (journal_entry_id, line_number) do nothing;
  insert into public.journal_line (journal_entry_id, account_id, line_number, debit, credit)
  select je.id, a3000.id, 2, 0, 100000 from public.journal_entry je, public.account a3000 where je.organization_id=v_demo_org and je.entry_number=1 and a3000.organization_id=v_demo_org and a3000.code='3000'
  on conflict (journal_entry_id, line_number) do nothing;

  -- 2) Office supplies 2026-07-05 5000: Debit 5000 / Credit 1000
  insert into public.journal_entry (id, organization_id, fiscal_period_id, entry_number, entry_date, reference, description, status, entry_type, total_debit, total_credit, created_by_id, posted_by_id, posted_at)
  values (gen_random_uuid(), v_demo_org, v_period_id, 2, '2026-07-05', 'JE-2026-0002', 'Office supplies paid in cash', 'POSTED', 'STANDARD', 5000, 5000, v_accountant, v_accountant, now())
  on conflict (organization_id, entry_number) do nothing;
  insert into public.journal_line (journal_entry_id, account_id, line_number, debit, credit)
  select je.id, a5000.id, 1, 5000, 0 from public.journal_entry je, public.account a5000 where je.organization_id=v_demo_org and je.entry_number=2 and a5000.organization_id=v_demo_org and a5000.code='5000'
  on conflict (journal_entry_id, line_number) do nothing;
  insert into public.journal_line (journal_entry_id, account_id, line_number, debit, credit)
  select je.id, a1000.id, 2, 0, 5000 from public.journal_entry je, public.account a1000 where je.organization_id=v_demo_org and je.entry_number=2 and a1000.organization_id=v_demo_org and a1000.code='1000'
  on conflict (journal_entry_id, line_number) do nothing;

  -- 3) Service on account 2026-07-10 20000: Debit 1100 / Credit 4000
  insert into public.journal_entry (id, organization_id, fiscal_period_id, entry_number, entry_date, reference, description, status, entry_type, total_debit, total_credit, created_by_id, posted_by_id, posted_at)
  values (gen_random_uuid(), v_demo_org, v_period_id, 3, '2026-07-10', 'JE-2026-0003', 'Service provided on account', 'POSTED', 'STANDARD', 20000, 20000, v_accountant, v_accountant, now())
  on conflict (organization_id, entry_number) do nothing;
  insert into public.journal_line (journal_entry_id, account_id, line_number, debit, credit)
  select je.id, a1100.id, 1, 20000, 0 from public.journal_entry je, public.account a1100 where je.organization_id=v_demo_org and je.entry_number=3 and a1100.organization_id=v_demo_org and a1100.code='1100'
  on conflict (journal_entry_id, line_number) do nothing;
  insert into public.journal_line (journal_entry_id, account_id, line_number, debit, credit)
  select je.id, a4000.id, 2, 0, 20000 from public.journal_entry je, public.account a4000 where je.organization_id=v_demo_org and je.entry_number=3 and a4000.organization_id=v_demo_org and a4000.code='4000'
  on conflict (journal_entry_id, line_number) do nothing;

  -- 4) Customer collection 2026-07-15 10000: Debit 1000 / Credit 1100
  insert into public.journal_entry (id, organization_id, fiscal_period_id, entry_number, entry_date, reference, description, status, entry_type, total_debit, total_credit, created_by_id, posted_by_id, posted_at)
  values (gen_random_uuid(), v_demo_org, v_period_id, 4, '2026-07-15', 'JE-2026-0004', 'Customer collection', 'POSTED', 'STANDARD', 10000, 10000, v_accountant, v_accountant, now())
  on conflict (organization_id, entry_number) do nothing;
  insert into public.journal_line (journal_entry_id, account_id, line_number, debit, credit)
  select je.id, a1000.id, 1, 10000, 0 from public.journal_entry je, public.account a1000 where je.organization_id=v_demo_org and je.entry_number=4 and a1000.organization_id=v_demo_org and a1000.code='1000'
  on conflict (journal_entry_id, line_number) do nothing;
  insert into public.journal_line (journal_entry_id, account_id, line_number, debit, credit)
  select je.id, a1100.id, 2, 0, 10000 from public.journal_entry je, public.account a1100 where je.organization_id=v_demo_org and je.entry_number=4 and a1100.organization_id=v_demo_org and a1100.code='1100'
  on conflict (journal_entry_id, line_number) do nothing;

  -- 5) Utilities 2026-07-20 3000: Debit 5100 / Credit 1000
  insert into public.journal_entry (id, organization_id, fiscal_period_id, entry_number, entry_date, reference, description, status, entry_type, total_debit, total_credit, created_by_id, posted_by_id, posted_at)
  values (gen_random_uuid(), v_demo_org, v_period_id, 5, '2026-07-20', 'JE-2026-0005', 'Utilities paid in cash', 'POSTED', 'STANDARD', 3000, 3000, v_accountant, v_accountant, now())
  on conflict (organization_id, entry_number) do nothing;
  insert into public.journal_line (journal_entry_id, account_id, line_number, debit, credit)
  select je.id, a5100.id, 1, 3000, 0 from public.journal_entry je, public.account a5100 where je.organization_id=v_demo_org and je.entry_number=5 and a5100.organization_id=v_demo_org and a5100.code='5100'
  on conflict (journal_entry_id, line_number) do nothing;
  insert into public.journal_line (journal_entry_id, account_id, line_number, debit, credit)
  select je.id, a1000.id, 2, 0, 3000 from public.journal_entry je, public.account a1000 where je.organization_id=v_demo_org and je.entry_number=5 and a1000.organization_id=v_demo_org and a1000.code='1000'
  on conflict (journal_entry_id, line_number) do nothing;

  -- audit events for the 5 (so dashboard counts may include them, but reports remain derivable)
  insert into public.audit_event (organization_id, user_id, entity_type, entity_id, action, metadata)
  select v_demo_org, v_accountant, 'journal_entry', je.id, 'POST', jsonb_build_object('entry_number', je.reference, 'total_debit', je.total_debit, 'total_credit', je.total_credit, 'line_count', 2)
  from public.journal_entry je where je.organization_id=v_demo_org and je.entry_number in (1,2,3,4,5) and not exists (select 1 from public.audit_event where entity_id=je.id and action='POST');
end $$;
