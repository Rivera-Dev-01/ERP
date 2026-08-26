'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { fiscalPeriodSchema } from '@/lib/validation/fiscal-period';
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
  let projectId = String(formData.get('project_id') ?? '').trim();
  if (!projectId) {
    const { data: proj } = await supabase
      .from('project')
      .select('id')
      .eq('organization_id', ctx.organization.id)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!proj) return { ok: false, formError: 'No project found. Create a project first.' };
    projectId = proj.id;
  }
  const { error } = await supabase.from('fiscal_period').insert({
    organization_id: ctx.organization.id,
    project_id: projectId,
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

export async function closeFiscalPeriod(_prev: R, formData: FormData): Promise<R> {
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Missing period id' };
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('fiscal_period')
    .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organization.id)
    .eq('status', 'OPEN');
  if (error) return { ok: false, formError: 'Unable to close period. Please try again.' };
  revalidatePath('/settings/periods');
  return { ok: true };
}
