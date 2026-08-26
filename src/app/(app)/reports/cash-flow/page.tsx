import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { getCashFlow } from '@/server/reports/cash-flow';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { FilterBar } from '@/components/reports/FilterBar';
import { ReportTable } from '@/components/reports/ReportTable';
import { PrintLayout } from '@/components/reports/PrintLayout';
import { formatPHP } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import type { ColumnDef } from '@tanstack/react-table';

type Line = { accountId: string; code: string; name: string; delta: string; _href: string };

function sectionRows(
  lines: Array<{ accountId: string; code: string; name: string; delta: string }>,
  companyId: string,
  from: string,
  to: string,
): Line[] {
  return lines
    .filter((l) => l.delta !== '0.0000' && l.delta !== '0')
    .map((l) => ({
      ...l,
      delta: formatPHP(l.delta),
      _href: `/reports/general-ledger?company=${companyId}&account=${l.accountId}&from=${from}&to=${to}`,
    }));
}

export default async function CashFlowPage({
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
        <ReportHeader company={`${organization.name} — ${organization.legal_name}`} title="Cash Flow Statement" from="2026-07-01" to="2026-07-31" generatedAt={new Date().toISOString()} />
        <div className="p-8 text-center text-muted-foreground">No companies yet. <a href="/companies" className="underline">Create a company</a> to view reports.</div>
      </PrintLayout>
    );
  }
  if (params.project && !params.company) redirect(`/reports/cash-flow?company=${companyId}`);
  if (!params.company) redirect(`/reports/cash-flow?company=${companyId}`);
  const validIds = new Set(companies.map((c) => c.id));
  if (!validIds.has(companyId)) {
    const fallback = companies[0]?.id;
    if (fallback) redirect(`/reports/cash-flow?company=${fallback}`);
  }
  const companyName = companies.find((c) => c.id === companyId)?.name ?? companyId;

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

  const [cf, accountsRes] = await Promise.all([
    getCashFlow({ organizationId: organization.id, companyId, from, to }),
    supabase.from('account').select('id,code,name').eq('organization_id', organization.id).eq('company_id', companyId).order('code'),
  ]);
  const accounts = accountsRes.data;

  const mkCols = (header: string): ColumnDef<Line, unknown>[] => [
    { accessorKey: 'code', header: 'Code' },
    { accessorKey: 'name', header: header },
    { accessorKey: 'delta', header: 'Effect on Cash' },
  ];

  const opRows = sectionRows(cf.operating.lines, companyId, from, to);
  const invRows = sectionRows(cf.investing.lines, companyId, from, to);
  const finRows = sectionRows(cf.financing.lines, companyId, from, to);

  return (
    <PrintLayout>
      <ReportHeader
        company={`${organization.name} — ${organization.legal_name}`}
        title="Cash Flow Statement (Indirect)"
        from={from}
        to={to}
        generatedAt={new Date().toISOString()}
        filters={`company=${companyName}`}
      />
      <FilterBar from={from} to={to} accounts={accounts ?? []} />
      <div className="flex gap-2 py-2 print:hidden">
        <a href={`/api/export/cash-flow?format=csv&from=${from}&to=${to}&company=${companyId}`} className="text-sm underline">Export CSV</a>
        <a href={`/api/export/cash-flow?format=xlsx&from=${from}&to=${to}&company=${companyId}`} className="text-sm underline">Export XLSX</a>
      </div>

      <div className="space-y-6" data-cash-flow>
        <section>
          <h2 className="mb-1 text-sm font-semibold">Operating activities</h2>
          <p className="mb-2 text-sm">Net Income: <strong>{formatPHP(cf.netIncome)}</strong></p>
          <ReportTable data={opRows} columns={mkCols('Account')} linkKeys={['code']} />
          <p className="mt-2 text-sm">Net cash from operating: <strong>{formatPHP(cf.operating.total)}</strong></p>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Investing activities</h2>
          {invRows.length ? (
            <>
              <ReportTable data={invRows} columns={mkCols('Account')} linkKeys={['code']} />
              <p className="mt-2 text-sm">Net cash from investing: <strong>{formatPHP(cf.investing.total)}</strong></p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No investing movement.</p>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Financing activities</h2>
          {finRows.length ? (
            <>
              <ReportTable data={finRows} columns={mkCols('Account')} linkKeys={['code']} />
              <p className="mt-2 text-sm">Net cash from financing: <strong>{formatPHP(cf.financing.total)}</strong></p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No financing movement.</p>
          )}
        </section>

        <div className="border-t pt-4 text-sm space-y-1" data-cash-footer>
          <p>Cash, opening: <strong>{formatPHP(cf.cashOpening)}</strong></p>
          <p>Net change in cash: <strong>{formatPHP(cf.netChange)}</strong> <span className="text-muted-foreground">(computed {formatPHP(cf.computedNetChange)})</span></p>
          <p>Cash, ending: <strong>{formatPHP(cf.cashEnding)}</strong></p>
          <Badge variant={cf.isReconciled ? 'default' : 'destructive'} data-reconciled={String(cf.isReconciled)}>
            {cf.isReconciled ? 'Reconciled with ledger' : 'Not reconciled — check cf_category assignments'}
          </Badge>
        </div>
      </div>
    </PrintLayout>
  );
}
