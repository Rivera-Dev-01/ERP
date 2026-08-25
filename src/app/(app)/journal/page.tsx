import Link from 'next/link';
import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { JournalTable, type JournalEntryRow } from '@/components/journal/JournalTable';
import { buttonVariants } from '@/components/ui/button';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { organization } = await requireOrganization();
  const supabase = await createClient();
  const params = await searchParams;

  const getFirst = (v: string | string[] | undefined): string | undefined => {
    if (Array.isArray(v)) return v[0];
    return v;
  };

  const statusRaw = getFirst(params.status);
  const qRaw = getFirst(params.q ?? params.search);
  const fromRaw = getFirst(params.from ?? params.date_from ?? params.start_date ?? params.start);
  const toRaw = getFirst(params.to ?? params.date_to ?? params.end_date ?? params.end);
  const accountRaw = getFirst(params.account ?? params.account_id ?? params.accountId);

  // Build base query
  // Use `any` to avoid Supabase type narrowing issues with chained .in/.or/.gte
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('journal_entry')
    .select('*')
    .eq('organization_id', organization.id)
    .order('entry_date', { ascending: false });

  if (statusRaw) {
    const statuses = String(statusRaw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (statuses.length) {
      query = query.in('status', statuses);
    }
  }

  if (qRaw) {
    const q = String(qRaw).trim();
    if (q) {
      const escaped = q.replace(/%/g, '\\%').replace(/,/g, '\\,');
      query = query.or(`reference.ilike.%${escaped}%,description.ilike.%${escaped}%`);
    }
  }

  if (fromRaw) {
    query = query.gte('entry_date', String(fromRaw));
  }
  if (toRaw) {
    query = query.lte('entry_date', String(toRaw));
  }

  let entries: JournalEntryRow[] | null = null;

  if (accountRaw) {
    const accountId = String(accountRaw);
    const { data: lineRows } = await supabase
      .from('journal_line')
      .select('journal_entry_id')
      .eq('account_id', accountId);
    const ids = [...new Set((lineRows ?? []).map((r: { journal_entry_id: string }) => r.journal_entry_id))];
    if (ids.length === 0) {
      entries = [];
    } else {
      const { data } = await query.in('id', ids);
      entries = (data ?? []) as unknown as JournalEntryRow[];
    }
  } else {
    const { data } = await query;
    entries = (data ?? []) as unknown as JournalEntryRow[];
  }

  const { data: accounts } = await supabase
    .from('account')
    .select('id,code,name')
    .eq('organization_id', organization.id)
    .eq('is_active', true)
    .order('code');

  const mapped: JournalEntryRow[] = (entries ?? []).map((e) => ({
    ...e,
    total: (e as unknown as { total_debit: number }).total_debit ?? 0,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Journal</h1>
        <Link href="/journal/new" className={buttonVariants({ variant: 'default' })}>
          New Journal Entry
        </Link>
      </div>
      <JournalTable data={mapped} accounts={accounts ?? []} />
    </div>
  );
}
