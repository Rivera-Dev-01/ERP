'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { journalSchema } from '@/lib/validation/journal';
import { toDbString } from '@/lib/money';

type R = { ok: boolean; entryId?: string; fieldErrors?: Record<string, string>; formError?: string };

export async function upsertJournalEntry(_prev: R, formData: FormData): Promise<R> {
  const linesRaw = JSON.parse(String(formData.get('lines_json') ?? '[]')) as Array<{ account_id: string; description?: string; debit: string; credit: string; tax_code?: string }>;
  const parsed = journalSchema.safeParse({
    entry_date: String(formData.get('entry_date') ?? ''),
    reference: String(formData.get('reference') ?? ''),
    description: String(formData.get('description') ?? ''),
    notes: String(formData.get('notes') ?? ''),
    lines: linesRaw,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, fieldErrors };
  }
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  // resolve fiscal_period_id for entry_date in an OPEN period
  const { data: period } = await supabase
    .from('fiscal_period')
    .select('id')
    .eq('organization_id', ctx.organization.id)
    .eq('status', 'OPEN')
    .lte('start_date', parsed.data.entry_date)
    .gte('end_date', parsed.data.entry_date)
    .maybeSingle();
  if (!period) return { ok: false, fieldErrors: { entry_date: 'Date not in any open period' } };
  // validate active accounts
  const accountIds = parsed.data.lines.map((l) => l.account_id);
  const { data: accounts } = await supabase.from('account').select('id,is_active').in('id', accountIds).eq('organization_id', ctx.organization.id);
  const activeMap = new Map((accounts ?? []).map((a) => [a.id, a.is_active]));
  for (const l of parsed.data.lines) if (!activeMap.get(l.account_id)) return { ok: false, formError: 'One or more selected accounts are inactive or not in your organization' };
  // compute totals
  const totalDebit = parsed.data.lines.reduce((s, l) => s + Number.parseFloat(l.debit || '0'), 0);
  const totalCredit = parsed.data.lines.reduce((s, l) => s + Number.parseFloat(l.credit || '0'), 0);
  const entryId = String(formData.get('id') ?? '').trim();
  const payload = {
    organization_id: ctx.organization.id,
    fiscal_period_id: period.id,
    entry_date: parsed.data.entry_date,
    reference: parsed.data.reference.trim(),
    description: parsed.data.description.trim(),
    notes: parsed.data.notes || null,
    total_debit: Number.parseFloat(toDbString(String(totalDebit))),
    total_credit: Number.parseFloat(toDbString(String(totalCredit))),
  };
  let savedId = entryId;
  if (entryId) {
    const { data: existing } = await supabase.from('journal_entry').select('status,organization_id').eq('id', entryId).maybeSingle();
    if (!existing || existing.organization_id !== ctx.organization.id || existing.status !== 'DRAFT') return { ok: false, formError: 'Only draft entries can be edited' };
    const { error } = await supabase.from('journal_entry').update(payload).eq('id', entryId).eq('organization_id', ctx.organization.id);
    if (error) return { ok: false, formError: 'Unable to save journal entry. Please try again.' };
    await supabase.from('journal_line').delete().eq('journal_entry_id', entryId);
  } else {
    const { data, error } = await supabase
      .from('journal_entry')
      .insert({ ...payload, created_by_id: ctx.profile.id })
      .select('id')
      .single();
    if (error || !data) return { ok: false, formError: 'Unable to create journal entry. Please try again.' };
    savedId = data.id;
  }
  const linePayload = parsed.data.lines.map((l, idx) => ({
    journal_entry_id: savedId,
    account_id: l.account_id,
    line_number: idx + 1,
    description: l.description || null,
    debit: Number.parseFloat(toDbString(l.debit || '0')),
    credit: Number.parseFloat(toDbString(l.credit || '0')),
    tax_code: l.tax_code || null,
  }));
  const { error: lineError } = await supabase.from('journal_line').insert(linePayload);
  if (lineError) return { ok: false, formError: 'Unable to save lines. Please try again.' };
  revalidatePath('/journal');
  revalidatePath(`/journal/${savedId}`);
  return { ok: true, entryId: savedId };
}

export async function deleteJournalEntry(entryId: string): Promise<{ ok: boolean; formError?: string }> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { data: entry } = await supabase.from('journal_entry').select('status,organization_id').eq('id', entryId).maybeSingle();
  if (!entry || entry.organization_id !== ctx.organization.id || entry.status !== 'DRAFT') return { ok: false, formError: 'Only draft entries can be deleted' };
  await supabase.from('journal_entry').delete().eq('id', entryId);
  revalidatePath('/journal');
  return { ok: true };
}

export async function duplicateJournalEntry(entryId: string): Promise<{ ok: boolean; newId?: string; formError?: string }> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { data: entry } = await supabase.from('journal_entry').select('*').eq('id', entryId).eq('organization_id', ctx.organization.id).maybeSingle();
  if (!entry) return { ok: false, formError: 'Entry not found' };
  const { data: lines } = await supabase.from('journal_line').select('*').eq('journal_entry_id', entryId).order('line_number');
  const { data: created } = await supabase
    .from('journal_entry')
    .insert({
      organization_id: entry.organization_id,
      fiscal_period_id: entry.fiscal_period_id,
      entry_date: entry.entry_date,
      reference: `${entry.reference}-copy`,
      description: entry.description,
      notes: entry.notes,
      status: 'DRAFT',
      entry_type: entry.entry_type,
      total_debit: 0,
      total_credit: 0,
      created_by_id: ctx.profile.id,
    })
    .select('id')
    .single();
  if (!created) return { ok: false, formError: 'Unable to duplicate' };
  if (lines?.length) {
    await supabase.from('journal_line').insert(
      lines.map((l, i) => ({
        journal_entry_id: created.id,
        account_id: l.account_id,
        line_number: i + 1,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        tax_code: l.tax_code,
      })),
    );
  }
  revalidatePath('/journal');
  return { ok: true, newId: created.id };
}

// TODO Tasks 2-3: postJournalEntry and reverseJournalEntry will be implemented in later slices.
// postJournalEntry(entryId) -> supabase.rpc('post_journal_entry', { p_entry_id: entryId })
// reverseJournalEntry(entryId, reversalDate, description?) -> supabase.rpc('reverse_journal_entry', { p_entry_id: entryId, p_reversal_date: reversalDate, p_description: description })
