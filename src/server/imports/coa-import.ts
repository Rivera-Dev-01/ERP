import { accountSchema } from '@/lib/validation/account';
import { coerceActive } from '@/server/domain/accounts';

export function validateCoaRows(rows: Record<string, string>[]): {
  rowErrors: Array<{ row: number; code: string; message: string }>;
  normalized: Array<{
    code: string;
    name: string;
    type: string;
    normal_balance: string;
    is_active: boolean;
  }>;
} {
  const rowErrors: Array<{ row: number; code: string; message: string }> = [];
  const seen = new Set<string>();
  const normalized: Array<{
    code: string;
    name: string;
    type: string;
    normal_balance: string;
    is_active: boolean;
  }> = [];
  rows.forEach((r, idx) => {
    const rowNum = idx + 2; // 1 is header
    const code = String(r['Account Code'] ?? '').trim();
    const name = String(r['Account Name'] ?? '').trim();
    const type = String(r['Account Type'] ?? '')
      .trim()
      .toUpperCase();
    const normal_balance = String(r['Normal Balance'] ?? '')
      .trim()
      .toUpperCase();
    const is_active = coerceActive(String(r['Active'] ?? 'true'));
    if (seen.has(code) && code)
      rowErrors.push({ row: rowNum, code, message: 'Duplicate code within file' });
    seen.add(code);
    const parsed = accountSchema.safeParse({ code, name, type, normal_balance, is_active });
    if (!parsed.success) {
      for (const i of parsed.error.issues)
        rowErrors.push({ row: rowNum, code, message: `${String(i.path[0])}: ${i.message}` });
    } else
      normalized.push({
        code: parsed.data.code,
        name: parsed.data.name,
        type: parsed.data.type,
        normal_balance: parsed.data.normal_balance,
        is_active: parsed.data.is_active,
      });
  });
  return { rowErrors, normalized };
}
