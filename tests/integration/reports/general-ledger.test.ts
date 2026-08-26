import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!available)('general ledger opening and running', () => {
  const orgId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient<Database>>;
  let userId: string;
  let periodId: string;
  let accountId: string;
  let counterAccountId: string;
  const entryIds: string[] = [];

  const from = '2026-07-01';
  const to = '2026-07-31';

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: orgErr } = await admin.from('organization').insert({
      id: orgId,
      name: `Ledger Org ${orgId.slice(0, 8)}`,
      legal_name: `Ledger Org ${orgId.slice(0, 8)} Legal`,
    });
    if (orgErr) throw orgErr;

    const email = `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@v0.test`;
    const password = 'test-pass-123';
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userErr) throw userErr;
    userId = userData.user!.id;

    const { error: profileErr } = await admin.from('profile').insert({ id: userId, name: 'Ledger Tester' });
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
        name: `Ledger FP ${orgId.slice(0, 8)}`,
        start_date: from,
        end_date: to,
        status: 'OPEN',
      })
      .select('id')
      .single();
    if (fpErr) throw fpErr;
    periodId = fp!.id;

    const { data: acct, error: acctErr } = await admin
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
    if (acctErr) throw acctErr;
    accountId = acct!.id;

    const { data: counterAcct, error: counterErr } = await admin
      .from('account')
      .insert({
        organization_id: orgId,
        code: '4000',
        name: 'Revenue',
        type: 'INCOME',
        normal_balance: 'CREDIT',
        is_active: true,
      })
      .select('id')
      .single();
    if (counterErr) throw counterErr;
    counterAccountId = counterAcct!.id;

    async function insertEntry(
      entryDate: string,
      status: 'POSTED' | 'DRAFT' | 'REVERSED',
      debit: number,
      credit: number,
      referenceSuffix: string,
    ) {
      const { data: entry, error: eErr } = await admin
        .from('journal_entry')
        .insert({
          organization_id: orgId,
          fiscal_period_id: periodId,
          entry_date: entryDate,
          reference: `GL-${referenceSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          description: `Ledger test ${referenceSuffix} ${entryDate}`,
          status,
          entry_type: 'STANDARD',
          created_by_id: userId,
          total_debit: debit + credit ? Math.max(debit, credit) : 0,
          total_credit: debit + credit ? Math.max(debit, credit) : 0,
          posted_by_id: status === 'POSTED' || status === 'REVERSED' ? userId : null,
          posted_at: status === 'POSTED' || status === 'REVERSED' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();
      if (eErr) throw eErr;
      entryIds.push(entry!.id);
      // Two lines: accountId gets the tested side, counter gets opposite to keep entry balanced
      if (debit > 0) {
        const { error: l1 } = await admin.from('journal_line').insert({
          journal_entry_id: entry!.id,
          account_id: accountId,
          line_number: 1,
          debit,
          credit: 0,
        });
        if (l1) throw l1;
        const { error: l2 } = await admin.from('journal_line').insert({
          journal_entry_id: entry!.id,
          account_id: counterAccountId,
          line_number: 2,
          debit: 0,
          credit: debit,
        });
        if (l2) throw l2;
      } else {
        const { error: l1 } = await admin.from('journal_line').insert({
          journal_entry_id: entry!.id,
          account_id: accountId,
          line_number: 1,
          debit: 0,
          credit,
        });
        if (l1) throw l1;
        const { error: l2 } = await admin.from('journal_line').insert({
          journal_entry_id: entry!.id,
          account_id: counterAccountId,
          line_number: 2,
          debit: credit,
          credit: 0,
        });
        if (l2) throw l2;
      }
      return entry!.id;
    }

    // Opening entry before from: 2026-06-30 POSTED debit 100 to Cash (needs a separate period but we reuse same period id for entry_date outside range - fiscal check is not enforced at DB level for this test)
    // Insert a dedicated fiscal period for June to host the opening entry, then also reuse same org
    const { data: fpJune, error: fpJuneErr } = await admin
      .from('fiscal_period')
      .insert({
        organization_id: orgId,
        name: `June FP ${orgId.slice(0, 8)}`,
        start_date: '2026-06-01',
        end_date: '2026-06-30',
        status: 'OPEN',
      })
      .select('id')
      .single();
    if (fpJuneErr) throw fpJuneErr;
    const junePeriodId = fpJune!.id;

    // Direct insert for opening (bypass helper to set entry_date 2026-06-30)
    {
      const { data: entry, error: eErr } = await admin
        .from('journal_entry')
        .insert({
          organization_id: orgId,
          fiscal_period_id: junePeriodId,
          entry_date: '2026-06-30',
          reference: `GL-OPEN-${Date.now()}`,
          description: 'Opening outside period',
          status: 'POSTED',
          entry_type: 'STANDARD',
          created_by_id: userId,
          total_debit: 100,
          total_credit: 100,
          posted_by_id: userId,
          posted_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (eErr) throw eErr;
      entryIds.push(entry!.id);
      await admin.from('journal_line').insert([
        { journal_entry_id: entry!.id, account_id: accountId, line_number: 1, debit: 100, credit: 0 },
        { journal_entry_id: entry!.id, account_id: counterAccountId, line_number: 2, debit: 0, credit: 100 },
      ]);
    }

    // Boundary inclusive: 2026-07-01
    await insertEntry('2026-07-01', 'POSTED', 50, 0, 'BOUNDARY-START');
    // Mid period: 2026-07-15 credit 30
    await insertEntry('2026-07-15', 'POSTED', 0, 30, 'MID');
    // Boundary inclusive: 2026-07-31
    await insertEntry('2026-07-31', 'POSTED', 20, 0, 'BOUNDARY-END');
    // Outside to: 2026-08-01 should be excluded
    {
      const { data: fpAug, error: fpAugErr } = await admin
        .from('fiscal_period')
        .insert({
          organization_id: orgId,
          name: `Aug FP ${orgId.slice(0, 8)}`,
          start_date: '2026-08-01',
          end_date: '2026-08-31',
          status: 'OPEN',
        })
        .select('id')
        .single();
      if (fpAugErr) throw fpAugErr;
      const { data: entry, error: eErr } = await admin
        .from('journal_entry')
        .insert({
          organization_id: orgId,
          fiscal_period_id: fpAug!.id,
          entry_date: '2026-08-01',
          reference: `GL-OUT-${Date.now()}`,
          description: 'Outside to excluded',
          status: 'POSTED',
          entry_type: 'STANDARD',
          created_by_id: userId,
          total_debit: 999,
          total_credit: 999,
          posted_by_id: userId,
          posted_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (eErr) throw eErr;
      entryIds.push(entry!.id);
      await admin.from('journal_line').insert([
        { journal_entry_id: entry!.id, account_id: accountId, line_number: 1, debit: 999, credit: 0 },
        { journal_entry_id: entry!.id, account_id: counterAccountId, line_number: 2, debit: 0, credit: 999 },
      ]);
    }
    // Draft in range: 2026-07-20 should be excluded
    await insertEntry('2026-07-20', 'DRAFT', 500, 0, 'DRAFT-EXCLUDED');

    // Store extra period ids for cleanup? They will be deleted via fiscal_period delete cascade handling manually
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

  it('opening before from is sum < from and running is opening + cumulative', async () => {
    // Opening: entry_date < 2026-07-01 -> should be 100 debit
    const { data: openingLines } = await admin
      .from('journal_line')
      .select('debit,credit,journal_entry!inner(entry_date,status,organization_id)')
      .eq('journal_entry.organization_id', orgId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .lt('journal_entry.entry_date', from)
      .eq('account_id', accountId);

    const openingSum = (openingLines ?? []).reduce(
      (s, l: unknown) => s + Number((l as { debit: number }).debit) - Number((l as { credit: number }).credit),
      0,
    );
    expect(openingSum).toBe(100);

    // Period lines BETWEEN inclusive
    const { data: periodLines, error: periodError } = await admin
      .from('journal_line')
      .select('debit,credit,journal_entry!inner(entry_date,status,organization_id)')
      .eq('journal_entry.organization_id', orgId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .gte('journal_entry.entry_date', from)
      .lte('journal_entry.entry_date', to)
      .eq('account_id', accountId);
    if (periodError) throw periodError;

    // Should be 3 POSTED in range: 07-01 (50), 07-15 (-30), 07-31 (20) = net 40, Draft and outside excluded
    expect(periodLines).toHaveLength(3);

    // Sort client-side by entry_date to ensure deterministic running
    const sorted = [...(periodLines ?? [])].sort((a: unknown, b: unknown) => {
      const da = (a as { journal_entry: { entry_date: string } }).journal_entry.entry_date;
      const db = (b as { journal_entry: { entry_date: string } }).journal_entry.entry_date;
      return da.localeCompare(db);
    });

    // Running balances: DEBIT normal => debits add, credits subtract
    let running = openingSum;
    const expectedRunnings = [150, 120, 140];
    for (let i = 0; i < sorted.length; i++) {
      const l = sorted[i] as unknown as { debit: number; credit: number };
      running += Number(l.debit) - Number(l.credit);
      expect(running).toBe(expectedRunnings[i]);
    }
    // Final ending 140 = opening 100 + period net 40
    expect(running).toBe(140);
  });

  it('Draft excluded: DRAFT entry does not appear in period rows', async () => {
    const { data: draftLines } = await admin
      .from('journal_line')
      .select('debit,credit,journal_entry!inner(entry_date,status,organization_id)')
      .eq('journal_entry.organization_id', orgId)
      .eq('journal_entry.status', 'DRAFT')
      .gte('journal_entry.entry_date', from)
      .lte('journal_entry.entry_date', to)
      .eq('account_id', accountId);
    expect(draftLines?.length).toBeGreaterThanOrEqual(1);

    const { data: postedLines } = await admin
      .from('journal_line')
      .select('debit,credit,journal_entry!inner(entry_date,status,organization_id)')
      .eq('journal_entry.organization_id', orgId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .gte('journal_entry.entry_date', from)
      .lte('journal_entry.entry_date', to)
      .eq('account_id', accountId);

    // Ensure draft 500 not counted in posted total
    const postedSum = (postedLines ?? []).reduce(
      (s, l: unknown) => s + Number((l as { debit: number }).debit),
      0,
    );
    expect(postedSum).toBe(70); // 50 + 20 (draft 500 not included, credit 30 is separate)
    const creditSum = (postedLines ?? []).reduce(
      (s, l: unknown) => s + Number((l as { credit: number }).credit),
      0,
    );
    expect(creditSum).toBe(30);
  });

  it('boundary inclusive: 2026-07-01 and 2026-07-31 included, 2026-06-30/2026-08-01 excluded', async () => {
    const { data: startBoundary } = await admin
      .from('journal_line')
      .select('journal_entry!inner(entry_date)')
      .eq('account_id', accountId)
      .eq('journal_entry.organization_id', orgId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .eq('journal_entry.entry_date', '2026-07-01');
    expect((startBoundary ?? []).length).toBeGreaterThan(0);

    const { data: endBoundary } = await admin
      .from('journal_line')
      .select('journal_entry!inner(entry_date)')
      .eq('account_id', accountId)
      .eq('journal_entry.organization_id', orgId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .eq('journal_entry.entry_date', '2026-07-31');
    expect((endBoundary ?? []).length).toBeGreaterThan(0);

    // Period query BETWEEN should include both boundaries
    const { data: between } = await admin
      .from('journal_line')
      .select('journal_entry!inner(entry_date)')
      .eq('account_id', accountId)
      .eq('journal_entry.organization_id', orgId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .gte('journal_entry.entry_date', from)
      .lte('journal_entry.entry_date', to);

    const dates = (between ?? []).map((r: unknown) => (r as { journal_entry: { entry_date: string } }).journal_entry.entry_date);
    expect(dates).toEqual(expect.arrayContaining(['2026-07-01', '2026-07-31']));
    expect(dates).not.toEqual(expect.arrayContaining(['2026-06-30', '2026-08-01']));
  });
});
