import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { formatBusinessDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default async function ActivityPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { organization } = await requireOrganization();
  const params = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const companies = await getActiveCompanies(organization.id);
  const rawCompany = params.company ?? params.project;
  const companyId = rawCompany ? String(rawCompany) : companies?.[0]?.id;
  const page = Math.max(1, parseInt(String(params.page ?? '1'), 10) || 1);
  const pageSize = 50;

  if (!companyId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground">No companies yet. Create a company to view activity.</p>
        <Link href="/companies" className="text-sm underline">Go to Companies</Link>
      </div>
    );
  }

  if (params.project && !params.company) {
    redirect(`/activity?company=${companyId}`);
  }

  if (!params.company) {
    redirect(`/activity?company=${companyId}`);
  }

  const validIds = new Set(companies.map((p) => p.id));
  if (!validIds.has(String(companyId))) {
    const fallback = companies[0]?.id;
    if (fallback) redirect(`/activity?company=${fallback}`);
  }

  const companyName = companies.find((p) => p.id === companyId)?.name ?? companyId;

  // Fetch audit events per company, most recent first, paginated
  const { data: events, count } = await supabase
    .from('audit_event')
    .select('id,action,entity_type,entity_id,metadata,created_at,user_id,company_id', { count: 'exact' })
    .eq('organization_id', organization.id)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  // Fetch user names for display (profile)
  const userIds = [...new Set((events ?? []).map((e) => e.user_id))];
  let userMap = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await supabase.from('profile').select('id,name').in('id', userIds);
    userMap = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground">Company: {companyName} — recent posting, reversal, and import activity</p>
        <p className="text-xs text-muted-foreground">Total events: {total} · Page {page} of {totalPages}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent events</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Time</th>
                  <th className="p-2 text-left">Action</th>
                  <th className="p-2 text-left">Entity</th>
                  <th className="p-2 text-left">User</th>
                  <th className="p-2 text-left">Details</th>
                </tr>
              </thead>
              <tbody>
                {(events ?? []).length ? (
                  (events ?? []).map((e) => {
                    const meta = e.metadata as Record<string, unknown> | null;
                    const entryNumber = meta && typeof meta.entry_number === 'string' ? meta.entry_number : meta && typeof meta.entry_number === 'number' ? String(meta.entry_number) : null;
                    const totalDebit = meta && (meta.total_debit ?? meta.totalDebit) ? String(meta.total_debit ?? meta.totalDebit) : null;
                    return (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
                        <td className="p-2"><Badge variant={e.action === 'POST' ? 'default' : e.action === 'REVERSED' ? 'destructive' : 'secondary'}>{e.action}</Badge></td>
                        <td className="p-2">
                          <span className="font-mono text-xs">{e.entity_type}</span>
                          {entryNumber ? <span className="ml-1 text-xs text-muted-foreground">{entryNumber}</span> : null}
                          <div className="text-xs text-muted-foreground truncate max-w-[160px]" title={e.entity_id}>{e.entity_id.slice(0,8)}</div>
                        </td>
                        <td className="p-2 text-xs">{userMap.get(e.user_id) ?? e.user_id.slice(0,8)}</td>
                        <td className="p-2 text-xs">
                          {meta ? (
                            <span className="line-clamp-2 max-w-[320px]" title={JSON.stringify(meta)}>
                              {totalDebit ? `debit ${totalDebit}` : ''} {meta.line_count ? `· ${String(meta.line_count)} lines` : ''} {meta.reference ? `· ${String(meta.reference)}` : ''}
                              {!totalDebit && !meta.line_count ? JSON.stringify(meta).slice(0,80) : ''}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">No activity yet for this company. Post a journal entry to see it here.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t p-2 text-xs">
            <span className="text-muted-foreground">{total} events</span>
            <div className="flex gap-2">
              {page > 1 ? <Link href={`/activity?company=${companyId}&page=${page-1}`} className="underline">Prev</Link> : <span className="text-muted-foreground">Prev</span>}
              {page < totalPages ? <Link href={`/activity?company=${companyId}&page=${page+1}`} className="underline">Next</Link> : <span className="text-muted-foreground">Next</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
