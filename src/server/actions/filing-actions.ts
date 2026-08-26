'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';

export async function toggleFilingStatus(_prev: { ok: boolean }, formData: FormData): Promise<{ ok: boolean; formError?: string }> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const companyId = String(formData.get('company_id') ?? '').trim();
  const form = String(formData.get('form') ?? '').trim();
  const periodLabel = String(formData.get('period_label') ?? '').trim();
  const dueDate = String(formData.get('due_date') ?? '').trim();
  const current = String(formData.get('current_status') ?? '').trim();
  if (!companyId || !form || !periodLabel || !dueDate) return { ok: false, formError: 'Missing fields' };
  const nextStatus = current === 'FILED' ? 'NOT_STARTED' : 'FILED';
  const supabase = await createClient();
  const payload = {
    organization_id: ctx.organization.id,
    company_id: companyId,
    form,
    period_label: periodLabel,
    due_date: dueDate,
    status: nextStatus,
    filed_at: nextStatus === 'FILED' ? new Date().toISOString() : null,
  } as unknown as never;
  const { error } = await supabase.from('filing_status').upsert(payload, { onConflict: 'company_id,form,period_label' });
  if (error) return { ok: false, formError: error.message };
  revalidatePath('/tax-center');
  return { ok: true };
}
