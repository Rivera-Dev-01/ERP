import { NextRequest, NextResponse } from 'next/server';
import { requireOrganization } from '@/server/auth';
import { getGeneralJournal } from '@/server/reports/general-journal';
import { getGeneralLedger } from '@/server/reports/general-ledger';
import { getTrialBalance } from '@/server/reports/trial-balance';
import { getIncomeStatement } from '@/server/reports/income-statement';
import { getBalanceSheet } from '@/server/reports/balance-sheet';
import { getCashFlow } from '@/server/reports/cash-flow';
import { buildCsv, buildXlsx } from '@/server/imports/export';

const REPORTS = ['general-journal', 'general-ledger', 'trial-balance', 'income-statement', 'balance-sheet', 'cash-flow'] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  if (!REPORTS.includes(report as never)) return NextResponse.json({ error: 'Unknown report' }, { status: 404 });
  let ctx;
  try {
    ctx = await requireOrganization();
  } catch {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '2026-07-01';
  const to = url.searchParams.get('to') ?? '2026-07-31';
  const account = url.searchParams.get('account');
  const format = (url.searchParams.get('format') ?? 'csv').toLowerCase();
  const accountIds = account ? account.split(',').filter(Boolean) : undefined;
  const companyParam = url.searchParams.get('company') ?? url.searchParams.get('project');
  let companyId: string = companyParam ?? '';
  if (!companyId) {
    const { createClient } = await import('@/server/supabase/server');
    const supabase = await createClient();
    const { data: comp } = await supabase
      .from('company')
      .select('id')
      .eq('organization_id', ctx.organization.id)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    companyId = comp?.id ?? '';
  }

  let headers: string[] = [];
  let rows: Array<Record<string, unknown>> = [];

  if (report === 'trial-balance') {
    const { rows: trialRows } = await getTrialBalance({ organizationId: ctx.organization.id, companyId, from, to, accountIds });
    headers = ['Code', 'Name', 'Opening debit', 'Opening credit', 'Period debit', 'Period credit', 'Ending debit', 'Ending credit'];
    rows = trialRows.map((r) => ({
      Code: r.account.code,
      Name: r.account.name,
      'Opening debit': r.opening.side === 'DEBIT' ? r.opening.amount : '',
      'Opening credit': r.opening.side === 'CREDIT' ? r.opening.amount : '',
      'Period debit': r.period.debit,
      'Period credit': r.period.credit,
      'Ending debit': r.ending.side === 'DEBIT' ? r.ending.amount : '',
      'Ending credit': r.ending.side === 'CREDIT' ? r.ending.amount : '',
    }));
  } else if (report === 'income-statement') {
    const { incomeRows, expenseRows } = await getIncomeStatement({ organizationId: ctx.organization.id, companyId, from, to, accountIds });
    headers = ['Type', 'Code', 'Name', 'Amount'];
    rows = [
      ...incomeRows.map((r) => ({ Type: 'INCOME', Code: r.account.code, Name: r.account.name, Amount: r.ending.amount })),
      ...expenseRows.map((r) => ({ Type: 'EXPENSE', Code: r.account.code, Name: r.account.name, Amount: r.ending.amount })),
    ];
  } else if (report === 'balance-sheet') {
    const { assets, liabilities, equity, currentEarnings } = await getBalanceSheet({ organizationId: ctx.organization.id, companyId, asOf: to, accountIds });
    headers = ['Section', 'Amount'];
    rows = [
      { Section: 'Assets', Amount: assets },
      { Section: 'Liabilities', Amount: liabilities },
      { Section: 'Equity', Amount: equity },
      { Section: 'Current Earnings', Amount: currentEarnings },
    ];
  } else if (report === 'cash-flow') {
    const cf = await getCashFlow({ organizationId: ctx.organization.id, companyId, from, to });
    headers = ['Section', 'Code', 'Name', 'Effect on Cash'];
    rows = [
      { Section: 'Net Income', Code: '', Name: '', 'Effect on Cash': cf.netIncome },
      ...cf.operating.lines.map((l) => ({ Section: 'Operating', Code: l.code, Name: l.name, 'Effect on Cash': l.delta })),
      { Section: 'Total Operating', Code: '', Name: '', 'Effect on Cash': cf.operating.total },
      ...cf.investing.lines.map((l) => ({ Section: 'Investing', Code: l.code, Name: l.name, 'Effect on Cash': l.delta })),
      { Section: 'Total Investing', Code: '', Name: '', 'Effect on Cash': cf.investing.total },
      ...cf.financing.lines.map((l) => ({ Section: 'Financing', Code: l.code, Name: l.name, 'Effect on Cash': l.delta })),
      { Section: 'Total Financing', Code: '', Name: '', 'Effect on Cash': cf.financing.total },
      { Section: 'Cash Opening', Code: '', Name: '', 'Effect on Cash': cf.cashOpening },
      { Section: 'Net Change in Cash', Code: '', Name: '', 'Effect on Cash': cf.netChange },
      { Section: 'Cash Ending', Code: '', Name: '', 'Effect on Cash': cf.cashEnding },
    ];
  } else if (report === 'general-ledger' && accountIds?.length === 1) {
    const { opening, lines } = await getGeneralLedger({ organizationId: ctx.organization.id, companyId, accountId: accountIds[0], from, to });
    headers = ['Date', 'Entry Number', 'Reference', 'Description', 'Debit', 'Credit', 'Running Balance', 'Side'];
    rows = [
      { Date: '', 'Entry Number': '', Reference: 'Opening', Description: `${opening.side} ${opening.amount}`, Debit: '', Credit: '', 'Running Balance': opening.amount, Side: opening.side },
      ...lines.map((l) => ({
        Date: l.journal_entry.entry_date,
        'Entry Number': l.journal_entry.entry_number ?? '',
        Reference: l.journal_entry.reference,
        Description: l.journal_entry.description,
        Debit: l.debit,
        Credit: l.credit,
        'Running Balance': l.runningBalance,
        Side: l.runningSide,
      })),
    ];
  } else {
    const journalRows = await getGeneralJournal({
      organizationId: ctx.organization.id,
      companyId,
      from,
      to,
      status: url.searchParams.get('status') ?? 'POSTED',
      accountIds,
      q: url.searchParams.get('q') ?? undefined,
    });
    headers = ['Entry Number', 'Date', 'Reference', 'Description', 'Account', 'Debit', 'Credit', 'Status'];
    rows = (journalRows as Array<{ debit: string; credit: string; journal_entry: { entry_number: number | null; reference: string; entry_date: string; description: string; status: string }; account: { code: string; name: string } }>).map((r) => ({
      'Entry Number': r.journal_entry.entry_number ?? '',
      Date: r.journal_entry.entry_date,
      Reference: r.journal_entry.reference,
      Description: r.journal_entry.description,
      Account: `${r.account.code} — ${r.account.name}`,
      Debit: r.debit,
      Credit: r.credit,
      Status: r.journal_entry.status,
    }));
  }

  const timestamp = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
  const filename = `${report}-${from}_to_${to}-${timestamp}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;

  if (format === 'xlsx') {
    const buf = await buildXlsx(report, headers, rows);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }
  const csv = buildCsv(report, headers, rows);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
