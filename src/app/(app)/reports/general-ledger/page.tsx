import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { getGeneralLedger } from '@/server/reports/general-ledger';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { FilterBar } from '@/components/reports/FilterBar';
import { ReportTable } from '@/components/reports/ReportTable';
import { PrintLayout } from '@/components/reports/PrintLayout';
import { formatBusinessDate, formatPHP } from '@/lib/format';
import type { ColumnDef } from '@tanstack/react-table';

export default async function GeneralLedgerPage({
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
  const accountId = params.account ? String(params.account).split(',')[0] : undefined;

  const { data: accounts } = await supabase
    .from('account')
    .select('id,code,name')
    .eq('organization_id', organization.id)
    .order('code');

  const result = accountId
    ? await getGeneralLedger({
        organizationId: organization.id,
        accountId,
        from,
        to,
      })
    : null;

  const displayRows = (result?.lines ?? []).map((l) => ({
    entryDate: formatBusinessDate(l.journal_entry.entry_date),
    entryNumber: l.journal_entry.entry_number != null ? `JE-2026-${String(l.journal_entry.entry_number).padStart(4, '0')}` : '—',
    reference: l.journal_entry.reference,
    description: l.journal_entry.description,
    debit: l.debit && l.debit !== '0' && l.debit !== '0.0000' ? formatPHP(l.debit as unknown as string) : '—',
    credit: l.credit && l.credit !== '0' && l.credit !== '0.0000' ? formatPHP(l.credit as unknown as string) : '—',
    runningBalance: `${formatPHP(l.runningBalance)} ${l.runningSide}`,
  }));

  type DisplayRow = (typeof displayRows)[number];

  const columns: ColumnDef<DisplayRow, unknown>[] = [
    { accessorKey: 'entryDate', header: 'Date' },
    { accessorKey: 'entryNumber', header: 'Entry #' },
    { accessorKey: 'reference', header: 'Reference' },
    { accessorKey: 'description', header: 'Description' },
    { accessorKey: 'debit', header: 'Debit' },
    { accessorKey: 'credit', header: 'Credit' },
    { accessorKey: 'runningBalance', header: 'Running Balance' },
  ];

  const filtersLabel = accountId ? `account=${accountId}` : undefined;

  return (
    <PrintLayout>
      <ReportHeader
        company={`${organization.name} — ${organization.legal_name}`}
        title="General Ledger"
        from={from}
        to={to}
        generatedAt={new Date().toISOString()}
        filters={filtersLabel}
      />
      <FilterBar from={from} to={to} accounts={accounts ?? []} />
      <div className="flex gap-2 py-2 print:hidden">
        <a
          href={`/api/export/general-ledger?format=csv&from=${from}&to=${to}${accountId ? `&account=${accountId}` : ''}`}
          className="text-sm underline"
        >
          Export CSV
        </a>
        <a
          href={`/api/export/general-ledger?format=xlsx&from=${from}&to=${to}${accountId ? `&account=${accountId}` : ''}`}
          className="text-sm underline"
        >
          Export XLSX
        </a>
      </div>
      {accountId ? (
        <>
          {result && (
            <p className="py-2 text-sm text-muted-foreground" data-ledger-opening>
              Opening: {formatPHP(result.opening.amount)} {result.opening.side}
            </p>
          )}
          <ReportTable data={displayRows} columns={columns} />
        </>
      ) : (
        <div className="rounded-md border p-8 text-center text-muted-foreground">Select an account</div>
      )}
    </PrintLayout>
  );
}
