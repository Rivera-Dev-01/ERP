import 'server-only';
import * as Papa from 'papaparse';
import ExcelJS from 'exceljs';

export function buildCsv(_report: string, headers: string[], rows: Array<Record<string, unknown>>): string {
  return Papa.unparse({ fields: headers, data: rows as never });
}

export async function buildXlsx(report: string, headers: string[], rows: Array<Record<string, unknown>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(report);
  ws.columns = headers.map((h) => ({ header: h, key: h, width: 18 }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  rows.forEach((r) => ws.addRow(r));
  const lastRow = ws.addRow({ [headers[0]]: 'Balance check' });
  lastRow.font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
