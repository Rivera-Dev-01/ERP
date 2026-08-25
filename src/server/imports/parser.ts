import Papa from 'papaparse';
import { ACCOUNT_HEADERS } from '@/server/domain/accounts';

export function parseCoaCsv(text: string): {
  rows: Record<string, string>[];
  headerError?: string;
} {
  const parsed = (
    Papa.parse as unknown as (
      input: string,
      config: unknown,
    ) => Papa.ParseResult<Record<string, string>>
  )(text, {
    header: true,
    skipEmptyLines: true,
    trimHeaders: true,
  } as unknown as Papa.ParseConfig);
  const headers = (parsed.meta.fields ?? []).map((h: string) => String(h).trim());
  const lower = headers.map((h: string) => h.toLowerCase());
  const headerOk = ACCOUNT_HEADERS.every((h) => lower.includes(h.toLowerCase()));
  if (!headerOk) {
    return {
      rows: parsed.data as Record<string, string>[],
      headerError: `Invalid header. Expected: ${ACCOUNT_HEADERS.join(', ')}`,
    };
  }
  return { rows: parsed.data as Record<string, string>[] };
}
