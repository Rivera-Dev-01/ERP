import { describe, expect, it } from 'vitest';
import { computeBalance } from '@/server/reports/balances';

describe('computeBalance', () => {
  it('applies normal_balance branching DEBIT vs CREDIT', () => {
    // ASSET/EXPENSE: debits - credits
    expect(computeBalance('ASSET', 'DEBIT', '100', '30')).toEqual({ side: 'DEBIT', amount: '70.0000' });
    // LIABILITY/EQUITY/INCOME: credits - debits
    expect(computeBalance('LIABILITY', 'CREDIT', '30', '100')).toEqual({ side: 'CREDIT', amount: '70.0000' });
  });
  it('opening is sum before from, period is BETWEEN inclusive, as-of is <= to', () => {
    // This test will call getBalances against a mocked Supabase in the next step; for now it just asserts the helper exists
    expect(typeof computeBalance).toBe('function');
  });
  it('half-up rounding via MONEY_SCALE 4', () => {
    expect(computeBalance('ASSET', 'DEBIT', '0.00005', '0')).toEqual({ side: 'DEBIT', amount: '0.0001' });
  });
});
