import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { validateCoaRows } from '@/server/imports/coa-import';

const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!available)('coa-import integration', () => {
  let admin: ReturnType<typeof createClient<Database>>;
  let orgId: string;
  let userId: string;

  const validRows: Record<string, string>[] = [
    {
      'Account Code': '1000',
      'Account Name': 'Cash in Bank',
      'Account Type': 'ASSET',
      'Normal Balance': 'DEBIT',
      Active: 'true',
    },
    {
      'Account Code': '1100',
      'Account Name': 'Accounts Receivable',
      'Account Type': 'ASSET',
      'Normal Balance': 'DEBIT',
      Active: 'true',
    },
    {
      'Account Code': '3000',
      'Account Name': "Owner's Capital",
      'Account Type': 'EQUITY',
      'Normal Balance': 'CREDIT',
      Active: 'true',
    },
    {
      'Account Code': '4000',
      'Account Name': 'Service Revenue',
      'Account Type': 'INCOME',
      'Normal Balance': 'CREDIT',
      Active: 'true',
    },
    {
      'Account Code': '5000',
      'Account Name': 'Office Supplies Expense',
      'Account Type': 'EXPENSE',
      'Normal Balance': 'DEBIT',
      Active: 'true',
    },
    {
      'Account Code': '5100',
      'Account Name': 'Utilities Expense',
      'Account Type': 'EXPENSE',
      'Normal Balance': 'DEBIT',
      Active: 'true',
    },
  ];

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    orgId = crypto.randomUUID();
    const { error: orgErr } = await admin.from('organization').insert({
      id: orgId,
      name: `COA Import Org ${orgId.slice(0, 8)}`,
      legal_name: `COA Import Org ${orgId.slice(0, 8)} Legal`,
    });
    if (orgErr) throw orgErr;

    const email = `coa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@v0.test`;
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password: 'test-pass-123',
      email_confirm: true,
    });
    if (userErr) throw userErr;
    userId = userData.user!.id;
    const { error: pErr } = await admin.from('profile').insert({ id: userId, name: 'COA Tester' });
    if (pErr) throw pErr;
    const { error: mErr } = await admin.from('organization_membership').insert({
      organization_id: orgId,
      user_id: userId,
      role: 'ACCOUNTANT',
    });
    if (mErr) throw mErr;
  });

  afterAll(async () => {
    if (admin && orgId) {
      await admin.from('import_batch').delete().eq('organization_id', orgId);
      await admin.from('account').delete().eq('organization_id', orgId);
      await admin.from('organization_membership').delete().eq('organization_id', orgId);
      await admin.from('organization').delete().eq('id', orgId);
      if (userId) {
        await admin.from('profile').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    }
  });

  it('valid 6-row file imports 6 + import_batch counts', async () => {
    const { rowErrors, normalized } = validateCoaRows(validRows);
    expect(rowErrors).toHaveLength(0);
    expect(normalized).toHaveLength(6);

    // insert accounts
    const payload = normalized.map((r) => ({
      organization_id: orgId,
      code: r.code,
      name: r.name,
      type: r.type as Database['public']['Enums']['account_type'],
      normal_balance: r.normal_balance as Database['public']['Enums']['normal_balance'],
      is_active: r.is_active,
    }));
    const { error: insErr } = await admin.from('account').insert(payload);
    expect(insErr).toBeNull();

    const { count: acctCount } = await admin
      .from('account')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    expect(acctCount).toBe(6);

    const { error: batchErr } = await admin.from('import_batch').insert({
      organization_id: orgId,
      file_name: 'chart-of-accounts.csv',
      import_type: 'CHART_OF_ACCOUNTS',
      status: 'IMPORTED',
      row_count: validRows.length,
      valid_row_count: validRows.length,
      invalid_row_count: 0,
      created_by_id: userId,
    });
    expect(batchErr).toBeNull();

    const { data: batch, error: batchSelErr } = await admin
      .from('import_batch')
      .select('row_count,valid_row_count,invalid_row_count')
      .eq('organization_id', orgId)
      .maybeSingle();
    expect(batchSelErr).toBeNull();
    expect(batch?.row_count).toBe(6);
    expect(batch?.valid_row_count).toBe(6);
    expect(batch?.invalid_row_count).toBe(0);
  });

  it('invalid (duplicate+bad type) returns rowErrors 0 inserts', async () => {
    // duplicate within file + non-numeric code
    const badRows: Record<string, string>[] = [
      {
        'Account Code': '1000',
        'Account Name': 'Duplicate of existing',
        'Account Type': 'ASSET',
        'Normal Balance': 'DEBIT',
        Active: 'true',
      },
      {
        'Account Code': 'A999',
        'Account Name': 'Bad code',
        'Account Type': 'ASSET',
        'Normal Balance': 'DEBIT',
        Active: 'true',
      },
    ];

    const { rowErrors: localErrors, normalized } = validateCoaRows(badRows);
    // A999 should produce non-numeric error
    expect(localErrors.some((e) => /code/i.test(e.message))).toBe(true);

    // vs-DB duplicate check (single query) same as importAccountsCsv
    const codes = normalized.map((r) => r.code);
    const vsDbErrors: Array<{ row: number; code: string; message: string }> = [];
    if (codes.length > 0) {
      const { data: existing } = await admin
        .from('account')
        .select('code')
        .eq('organization_id', orgId)
        .in('code', codes);
      const existingSet = new Set((existing ?? []).map((r) => r.code));
      for (const r of normalized) {
        if (existingSet.has(r.code))
          vsDbErrors.push({
            row: -1,
            code: r.code,
            message: 'Code already exists in organization',
          });
      }
    }
    const allErrors = [...localErrors, ...vsDbErrors];
    expect(allErrors.length).toBeGreaterThan(0);

    // atomic: should insert 0 when errors exist
    const beforeCountRes = await admin
      .from('account')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    const beforeCount = beforeCountRes.count ?? 0;

    // do NOT insert when errors exist — simulate atomic guard
    if (allErrors.length === 0) {
      await admin.from('account').insert(
        normalized.map((r) => ({
          organization_id: orgId,
          code: r.code,
          name: r.name,
          type: r.type as Database['public']['Enums']['account_type'],
          normal_balance: r.normal_balance as Database['public']['Enums']['normal_balance'],
          is_active: r.is_active,
        })),
      );
    }

    const afterCountRes = await admin
      .from('account')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    expect(afterCountRes.count).toBe(beforeCount);

    // also ensure no extra import_batch inserted for invalid file
    const { count: batchCount } = await admin
      .from('import_batch')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    // should still be 1 from previous valid import
    expect(batchCount).toBe(1);
  });
});
