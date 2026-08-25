create or replace function public.reverse_journal_entry(p_entry_id uuid, p_reversal_date date, p_description text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig public.journal_entry%rowtype;
  v_new_id uuid;
  v_new_number bigint;
  v_formatted text;
  v_period public.fiscal_period%rowtype;
  v_line_count integer;
begin
  -- lock original and verify POSTED not already reversed
  select * into v_orig from public.journal_entry where id = p_entry_id for update;
  if not found then raise exception 'Journal entry not found' using errcode='P0001'; end if;
  if v_orig.status <> 'POSTED' then raise exception 'Only posted entries can be reversed' using errcode='P0001'; end if;
  if exists (select 1 from public.journal_entry where reversal_of_id = p_entry_id) then
    raise exception 'Entry has already been reversed' using errcode='P0001';
  end if;

  -- membership
  if not exists (select 1 from public.organization_membership where organization_id = v_orig.organization_id and user_id = auth.uid()) then
    raise exception 'Not authorized' using errcode='P0001';
  end if;

  -- reversal date must be in an OPEN period for that org
  select * into v_period from public.fiscal_period
  where organization_id = v_orig.organization_id and status='OPEN' and p_reversal_date between start_date and end_date limit 1;
  if not found then raise exception 'Reversal date not in any open period' using errcode='P0001'; end if;

  -- create reversal entry (same type REVERSAL, reference REV-<orig.reference> unless override)
  -- reuse the sequence logic from post (fetch FOR UPDATE, increment)
  insert into public.journal_entry_sequence (organization_id, last_number) values (v_orig.organization_id, 0) on conflict (organization_id) do nothing;
  select last_number into v_new_number from public.journal_entry_sequence where organization_id = v_orig.organization_id for update;
  v_new_number := v_new_number + 1;
  v_formatted := 'JE-' || to_char(p_reversal_date, 'YYYY') || '-' || lpad(v_new_number::text, 4, '0');

  insert into public.journal_entry (organization_id, fiscal_period_id, entry_date, reference, description, notes, status, entry_type, reversal_of_id, total_debit, total_credit, created_by_id, posted_by_id, posted_at, entry_number)
  values (v_orig.organization_id, v_period.id, p_reversal_date, coalesce(p_description, 'Reversal of ' || v_orig.reference), 'Reversal of ' || v_orig.description, v_orig.notes, 'POSTED', 'REVERSAL', p_entry_id, v_orig.total_credit, v_orig.total_debit, auth.uid(), auth.uid(), now(), v_new_number)
  returning id into v_new_id;

  -- swapped lines
  insert into public.journal_line (journal_entry_id, account_id, line_number, description, debit, credit, tax_code)
  select v_new_id, account_id, line_number, description, credit, debit, tax_code
  from public.journal_line where journal_entry_id = p_entry_id order by line_number;
  select count(*) into v_line_count from public.journal_line where journal_entry_id = v_new_id;

  update public.journal_entry_sequence set last_number = v_new_number where organization_id = v_orig.organization_id;

  -- mark original REVERSED
  update public.journal_entry set status = 'REVERSED' where id = p_entry_id;

  -- audit both
  insert into public.audit_event (organization_id, user_id, entity_type, entity_id, action, metadata)
  values (v_orig.organization_id, auth.uid(), 'journal_entry', v_new_id, 'REVERSE', jsonb_build_object('entry_number', v_formatted, 'total_debit', v_orig.total_credit, 'total_credit', v_orig.total_debit, 'line_count', v_line_count, 'reversal_of', v_orig.id)),
         (v_orig.organization_id, auth.uid(), 'journal_entry', p_entry_id, 'REVERSED', jsonb_build_object('entry_number', v_formatted, 'line_count', v_line_count));

  return v_formatted;
end;
$$;
