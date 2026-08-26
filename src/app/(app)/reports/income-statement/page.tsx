import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { getIncomeStatement } from '@/server/reports/income-statement';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { FilterBar } from '@/components/reports/FilterBar';
import { ReportTable } from '@/components/reports/ReportTable';
import { PrintLayout } from '@/components/reports/PrintLayout';
import { formatPHP } from '@/lib/format';
import type { ColumnDef } from '@tanstack/react-table';

type IncomeRow = Awaited<ReturnType<typeof getIncomeStatement>>['incomeRows'][number];

function priorWindow(from: string, to: string): { from: string; to: string } {
  const f = new Date(from);
  const t = new Date(to);
  const diff = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const pf = new Date(f);
  pf.setDate(pf.getDate() - diff);
  const pt = new Date(f);
  pt.setDate(pt.getDate() - 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(pf), to: fmt(pt) };
}

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { organization } = await requireOrganization();
  const params = await searchParams;
  const supabase = await createClient();

  const companies = await getActiveCompanies(organization.id);
  const rawCompany = params.company ?? params.project;
  const companyId = rawCompany ? String(rawCompany) : companies?.[0]?.id;
  if (!companyId) {
    return (
      <PrintLayout>
        <ReportHeader
          company={`${organization.name} — ${organization.legal_name}`}
          title="Income Statement"
          from="2026-07-01"
          to="2026-07-31"
          generatedAt={new Date().toISOString()}
        />
        <div className="p-8 text-center text-muted-foreground">
          No companies yet. <a href="/companies" className="underline">Create a company</a> to view reports.
        </div>
      </PrintLayout>
    );
  }
  if (params.project && !params.company) {
    const search = new URLSearchParams();
    search.set('company', companyId);
    if (params.from) search.set('from', String(params.from));
    if (params.to) search.set('to', String(params.to));
    if (params.account) search.set('account', String(params.account));
    redirect(`/reports/income-statement?${search.toString()}`);
  }
  if (!params.company) {
    const search = new URLSearchParams();
    search.set('company', companyId);
    if (params.from) search.set('from', String(params.from));
    if (params.to) search.set('to', String(params.to));
    if (params.account) search.set('account', String(params.account));
    redirect(`/reports/income-statement?${search.toString()}`);
  }
  const companyName = companies.find((p) => p.id === companyId)?.name ?? companyId;

  const { data: period } = await supabase
    .from('fiscal_period')
    .select('start_date,end_date')
    .eq('organization_id', organization.id)
    .eq('company_id', companyId)
    .eq('status', 'OPEN')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const from = params.from ?? period?.start_date ?? '2026-07-01';
  const to = params.to ?? period?.end_date ?? '2026-07-31';
  const accountIds = params.account ? String(params.account).split(',').filter(Boolean) : undefined;

  const prior = priorWindow(from, to);

  const [{ income, expenses, net, incomeRows, expenseRows }, priorRes, accountsRes] = await Promise.all([
    getIncomeStatement({
      organizationId: organization.id,
      companyId,
      from,
      to,
      accountIds,
    }),
    getIncomeStatement({
      organizationId: organization.id,
      companyId,
      from: prior.from,
      to: prior.to,
      accountIds,
    }),
    supabase
      .from('account')
      .select('id,code,name')
      .eq('organization_id', organization.id)
      .eq('company_id', companyId)
      .order('code'),
  ]);
  const accounts = accountsRes.data;
  const priorMap = new Map<string, IncomeRow>();
  for (const r of [...priorRes.incomeRows, ...priorRes.expenseRows]) priorMap.set(r.account.id, r);

  const toDisplay = (r: IncomeRow) => {
    const isIncome = r.account.type === 'INCOME';
    const amt = isIncome
      ? (Number(r.period.credit) - Number(r.period.debit)).toFixed(4)
      : (Number(r.period.debit) - Number(r.period.credit)).toFixed(4);
    const priorRow = priorMap.get(r.account.id);
    const priorAmt = priorRow
      ? (isIncome ? (Number(priorRow.period.credit) - Number(priorRow.period.debit)).toFixed(4) : (Number(priorRow.period.debit) - Number(priorRow.period.credit)).toFixed(4))
      : '0.0000';
    const drillHref = `/journal?company=${companyId}&account=${r.account.id}&from=${from}&to=${to}`;
    return {
      code: r.account.code,
      name: r.account.name,
      amount: Number(amt) === 0 ? '—' : formatPHP(amt),
      amountRaw: amt,
      prior: Number(priorAmt) === 0 ? '—' : formatPHP(priorAmt),
      _href: drillHref,
      _accountId: r.account.id,
    };
  };
  const incomeDisplay = incomeRows.map(toDisplay);
  const expenseDisplay = expenseRows.map(toDisplay);

  type DisplayRow = (typeof incomeDisplay)[number];

  const amountCell = (info: { getValue: () => unknown; row: { original: DisplayRow } }) => {
    const v = String(info.getValue() ?? '—');
    if (v === '—') return v;
    const href = (info.row.original as DisplayRow)._href;
    return <Link href={href} className="underline text-primary">{v}</Link>;
  };

  const columns: ColumnDef<DisplayRow, unknown>[] = [
    { accessorKey: 'code', header: 'Code' },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'amount', header: 'Amount', cell: amountCell as unknown as ColumnDef<DisplayRow, unknown>['cell'] },
    { accessorKey: 'prior', header: `Prior (${prior.from}–${prior.to})` },
  ];

  const filtersLabel = `company=${companyName}${accountIds ? ` account=${accountIds.join(',')}` : ''}`;

  return (
    <PrintLayout>
      <ReportHeader
        company={`${organization.name} — ${organization.legal_name}`}
        title="Income Statement"
        from={from}
        to={to}
        generatedAt={new Date().toISOString()}
        filters={filtersLabel}
      />
      <FilterBar from={from} to={to} accounts={accounts ?? []} />
      <div className="flex gap-2 py-2 print:hidden">
        <a href={`/api/export/income-statement?format=csv&from=${from}&to=${to}&company=${companyId}${accountIds ? `&account=${accountIds.join(',')}` : ''}`} className="text-sm underline">
          Export CSV
        </a>
        <a href={`/api/export/income-statement?format=xlsx&from=${from}&to=${to}&company=${companyId}${accountIds ? `&account=${accountIds.join(',')}` : ''}`} className="text-sm underline">
          Export XLSX
        </a>
      </div>
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Income</h2>
          <ReportTable data={incomeDisplay} columns={columns} />
          <p className="mt-2 text-sm">
            Total Income: <strong>{formatPHP(income)}</strong> <span className="text-muted-foreground">· Prior {formatPHP(priorRes.income)}</span>
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Expenses</h2>
          <ReportTable data={expenseDisplay} columns={columns} />
          <p className="mt-2 text-sm">
            Total Expenses: <strong>{formatPHP(expenses)}</strong> <span className="text-muted-foreground">· Prior {formatPHP(priorRes.expenses)}</span>
          </p>
        </section>
        <div className="border-t pt-4 text-sm flex gap-4" data-income-net>
          <span>Net Income: <strong>{formatPHP(net)}</strong></span>
          <span className="text-muted-foreground">Prior {formatPHP(priorRes.net)}</span>
        </div>
      </div>
    </PrintLayout>
  );
}
