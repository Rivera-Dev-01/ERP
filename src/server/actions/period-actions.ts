'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { fiscalPeriodSchema, reopenReasonSchema } from '@/lib/validation/fiscal-period';
import { isOverlapError } from '@/server/domain/fiscal-periods';

type R = { ok: boolean; fieldErrors?: Record<string, string>; formError?: string };

export async function createFiscalPeriod(_prev: R, formData: FormData): Promise<R> {
  const parsed = fiscalPeriodSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    start_date: String(formData.get('start_date') ?? ''),
    end_date: String(formData.get('end_date') ?? ''),
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
  let companyId = String(formData.get('company_id') ?? formData.get('project_id') ?? '').trim();
  if (!companyId) {
    const { data: comp } = await supabase
      .from('company')
      .select('id')
      .eq('organization_id', ctx.organization.id)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!comp) return { ok: false, formError: 'No company found. Create a company first.' };
    companyId = comp.id;
  }
  const { error } = await supabase.from('fiscal_period').insert({
    organization_id: ctx.organization.id,
    company_id: companyId,
    name: parsed.data.name,
    start_date: parsed.data.start_date,
    end_date: parsed.data.end_date,
    status: 'OPEN',
  });
  if (error) {
    if (isOverlapError(error as { code?: string; message?: string }))
      return {
        ok: false,
        formError: `Period ${parsed.data.start_date}–${parsed.data.end_date} overlaps an existing period.`,
      };
    if ((error as { code?: string }).code === '23505')
      return { ok: false, fieldErrors: { name: 'A period with this name already exists' } };
    return { ok: false, formError: 'Unable to create period. Please try again.' };
  }
  revalidatePath('/settings/periods');
  return { ok: true };
}

export async function closeFiscalPeriod(prev: R | FormData, maybeFormData?: FormData): Promise<R> {
  const formData = maybeFormData instanceof FormData ? maybeFormData : prev instanceof FormData ? prev : undefined;
  if (!formData || typeof (formData as FormData).get !== 'function') return { ok: false, formError: 'Missing form data' };
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Missing period id' };
  const forced = String(formData.get('force') ?? '') === 'true';
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  // Fetch period for audit metadata + company_id
  const { data: period } = await supabase.from('fiscal_period').select('id,company_id,start_date,end_date').eq('id', id).eq('organization_id', ctx.organization.id).maybeSingle();
  if (!period) return { ok: false, formError: 'Period not found' };
  // Checklist data for audit
  let draftCount = 0;
  let tbBalanced: boolean | null = null;
  try {
    const { count } = await supabase.from('journal_entry').select('id', { count: 'exact', head: true }).eq('company_id', (period as unknown as { company_id: string }).company_id).eq('status', 'DRAFT').gte('entry_date', (period as unknown as { start_date: string }).start_date).lte('entry_date', (period as unknown as { end_date: string }).end_date);
    draftCount = count ?? 0;
    try {
      const { getTrialBalance } = await import('@/server/reports/trial-balance');
      const tb = await getTrialBalance({ organizationId: ctx.organization.id, companyId: (period as unknown as { company_id: string }).company_id, from: (period as unknown as { start_date: string }).start_date, to: (period as unknown as { end_date: string }).end_date });
      tbBalanced = tb.isBalanced;
    } catch { tbBalanced = null; }
  } catch { /* best effort */ }
  const { error } = await supabase
    .from('fiscal_period')
    .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organization.id)
    .eq('status', 'OPEN');
  if (error) return { ok: false, formError: 'Unable to close period. Please try again.' };
  // Audit event
  try {
    await supabase.from('audit_event').insert({
      organization_id: ctx.organization.id,
      company_id: (period as unknown as { company_id: string }).company_id,
      user_id: ctx.profile.id,
      entity_type: 'fiscal_period',
      entity_id: id,
      action: 'CLOSE',
      metadata: { draft_count: draftCount, tb_balanced: tbBalanced, forced } as unknown as import('@/types/database').Database['public']['Tables']['audit_event']['Row']['metadata'],
    });
  } catch { /* best effort */ }
  revalidatePath('/settings/periods');
  revalidatePath('/activity');
  return { ok: true };
}

export async function reopenFiscalPeriod(prev: R | FormData, maybeFormData?: FormData): Promise<R> {
  const formData = maybeFormData instanceof FormData ? maybeFormData : prev instanceof FormData ? prev : undefined;
  if (!formData || typeof (formData as FormData).get !== 'function') return { ok: false, formError: 'Missing form data' };
  const id = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const parsed = reopenReasonSchema.safeParse({ reason });
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
  const { data: period } = await supabase.from('fiscal_period').select('id,company_id,status').eq('id', id).eq('organization_id', ctx.organization.id).maybeSingle();
  if (!period || (period as unknown as { status: string }).status !== 'CLOSED') return { ok: false, formError: 'Only closed periods can be reopened' };
  const { error } = await supabase
    .from('fiscal_period')
    .update({ status: 'OPEN', reopened_at: new Date().toISOString(), reopened_by_id: ctx.profile.id, reopened_reason: reason })
    .eq('id', id)
    .eq('organization_id', ctx.organization.id)
    .eq('status', 'CLOSED');
  if (error) return { ok: false, formError: 'Unable to reopen period. Please try again.' };
  try {
    await supabase.from('audit_event').insert({
      organization_id: ctx.organization.id,
      company_id: (period as unknown as { company_id: string }).company_id,
      user_id: ctx.profile.id,
      entity_type: 'fiscal_period',
      entity_id: id,
      action: 'REOPEN',
      metadata: { reason } as unknown as import('@/types/database').Database['public']['Tables']['audit_event']['Row']['metadata'],
    });
  } catch { /* best effort */ }
  revalidatePath('/settings/periods');
  revalidatePath('/activity');
  return { ok: true };
}
