'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { projectSchema } from '@/lib/validation/project';
import { isDuplicateError } from '@/server/domain/projects';

type R = { ok: boolean; fieldErrors?: Record<string, string>; formError?: string; projectId?: string };

export async function createProject(_prev: R, formData: FormData): Promise<R> {
  const parsed = projectSchema.safeParse({
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
    .from('project')
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
      return { ok: false, fieldErrors: { name: 'A project with this name already exists' } };
    }
    return { ok: false, formError: 'Unable to create project. Please try again.' };
  }
  revalidatePath('/projects');
  revalidatePath('/accounts');
  revalidatePath('/reports');
  return { ok: true, projectId: data!.id };
}

export async function updateProject(_prev: R, formData: FormData): Promise<R> {
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Missing project id' };
  const parsed = projectSchema.safeParse({
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
    .from('project')
    .update({ name: parsed.data.name, client_name: parsed.data.client_name || null })
    .eq('id', id)
    .eq('organization_id', ctx.organization.id);
  if (error) {
    if (isDuplicateError(error as { code?: string })) {
      return { ok: false, fieldErrors: { name: 'A project with this name already exists' } };
    }
    return { ok: false, formError: 'Unable to update project. Please try again.' };
  }
  revalidatePath('/projects');
  return { ok: true };
}

export async function archiveProject(_prev: R, formData: FormData): Promise<R> {
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Missing project id' };
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('project')
    .update({ status: 'ARCHIVED' })
    .eq('id', id)
    .eq('organization_id', ctx.organization.id)
    .eq('status', 'ACTIVE');
  if (error) return { ok: false, formError: 'Unable to archive project. Please try again.' };
  revalidatePath('/projects');
  return { ok: true };
}
