import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { getTrialBalance } from '@/server/reports/trial-balance';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { FilterBar } from '@/components/reports/FilterBar';
import { ReportTable } from '@/components/reports/ReportTable';
import { PrintLayout } from '@/components/reports/PrintLayout';
import { formatBusinessDate, formatPHP } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import type { ColumnDef } from '@tanstack/react-table';

type TrialRow = Awaited<ReturnType<typeof getTrialBalance>>['rows'][number];

export default async function TrialBalancePage({
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

  const { rows, totalEndingDebits, totalEndingCredits, isBalanced } = await getTrialBalance({
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

  const columns: ColumnDef<TrialRow, unknown>[] = [
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
      id: 'opening',
      header: 'Opening',
      cell: ({ row }) => {
        const o = row.original.opening;
        return o.amount === '0.0000' ? '—' : `${formatPHP(o.amount)} ${o.side}`;
      },
    },
    {
      id: 'periodDebit',
      header: 'Period Debit',
      cell: ({ row }) => {
        const v = row.original.period.debit;
        return v === '0.0000' ? '—' : formatPHP(v);
      },
    },
    {
      id: 'periodCredit',
      header: 'Period Credit',
      cell: ({ row }) => {
        const v = row.original.period.credit;
        return v === '0.0000' ? '—' : formatPHP(v);
      },
    },
    {
      id: 'ending',
      header: 'Ending',
      cell: ({ row }) => {
        const e = row.original.ending;
        return e.amount === '0.0000' ? '—' : `${formatPHP(e.amount)} ${e.side}`;
      },
    },
  ];

  const filtersLabel = accountIds ? `account=${accountIds.join(',')}` : undefined;

  return (
    <PrintLayout>
      <ReportHeader
        company={`${organization.name} — ${organization.legal_name}`}
        title="Trial Balance"
        from={from}
        to={to}
        generatedAt={new Date().toISOString()}
        filters={filtersLabel}
      />
      <FilterBar from={from} to={to} accounts={accounts ?? []} />
      <div className="flex gap-2 py-2 print:hidden">
        <a href={`/api/export/trial-balance?format=csv&from=${from}&to=${to}${accountIds ? `&account=${accountIds.join(',')}` : ''}`} className="text-sm underline">
          Export CSV
        </a>
        <a href={`/api/export/trial-balance?format=xlsx&from=${from}&to=${to}${accountIds ? `&account=${accountIds.join(',')}` : ''}`} className="text-sm underline">
          Export XLSX
        </a>
      </div>
      <ReportTable data={rows} columns={columns} />
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm" data-trial-footer>
        <span>
          Total Ending Debits: <strong>{formatPHP(totalEndingDebits)}</strong>
        </span>
        <span>
          Total Ending Credits: <strong>{formatPHP(totalEndingCredits)}</strong>
        </span>
        <Badge variant={isBalanced ? 'default' : 'destructive'} data-balanced={String(isBalanced)}>
          {isBalanced ? 'Balanced' : 'Not Balanced'}
        </Badge>
      </div>
    </PrintLayout>
  );
}
