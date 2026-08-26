import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { add, toDecimal } from '@/lib/money';
import { formatBusinessDate, formatPHP } from '@/lib/format';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default async function DashboardPage({
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

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">No companies yet. Create a company to view totals.</p>
        </div>
        <Link href="/companies" className={cn(buttonVariants())}>Create Company</Link>
      </div>
    );
  }

  if (params.project && !params.company) {
    redirect(`/dashboard?company=${companyId}`);
  }

  if (!params.company) {
    redirect(`/dashboard?company=${companyId}`);
  }

  const validIds = new Set((companies ?? []).map((p) => p.id));
  if (!validIds.has(String(companyId))) {
    const fallback = companies?.[0]?.id;
    if (fallback) redirect(`/dashboard?company=${fallback}`);
  }

  const companyName = companies?.find((p) => p.id === companyId)?.name ?? companyId;

  // Period-scoped totals: fetch open period first, then scope entries to its date range
  const { data: period } = await supabase
    .from('fiscal_period')
    .select('*')
    .eq('organization_id', organization.id)
    .eq('company_id', companyId)
    .eq('status', 'OPEN')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  let entriesQuery = supabase
    .from('journal_entry')
    .select('status, total_debit, total_credit')
    .eq('organization_id', organization.id)
    .eq('company_id', companyId)
    .limit(200);

  if (period) {
    entriesQuery = entriesQuery
      .gte('entry_date', period.start_date)
      .lte('entry_date', period.end_date);
  }

  const { data: entries } = await entriesQuery;

  const draftCount = entries?.filter((e) => e.status === 'DRAFT').length ?? 0;
  const postedEntries = entries?.filter((e) => e.status === 'POSTED') ?? [];
  const postedCount = postedEntries.length;
  const totalDebit =
    postedEntries.reduce((sum, e) => add(sum, e.total_debit), toDecimal('0')) ?? toDecimal('0');
  const totalCredit =
    postedEntries.reduce((sum, e) => add(sum, e.total_credit), toDecimal('0')) ?? toDecimal('0');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Company: {companyName}</p>
        {period ? (
          <p className="text-sm text-muted-foreground">
            {period.name} · {formatBusinessDate(period.start_date)} –{' '}
            {formatBusinessDate(period.end_date)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No open fiscal period for this company.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Draft entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{draftCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {period ? `for ${period.name}` : 'No open fiscal period'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Posted entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{postedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {period ? `for ${period.name}` : 'No open fiscal period'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total debits (posted)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatPHP(totalDebit.toNumber())}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {period ? `for ${period.name}` : 'No open fiscal period'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total credits (posted)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatPHP(totalCredit.toNumber())}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {period ? `for ${period.name}` : 'No open fiscal period'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Link href={`/journal/new?company=${companyId}`} className={cn(buttonVariants())}>
          New Journal Entry
        </Link>
        <Link href={`/imports?company=${companyId}`} className={cn(buttonVariants({ variant: 'outline' }))}>
          Import Excel
        </Link>
        <Link href={`/reports/trial-balance?company=${companyId}`} className={cn(buttonVariants({ variant: 'outline' }))}>
          View Trial Balance
        </Link>
      </div>
    </div>
  );
}
