import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe.skipIf(!available)('reports trial balance 120000 halves', () => {
  it('demo org shows Total Ending Debits = Total Ending Credits = 120000', async () => {
    const admin = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify via direct admin queries (service_role bypasses RLS and exercises the same engine predicates)
    const { data: accounts } = await admin
      .from('account')
      .select('*')
      .eq('organization_id', '22222222-2222-2222-2222-222222222222')
      .order('code');
    const codes = (accounts ?? []).map((a) => a.code);
    expect(codes).toEqual(expect.arrayContaining(['1000', '1100', '3000', '4000', '5000', '5100']));

    const { data: lines } = await admin
      .from('journal_line')
      .select('account_id,debit,credit,journal_entry!inner(entry_date,status,organization_id)')
      .eq('journal_entry.organization_id', '22222222-2222-2222-2222-222222222222')
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .gte('journal_entry.entry_date', '2026-07-01')
      .lte('journal_entry.entry_date', '2026-07-31');

    // Compute per-account ending via normal_balance branching (same as balances.ts)
    const byAccount = new Map<string, { debit: number; credit: number }>();
    for (const l of (lines ?? []) as Array<{ account_id: string; debit: number; credit: number }>) {
      const cur = byAccount.get(l.account_id) ?? { debit: 0, credit: 0 };
      cur.debit += Number(l.debit);
      cur.credit += Number(l.credit);
      byAccount.set(l.account_id, cur);
    }

    let totalDebits = 0;
    let totalCredits = 0;
    for (const acc of accounts ?? []) {
      const sums = byAccount.get(acc.id) ?? { debit: 0, credit: 0 };
      const isDebitNormal = acc.normal_balance === 'DEBIT';
      // For ending: ASSET/EXPENSE debits-credits, else credits-debits
      const isAssetExpense = acc.type === 'ASSET' || acc.type === 'EXPENSE';
      const diff = isAssetExpense ? sums.debit - sums.credit : sums.credit - sums.debit;
      if (diff > 0) {
        if (isDebitNormal) totalDebits += diff;
        else totalCredits += diff;
      } else if (diff < 0) {
        if (isDebitNormal) totalCredits += -diff;
        else totalDebits += -diff;
      }
    }

    expect(totalDebits).toBe(120000);
    expect(totalCredits).toBe(120000);

    const { count } = await admin
      .from('journal_entry')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', '22222222-2222-2222-2222-222222222222')
      .in('entry_number', [1, 2, 3, 4, 5])
      .eq('status', 'POSTED');
    expect(count).toBe(5);
  });
});
