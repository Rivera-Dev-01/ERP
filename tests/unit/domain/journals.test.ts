import { describe, expect, it } from 'vitest';
import { journalSchema, formatEntryNumber } from '@/lib/validation/journal';

describe('journalSchema', () => {
  const okLines = [
    { account_id: '550e8400-e29b-41d4-a716-446655440001', description: '', debit: '100.00', credit: '0', tax_code: '' },
    { account_id: '550e8400-e29b-41d4-a716-446655440002', description: '', debit: '0', credit: '100.00', tax_code: '' },
  ];
  it('accepts a balanced two-line entry', () => {
    expect(journalSchema.parse({ entry_date: '2026-07-15', reference: 'JE-2026-0001', description: 'Test', lines: okLines }).lines).toHaveLength(2);
  });
  it('rejects fewer than two lines', () => {
    expect(() => journalSchema.parse({ entry_date: '2026-07-15', reference: 'x', description: 'x', lines: [okLines[0]] })).toThrow();
  });
  it('rejects a line with both debit and credit', () => {
    expect(() => journalSchema.parse({ entry_date: '2026-07-15', reference: 'x', description: 'x', lines: [
      { account_id: okLines[0].account_id, description: '', debit: '10.00', credit: '10.00', tax_code: '' },
      okLines[1],
    ]})).toThrow();
  });
  it('rejects an unbalanced entry', () => {
    expect(() => journalSchema.parse({ entry_date: '2026-07-15', reference: 'x', description: 'x', lines: [
      { account_id: okLines[0].account_id, description: '', debit: '10.00', credit: '0', tax_code: '' },
      { account_id: okLines[1].account_id, description: '', debit: '0', credit: '9.00', tax_code: '' },
    ]})).toThrow();
  });
  it('formats entry number as JE-YYYY-XXXX', () => {
    expect(formatEntryNumber(1, '2026-07-15')).toBe('JE-2026-0001');
    expect(formatEntryNumber(null, '2026-07-15')).toBe('—');
  });
});
