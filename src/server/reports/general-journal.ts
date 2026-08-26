import 'server-only';
import { createClient } from '@/server/supabase/server';

export type GeneralJournalRow = {
  debit: string;
  credit: string;
  account: { code: string; name: string };
  journal_entry: {
    id: string;
    entry_number: number | null;
    reference: string;
    entry_date: string;
    description: string;
    status: string;
    organization_id: string;
  };
};

export async function getGeneralJournal(opts: {
  organizationId: string;
  projectId?: string;
  from: string;
  to: string;
  status: string;
  accountIds?: string[];
  q?: string;
}): Promise<GeneralJournalRow[]> {
  const supabase = await createClient();
  const allowed: ('POSTED' | 'REVERSED' | 'DRAFT')[] =
    opts.status === 'DRAFT' || opts.status.includes('DRAFT')
      ? ['POSTED', 'REVERSED', 'DRAFT']
      : ['POSTED', 'REVERSED'];

  let query: any = supabase
    .from('journal_line')
    .select(
      'debit,credit,account!inner(code,name),journal_entry!inner(id,entry_number,reference,entry_date,description,status,organization_id,project_id)',
    )
    .eq('journal_entry.organization_id', opts.organizationId)
    .in('journal_entry.status', allowed as unknown as never)
    .gte('journal_entry.entry_date', opts.from)
    .lte('journal_entry.entry_date', opts.to)
    .order('journal_entry.entry_date', { ascending: true });
  if (opts.projectId) query = query.eq('journal_entry.project_id', opts.projectId);

  if (opts.accountIds?.length) {
    query = query.in('account_id', opts.accountIds);
  }

  if (opts.q) {
    // PostgREST or filter on joined table; escape commas/quotes by replacing with safe chars
    const term = opts.q.replace(/,/g, ' ').replace(/"/g, '');
    query = query.or(
      `journal_entry.reference.ilike.%${term}%,journal_entry.description.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    // In case join filter fails, return empty rather than throw to keep report resilient
    return [];
  }

  const rows = (data ?? []) as unknown as GeneralJournalRow[];

  // Secondary sort by entry_number to keep chronological stable order within same date
  return rows.sort((a, b) => {
    const dateCmp = a.journal_entry.entry_date.localeCompare(b.journal_entry.entry_date);
    if (dateCmp !== 0) return dateCmp;
    return (a.journal_entry.entry_number ?? 0) - (b.journal_entry.entry_number ?? 0);
  });
}
