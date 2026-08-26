import Link from 'next/link';
import { redirect } from 'next/navigation';
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
  const projectRaw = getFirst(params.project);

  const { data: projects } = await supabase
    .from('project')
    .select('id,name')
    .eq('organization_id', organization.id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });

  const projectId = projectRaw ? String(projectRaw) : projects?.[0]?.id;

  if (!projectId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Journal</h1>
          <Link href="/projects" className={buttonVariants({ variant: 'default' })}>
            Create Project
          </Link>
        </div>
        <div className="p-8 text-center text-muted-foreground">
          No projects yet. <Link href="/projects" className="underline">Create a project</Link> to view journal entries.
        </div>
      </div>
    );
  }

  // Validate ?project= is ACTIVE for this org; if stale, redirect to canonical
  const validIds = new Set((projects ?? []).map((p) => p.id));
  if (projectRaw && !validIds.has(String(projectRaw))) {
    const qs = new URLSearchParams();
    qs.set('project', projectId);
    if (statusRaw) qs.set('status', String(statusRaw));
    if (qRaw) qs.set('q', String(qRaw));
    if (fromRaw) qs.set('from', String(fromRaw));
    if (toRaw) qs.set('to', String(toRaw));
    if (accountRaw) qs.set('account', String(accountRaw));
    redirect(`/journal?${qs.toString()}`);
  }

  if (!projectRaw) {
    const qs = new URLSearchParams();
    qs.set('project', projectId);
    if (statusRaw) qs.set('status', String(statusRaw));
    if (qRaw) qs.set('q', String(qRaw));
    if (fromRaw) qs.set('from', String(fromRaw));
    if (toRaw) qs.set('to', String(toRaw));
    if (accountRaw) qs.set('account', String(accountRaw));
    redirect(`/journal?${qs.toString()}`);
  }

  const projectName = projects?.find((p) => p.id === projectId)?.name ?? projectId;

  // Build base query — strictly per Project (fresh project shows 0)
  // Use `any` to avoid Supabase type narrowing issues with chained .in/.or/.gte
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('journal_entry')
    .select('*')
    .eq('organization_id', organization.id)
    .eq('project_id', projectId)
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
      .select('journal_entry_id, account_id')
      .eq('account_id', accountId);
    // Further filter ids to this project via journal_entry ids already constrained? Easiest: fetch ids then query with project_id
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
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('code');

  const mapped: JournalEntryRow[] = (entries ?? []).map((e) => ({
    ...e,
    total: (e as unknown as { total_debit: number }).total_debit ?? 0,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Journal</h1>
          <p className="text-sm text-muted-foreground">Project: {projectName}</p>
        </div>
        <Link href={`/journal/new?project=${projectId}`} className={buttonVariants({ variant: 'default' })}>
          New Journal Entry
        </Link>
      </div>
      <JournalTable data={mapped} accounts={accounts ?? []} projectId={projectId} />
    </div>
  );
}
