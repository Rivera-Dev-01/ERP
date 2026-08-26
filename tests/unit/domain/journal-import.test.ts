import { describe, expect, it } from 'vitest';
import { validateJournalGroups } from '@/server/imports/journal-import';

describe('validateJournalGroups', () => {
  const accountMap = new Map<string, { id: string; is_active: boolean }>([
    ['1000', { id: 'id-1000', is_active: true }],
    ['4000', { id: 'id-4000', is_active: true }],
  ]);

  it('flags non-numeric debit', () => {
    const r = validateJournalGroups(
      [
        {
          'Entry Group': 'G1',
          'Entry Date': '2026-07-15',
          Reference: 'REF1',
          'Entry Description': 'Test',
          'Account Code': '1000',
          'Line Description': '',
          Debit: 'abc',
          Credit: '0',
          'Tax Code': '',
        } as never,
      ],
      { accountMap },
    );
    expect(r.rowErrors.length).toBeGreaterThan(0);
  });
  it('flags unknown account code', () => {
    const r = validateJournalGroups(
      [
        {
          'Entry Group': 'G1',
          'Entry Date': '2026-07-15',
          Reference: 'REF1',
          'Entry Description': 'Test',
          'Account Code': '9999',
          'Line Description': '',
          Debit: '100',
          Credit: '0',
          'Tax Code': '',
        } as never,
        {
          'Entry Group': 'G1',
          'Entry Date': '2026-07-15',
          Reference: 'REF1',
          'Entry Description': 'Test',
          'Account Code': '4000',
          'Line Description': '',
          Debit: '0',
          Credit: '100',
          'Tax Code': '',
        } as never,
      ],
      { accountMap },
    );
    expect(r.rowErrors.some((e) => /not found/i.test(e.message))).toBe(true);
  });
  it('flags unbalanced group', () => {
    const r = validateJournalGroups(
      [
        {
          'Entry Group': 'G1',
          'Entry Date': '2026-07-15',
          Reference: 'REF1',
          'Entry Description': 'Test',
          'Account Code': '1000',
          'Line Description': '',
          Debit: '100',
          Credit: '0',
          'Tax Code': '',
        } as never,
        {
          'Entry Group': 'G1',
          'Entry Date': '2026-07-15',
          Reference: 'REF1',
          'Entry Description': 'Test',
          'Account Code': '4000',
          'Line Description': '',
          Debit: '0',
          Credit: '90',
          'Tax Code': '',
        } as never,
      ],
      { accountMap },
    );
    expect(r.rowErrors.some((e) => /debits must equal/i.test(e.message))).toBe(true);
  });
  it('accepts balanced valid group', () => {
    const r = validateJournalGroups(
      [
        {
          'Entry Group': 'G1',
          'Entry Date': '2026-07-15',
          Reference: 'REF1',
          'Entry Description': 'Test',
          'Account Code': '1000',
          'Line Description': '',
          Debit: '100',
          Credit: '0',
          'Tax Code': '',
        } as never,
        {
          'Entry Group': 'G1',
          'Entry Date': '2026-07-15',
          Reference: 'REF1',
          'Entry Description': 'Test',
          'Account Code': '4000',
          'Line Description': '',
          Debit: '0',
          Credit: '100',
          'Tax Code': '',
        } as never,
      ],
      { accountMap },
    );
    expect(r.rowErrors).toHaveLength(0);
    expect(r.normalized).toHaveLength(1);
  });
});
