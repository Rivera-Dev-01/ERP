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

  const { data: period } = await supabase
    .from('fiscal_period')
    .select('start_date,end_date')
    .eq('organization_id', organization.id)
    .eq('status', 'OPEN')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const from = params.from ?? period?.start_date ?? '2026-07-01';
  const to = params.to ?? period?.end_date ?? '2026-07-31';
  const accountIds = params.account ? String(params.account).split(',').filter(Boolean) : undefined;

  const { income, expenses, net, incomeRows, expenseRows } = await getIncomeStatement({
    organizationId: organization.id,
    from,
    to,
    accountIds,
  });

  const { data: accounts } = await supabase
    .from('account')
    .select('id,code,name')
    .eq('organization_id', organization.id)
    .order('code');

  const columns: ColumnDef<IncomeRow, unknown>[] = [
    {
      accessorKey: 'account.code',
      header: 'Code',
      cell: ({ row }) => row.original.account.code,
    },
    {
      accessorKey: 'account.name',
      header: 'Name',
      cell: ({ row }) => row.original.account.name,
    },
    {
      id: 'amount',
      header: 'Amount',
      cell: ({ row }) => {
        const r = row.original;
        const isIncome = r.account.type === 'INCOME';
        const amt = isIncome
          ? (Number(r.period.credit) - Number(r.period.debit)).toFixed(4)
          : (Number(r.period.debit) - Number(r.period.credit)).toFixed(4);
        return Number(amt) === 0 ? '—' : formatPHP(amt);
      },
    },
  ];

  const filtersLabel = accountIds ? `account=${accountIds.join(',')}` : undefined;

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
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Income</h2>
          <ReportTable data={incomeRows} columns={columns} />
          <p className="mt-2 text-sm">
            Total Income: <strong>{formatPHP(income)}</strong>
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Expenses</h2>
          <ReportTable data={expenseRows} columns={columns} />
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
