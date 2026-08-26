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
  const rawClassification = String(formData.get('tax_classification') ?? '').trim();
  const parsed = organizationUpdateSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    legal_name: String(formData.get('legal_name') ?? ''),
    tin: formData.get('tin') != null ? String(formData.get('tin')) : null,
    rdo: formData.get('rdo') != null ? String(formData.get('rdo')) : null,
    branch_code: formData.get('branch_code') != null ? String(formData.get('branch_code')) : null,
    address: formData.get('address') != null ? String(formData.get('address')) : null,
    tax_classification: rawClassification ? rawClassification : null,
    fiscal_year_start_month: formData.get('fiscal_year_start_month') != null ? String(formData.get('fiscal_year_start_month')) : '1',
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
  const clean = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s ? s : null;
  };
  const tax = clean(parsed.data.tax_classification);
  const validTax = tax && ['VAT', 'NON_VAT', 'PERCENTAGE'].includes(tax) ? tax : null;
  const { error } = await supabase
    .from('organization')
    .update({
      name: parsed.data.name,
      legal_name: parsed.data.legal_name,
      tin: clean(parsed.data.tin),
      rdo: clean(parsed.data.rdo),
      branch_code: clean(parsed.data.branch_code),
      address: clean(parsed.data.address),
      tax_classification: validTax as unknown as 'VAT' | 'NON_VAT' | 'PERCENTAGE' | null,
      fiscal_year_start_month: parsed.data.fiscal_year_start_month,
    })
    .eq('id', ctx.organization.id);
  if (error) return { ok: false, formError: 'Unable to save changes. Please try again.' };
  revalidatePath('/settings');
  return { ok: true };
}
