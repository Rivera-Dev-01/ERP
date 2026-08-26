import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { isBalanced, toDbString, toDecimal } from '@/lib/money';

const journalLineSchema = z
  .object({
    account_id: z.string().uuid('Select an account'),
    description: z.string().max(200).optional().default(''),
    debit: z.string().trim().default('0'),
    credit: z.string().trim().default('0'),
    tax_code: z.string().max(30).optional().default(''),
  })
  .superRefine((line, ctx) => {
    const d = Number.parseFloat(line.debit || '0');
    const c = Number.parseFloat(line.credit || '0');
    const hasDebit = d > 0 && Number.isFinite(d);
    const hasCredit = c > 0 && Number.isFinite(c);
    if ((hasDebit && hasCredit) || (!hasDebit && !hasCredit)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter exactly one of debit or credit as a positive amount',
        path: ['debit'],
      });
    }
    if (d < 0 || c < 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount cannot be negative',
        path: ['debit'],
      });
  });

export const journalSchema = z
  .object({
    entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    reference: z.string().trim().min(1, 'Reference is required').max(60),
    description: z.string().trim().min(1, 'Description is required').max(200),
    notes: z.string().trim().max(1000).optional().default(''),
    lines: z.array(journalLineSchema).min(2, 'At least two lines are required'),
  })
  .superRefine((val, ctx) => {
    const debits = val.lines.map((l) => l.debit);
    const credits = val.lines.map((l) => l.credit);
    if (!isBalanced(debits, credits)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Total debits must equal total credits',
        path: ['lines'],
      });
    }
    const total = val.lines.reduce(
      (s, l) => s + Number.parseFloat(l.debit || '0') + Number.parseFloat(l.credit || '0'),
      0,
    );
    if (total <= 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Total must be greater than zero',
        path: ['lines'],
      });
  });

export type JournalInput = z.infer<typeof journalSchema>;

export function formatEntryNumber(entry_number: number | null, entry_date: string): string {
  if (entry_number == null) return '—';
  const year = entry_date.slice(0, 4);
  return `JE-${year}-${String(entry_number).padStart(4, '0')}`;
}

export function nextReferencePreview(lastNumber: number, entryDate: string): string {
  return formatEntryNumber(lastNumber + 1, entryDate);
}

// Contract frozen 2026-08-26 Gap A — sticky totals footer shares exact arithmetic via lib/money
export function sumLineAmounts(lines: Array<{ debit: string; credit: string }>): {
  totalDebit: string;
  totalCredit: string;
  difference: string;
} {
  const zero = new Decimal(0);
  const sumDebit = lines.reduce((acc, l) => acc.plus(toDecimal(l.debit || '0')), zero);
  const sumCredit = lines.reduce((acc, l) => acc.plus(toDecimal(l.credit || '0')), zero);
  const diff = sumDebit.minus(sumCredit);
  return {
    totalDebit: toDbString(sumDebit.toString()),
    totalCredit: toDbString(sumCredit.toString()),
    difference: toDbString(diff.toString()),
  };
}
