'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { accountSchema } from '@/lib/validation/account';

type R = { ok: boolean; fieldErrors?: Record<string, string>; formError?: string };

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
  const payload = {
    organization_id: ctx.organization.id,
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
    : await supabase.from('account').insert(payload);
  if (error) {
    if ((error as { code?: string }).code === '23505')
      return { ok: false, fieldErrors: { code: 'Code already exists in this organization' } };
    return { ok: false, formError: 'Unable to save account. Please try again.' };
  }
  revalidatePath('/accounts');
  return { ok: true };
}

export async function seedDemoAccountsIfEmpty(): Promise<void> {
  const ctx = await requireOrganizationAction();
  const supabase = await createClient();
  const { count } = await supabase
    .from('account')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organization.id);
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
  ].map((r) => ({ ...r, organization_id: ctx.organization.id }));
  await supabase
    .from('account')
    .upsert(rows, { onConflict: 'organization_id,code', ignoreDuplicates: false });
}
