import { redirect } from 'next/navigation';
import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { getIncomeStatement } from '@/server/reports/income-statement';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { FilterBar } from '@/components/reports/FilterBar';
import { ReportTable } from '@/components/reports/ReportTable';
import { PrintLayout } from '@/components/reports/PrintLayout';
import { formatPHP } from '@/lib/format';
import type { ColumnDef } from '@tanstack/react-table';

type IncomeRow = Awaited<ReturnType<typeof getIncomeStatement>>['incomeRows'][number];

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { organization } = await requireOrganization();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from('project')
    .select('id,name')
    .eq('organization_id', organization.id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });
  const projectId = params.project ? String(params.project) : projects?.[0]?.id;
  if (!projectId) {
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
          No projects yet. <a href="/projects" className="underline">Create a project</a> to view reports.
        </div>
      </PrintLayout>
    );
  }
  if (!params.project) {
    const search = new URLSearchParams();
    search.set('project', projectId);
    if (params.from) search.set('from', String(params.from));
    if (params.to) search.set('to', String(params.to));
    if (params.account) search.set('account', String(params.account));
    redirect(`/reports/income-statement?${search.toString()}`);
  }
  const projectName = projects?.find((p) => p.id === projectId)?.name ?? projectId;

  const { data: period } = await supabase
    .from('fiscal_period')
    .select('start_date,end_date')
    .eq('organization_id', organization.id)
    .eq('project_id', projectId)
    .eq('status', 'OPEN')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const from = params.from ?? period?.start_date ?? '2026-07-01';
  const to = params.to ?? period?.end_date ?? '2026-07-31';
  const accountIds = params.account ? String(params.account).split(',').filter(Boolean) : undefined;

  const { income, expenses, net, incomeRows, expenseRows } = await getIncomeStatement({
    organizationId: organization.id,
    projectId,
    from,
    to,
    accountIds,
  });

  const { data: accounts } = await supabase
    .from('account')
    .select('id,code,name')
    .eq('organization_id', organization.id)
    .eq('project_id', projectId)
    .order('code');

  const toDisplay = (r: IncomeRow) => {
    const isIncome = r.account.type === 'INCOME';
    const amt = isIncome
      ? (Number(r.period.credit) - Number(r.period.debit)).toFixed(4)
      : (Number(r.period.debit) - Number(r.period.credit)).toFixed(4);
    return {
      code: r.account.code,
      name: r.account.name,
      amount: Number(amt) === 0 ? '—' : formatPHP(amt),
    };
  };
  const incomeDisplay = incomeRows.map(toDisplay);
  const expenseDisplay = expenseRows.map(toDisplay);

  type DisplayRow = (typeof incomeDisplay)[number];

  const columns: ColumnDef<DisplayRow, unknown>[] = [
    { accessorKey: 'code', header: 'Code' },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'amount', header: 'Amount' },
  ];

  const filtersLabel = `project=${projectName}${accountIds ? ` account=${accountIds.join(',')}` : ''}`;

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
        <a href={`/api/export/income-statement?format=csv&from=${from}&to=${to}&project=${projectId}${accountIds ? `&account=${accountIds.join(',')}` : ''}`} className="text-sm underline">
          Export CSV
        </a>
        <a href={`/api/export/income-statement?format=xlsx&from=${from}&to=${to}&project=${projectId}${accountIds ? `&account=${accountIds.join(',')}` : ''}`} className="text-sm underline">
          Export XLSX
        </a>
      </div>
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Income</h2>
          <ReportTable data={incomeDisplay} columns={columns} />
          <p className="mt-2 text-sm">
            Total Income: <strong>{formatPHP(income)}</strong>
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Expenses</h2>
          <ReportTable data={expenseDisplay} columns={columns} />
          <p className="mt-2 text-sm">
            Total Expenses: <strong>{formatPHP(expenses)}</strong>
          </p>
        </section>
        <div className="border-t pt-4 text-sm" data-income-net>
          Net Income: <strong>{formatPHP(net)}</strong>
        </div>
      </div>
    </PrintLayout>
  );
}
