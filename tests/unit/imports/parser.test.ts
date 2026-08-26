import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseTabular, ImportParseError } from '@/server/imports/parser';

function stringToArrayBuffer(str: string): ArrayBuffer {
  const enc = new TextEncoder().encode(str);
  // slice to get exact ArrayBuffer (avoid SharedArrayBuffer offset issues)
  return enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength) as ArrayBuffer;
}

describe('parseTabular', () => {
  it('CSV happy path — parses headers and rows with trimHeaders', async () => {
    const csv = [
      'Account Code,Account Name,Account Type,Normal Balance,Active',
      '1000,Cash,ASSET,DEBIT,true',
      ' 2000 , Revenue , INCOME , CREDIT , false ',
    ].join('\n');
    const data = stringToArrayBuffer(csv);
    const result = await parseTabular('test.csv', data);

    expect(result.headers).toEqual([
      'Account Code',
      'Account Name',
      'Account Type',
      'Normal Balance',
      'Active',
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]['Account Code']).toBe('1000');
    expect(result.rows[0]['Account Name']).toBe('Cash');
    expect(result.rows[1]['Account Code']).toBe('2000');
    expect(result.rows[1]['Account Name']).toBe('Revenue');
  });

  it('CSV trims header whitespace via trimHeaders', async () => {
    const csv = [' Account Code , Account Name ', '1000,Cash'].join('\n');
    const data = stringToArrayBuffer(csv);
    const result = await parseTabular('weird.CSV', data);
    expect(result.headers).toEqual(['Account Code', 'Account Name']);
  });

  it('XLSX happy path — Date cell -> YYYY-MM-DD UTC and formula -> String(result)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    // header
    ws.addRow(['Account Code', 'Account Name', 'Entry Date', 'Amount']);
    // data row 1 with Date cell 2026-07-15 and formula cell
    const dateCell = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15 UTC
    ws.addRow(['1000', 'Cash', dateCell, { formula: '1+1', result: 2 } as unknown as string]);
    ws.addRow(['2000', 'Revenue', dateCell, { formula: 'SUM(A1:A2)', result: 42 } as unknown as string]);

    const buffer = (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer | Uint8Array;
    // Ensure we have ArrayBuffer (exceljs returns Buffer which is Uint8Array)
    const ab = (
      buffer instanceof ArrayBuffer
        ? buffer
        : (buffer as unknown as Uint8Array).buffer.slice(
            (buffer as unknown as Uint8Array).byteOffset,
            (buffer as unknown as Uint8Array).byteOffset + (buffer as unknown as Uint8Array).byteLength,
          )
    ) as unknown as ArrayBuffer;

    const result = await parseTabular('test.xlsx', ab);

    expect(result.headers).toEqual(['Account Code', 'Account Name', 'Entry Date', 'Amount']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]['Account Code']).toBe('1000');
    expect(result.rows[0]['Entry Date']).toBe('2026-07-15');
    expect(result.rows[0]['Amount']).toBe('2');
    expect(result.rows[1]['Amount']).toBe('42');
    expect(result.rows[1]['Entry Date']).toBe('2026-07-15');
  });

  it('XLSX handles .xls extension same as xlsx', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Account Code', 'Account Name']);
    ws.addRow(['1000', 'Cash']);
    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Uint8Array;
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const result = await parseTabular('test.xls', ab);
    expect(result.headers).toEqual(['Account Code', 'Account Name']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]['Account Code']).toBe('1000');
  });

  it('empty trailing rows dropped (XLSX)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Account Code', 'Account Name']);
    ws.addRow(['1000', 'Cash']);
    ws.addRow(['', '']); // trailing empty row
    ws.addRow([]); // another empty
    ws.addRow(['', '   ']); // whitespace only
    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Uint8Array;
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const result = await parseTabular('trailing.xlsx', ab);
    expect(result.rows).toHaveLength(1);
  });

  it('empty trailing rows dropped (CSV) via papaparse skipEmptyLines', async () => {
    const csv = ['Account Code,Account Name', '1000,Cash', '', '   ', ''].join('\n');
    const data = stringToArrayBuffer(csv);
    const result = await parseTabular('trailing.csv', data);
    expect(result.rows).toHaveLength(1);
  });

  it('throws ImportParseError for unsupported extension', async () => {
    const data = stringToArrayBuffer('hello');
    await expect(parseTabular('test.txt', data)).rejects.toBeInstanceOf(ImportParseError);
    await expect(parseTabular('test.pdf', data)).rejects.toBeInstanceOf(ImportParseError);
  });

  it('throws ImportParseError for empty sheet (no worksheet or no headers)', async () => {
    const wb = new ExcelJS.Workbook();
    // add empty worksheet with no rows
    wb.addWorksheet('Sheet1');
    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Uint8Array;
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await expect(parseTabular('empty.xlsx', ab)).rejects.toBeInstanceOf(ImportParseError);
  });

  it('handles rich-text / hyperlink objects via text property', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Name', 'Note']);
    // Simulate rich-text / hyperlink cell value
    // ExcelJS hyperlink value shape: { text: 'Click', hyperlink: 'http://...' }
    const row = ws.addRow(['Alice', '']);
    // directly assign cell value to test parser's branching
    row.getCell(2).value = { text: 'hello rich', hyperlink: 'https://example.com' } as unknown as ExcelJS.CellValue;
    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Uint8Array;
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const result = await parseTabular('rich.xlsx', ab);
    expect(result.rows[0]['Note']).toBe('hello rich');
  });
});
