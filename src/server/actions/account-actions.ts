'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import Papa from 'papaparse';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { accountSchema } from '@/lib/validation/account';
import { ACCOUNT_HEADERS } from '@/server/domain/accounts';
import { validateCoaRows } from '@/server/imports/coa-import';
import type { Database } from '@/types/database';

type R = { ok: boolean; fieldErrors?: Record<string, string>; formError?: string };

export async function deactivateAccount(
  _prev: { ok: boolean; warningCount?: number; formError?: string },
  formData: FormData,
) {
  const id = String(formData.get('id') ?? '');
  const confirmed = String(formData.get('confirmed') ?? '') === 'true';
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' } as const;
  }
  const supabase = await createClient();
  const { count } = await supabase
    .from('journal_line')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id);
  const hasLines = (count ?? 0) > 0;
  if (hasLines && !confirmed) return { ok: false, warningCount: count ?? 0 } as const;
  const { error } = await supabase
    .from('account')
    .update({ is_active: false })
    .eq('id', id)
    .eq('organization_id', ctx.organization.id);
  if (error)
    return { ok: false, formError: 'Unable to deactivate account. Please try again.' } as const;
  revalidatePath('/accounts');
  return { ok: true } as const;
}

export async function upsertAccount(_prev: R, formData: FormData): Promise<R> {
  const isUpdate = !!String(formData.get('id') ?? '');
  const parsed = accountSchema.safeParse({
    code: String(formData.get('code') ?? ''),
    name: String(formData.get('name') ?? ''),
    type: String(formData.get('type') ?? ''),
    normal_balance: String(formData.get('normal_balance') ?? ''),
    is_active: String(formData.get('is_active') ?? 'true'),
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
  // Resolve projectId from form or default first ACTIVE
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
  const payload = {
    organization_id: ctx.organization.id,
    project_id: projectId,
    code: parsed.data.code,
    name: parsed.data.name,
    type: parsed.data.type,
    normal_balance: parsed.data.normal_balance,
    is_active: parsed.data.is_active,
  };
  const { error } = isUpdate
    ? await supabase
        .from('account')
        .update(payload)
        .eq('id', String(formData.get('id')))
        .eq('organization_id', ctx.organization.id)
        .eq('project_id', projectId)
    : await supabase.from('account').insert(payload);
  if (error) {
    if ((error as { code?: string }).code === '23505')
      return { ok: false, fieldErrors: { code: 'Code already exists in this project' } };
    return { ok: false, formError: 'Unable to save account. Please try again.' };
  }
  revalidatePath('/accounts');
  return { ok: true };
}

export async function seedDemoAccountsIfEmpty(projectId?: string): Promise<void> {
  const ctx = await requireOrganizationAction();
  const supabase = await createClient();
  let pid = projectId;
  if (!pid) {
    const { data: proj } = await supabase
      .from('project')
      .select('id')
      .eq('organization_id', ctx.organization.id)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!proj) return;
    pid = proj.id;
  }
  const { count } = await supabase
    .from('account')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organization.id)
    .eq('project_id', pid);
  if ((count ?? 0) > 0) return;
  const rows = [
    {
      code: '1000',
      name: 'Cash in Bank',
      type: 'ASSET' as const,
      normal_balance: 'DEBIT' as const,
      is_active: true,
    },
    {
      code: '1100',
      name: 'Accounts Receivable',
      type: 'ASSET' as const,
      normal_balance: 'DEBIT' as const,
      is_active: true,
    },
    {
      code: '3000',
      name: "Owner's Capital",
      type: 'EQUITY' as const,
      normal_balance: 'CREDIT' as const,
      is_active: true,
    },
    {
      code: '4000',
      name: 'Service Revenue',
      type: 'INCOME' as const,
      normal_balance: 'CREDIT' as const,
      is_active: true,
    },
    {
      code: '5000',
      name: 'Office Supplies Expense',
      type: 'EXPENSE' as const,
      normal_balance: 'DEBIT' as const,
      is_active: true,
    },
    {
      code: '5100',
      name: 'Utilities Expense',
      type: 'EXPENSE' as const,
      normal_balance: 'DEBIT' as const,
      is_active: true,
    },
  ].map((r) => ({ ...r, organization_id: ctx.organization.id, project_id: pid }));
  await supabase
    .from('account')
    .upsert(rows, { onConflict: 'project_id,code', ignoreDuplicates: false });
}

export async function importAccountsCsv(
  _prev: {
    ok: boolean;
    rowErrors?: Array<{ row: number; code: string; message: string }>;
    rowCount?: number;
    formError?: string;
  },
  formData: FormData,
) {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' } as const;
  }
  const file = formData.get('file') as File | null;
  if (!file) return { ok: false, formError: 'No file provided' } as const;
  const text = await file.text();
  const parsed = (
    Papa.parse as unknown as (
      input: string,
      config: unknown,
    ) => Papa.ParseResult<Record<string, string>>
  )(text, {
    header: true,
    skipEmptyLines: true,
    trimHeaders: true,
  } as unknown as Papa.ParseConfig);
  const headers = (parsed.meta.fields ?? []).map((h: string) => String(h).trim());
  const headerOk = ACCOUNT_HEADERS.every((h) =>
    headers.map((x: string) => x.toLowerCase()).includes(h.toLowerCase()),
  );
  if (!headerOk)
    return {
      ok: false,
      formError: `Invalid header. Expected: ${ACCOUNT_HEADERS.join(', ')}`,
    } as const;
  const rows = parsed.data as Record<string, string>[];
  const { rowErrors, normalized } = validateCoaRows(rows);
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
    if (!proj) return { ok: false, formError: 'No project found. Create a project first.' } as const;
    projectId = proj.id;
  }
  if (normalized.length > 0) {
    const codes = normalized.map((r) => r.code);
    const { data: existing } = await supabase
      .from('account')
      .select('code')
      .eq('organization_id', ctx.organization.id)
      .eq('project_id', projectId)
      .in('code', codes);
    const existingSet = new Set((existing ?? []).map((r) => r.code));
    for (const r of normalized)
      if (existingSet.has(r.code))
        rowErrors.push({ row: -1, code: r.code, message: 'Code already exists in this project' });
  }
  if (rowErrors.length > 0) return { ok: false, rowErrors, rowCount: rows.length } as const;
  const payload = normalized.map((r) => ({
    organization_id: ctx.organization.id,
    project_id: projectId,
    code: r.code,
    name: r.name,
    type: r.type as Database['public']['Enums']['account_type'],
    normal_balance: r.normal_balance as Database['public']['Enums']['normal_balance'],
    is_active: r.is_active,
  }));
  const { error } = await supabase.from('account').insert(payload);
  if (error) {
    if ((error as { code?: string }).code === '23505')
      return {
        ok: false,
        rowErrors: [{ row: -1, code: '', message: 'Duplicate code in this project (race)' }],
        rowCount: rows.length,
      } as const;
    return { ok: false, formError: 'Import failed. Please try again.' } as const;
  }
  await supabase.from('import_batch').insert({
    organization_id: ctx.organization.id,
    project_id: projectId,
    file_name: file.name,
    import_type: 'CHART_OF_ACCOUNTS',
    status: 'IMPORTED',
    row_count: rows.length,
    valid_row_count: rows.length,
    invalid_row_count: 0,
    created_by_id: ctx.profile.id,
  });
  revalidatePath('/accounts');
  return { ok: true, rowCount: rows.length } as const;
}
