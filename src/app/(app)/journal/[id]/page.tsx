import { notFound, redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
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
import { AttachmentsCard } from '@/components/journal/AttachmentsCard';

export default async function JournalEntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const { organization } = await requireOrganization();
  const supabase = await createClient();
  const companies = await getActiveCompanies(organization.id);
  const rawCompany = sp.company ? String(sp.company) : sp.project ? String(sp.project) : undefined;
  const companyId = rawCompany ?? companies?.[0]?.id ?? '';

  if (!companyId) notFound();

  // Backwards compat: redirect old ?project= to ?company=
  if (sp.project && !sp.company) {
    redirect(`/journal/${id}?company=${companyId}`);
  }

  // Canonical: ensure ?company= present
  if (!rawCompany) {
    redirect(`/journal/${id}?company=${companyId}`);
  }

  // Validate company belongs to org
  const validIds = new Set((companies ?? []).map((p) => p.id));
  if (!validIds.has(String(companyId))) {
    redirect(`/journal/${id}?company=${companies?.[0]?.id ?? ''}`);
  }

  const { data: entry } = await supabase
    .from('journal_entry')
    .select('*, journal_line(*)')
    .eq('id', id)
    .eq('organization_id', organization.id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!entry) notFound();

  const status = (entry as { status: string }).status;
  const { data: attachments } = await supabase
    .from('attachment')
    .select('id,file_name,size_bytes,created_at')
    .eq('journal_entry_id', id)
    .order('created_at', { ascending: false });
  const attachmentsCard = (
    <AttachmentsCard entryId={id} initial={(attachments ?? []) as unknown as Array<{ id: string; file_name: string; size_bytes: number; created_at: string }>} />
  );

  // POSTED or REVERSED -> read-only view
  if (status === 'POSTED' || status === 'REVERSED') {
    const lines = (entry as { journal_line: Array<{ id: string; account_id: string; description: string | null; debit: number; credit: number; tax_code: string | null; line_number: number }> }).journal_line ?? [];
    // fetch account codes for display — strictly within company for correctness
    const accountIds = lines.map((l) => l.account_id);
    let accountMap = new Map<string, { code: string; name: string }>();
    if (accountIds.length) {
      const { data: accounts } = await supabase.from('account').select('id,code,name').in('id', accountIds).eq('company_id', companyId);
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
        {attachmentsCard}
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
  const { data: accounts } = await (companyId ? accountQuery.eq('company_id', companyId) : accountQuery).order('code');

  if (canPost(status)) {
    const e = entry as { entry_number: number | null; entry_date: string };
    const display = formatEntryNumber(e.entry_number, e.entry_date);
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <PostConfirm entryId={id} entryNumber={display} />
        </div>
        <JournalForm mode="edit" entry={entry as unknown as Parameters<typeof JournalForm>[0]['entry']} accounts={accounts ?? []} companyId={companyId} />
        {attachmentsCard}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <JournalForm mode="edit" entry={entry as unknown as Parameters<typeof JournalForm>[0]['entry']} accounts={accounts ?? []} companyId={companyId} />
      {attachmentsCard}
    </div>
  );
}

