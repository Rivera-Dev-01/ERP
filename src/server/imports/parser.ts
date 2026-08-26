import 'server-only';

export type ParsedSheet = { headers: string[]; rows: Array<Record<string, string>> };

export class ImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportParseError';
  }
}

/**
 * Contract frozen 2026-08-26 Gap C — shared tabular parser for both COA + Journal imports.
 * Supports .csv via papaparse, .xlsx/.xls via exceljs (sheet 1). Worker C implements.
 * @throws ImportParseError on unsupported extension or empty sheet
 */
export async function parseTabular(fileName: string, data: ArrayBuffer): Promise<ParsedSheet> {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';

  if (ext === 'csv') {
    const text = new TextDecoder('utf-8').decode(data);
    // dynamic import to avoid bundling issues, but static import works in server-only
    const papaparseMod = (await import('papaparse')) as unknown as { default: typeof import('papaparse') } & typeof import('papaparse');
    const Papa = (papaparseMod.default ?? papaparseMod) as unknown as typeof import('papaparse');
    const parsed = (
      Papa.parse as unknown as (
        input: string,
        config: unknown,
      ) => import('papaparse').ParseResult<Record<string, string>>
    )(text, {
      header: true,
      skipEmptyLines: true,
      trimHeaders: true,
    } as unknown as import('papaparse').ParseConfig);

    const headers = (parsed.meta.fields ?? []).map((h: string) => String(h).trim());
    if (headers.length === 0 || headers.every((h) => h === '')) {
      throw new ImportParseError('Empty sheet: no headers found');
    }
    const rows = (parsed.data as Record<string, string>[]).map((row) => {
      const out: Record<string, string> = {};
      for (const h of headers) {
        out[h] = String((row as Record<string, unknown>)[h] ?? '').trim();
      }
      // also include any extra keys trimmed? but contract says headers drive rows
      // ensure values are strings trimmed
      return out;
    });
    // Papaparse with skipEmptyLines already drops empty trailing rows, but double-check:
    // drop rows where all values empty after trim
    const filtered = rows.filter((r) => Object.values(r).some((v) => String(v).trim() !== ''));
    if (filtered.length === 0 && rows.length === 0) {
      // empty data but headers exist is not error — return empty rows
      // only throw if headers empty; so don't throw here
    }
    return { headers, rows: filtered };
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const excelMod = (await import('exceljs')) as unknown as { default: typeof import('exceljs') } & typeof import('exceljs');
    const ExcelJS = (excelMod.default ?? excelMod) as unknown as typeof import('exceljs');
    const workbook = new ExcelJS.Workbook();
    // exceljs expects Buffer/Uint8Array; convert ArrayBuffer
    const input = Buffer.isBuffer(data) ? (data as unknown as Buffer) : Buffer.from(data);
    await workbook.xlsx.load(input as unknown as ArrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new ImportParseError('Empty sheet: no worksheet found');
    }

    // Headers = first row values (row.values is 1-indexed array)
    const firstRow = worksheet.getRow(1);
    const rawValues = (firstRow.values as unknown[]) ?? [];
    // row.values is 1-indexed; slice(1)
    const sliced = Array.isArray(rawValues) ? (rawValues as unknown[]).slice(1) : [];
    const headers = sliced.map((v) => String(v ?? '').trim()).filter((h) => h !== '');
    if (headers.length === 0) {
      throw new ImportParseError('Empty sheet: no headers found');
    }

    const rows: Array<Record<string, string>> = [];
    const rowCount = worksheet.rowCount;
    for (let r = 2; r <= rowCount; r++) {
      const row = worksheet.getRow(r);
      const values = (row.values as unknown[]) ?? [];
      const record: Record<string, string> = {};
      let allEmpty = true;
      for (let c = 0; c < headers.length; c++) {
        const raw = (values as unknown[])[c + 1];
        let str: string;
        if (raw instanceof Date) {
          const y = raw.getUTCFullYear();
          const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
          const d = String(raw.getUTCDate()).padStart(2, '0');
          str = `${y}-${m}-${d}`;
        } else if (raw && typeof raw === 'object' && 'richText' in (raw as Record<string, unknown>)) {
          const rt = (raw as { richText: Array<{ text: string }> }).richText;
          if (Array.isArray(rt)) {
            str = rt.map((x) => String(x.text ?? '')).join('');
          } else {
            str = String((raw as { text?: unknown }).text ?? (raw as { result?: unknown }).result ?? '').trim();
          }
          str = String(str).trim();
        } else if (raw && typeof raw === 'object' && 'text' in (raw as Record<string, unknown>)) {
          str = String((raw as { text?: unknown }).text ?? (raw as { result?: unknown }).result ?? '').trim();
        } else if (raw && typeof raw === 'object' && 'result' in (raw as Record<string, unknown>)) {
          str = String((raw as { result?: unknown }).result ?? '').trim();
        } else {
          str = String(raw ?? '').trim();
        }
        record[headers[c]] = str;
        if (str !== '') allEmpty = false;
      }
      if (allEmpty) continue;
      rows.push(record);
    }

    return { headers, rows };
  }

  throw new ImportParseError(`Unsupported file extension: .${ext}`);
}
