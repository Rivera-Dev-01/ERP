'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';

type R = { ok: boolean; formError?: string };

export async function upsertWorkpaperNote(_prev: R, formData: FormData): Promise<R> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const companyId = String(formData.get('company_id') ?? '').trim();
  const key = String(formData.get('schedule_key') ?? '').trim();
  const periodEnd = String(formData.get('period_end') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  if (!companyId || !key || !periodEnd) return { ok: false, formError: 'Missing fields' };
  const supabase = await createClient();
  const { error } = await supabase.from('workpaper_note').upsert({
    organization_id: ctx.organization.id,
    company_id: companyId,
    schedule_key: key,
    period_end: periodEnd,
    notes,
    updated_by_id: ctx.profile.id,
    updated_at: new Date().toISOString(),
  } as unknown as never, { onConflict: 'company_id,schedule_key,period_end' });
  if (error) return { ok: false, formError: error.message };
  revalidatePath('/workpapers');
  return { ok: true };
}
