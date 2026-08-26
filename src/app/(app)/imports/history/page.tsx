import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default async function ImportHistoryPage({
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
        <h1 className="text-2xl font-semibold">Import History</h1>
        <p className="text-sm text-muted-foreground">No companies yet.</p>
        <Link href="/companies" className="text-sm underline">Create a company</Link>
      </div>
    );
  }

  if (params.project && !params.company) redirect(`/imports/history?company=${companyId}`);
  if (!params.company) redirect(`/imports/history?company=${companyId}`);

  const validIds = new Set(companies.map((c) => c.id));
  if (!validIds.has(String(companyId))) {
    const fallback = companies[0]?.id;
    if (fallback) redirect(`/imports/history?company=${fallback}`);
  }

  const companyName = companies.find((c) => c.id === companyId)?.name ?? companyId;

  const { data: batches, count } = await supabase
    .from('import_batch')
    .select('id,file_name,import_type,status,row_count,valid_row_count,invalid_row_count,created_at', { count: 'exact' })
    .eq('organization_id', organization.id)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import History</h1>
          <p className="text-sm text-muted-foreground">Company: {companyName} · {total} batches</p>
        </div>
        <Link href={`/imports?company=${companyId}`} className="text-sm underline">Back to Imports</Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Batches</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-2 text-left">File</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-right">Rows</th>
                  <th className="p-2 text-right">Valid</th>
                  <th className="p-2 text-right">Invalid</th>
                  <th className="p-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {(batches ?? []).length ? (
                  (batches ?? []).map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="p-2 truncate max-w-[260px]" title={b.file_name}>{b.file_name}</td>
                      <td className="p-2"><Badge variant="outline">{b.import_type}</Badge></td>
                      <td className="p-2"><Badge variant={b.status === 'IMPORTED' ? 'default' : b.status === 'FAILED' ? 'destructive' : 'secondary'}>{b.status}</Badge></td>
                      <td className="p-2 text-right">{b.row_count}</td>
                      <td className="p-2 text-right">{b.valid_row_count}</td>
                      <td className="p-2 text-right">{b.invalid_row_count}</td>
                      <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">No imports yet for this company.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t p-2 text-xs">
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              {page > 1 ? <Link href={`/imports/history?company=${companyId}&page=${page - 1}`} className="underline">Prev</Link> : <span className="text-muted-foreground">Prev</span>}
              {page < totalPages ? <Link href={`/imports/history?company=${companyId}&page=${page + 1}`} className="underline">Next</Link> : <span className="text-muted-foreground">Next</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
