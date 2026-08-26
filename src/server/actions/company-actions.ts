'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { companySchema } from '@/lib/validation/company';
import { isDuplicateError } from '@/server/domain/companies';

type R = { ok: boolean; fieldErrors?: Record<string, string>; formError?: string; companyId?: string; projectId?: string };

export async function createCompany(prevOrData: R | FormData, maybeFormData?: FormData): Promise<R> {
  const formData = maybeFormData instanceof FormData ? maybeFormData : prevOrData instanceof FormData ? prevOrData : undefined;
  if (!formData || typeof (formData as FormData).get !== 'function') {
    return { ok: false, formError: 'Missing form data' };
  }
  const parsed = companySchema.safeParse({
    name: String(formData.get('name') ?? ''),
    client_name: String(formData.get('client_name') ?? ''),
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
  const { data, error } = await supabase
    .from('company')
    .insert({
      organization_id: ctx.organization.id,
      name: parsed.data.name,
      client_name: parsed.data.client_name || null,
      status: 'ACTIVE',
    })
    .select('id')
    .single();
  if (error) {
    if (isDuplicateError(error as { code?: string })) {
      return { ok: false, fieldErrors: { name: 'A company with this name already exists' } };
    }
    return { ok: false, formError: 'Unable to create company. Please try again.' };
  }
  revalidatePath('/companies');
  revalidatePath('/accounts');
  revalidatePath('/reports');
  return { ok: true, companyId: data!.id, projectId: data!.id };
}

export async function updateCompany(prevOrData: R | FormData, maybeFormData?: FormData): Promise<R> {
  const formData = maybeFormData instanceof FormData ? maybeFormData : prevOrData instanceof FormData ? prevOrData : undefined;
  if (!formData || typeof (formData as FormData).get !== 'function') {
    return { ok: false, formError: 'Missing form data' };
  }
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Missing company id' };
  const parsed = companySchema.safeParse({
    name: String(formData.get('name') ?? ''),
    client_name: String(formData.get('client_name') ?? ''),
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
  const { error } = await supabase
    .from('company')
    .update({ name: parsed.data.name, client_name: parsed.data.client_name || null })
    .eq('id', id)
    .eq('organization_id', ctx.organization.id);
  if (error) {
    if (isDuplicateError(error as { code?: string })) {
      return { ok: false, fieldErrors: { name: 'A company with this name already exists' } };
    }
    return { ok: false, formError: 'Unable to update company. Please try again.' };
  }
  revalidatePath('/companies');
  return { ok: true };
}

export async function archiveCompany(prevOrData: R | FormData, maybeFormData?: FormData): Promise<R> {
  const formData = maybeFormData instanceof FormData ? maybeFormData : prevOrData instanceof FormData ? prevOrData : undefined;
  if (!formData || typeof (formData as FormData).get !== 'function') {
    return { ok: false, formError: 'Missing form data' };
  }
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Missing company id' };
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('company')
    .update({ status: 'ARCHIVED' })
    .eq('id', id)
    .eq('organization_id', ctx.organization.id)
    .eq('status', 'ACTIVE');
  if (error) return { ok: false, formError: 'Unable to archive company. Please try again.' };
  revalidatePath('/companies');
  return { ok: true };
}

// Backwards compat aliases
export const createProject = createCompany;
export const updateProject = updateCompany;
export const archiveProject = archiveCompany;
