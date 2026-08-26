import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { getGeneralJournal } from '@/server/reports/general-journal';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { FilterBar } from '@/components/reports/FilterBar';
import { ReportTable } from '@/components/reports/ReportTable';
import { PrintLayout } from '@/components/reports/PrintLayout';
import { formatBusinessDate, formatPHP } from '@/lib/format';
import type { ColumnDef } from '@tanstack/react-table';
import type { GeneralJournalRow } from '@/server/reports/general-journal';

export default async function GeneralJournalPage({
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
  const status = params.status ?? 'POSTED';
  const accountIds = params.account ? String(params.account).split(',').filter(Boolean) : undefined;
  const q = params.q;

  const rows = await getGeneralJournal({
    organizationId: organization.id,
    from,
    to,
    status,
    accountIds,
    q,
  });

  const { data: accounts } = await supabase
    .from('account')
    .select('id,code,name')
    .eq('organization_id', organization.id)
    .order('code');

  const columns: ColumnDef<GeneralJournalRow, unknown>[] = [
    {
      accessorKey: 'journal_entry.entry_number',
      header: 'Entry #',
      cell: ({ row }) => {
        const n = row.original.journal_entry.entry_number;
        return n != null ? `JE-2026-${String(n).padStart(4, '0')}` : '—';
      },
    },
    {
      accessorKey: 'journal_entry.entry_date',
      header: 'Date',
      cell: ({ row }) => formatBusinessDate(row.original.journal_entry.entry_date),
    },
    {
      accessorKey: 'journal_entry.reference',
      header: 'Reference',
      cell: ({ row }) => row.original.journal_entry.reference,
    },
    {
      accessorKey: 'journal_entry.description',
      header: 'Description',
      cell: ({ row }) => row.original.journal_entry.description,
    },
    {
      id: 'account',
      header: 'Account',
      cell: ({ row }) => `${row.original.account.code} — ${row.original.account.name}`,
    },
    {
      accessorKey: 'debit',
      header: 'Debit',
      cell: ({ row }) => {
        const v = row.original.debit as unknown as string;
        return v && v !== '0' && v !== '0.0000' ? formatPHP(v) : '—';
      },
    },
    {
      accessorKey: 'credit',
      header: 'Credit',
      cell: ({ row }) => {
        const v = row.original.credit as unknown as string;
        return v && v !== '0' && v !== '0.0000' ? formatPHP(v) : '—';
      },
    },
    {
      accessorKey: 'journal_entry.status',
      header: 'Status',
      cell: ({ row }) => row.original.journal_entry.status,
    },
  ];

  const filtersLabel = `status=${status}${accountIds ? ` account=${accountIds.join(',')}` : ''}${q ? ` q=${q}` : ''}`;

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
      <ReportTable data={rows} columns={columns} />
    </PrintLayout>
  );
}
