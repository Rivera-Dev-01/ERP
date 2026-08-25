create or replace function public.post_journal_entry(p_entry_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.journal_entry%rowtype;
  v_org_id uuid;
  v_period public.fiscal_period%rowtype;
  v_total_debit numeric(19,4);
  v_total_credit numeric(19,4);
  v_line_count integer;
  v_next bigint;
  v_formatted text;
  v_year text;
begin
  -- membership check via organization_membership, locked entry
  select je.* into v_entry from public.journal_entry je
  join public.organization_membership om on om.organization_id = je.organization_id and om.user_id = auth.uid()
  where je.id = p_entry_id
  for update of je;
  if not found then raise exception 'Journal entry not found or not authorized' using errcode='P0001'; end if;
  if v_entry.status <> 'DRAFT' then raise exception 'Only draft entries can be posted' using errcode='P0001'; end if;

  -- lock sequence row (create lazily if missing) — FOR UPDATE ensures per-org serialization
  insert into public.journal_entry_sequence (organization_id, last_number)
  values (v_entry.organization_id, 0)
  on conflict (organization_id) do nothing;
  select last_number into v_next from public.journal_entry_sequence where organization_id = v_entry.organization_id for update;
  v_next := v_next + 1;

  -- fiscal period check: entry_date must be BETWEEN start_date and end_date of an OPEN period
  select * into v_period from public.fiscal_period
  where organization_id = v_entry.organization_id
    and status = 'OPEN'
    and v_entry.entry_date between start_date and end_date
  limit 1;
  if not found then raise exception 'Date not in any open period' using errcode='P0001'; end if;
  if v_entry.fiscal_period_id <> v_period.id then
    v_entry.fiscal_period_id := v_period.id;
  end if;

  -- lines + numeric totals
  select count(*), coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_line_count, v_total_debit, v_total_credit
  from public.journal_line jl
  where jl.journal_entry_id = p_entry_id;
  if v_line_count < 2 then raise exception 'At least two lines are required' using errcode='P0001'; end if;

  -- every line references an active account in same org
  perform 1 from public.journal_line jl
  join public.account a on a.id = jl.account_id
  where jl.journal_entry_id = p_entry_id
    and (a.organization_id <> v_entry.organization_id or a.is_active = false);
  if found then raise exception 'One or more accounts are inactive or not in your organization' using errcode='P0001'; end if;

  -- debit xor credit, exactly one positive amount per line
  if exists (select 1 from public.journal_line where journal_entry_id = p_entry_id and ((debit = 0 and credit = 0) or (debit > 0 and credit > 0) or debit < 0 or credit < 0)) then
    raise exception 'Each line must have exactly one positive amount' using errcode='P0001';
  end if;

  -- sum debits = sum credits via numeric, total > 0
  if v_total_debit <> v_total_credit then raise exception 'Debits do not equal credits' using errcode='P0001'; end if;
  if v_total_debit <= 0 then raise exception 'Total must be greater than zero' using errcode='P0001'; end if;

  -- JE-YYYY-XXXX formatted as 'JE-'||year||'-'||lpad(next::text,4,'0')
  v_year := to_char(v_entry.entry_date, 'YYYY');
  v_formatted := 'JE-' || v_year || '-' || lpad(v_next::text, 4, '0');

  update public.journal_entry
  set fiscal_period_id = v_period.id,
      entry_number = v_next,
      reference = case when v_entry.reference = '' or v_entry.reference is null then v_formatted else v_entry.reference end,
      total_debit = v_total_debit,
      total_credit = v_total_credit,
      status = 'POSTED',
      posted_by_id = auth.uid(),
      posted_at = now()
  where id = p_entry_id;

  update public.journal_entry_sequence set last_number = v_next where organization_id = v_entry.organization_id;

  -- audit_event insert is covered via SECURITY DEFINER (no extra RLS policy needed; function runs with definer privileges)
  insert into public.audit_event (organization_id, user_id, entity_type, entity_id, action, metadata)
  values (v_entry.organization_id, auth.uid(), 'journal_entry', p_entry_id, 'POST', jsonb_build_object('entry_number', v_formatted, 'total_debit', v_total_debit, 'total_credit', v_total_credit, 'line_count', v_line_count));

  return v_formatted;
end;
$$;
