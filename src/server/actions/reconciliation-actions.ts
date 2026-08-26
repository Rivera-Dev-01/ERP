'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { parseTabular, ImportParseError } from '@/server/imports/parser';

type R = { ok: boolean; formError?: string; reconId?: string };

export async function createReconciliation(_prev: R, formData: FormData): Promise<R> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const companyId = String(formData.get('company_id') ?? '').trim();
  const accountId = String(formData.get('account_id') ?? '').trim();
  const start = String(formData.get('start_date') ?? '').trim();
  const end = String(formData.get('end_date') ?? '').trim();
  const bal = String(formData.get('statement_balance') ?? '').trim();
  if (!companyId || !accountId || !start || !end || !bal) return { ok: false, formError: 'All fields required' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reconciliation')
    .insert({
      organization_id: ctx.organization.id,
      company_id: companyId,
      account_id: accountId,
      start_date: start,
      end_date: end,
      statement_balance: Number.parseFloat(bal),
      created_by_id: ctx.profile.id,
    })
    .select('id')
    .single();
  if (error) return { ok: false, formError: error.message };
  revalidatePath('/reconciliation');
  return { ok: true, reconId: data!.id };
}

export async function importReconStatement(_prev: R, formData: FormData): Promise<R> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const reconId = String(formData.get('reconciliation_id') ?? '').trim();
  const file = formData.get('file') as File | null;
  if (!reconId || !file) return { ok: false, formError: 'Missing recon or file' };
  const supabase = await createClient();
  const { data: recon } = await supabase.from('reconciliation').select('company_id').eq('id', reconId).maybeSingle();
  if (!recon) return { ok: false, formError: 'Reconciliation not found' };
  try {
    const buf = await file.arrayBuffer();
    const parsed = await parseTabular(file.name, buf);
    // Expect headers: Date, Description, Amount  (or Debit/Credit)
    const lower = parsed.headers.map((h) => h.toLowerCase());
    const hasAmount = lower.includes('amount');
    const hasDebitCredit = lower.includes('debit') || lower.includes('credit');
    if (!hasAmount && !hasDebitCredit) return { ok: false, formError: `Header must include Amount or Debit/Credit. Got: ${parsed.headers.join(', ')}` };
    const rows = parsed.rows;
    const payload = rows.map((r) => {
      // Normalize keys to lower for lookup
      const rec: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) rec[k.toLowerCase()] = v;
      const date = rec['date'] ?? rec['item_date'] ?? rec['entry_date'] ?? '';
      const desc = rec['description'] ?? rec['memo'] ?? '';
      let amtStr = rec['amount'] ?? '';
      if (!amtStr && (rec['debit'] || rec['credit'])) {
        const d = Number.parseFloat(rec['debit'] || '0') || 0;
        const c = Number.parseFloat(rec['credit'] || '0') || 0;
        amtStr = String(d - c || c - d || 0);
        // Simple: Debit positive, Credit negative? We'll store as provided: Debit - Credit
        amtStr = String(d - c);
        if (!amtStr || amtStr === '0') amtStr = String(c ? `-${c}` : d);
      }
      return {
        reconciliation_id: reconId,
        item_date: date || new Date().toISOString().slice(0, 10),
        description: desc || file.name,
        amount: Number.parseFloat(amtStr || '0'),
      };
    }).filter((p) => !Number.isNaN(p.amount));
    if (payload.length === 0) return { ok: false, formError: 'No valid rows found' };
    const { error } = await supabase.from('reconciliation_item').insert(payload as unknown as never);
    if (error) return { ok: false, formError: error.message };
    revalidatePath('/reconciliation');
    return { ok: true };
  } catch (e) {
    if (e instanceof ImportParseError) return { ok: false, formError: e.message };
    return { ok: false, formError: String((e as Error).message) };
  }
}

export async function toggleReconMatch(itemId: string, lineId: string | null): Promise<{ ok: boolean; formError?: string }> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { error } = await supabase.from('reconciliation_item').update({ matched_line_id: lineId }).eq('id', itemId);
  if (error) return { ok: false, formError: error.message };
  revalidatePath('/reconciliation');
  return { ok: true };
}

export async function completeReconciliation(reconId: string): Promise<{ ok: boolean; formError?: string }> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { error } = await supabase.from('reconciliation').update({ status: 'COMPLETE' }).eq('id', reconId);
  if (error) return { ok: false, formError: error.message };
  revalidatePath('/reconciliation');
  return { ok: true };
}
