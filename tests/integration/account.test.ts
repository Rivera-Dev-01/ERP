import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!available)('account integration', () => {
  const orgId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient<Database>>;
  let accountId: string | null = null;

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: errA } = await admin.from('organization').insert({
      id: orgId,
      name: `Test Org A ${orgId.slice(0, 8)}`,
      legal_name: `Test Org A ${orgId.slice(0, 8)} Legal`,
    });
    if (errA) throw errA;
    const { error: errB } = await admin.from('organization').insert({
      id: orgBId,
      name: `Test Org B ${orgBId.slice(0, 8)}`,
      legal_name: `Test Org B ${orgBId.slice(0, 8)} Legal`,
    });
    if (errB) throw errB;
  });

  afterAll(async () => {
    if (admin) {
      await admin.from('account').delete().eq('organization_id', orgId);
      await admin.from('account').delete().eq('organization_id', orgBId);
      await admin.from('organization').delete().eq('id', orgId);
      await admin.from('organization').delete().eq('id', orgBId);
    }
  });

  it('creates 1000 Cash succeeds', async () => {
    const { data, error } = await admin
      .from('account')
      .insert({
        organization_id: orgId,
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeDefined();
    accountId = data!.id;
  });

  it('duplicate 1000 within same org rejected (23505)', async () => {
    const { error } = await admin.from('account').insert({
      organization_id: orgId,
      code: '1000',
      name: 'Cash Duplicate',
      type: 'ASSET',
      normal_balance: 'DEBIT',
      is_active: true,
    });
    expect(error).not.toBeNull();
    expect((error as { code?: string })?.code).toBe('23505');
  });

  it('update name succeeds', async () => {
    expect(accountId).not.toBeNull();
    const { error } = await admin
      .from('account')
      .update({ name: 'Cash Updated' })
      .eq('id', accountId!)
      .eq('organization_id', orgId);
    expect(error).toBeNull();
    const { data } = await admin.from('account').select('name').eq('id', accountId!).single();
    expect(data?.name).toBe('Cash Updated');
  });

  it('cross-org duplicate code 1000 succeeds', async () => {
    const { data, error } = await admin
      .from('account')
      .insert({
        organization_id: orgBId,
        code: '1000',
        name: 'Cash Org B',
        type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeDefined();
  });

  it('seed backfill on empty org inserts 6 rows and re-run is idempotent (still 6)', async () => {
    // Clean orgA accounts except keep the earlier one? For seed test, use a fresh org
    const seedOrgId = crypto.randomUUID();
    await admin.from('organization').insert({
      id: seedOrgId,
      name: `Seed Org ${seedOrgId.slice(0, 8)}`,
      legal_name: `Seed Org ${seedOrgId.slice(0, 8)} Legal`,
    });

    // First run: count ==0 then upsert 6
    const { count: count0 } = await admin
      .from('account')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', seedOrgId);
    expect(count0).toBe(0);

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
    ].map((r) => ({ ...r, organization_id: seedOrgId }));

    const { error: err1 } = await admin
      .from('account')
      .upsert(rows, { onConflict: 'organization_id,code', ignoreDuplicates: false });
    expect(err1).toBeNull();

    const { count: count1 } = await admin
      .from('account')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', seedOrgId);
    expect(count1).toBe(6);

    // Re-run is idempotent
    const { error: err2 } = await admin
      .from('account')
      .upsert(rows, { onConflict: 'organization_id,code', ignoreDuplicates: false });
    expect(err2).toBeNull();

    const { count: count2 } = await admin
      .from('account')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', seedOrgId);
    expect(count2).toBe(6);

    await admin.from('account').delete().eq('organization_id', seedOrgId);
    await admin.from('organization').delete().eq('id', seedOrgId);
  });
});
