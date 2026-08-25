'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { organizationUpdateSchema } from '@/lib/validation/organization';

type ActionResult = { ok: boolean; fieldErrors?: Record<string, string>; formError?: string };

export async function updateOrganization(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = organizationUpdateSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    legal_name: String(formData.get('legal_name') ?? ''),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { ok: false, fieldErrors };
  }
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('organization')
    .update({ name: parsed.data.name, legal_name: parsed.data.legal_name })
    .eq('id', ctx.organization.id);
  if (error) return { ok: false, formError: 'Unable to save changes. Please try again.' };
  revalidatePath('/settings');
  return { ok: true };
}
