import { test, expect } from '@playwright/test';
import { signIn } from './support/helpers';
import * as Papa from 'papaparse';
import ExcelJS from 'exceljs';

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

test('reports seeded 120000/12000/112000 and export + print', async ({ page }) => {
  await signIn(page);

  // Trial half check - demo org seeded 120000 halves for July 2026
  await page.goto('/reports/trial-balance?from=2026-07-01&to=2026-07-31');
  await expect(page.getByText(/Trial Balance/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Total Ending Debits/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/₱120,000\.00/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Balanced').first()).toBeVisible({ timeout: 10_000 });

  // Income Net 12000
  await page.goto('/reports/income-statement?from=2026-07-01&to=2026-07-31');
  await expect(page.getByText(/Income Statement/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Net Income/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('₱12,000.00').first()).toBeVisible({ timeout: 10_000 });

  // Balance 112000
  await page.goto('/reports/balance-sheet?to=2026-07-31');
  await expect(page.getByText(/Balance Sheet/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('₱112,000.00').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Balanced').first()).toBeVisible({ timeout: 10_000 });

  // Export CSV via API route with same predicate as page - check content-disposition and headers
  const csvRes = await page.request.get('/api/export/trial-balance?format=csv&from=2026-07-01&to=2026-07-31');
  expect(csvRes.status()).toBe(200);
  expect(csvRes.headers()['content-type']).toContain('text/csv');
  expect(csvRes.headers()['content-disposition']).toContain('attachment');
  expect(csvRes.headers()['content-disposition']).toContain('trial-balance-2026-07-01_to_2026-07-31');
  const csvText = await csvRes.text();
  expect(csvText.length).toBeGreaterThan(0);
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  expect(parsed.data.length).toBeGreaterThan(0);
  const headers = parsed.meta.fields ?? [];
  expect(headers).toEqual(expect.arrayContaining(['Code', 'Name']));

  // Export XLSX
  const xlsxRes = await page.request.get('/api/export/trial-balance?format=xlsx&from=2026-07-01&to=2026-07-31');
  expect(xlsxRes.status()).toBe(200);
  expect(xlsxRes.headers()['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  expect(xlsxRes.headers()['content-disposition']).toContain('attachment');
  const xlsxBuffer = await xlsxRes.body();
  const wb = new ExcelJS.Workbook();
  // @ts-expect-error - load from buffer
  await wb.xlsx.load(xlsxBuffer);
  const ws = wb.getWorksheet(1)!;
  expect(ws.getRow(1).getCell(1).value).toBeDefined();
  expect(ws.rowCount).toBeGreaterThan(1);

  // General Journal export
  const gjCsv = await page.request.get('/api/export/general-journal?format=csv&from=2026-07-01&to=2026-07-31');
  expect(gjCsv.status()).toBe(200);
  const gjText = await gjCsv.text();
  const gjParsed = Papa.parse(gjText, { header: true, skipEmptyLines: true });
  expect(gjParsed.data.length).toBeGreaterThan(0);

  // Print mode - media emulation should hide filter bar but keep header
  await page.goto('/reports/trial-balance?from=2026-07-01&to=2026-07-31');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText(/Trial Balance/i).first()).toBeVisible({ timeout: 5_000 });
  // Filter bar should be hidden in print (check data-filter-bar hidden via style is best-effort)
  await page.emulateMedia({ media: 'screen' });
  await expect(page.getByRole('button', { name: /Print/i })).toBeVisible({ timeout: 5_000 });
});
