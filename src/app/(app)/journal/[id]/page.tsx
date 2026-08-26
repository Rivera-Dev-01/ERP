import { notFound, redirect } from 'next/navigation';
import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { JournalForm } from '@/components/journal/JournalForm';
import { PostConfirm } from '@/components/journal/PostConfirm';
import { ReverseDialog } from '@/components/journal/ReverseDialog';
import { formatEntryNumber } from '@/lib/validation/journal';
import { formatBusinessDate, formatPHP } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { canPost, canReverse } from '@/server/domain/journals';

export default async function JournalEntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const { organization } = await requireOrganization();
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('project')
    .select('id')
    .eq('organization_id', organization.id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });
  const rawProject = sp.project ? String(sp.project) : undefined;
  const projectId = rawProject ?? projects?.[0]?.id ?? '';

  if (!projectId) notFound();

  // Canonical: ensure ?project= present
  if (!rawProject) {
    redirect(`/journal/${id}?project=${projectId}`);
  }

  // Validate project belongs to org
  const validIds = new Set((projects ?? []).map((p) => p.id));
  if (!validIds.has(String(projectId))) {
    redirect(`/journal/${id}?project=${projects?.[0]?.id ?? ''}`);
  }

  const { data: entry } = await supabase
    .from('journal_entry')
    .select('*, journal_line(*)')
    .eq('id', id)
    .eq('organization_id', organization.id)
    .eq('project_id', projectId)
    .maybeSingle();

  if (!entry) notFound();

  const status = (entry as { status: string }).status;

  // POSTED or REVERSED -> read-only view
  if (status === 'POSTED' || status === 'REVERSED') {
    const lines = (entry as { journal_line: Array<{ id: string; account_id: string; description: string | null; debit: number; credit: number; tax_code: string | null; line_number: number }> }).journal_line ?? [];
    // fetch account codes for display — strictly within project for correctness
    const accountIds = lines.map((l) => l.account_id);
    let accountMap = new Map<string, { code: string; name: string }>();
    if (accountIds.length) {
      const { data: accounts } = await supabase.from('account').select('id,code,name').in('id', accountIds).eq('project_id', projectId);
      accountMap = new Map((accounts ?? []).map((a) => [a.id, { code: a.code, name: a.name }]));
    }
    const e = entry as {
      entry_number: number | null;
      entry_date: string;
      reference: string;
      description: string;
      notes: string | null;
      total_debit: number;
      total_credit: number;
      status: string;
      posted_at: string | null;
    };
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{formatEntryNumber(e.entry_number, e.entry_date)} — {e.reference}</h1>
          <Badge variant={status === 'POSTED' ? 'secondary' : 'destructive'}>{status}</Badge>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Header</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Date: {formatBusinessDate(e.entry_date)}</div>
            <div>Reference: {e.reference}</div>
            <div>Description: {e.description}</div>
            {e.notes ? <div>Notes: {e.notes}</div> : null}
            <div>Total Debit: {formatPHP(e.total_debit)}</div>
            <div>Total Credit: {formatPHP(e.total_credit)}</div>
            {e.posted_at ? <div>Posted at: {e.posted_at}</div> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines
                  .slice()
                  .sort((a, b) => a.line_number - b.line_number)
                  .map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.line_number}</TableCell>
                      <TableCell>{accountMap.get(l.account_id)?.code ?? l.account_id} — {accountMap.get(l.account_id)?.name ?? ''}</TableCell>
                      <TableCell>{l.description ?? ''}</TableCell>
                      <TableCell className="text-right">{l.debit ? formatPHP(l.debit) : '—'}</TableCell>
                      <TableCell className="text-right">{l.credit ? formatPHP(l.credit) : '—'}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {canReverse(status) ? (
          <div className="flex justify-end">
            <ReverseDialog
              entryId={id}
              entryNumber={formatEntryNumber(e.entry_number, e.entry_date)}
              lines={lines}
              accounts={Array.from(accountMap.entries()).map(([accId, v]) => ({ id: accId, code: v.code, name: v.name }))}
            />
          </div>
        ) : null}
      </div>
    );
  }

  // DRAFT -> editable form + PostConfirm
  // Need active accounts for picker and entry prop
  const accountQuery = supabase.from('account').select('*').eq('organization_id', organization.id).eq('is_active', true);
  const { data: accounts } = await (projectId ? accountQuery.eq('project_id', projectId) : accountQuery).order('code');

  if (canPost(status)) {
    const e = entry as { entry_number: number | null; entry_date: string };
    const display = formatEntryNumber(e.entry_number, e.entry_date);
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <PostConfirm entryId={id} entryNumber={display} />
        </div>
        <JournalForm mode="edit" entry={entry as unknown as Parameters<typeof JournalForm>[0]['entry']} accounts={accounts ?? []} projectId={projectId} />
      </div>
    );
  }

  return <JournalForm mode="edit" entry={entry as unknown as Parameters<typeof JournalForm>[0]['entry']} accounts={accounts ?? []} projectId={projectId} />;
}
