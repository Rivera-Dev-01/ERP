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
export async function parseTabular(fileName: string, _data: ArrayBuffer): Promise<ParsedSheet> {
  void fileName;
  throw new Error('parseTabular not implemented — Worker C');
}
