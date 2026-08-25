import { describe, expect, it } from 'vitest';
import { accountSchema } from '@/lib/validation/account';
describe('accountSchema', () => {
  it('accepts valid ASSET/DEBIT', () => {
    expect(
      accountSchema.parse({
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
      }).code,
    ).toBe('1000');
  });
  it('rejects non-numeric code', () => {
    expect(() =>
      accountSchema.parse({
        code: 'A100',
        name: 'x',
        type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
      }),
    ).toThrow();
  });
  it('rejects empty name', () => {
    expect(() =>
      accountSchema.parse({
        code: '1000',
        name: ' ',
        type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
      }),
    ).toThrow();
  });
  it('rejects invalid type', () => {
    expect(() =>
      accountSchema.parse({
        code: '1000',
        name: 'x',
        type: 'BOGUS',
        normal_balance: 'DEBIT',
        is_active: true,
      }),
    ).toThrow();
  });
});
