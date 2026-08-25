import { describe, expect, it } from 'vitest';
import { coerceActive } from '@/server/domain/accounts';
import { validateCoaRows } from '@/server/imports/coa-import';
describe('coerceActive', () => {
  it('coerces true variants', () => {
    expect(coerceActive('TRUE')).toBe(true);
    expect(coerceActive('1')).toBe(true);
  });
  it('coerces false variants', () => {
    expect(coerceActive('false')).toBe(false);
    expect(coerceActive('0')).toBe(false);
  });
});
describe('validateCoaRows', () => {
  it('flags non-numeric code and missing name', () => {
    const r = validateCoaRows([
      {
        'Account Code': 'A100',
        'Account Name': '',
        'Account Type': 'ASSET',
        'Normal Balance': 'DEBIT',
        Active: 'true',
      } as never,
    ]);
    expect(r.rowErrors).toHaveLength(2);
  });
  it('flags duplicate within file', () => {
    const r = validateCoaRows([
      {
        'Account Code': '1000',
        'Account Name': 'Cash',
        'Account Type': 'ASSET',
        'Normal Balance': 'DEBIT',
        Active: 'true',
      } as never,
      {
        'Account Code': '1000',
        'Account Name': 'Cash 2',
        'Account Type': 'ASSET',
        'Normal Balance': 'DEBIT',
        Active: 'true',
      } as never,
    ]);
    expect(r.rowErrors.some((e) => /duplicate/i.test(e.message))).toBe(true);
  });
});
