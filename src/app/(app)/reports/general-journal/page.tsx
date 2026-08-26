import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { getGeneralJournal } from '@/server/reports/general-journal';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { FilterBar } from '@/components/reports/FilterBar';
import { ReportTable } from '@/components/reports/ReportTable';
import { PrintLayout } from '@/components/reports/PrintLayout';
import { formatBusinessDate, formatPHP } from '@/lib/format';
import type { ColumnDef } from '@tanstack/react-table';

export default async function GeneralJournalPage({
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
          title="General Journal"
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
    if (params.status) search.set('status', String(params.status));
    if (params.q) search.set('q', String(params.q));
    redirect(`/reports/general-journal?${search.toString()}`);
  }
  if (!params.company) {
    const search = new URLSearchParams();
    search.set('company', companyId);
    if (params.from) search.set('from', String(params.from));
    if (params.to) search.set('to', String(params.to));
    if (params.account) search.set('account', String(params.account));
    if (params.status) search.set('status', String(params.status));
    if (params.q) search.set('q', String(params.q));
    redirect(`/reports/general-journal?${search.toString()}`);
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
  const status = params.status ?? 'POSTED';
  const accountIds = params.account ? String(params.account).split(',').filter(Boolean) : undefined;
  const q = params.q;

  const [rows, accountsRes] = await Promise.all([
    getGeneralJournal({
      organizationId: organization.id,
      companyId,
      from,
      to,
      status,
      accountIds,
      q,
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
    entryNumber: r.journal_entry.entry_number != null ? `JE-2026-${String(r.journal_entry.entry_number).padStart(4, '0')}` : '—',
    entryDate: formatBusinessDate(r.journal_entry.entry_date),
    reference: r.journal_entry.reference,
    description: r.journal_entry.description,
    account: `${r.account.code} — ${r.account.name}`,
    debit: r.debit && r.debit !== '0' && r.debit !== '0.0000' ? formatPHP(r.debit as unknown as string) : '—',
    credit: r.credit && r.credit !== '0' && r.credit !== '0.0000' ? formatPHP(r.credit as unknown as string) : '—',
    status: r.journal_entry.status,
  }));

  type DisplayRow = (typeof displayRows)[number];

  const columns: ColumnDef<DisplayRow, unknown>[] = [
    { accessorKey: 'entryNumber', header: 'Entry #' },
    { accessorKey: 'entryDate', header: 'Date' },
    { accessorKey: 'reference', header: 'Reference' },
    { accessorKey: 'description', header: 'Description' },
    { accessorKey: 'account', header: 'Account' },
    { accessorKey: 'debit', header: 'Debit' },
    { accessorKey: 'credit', header: 'Credit' },
    { accessorKey: 'status', header: 'Status' },
  ];

  const filtersLabel = `company=${companyName} status=${status}${accountIds ? ` account=${accountIds.join(',')}` : ''}${q ? ` q=${q}` : ''}`;

  return (
    <PrintLayout>
      <ReportHeader
        company={`${organization.name} — ${organization.legal_name}`}
        title="General Journal"
        from={from}
        to={to}
        generatedAt={new Date().toISOString()}
        filters={filtersLabel}
      />
      <FilterBar from={from} to={to} accounts={accounts ?? []} />
      <div className="flex gap-2 py-2 print:hidden">
        <a
          href={`/api/export/general-journal?format=csv&from=${from}&to=${to}&company=${companyId}${accountIds ? `&account=${accountIds.join(',')}` : ''}${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className="text-sm underline"
        >
          Export CSV
        </a>
        <a
          href={`/api/export/general-journal?format=xlsx&from=${from}&to=${to}&company=${companyId}${accountIds ? `&account=${accountIds.join(',')}` : ''}${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className="text-sm underline"
        >
          Export XLSX
        </a>
      </div>
      <ReportTable data={displayRows} columns={columns} />
    </PrintLayout>
  );
}
