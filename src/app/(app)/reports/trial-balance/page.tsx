import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { getTrialBalance } from '@/server/reports/trial-balance';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { FilterBar } from '@/components/reports/FilterBar';
import { ReportTable } from '@/components/reports/ReportTable';
import { PrintLayout } from '@/components/reports/PrintLayout';
import { formatPHP } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import type { ColumnDef } from '@tanstack/react-table';

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { organization } = await requireOrganization();
  const params = await searchParams;
  const supabase = await createClient();

  // Resolve companyId — React.cache dedupes with layout (0 extra DB)
  const companies = await getActiveCompanies(organization.id);
  const rawCompany = params.company ?? params.project;
  const companyId = rawCompany ? String(rawCompany) : companies?.[0]?.id;
  if (!companyId) {
    return (
      <PrintLayout>
        <ReportHeader
          company={`${organization.name} — ${organization.legal_name}`}
          title="Trial Balance"
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
    redirect(`/reports/trial-balance?${search.toString()}`);
  }
  // Canonical redirect: ensure URL has ?company=
  if (!params.company) {
    const search = new URLSearchParams();
    search.set('company', companyId);
    if (params.from) search.set('from', String(params.from));
    if (params.to) search.set('to', String(params.to));
    if (params.account) search.set('account', String(params.account));
    redirect(`/reports/trial-balance?${search.toString()}`);
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

  // Parallelize heavy balances aggregation + accounts list (accounts not dependent on period)
  const [{ rows, totalEndingDebits, totalEndingCredits, isBalanced }, accountsRes] = await Promise.all([
    getTrialBalance({
      organizationId: organization.id,
      companyId,
      from,
      to,
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

  const displayRows = rows.map((r) => ({
    code: r.account.code,
    name: r.account.name,
    opening: r.opening.amount === '0.0000' ? '—' : `${formatPHP(r.opening.amount)} ${r.opening.side}`,
    periodDebit: r.period.debit === '0.0000' ? '—' : formatPHP(r.period.debit),
    periodCredit: r.period.credit === '0.0000' ? '—' : formatPHP(r.period.credit),
    ending: r.ending.amount === '0.0000' ? '—' : `${formatPHP(r.ending.amount)} ${r.ending.side}`,
  }));

  type DisplayRow = (typeof displayRows)[number];

  const columns: ColumnDef<DisplayRow, unknown>[] = [
    { accessorKey: 'code', header: 'Code' },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'opening', header: 'Opening' },
    { accessorKey: 'periodDebit', header: 'Period Debit' },
    { accessorKey: 'periodCredit', header: 'Period Credit' },
    { accessorKey: 'ending', header: 'Ending' },
  ];

  const filtersLabel = `company=${companyName}${accountIds ? ` account=${accountIds.join(',')}` : ''}`;

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
        <a href={`/api/export/trial-balance?format=csv&from=${from}&to=${to}&company=${companyId}${accountIds ? `&account=${accountIds.join(',')}` : ''}`} className="text-sm underline">
          Export CSV
        </a>
        <a href={`/api/export/trial-balance?format=xlsx&from=${from}&to=${to}&company=${companyId}${accountIds ? `&account=${accountIds.join(',')}` : ''}`} className="text-sm underline">
          Export XLSX
        </a>
      </div>
      <ReportTable data={displayRows} columns={columns} />
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
