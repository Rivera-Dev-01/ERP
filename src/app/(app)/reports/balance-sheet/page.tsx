import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { getBalanceSheet } from '@/server/reports/balance-sheet';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { FilterBar } from '@/components/reports/FilterBar';
import { PrintLayout } from '@/components/reports/PrintLayout';
import { formatPHP } from '@/lib/format';
import { Badge } from '@/components/ui/badge';

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { organization } = await requireOrganization();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from('project')
    .select('id')
    .eq('organization_id', organization.id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });
  const projectId = params.project ? String(params.project) : projects?.[0]?.id;
  if (!projectId) {
    return (
      <PrintLayout>
        <ReportHeader
          company={`${organization.name} — ${organization.legal_name}`}
          title="Balance Sheet"
          from="1970-01-01"
          to="2026-07-31"
          generatedAt={new Date().toISOString()}
        />
        <div className="p-8 text-center text-muted-foreground">
          No projects yet. <a href="/projects" className="underline">Create a project</a> to view reports.
        </div>
      </PrintLayout>
    );
  }

  const { data: period } = await supabase
    .from('fiscal_period')
    .select('start_date,end_date')
    .eq('organization_id', organization.id)
    .eq('project_id', projectId)
    .eq('status', 'OPEN')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const asOf = params.to ?? period?.end_date ?? '2026-07-31';
  const from = params.from ?? period?.start_date ?? '1970-01-01';
  const accountIds = params.account ? String(params.account).split(',').filter(Boolean) : undefined;

  const { assets, liabilities, equity, currentEarnings, isBalanced } = await getBalanceSheet({
    organizationId: organization.id,
    projectId,
    asOf,
    accountIds,
  });

  const { data: accounts } = await supabase
    .from('account')
    .select('id,code,name')
    .eq('organization_id', organization.id)
    .eq('project_id', projectId)
    .order('code');

  const filtersLabel = `project=${projectId}${accountIds ? ` account=${accountIds.join(',')}` : ''}`;

  return (
    <PrintLayout>
      <ReportHeader
        company={`${organization.name} — ${organization.legal_name}`}
        title="Balance Sheet"
        from={from}
        to={asOf}
        generatedAt={new Date().toISOString()}
        filters={filtersLabel}
      />
      <FilterBar from={from} to={asOf} accounts={accounts ?? []} />
      <div className="flex gap-2 py-2 print:hidden">
        <a href={`/api/export/balance-sheet?format=csv&to=${asOf}&project=${projectId}${accountIds ? `&account=${accountIds.join(',')}` : ''}`} className="text-sm underline">
          Export CSV
        </a>
        <a href={`/api/export/balance-sheet?format=xlsx&to=${asOf}&project=${projectId}${accountIds ? `&account=${accountIds.join(',')}` : ''}`} className="text-sm underline">
          Export XLSX
        </a>
      </div>
      <div className="mt-4 space-y-4" data-balance-sheet>
        <div className="rounded-md border p-4">
          <h2 className="mb-2 text-sm font-semibold">Assets</h2>
          <p className="text-sm">
            Total Assets: <strong>{formatPHP(assets)}</strong>
          </p>
        </div>
        <div className="rounded-md border p-4 space-y-2">
          <h2 className="text-sm font-semibold">Liabilities & Equity</h2>
          <p className="text-sm">
            Liabilities: <strong>{formatPHP(liabilities)}</strong>
          </p>
          <p className="text-sm">
            Equity: <strong>{formatPHP(equity)}</strong>
          </p>
          <p className="text-sm">
            Current Earnings: <strong>{formatPHP(currentEarnings)}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isBalanced ? 'default' : 'destructive'} data-balanced={String(isBalanced)}>
            {isBalanced ? 'Balanced' : 'Not Balanced'}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Assets = Liabilities + Equity + Current Earnings
          </span>
        </div>
      </div>
    </PrintLayout>
  );
}
