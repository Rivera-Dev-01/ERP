import { describe, expect, it, beforeAll, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

vi.mock('@/server/supabase/server', () => ({
  createClient: async () =>
    createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
}));

describe.skipIf(!available)('cash flow statement (seeded fixture)', () => {
  const orgId = '22222222-2222-2222-2222-222222222222';
  const companyId = '59443ac9-5ca5-4f61-9e41-b0587e235043';
  let getCashFlow: typeof import('@/server/reports/cash-flow').getCashFlow;

  beforeAll(async () => {
    ({ getCashFlow } = await import('@/server/reports/cash-flow'));
  });

  it('July 2026 reconciles: net change 102000 = CFO 2000 + CFF 100000', async () => {
    const cf = await getCashFlow({ organizationId: orgId, companyId, from: '2026-07-01', to: '2026-07-31' });
    expect(cf.isReconciled).toBe(true);
    expect(cf.netIncome).toBe('12000.0000');
    expect(cf.operating.total).toBe('2000.0000');
    expect(cf.financing.total).toBe('100000.0000');
    expect(cf.netChange).toBe('102000.0000');
    expect(cf.cashEnding).toBe('102000.0000');
  });

  it('computed equals ledger cash movement (drafts excluded)', async () => {
    const cf = await getCashFlow({ organizationId: orgId, companyId, from: '2026-07-01', to: '2026-07-31' });
    expect(cf.computedNetChange).toBe(cf.netChange);
  });
});
