import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!available)('balance sheet 112000 as-of', () => {
  const orgId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient<Database>>;
  let userId: string;
  let periodId: string;
  const accountIds: Record<string, string> = {};
  const entryIds: string[] = [];
  const asOf = '2026-07-31';

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: orgErr } = await admin.from('organization').insert({
      id: orgId,
      name: `BS Org ${orgId.slice(0, 8)}`,
      legal_name: `BS Org ${orgId.slice(0, 8)} Legal`,
    });
    if (orgErr) throw orgErr;

    const email = `bs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@v0.test`;
    const password = 'test-pass-123';
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userErr) throw userErr;
    userId = userData.user!.id;
    const { error: profileErr } = await admin.from('profile').insert({ id: userId, name: 'BS Tester' });
    if (profileErr) throw profileErr;
    const { error: memErr } = await admin.from('organization_membership').insert({
      organization_id: orgId,
      user_id: userId,
      role: 'ACCOUNTANT',
    });
    if (memErr) throw memErr;

    const { data: fp, error: fpErr } = await admin
      .from('fiscal_period')
      .insert({
        organization_id: orgId,
        name: `BS FP ${orgId.slice(0, 8)}`,
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        status: 'OPEN',
      })
      .select('id')
      .single();
    if (fpErr) throw fpErr;
    periodId = fp!.id;

    const accountsToCreate = [
      { code: '1000', name: 'Cash', type: 'ASSET', normal_balance: 'DEBIT' },
      { code: '1100', name: 'Accounts Receivable', type: 'ASSET', normal_balance: 'DEBIT' },
      { code: '3000', name: 'Owner Capital', type: 'EQUITY', normal_balance: 'CREDIT' },
      { code: '4000', name: 'Service Revenue', type: 'INCOME', normal_balance: 'CREDIT' },
      { code: '5000', name: 'Office Supplies', type: 'EXPENSE', normal_balance: 'DEBIT' },
      { code: '5100', name: 'Utilities', type: 'EXPENSE', normal_balance: 'DEBIT' },
    ] as const;

    for (const a of accountsToCreate) {
      const { data, error } = await admin
        .from('account')
        .insert({
          organization_id: orgId,
          code: a.code,
          name: a.name,
          type: a.type as Database['public']['Enums']['account_type'],
          normal_balance: a.normal_balance as Database['public']['Enums']['normal_balance'],
          is_active: true,
        })
        .select('id')
        .single();
      if (error) throw error;
      accountIds[a.code] = data!.id;
    }

    async function insertEntry(
      entryDate: string,
      fiscalPeriodId: string,
      status: 'POSTED' | 'DRAFT' | 'REVERSED',
      lines: Array<{ code: string; debit: number; credit: number }>,
      suffix: string,
    ) {
      const total = lines.reduce((s, l) => s + l.debit, 0);
      const { data: entry, error } = await admin
        .from('journal_entry')
        .insert({
          organization_id: orgId,
          fiscal_period_id: fiscalPeriodId,
          entry_date: entryDate,
          reference: `BS-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
          description: `BS test ${suffix} ${entryDate}`,
          status,
          entry_type: 'STANDARD',
          created_by_id: userId,
          total_debit: total,
          total_credit: total,
          posted_by_id: status === 'POSTED' || status === 'REVERSED' ? userId : null,
          posted_at: status === 'POSTED' || status === 'REVERSED' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();
      if (error) throw error;
      entryIds.push(entry!.id);
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const { error: le } = await admin.from('journal_line').insert({
          journal_entry_id: entry!.id,
          account_id: accountIds[l.code],
          line_number: i + 1,
          debit: l.debit,
          credit: l.credit,
        });
        if (le) throw le;
      }
      return entry!.id;
    }

    // Same 5 fixture
    await insertEntry('2026-07-01', periodId, 'POSTED', [
      { code: '1000', debit: 100000, credit: 0 },
      { code: '3000', debit: 0, credit: 100000 },
    ], 'INVEST');
    await insertEntry('2026-07-05', periodId, 'POSTED', [
      { code: '5000', debit: 5000, credit: 0 },
      { code: '1000', debit: 0, credit: 5000 },
    ], 'SUPPLIES');
    await insertEntry('2026-07-10', periodId, 'POSTED', [
      { code: '1100', debit: 20000, credit: 0 },
      { code: '4000', debit: 0, credit: 20000 },
    ], 'REVENUE');
    await insertEntry('2026-07-15', periodId, 'POSTED', [
      { code: '1000', debit: 10000, credit: 0 },
      { code: '1100', debit: 0, credit: 10000 },
    ], 'COLLECT');
    await insertEntry('2026-07-20', periodId, 'POSTED', [
      { code: '5100', debit: 3000, credit: 0 },
      { code: '1000', debit: 0, credit: 3000 },
    ], 'UTIL');

    // Draft excluded
    await insertEntry('2026-07-18', periodId, 'DRAFT', [
      { code: '5000', debit: 7000, credit: 0 },
      { code: '1000', debit: 0, credit: 7000 },
    ], 'DRAFT-EXCLUDED');

    const { data: fpAug } = await admin
      .from('fiscal_period')
      .insert({
        organization_id: orgId,
        name: `Aug BS ${orgId.slice(0, 8)}`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        status: 'OPEN',
      })
      .select('id')
      .single();

    await insertEntry('2026-08-01', fpAug!.id, 'POSTED', [
      { code: '4000', debit: 0, credit: 9999 },
      { code: '1000', debit: 9999, credit: 0 },
    ], 'AFTER');
  });

  afterAll(async () => {
    if (admin) {
      for (const eid of entryIds) {
        await admin.from('journal_line').delete().eq('journal_entry_id', eid);
      }
      for (const eid of entryIds) {
        await admin.from('journal_entry').delete().eq('id', eid);
      }
      await admin.from('fiscal_period').delete().eq('organization_id', orgId);
      await admin.from('account').delete().eq('organization_id', orgId);
      await admin.from('organization_membership').delete().eq('organization_id', orgId);
      await admin.from('organization').delete().eq('id', orgId);
      if (userId) {
        await admin.from('profile').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    }
  });

  it('as-of 2026-07-31 yields assets 112000 = L0 + E100000 + CE12000', async () => {
    const { data: lines } = await admin
      .from('journal_line')
      .select('account_id,debit,credit,account!inner(type,normal_balance),journal_entry!inner(entry_date,status,organization_id)')
      .eq('journal_entry.organization_id', orgId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .lte('journal_entry.entry_date', asOf);

    // Filter to from 1970-01-01 implicitly includes all before asOf; no gte needed for balance sheet as-of
    // Compute per-account ending via normal_balance logic (same as balances.ts computeBalance)
    const byAccount = new Map<string, { type: string; normal: string; debit: number; credit: number }>();
    // Fetch accounts to map types
    const { data: accounts } = await admin.from('account').select('id,type,normal_balance').eq('organization_id', orgId);
    const accMap = new Map((accounts ?? []).map((a) => [a.id, a]));
    for (const l of (lines ?? []) as Array<{ account_id: string; debit: number; credit: number }>) {
      const acc = accMap.get(l.account_id);
      if (!acc) continue;
      const cur = byAccount.get(l.account_id) ?? { type: acc.type, normal: acc.normal_balance, debit: 0, credit: 0 };
      cur.debit += Number(l.debit);
      cur.credit += Number(l.credit);
      byAccount.set(l.account_id, cur);
    }

    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    let income = 0;
    let expenses = 0;
    for (const [, v] of byAccount) {
      const isAssetExpense = v.type === 'ASSET' || v.type === 'EXPENSE';
      const diff = isAssetExpense ? v.debit - v.credit : v.credit - v.debit;
      // Signed amount: DEBIT normal positive, CREDIT normal positive; diff already signed per type group
      // For assets/liabilities/equity we need signed ending
      if (v.type === 'ASSET') assets += diff;
      if (v.type === 'LIABILITY') liabilities += diff;
      if (v.type === 'EQUITY') equity += diff;
      if (v.type === 'INCOME') income += diff;
      if (v.type === 'EXPENSE') expenses += diff;
    }
    // income diff = credits - debits, expenses diff = debits - credits
    // currentEarnings = income - expenses
    const currentEarnings = income - expenses;
    expect(assets).toBe(112000);
    expect(liabilities).toBe(0);
    expect(equity).toBe(100000);
    expect(currentEarnings).toBe(12000);
    expect(assets).toBe(liabilities + equity + currentEarnings);
  });

  it('Draft excluded from as-of', async () => {
    const { data: draftLines } = await admin
      .from('journal_line')
      .select('debit,credit,journal_entry!inner(status,entry_date,organization_id)')
      .eq('journal_entry.organization_id', orgId)
      .eq('journal_entry.status', 'DRAFT')
      .lte('journal_entry.entry_date', asOf);
    expect((draftLines ?? []).length).toBeGreaterThan(0);

    const { data: postedLines } = await admin
      .from('journal_line')
      .select('debit,credit,journal_entry!inner(status,organization_id)')
      .eq('journal_entry.organization_id', orgId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .lte('journal_entry.entry_date', asOf);
    // Ensure draft 7000 not counted in assets
    const totalPostedDebit = (postedLines ?? []).reduce((s: number, l: unknown) => s + Number((l as { debit: number }).debit), 0);
    // 100k+5k+20k+10k+3k = 138k debits posted; draft 7k not included
    expect(totalPostedDebit).toBe(138000);
  });

  it('08-01 excluded from as-of 07-31', async () => {
    const { data: asOfLines } = await admin
      .from('journal_line')
      .select('journal_entry!inner(entry_date)')
      .eq('journal_entry.organization_id', orgId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .lte('journal_entry.entry_date', asOf);
    const dates = (asOfLines ?? []).map((r: unknown) => (r as { journal_entry: { entry_date: string } }).journal_entry.entry_date);
    expect(dates).not.toEqual(expect.arrayContaining(['2026-08-01']));
    expect(dates).toEqual(expect.arrayContaining(['2026-07-01', '2026-07-20']));
  });
});
