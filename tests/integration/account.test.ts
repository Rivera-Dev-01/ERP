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

  it('warns when deactivating an account used in journal lines', async () => {
    // isolated org for deactivation test
    const deactOrgId = crypto.randomUUID();
    const { error: orgErr } = await admin.from('organization').insert({
      id: deactOrgId,
      name: `Deact Org ${deactOrgId.slice(0, 8)}`,
      legal_name: `Deact Org ${deactOrgId.slice(0, 8)} Legal`,
    });
    expect(orgErr).toBeNull();

    // create a real auth user + profile to satisfy journal_entry.created_by_id FK
    const email = `deact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@v0.test`;
    const password = 'test-pass-123';
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(userErr).toBeNull();
    const userId = userData.user!.id;
    const { error: profileErr } = await admin
      .from('profile')
      .insert({ id: userId, name: 'Deact Tester' });
    expect(profileErr).toBeNull();
    const { error: memErr } = await admin.from('organization_membership').insert({
      organization_id: deactOrgId,
      user_id: userId,
      role: 'ACCOUNTANT',
    });
    expect(memErr).toBeNull();

    // fiscal period
    const { data: fp, error: fpErr } = await admin
      .from('fiscal_period')
      .insert({
        organization_id: deactOrgId,
        name: `FP ${deactOrgId.slice(0, 8)}`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        status: 'OPEN',
      })
      .select('id')
      .single();
    expect(fpErr).toBeNull();
    const fpId = fp!.id;

    // account A
    const { data: acct, error: acctErr } = await admin
      .from('account')
      .insert({
        organization_id: deactOrgId,
        code: '9200',
        name: 'Deact Test Account',
        type: 'EXPENSE',
        normal_balance: 'DEBIT',
        is_active: true,
      })
      .select('id, is_active')
      .single();
    expect(acctErr).toBeNull();
    const accountAId = acct!.id;

    // draft journal_entry + journal_line referencing account A
    const { data: entry, error: entryErr } = await admin
      .from('journal_entry')
      .insert({
        organization_id: deactOrgId,
        fiscal_period_id: fpId,
        entry_date: '2026-08-15',
        reference: `REF-${Date.now()}`,
        description: 'Test entry for deactivation',
        status: 'DRAFT',
        entry_type: 'STANDARD',
        created_by_id: userId,
        total_debit: 100,
        total_credit: 100,
      })
      .select('id')
      .single();
    expect(entryErr).toBeNull();
    const entryId = entry!.id;

    const { error: lineErr } = await admin.from('journal_line').insert({
      journal_entry_id: entryId,
      account_id: accountAId,
      line_number: 1,
      debit: 100,
      credit: 0,
      description: 'Test line',
    });
    expect(lineErr).toBeNull();

    // --- simulate deactivateAccount logic ---
    async function simulateDeactivate(id: string, confirmed: boolean) {
      const { count } = await admin
        .from('journal_line')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', id);
      const hasLines = (count ?? 0) > 0;
      if (hasLines && !confirmed) return { ok: false, warningCount: count ?? 0 } as const;
      const { error } = await admin
        .from('account')
        .update({ is_active: false })
        .eq('id', id)
        .eq('organization_id', deactOrgId);
      if (error) return { ok: false, formError: 'Unable to deactivate' } as const;
      return { ok: true } as const;
    }

    // without confirmed → expect warningCount>0 and is_active still true
    const resWithout = await simulateDeactivate(accountAId, false);
    expect(resWithout.ok).toBe(false);
    expect((resWithout as { warningCount?: number }).warningCount).toBeGreaterThan(0);
    const { data: accBefore } = await admin
      .from('account')
      .select('is_active')
      .eq('id', accountAId)
      .single();
    expect(accBefore?.is_active).toBe(true);

    // with confirmed=true → expect is_active=false and line still present
    const resWith = await simulateDeactivate(accountAId, true);
    expect(resWith.ok).toBe(true);
    const { data: accAfter } = await admin
      .from('account')
      .select('is_active')
      .eq('id', accountAId)
      .single();
    expect(accAfter?.is_active).toBe(false);
    const { count: lineCount } = await admin
      .from('journal_line')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountAId);
    expect(lineCount).toBeGreaterThan(0);

    // cleanup in reverse FK order
    await admin.from('journal_line').delete().eq('journal_entry_id', entryId);
    await admin.from('journal_entry').delete().eq('id', entryId);
    await admin.from('fiscal_period').delete().eq('id', fpId);
    await admin.from('account').delete().eq('id', accountAId);
    await admin.from('organization_membership').delete().eq('organization_id', deactOrgId);
    await admin.from('organization').delete().eq('id', deactOrgId);
    await admin.from('profile').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
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
