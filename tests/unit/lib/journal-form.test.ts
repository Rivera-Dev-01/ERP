import { describe, expect, it } from 'vitest';
import { sumLineAmounts } from '@/lib/validation/journal';

describe('sumLineAmounts', () => {
  it('empty array => 0/0/0', () => {
    const res = sumLineAmounts([]);
    expect(res).toEqual({ totalDebit: '0.0000', totalCredit: '0.0000', difference: '0.0000' });
  });

  it('single debit 100', () => {
    const res = sumLineAmounts([{ debit: '100', credit: '0' }]);
    expect(res).toEqual({ totalDebit: '100.0000', totalCredit: '0.0000', difference: '100.0000' });
  });

  it('single credit 50', () => {
    const res = sumLineAmounts([{ debit: '0', credit: '50' }]);
    expect(res).toEqual({ totalDebit: '0.0000', totalCredit: '50.0000', difference: '-50.0000' });
  });

  it('balanced 100/100 => diff 0', () => {
    const res = sumLineAmounts([
      { debit: '100', credit: '0' },
      { debit: '0', credit: '100' },
    ]);
    expect(res.totalDebit).toBe('100.0000');
    expect(res.totalCredit).toBe('100.0000');
    expect(res.difference).toBe('0.0000');
  });

  it('unbalanced 100/60 => diff 40', () => {
    const res = sumLineAmounts([
      { debit: '100', credit: '0' },
      { debit: '0', credit: '60' },
    ]);
    expect(res).toEqual({ totalDebit: '100.0000', totalCredit: '60.0000', difference: '40.0000' });
  });

  it('exact decimal 0.1+0.2 handling (no floating drift)', () => {
    const res = sumLineAmounts([
      { debit: '0.1', credit: '0' },
      { debit: '0.2', credit: '0' },
      { debit: '0', credit: '0.15' },
    ]);
    // 0.1+0.2 = 0.3
    expect(res.totalDebit).toBe('0.3000');
    expect(res.totalCredit).toBe('0.1500');
    expect(res.difference).toBe('0.1500');
  });

  it('handles 0.1+0.2 balanced edge (difference zero exactly)', () => {
    const res = sumLineAmounts([
      { debit: '0.1', credit: '0' },
      { debit: '0.2', credit: '0' },
      { debit: '0', credit: '0.3' },
    ]);
    expect(res.totalDebit).toBe('0.3000');
    expect(res.totalCredit).toBe('0.3000');
    expect(res.difference).toBe('0.0000');
  });

  it('negative/zero edge — zero amounts', () => {
    const res = sumLineAmounts([
      { debit: '0', credit: '0' },
      { debit: '0.00', credit: '0.00' },
    ]);
    expect(res).toEqual({ totalDebit: '0.0000', totalCredit: '0.0000', difference: '0.0000' });
  });

  it('negative amounts are summed arithmetically', () => {
    const res = sumLineAmounts([
      { debit: '-5', credit: '0' },
      { debit: '10', credit: '0' },
    ]);
    expect(res.totalDebit).toBe('5.0000');
    expect(res.difference).toBe('5.0000');
  });

  it('empty string fallback to zero', () => {
    const res = sumLineAmounts([
      { debit: '', credit: '' },
      { debit: '10', credit: '' },
    ]);
    expect(res.totalDebit).toBe('10.0000');
    expect(res.totalCredit).toBe('0.0000');
    expect(res.difference).toBe('10.0000');
  });

  it('half-up rounding to 4 decimals via toDbString', () => {
    const res = sumLineAmounts([{ debit: '1.23456', credit: '0' }]);
    expect(res.totalDebit).toBe('1.2346');
    expect(res.difference).toBe('1.2346');
  });

  it('multiple lines sum correctly', () => {
    const res = sumLineAmounts([
      { debit: '100.1234', credit: '0' },
      { debit: '50.8766', credit: '0' },
      { debit: '0', credit: '75' },
      { debit: '0', credit: '76' },
    ]);
    expect(res.totalDebit).toBe('151.0000');
    expect(res.totalCredit).toBe('151.0000');
    expect(res.difference).toBe('0.0000');
  });
});
