import { isBalanced, toDecimal } from '@/lib/money';

export const JOURNAL_HEADERS = [
  'Entry Group',
  'Entry Date',
  'Reference',
  'Entry Description',
  'Account Code',
  'Line Description',
  'Debit',
  'Credit',
  'Tax Code',
] as const;

export type JournalImportRow = Record<string, string>;

export type NormalizedJournalGroup = {
  group: string;
  entry_date: string;
  reference: string;
  description: string;
  lines: Array<{
    account_code: string;
    description: string;
    debit: string;
    credit: string;
    tax_code: string;
    row: number;
  }>;
};

export function validateJournalGroups(
  rows: JournalImportRow[],
  opts: {
    accountMap: Map<string, { id: string; is_active: boolean }>;
    periodMap?: Map<string, boolean>; // not used for now, period check via DB
  },
): {
  rowErrors: Array<{ row: number; group: string; message: string }>;
  normalized: NormalizedJournalGroup[];
} {
  const rowErrors: Array<{ row: number; group: string; message: string }> = [];
  const groups = new Map<string, NormalizedJournalGroup>();

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const group = String(r['Entry Group'] ?? '').trim();
    const entryDate = String(r['Entry Date'] ?? '').trim();
    const reference = String(r['Reference'] ?? '').trim();
    const entryDesc = String(r['Entry Description'] ?? '').trim();
    const accountCode = String(r['Account Code'] ?? '').trim();
    const lineDesc = String(r['Line Description'] ?? '').trim();
    const debitRaw = String(r['Debit'] ?? '').trim();
    const creditRaw = String(r['Credit'] ?? '').trim();
    const taxCode = String(r['Tax Code'] ?? '').trim();

    if (!group) {
      rowErrors.push({ row: rowNum, group, message: 'Entry Group is required' });
      return;
    }

    // Validate account exists and active (if map provided)
    if (!accountCode) {
      rowErrors.push({ row: rowNum, group, message: 'Account Code is required' });
    } else if (opts.accountMap && !opts.accountMap.has(accountCode)) {
      rowErrors.push({ row: rowNum, group, message: `Account Code ${accountCode} not found or inactive in this company` });
    }

    // Validate debit/credit xor positive
    const debit = debitRaw === '' ? '0' : debitRaw;
    const credit = creditRaw === '' ? '0' : creditRaw;
    let debitNum = 0;
    let creditNum = 0;
    try {
      debitNum = Number(toDecimal(debit).toString());
      creditNum = Number(toDecimal(credit).toString());
    } catch {
      rowErrors.push({ row: rowNum, group, message: 'Debit/Credit must be valid decimal' });
      return;
    }
    const hasDebit = debitNum > 0;
    const hasCredit = creditNum > 0;
    if ((hasDebit && hasCredit) || (!hasDebit && !hasCredit)) {
      rowErrors.push({ row: rowNum, group, message: 'Enter exactly one of debit or credit as a positive amount' });
    }
    if (debitNum < 0 || creditNum < 0) {
      rowErrors.push({ row: rowNum, group, message: 'Amount cannot be negative' });
    }

    // Validate entry date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      rowErrors.push({ row: rowNum, group, message: 'Entry Date must be YYYY-MM-DD' });
    }

    if (!reference) {
      rowErrors.push({ row: rowNum, group, message: 'Reference is required' });
    }
    if (!entryDesc) {
      rowErrors.push({ row: rowNum, group, message: 'Entry Description is required' });
    }

    // Build group
    let g = groups.get(group);
    if (!g) {
      g = { group, entry_date: entryDate, reference, description: entryDesc, lines: [] };
      groups.set(group, g);
    } else {
      // Ensure entry_date/reference/description consistent within group
      if (g.entry_date !== entryDate) {
        rowErrors.push({ row: rowNum, group, message: `Entry Date mismatch within group (expected ${g.entry_date})` });
      }
      if (g.reference !== reference) {
        rowErrors.push({ row: rowNum, group, message: `Reference mismatch within group` });
      }
    }
    g.lines.push({ account_code: accountCode, description: lineDesc, debit, credit, tax_code: taxCode, row: rowNum });
  });

  // Validate per group: at least 2 lines, balanced
  for (const [groupKey, g] of groups) {
    if (g.lines.length < 2) {
      rowErrors.push({ row: g.lines[0]?.row ?? -1, group: groupKey, message: 'Entry Group must have at least two lines' });
    }
    const debits = g.lines.map((l) => l.debit);
    const credits = g.lines.map((l) => l.credit);
    if (!isBalanced(debits, credits)) {
      rowErrors.push({ row: g.lines[0]?.row ?? -1, group: groupKey, message: 'Total debits must equal total credits within group' });
    }
    const total = g.lines.reduce((s, l) => s + Number(l.debit || '0') + Number(l.credit || '0'), 0);
    if (total <= 0) {
      rowErrors.push({ row: g.lines[0]?.row ?? -1, group: groupKey, message: 'Total must be greater than zero' });
    }
  }

  const normalized = Array.from(groups.values());
  return { rowErrors, normalized };
}

export function parseJournalHeader(headers: string[]): { ok: boolean; message?: string } {
  const lower = headers.map((h) => String(h).trim().toLowerCase());
  const expected = JOURNAL_HEADERS.map((h) => h.toLowerCase());
  const ok = expected.every((h) => lower.includes(h));
  if (!ok) return { ok: false, message: `Invalid header. Expected: ${JOURNAL_HEADERS.join(', ')}` };
  return { ok: true };
}
