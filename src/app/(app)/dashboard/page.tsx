import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { add, toDecimal } from '@/lib/money';
import { formatBusinessDate, formatPHP } from '@/lib/format';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getIncomeStatement } from '@/server/reports/income-statement';

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

  // S7 enrichment widgets — fetched in parallel (cash, NI, recent, imports)
  const cashAccountsPromise = supabase.from('account').select('id').eq('company_id', companyId).eq('is_cash', true).eq('is_active', true);
  const recentPromise = supabase
    .from('journal_entry')
    .select('id,reference,entry_date,total_debit,status,posted_at,entry_number')
    .eq('company_id', companyId)
    .eq('status', 'POSTED')
    .order('posted_at', { ascending: false })
    .limit(5);
  const importPromise = supabase
    .from('import_batch')
    .select('id,file_name,import_type,status,row_count,created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(3);

  const [cashAccountsRes, recentRes, importRes] = await Promise.all([
    cashAccountsPromise,
    recentPromise,
    importPromise,
  ]);

  const cashAccountIds = (cashAccountsRes.data ?? []).map((a: { id: string }) => a.id);
  let cashBalance = toDecimal('0');
  if (cashAccountIds.length && period) {
    // Sum ending balance for is_cash ASSET accounts as-of period end (debits-credits)
    const { data: cashLines } = await supabase
      .from('journal_line')
      .select('debit,credit,account_id,journal_entry!inner(entry_date,status,company_id)')
      .eq('journal_entry.company_id', companyId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .lte('journal_entry.entry_date', period.end_date)
      .in('account_id', cashAccountIds);
    // For ASSET DEBIT normal, cash = debits - credits
    let d = toDecimal('0');
    let c = toDecimal('0');
    for (const l of (cashLines as unknown as Array<{ debit: string; credit: string }> ) ?? []) {
      d = add(d, l.debit);
      c = add(c, l.credit);
    }
    cashBalance = toDecimal(d.toString()).minus(toDecimal(c.toString()));
  } else if (cashAccountIds.length && !period) {
    // No period — sum all
    const { data: cashLines } = await supabase
      .from('journal_line')
      .select('debit,credit,journal_entry!inner(status,company_id)')
      .eq('journal_entry.company_id', companyId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .in('account_id', cashAccountIds);
    let d = toDecimal('0');
    let c = toDecimal('0');
    for (const l of (cashLines as unknown as Array<{ debit: string; credit: string }> ) ?? []) {
      d = add(d, l.debit);
      c = add(c, l.credit);
    }
    cashBalance = toDecimal(d.toString()).minus(toDecimal(c.toString()));
  }

  let netIncome: string | null = null;
  if (period) {
    try {
      const inc = await getIncomeStatement({
        organizationId: organization.id,
        companyId,
        from: period.start_date,
        to: period.end_date,
      });
      netIncome = inc.net;
    } catch {
      netIncome = null;
    }
  }

  const recentPosted = recentRes.data ?? [];
  const recentImports = importRes.data ?? [];

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatPHP(cashBalance.toNumber())}</p>
            <p className="text-xs text-muted-foreground mt-1">{cashAccountIds.length ? `${cashAccountIds.length} cash accounts` : 'Mark accounts as Cash in Chart of Accounts'}</p>
            <Link href={`/accounts?company=${companyId}`} className="text-xs underline mt-1 inline-block">Manage accounts</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Net income</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{netIncome ? formatPHP(netIncome) : '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">{period ? `for ${period.name}` : 'No period'}</p>
            <Link href={`/reports/income-statement?company=${companyId}`} className="text-xs underline mt-1 inline-block">View Income Statement</Link>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Recently posted</CardTitle>
          </CardHeader>
          <CardContent>
            {recentPosted.length ? (
              <ul className="space-y-1 text-sm">
                {recentPosted.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <Link href={`/journal/${r.id}?company=${companyId}`} className="underline truncate">{r.reference ?? r.id.slice(0,8)}</Link>
                    <span className="text-muted-foreground whitespace-nowrap">{formatBusinessDate(r.entry_date)} · {formatPHP(r.total_debit)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No posted entries yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Recent imports</CardTitle>
        </CardHeader>
        <CardContent>
          {recentImports.length ? (
            <ul className="space-y-1 text-sm">
              {recentImports.map((im) => (
                <li key={im.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{im.file_name} <Badge variant="outline" className="ml-1">{im.import_type}</Badge></span>
                  <span className="flex items-center gap-2">
                    <Badge variant={im.status === 'IMPORTED' ? 'default' : im.status === 'FAILED' ? 'destructive' : 'secondary'}>{im.status}</Badge>
                    <span className="text-muted-foreground whitespace-nowrap">{new Date(im.created_at).toLocaleDateString('en-PH')}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          )}
          <Link href={`/imports/history?company=${companyId}`} className="text-xs underline mt-2 inline-block">View import history →</Link>
        </CardContent>
      </Card>

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
