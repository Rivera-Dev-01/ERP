import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOrganization } from '@/server/auth';
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

  const { data: projects } = await supabase
    .from('project')
    .select('id,name')
    .eq('organization_id', organization.id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });

  const projectId = params.project ? String(params.project) : projects?.[0]?.id;

  if (!projectId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">No projects yet. Create a project to view totals.</p>
        </div>
        <Link href="/projects" className={cn(buttonVariants())}>Create Project</Link>
      </div>
    );
  }

  if (!params.project) {
    redirect(`/dashboard?project=${projectId}`);
  }

  const validIds = new Set((projects ?? []).map((p) => p.id));
  if (!validIds.has(String(projectId))) {
    const fallback = projects?.[0]?.id;
    if (fallback) redirect(`/dashboard?project=${fallback}`);
  }

  const projectName = projects?.find((p) => p.id === projectId)?.name ?? projectId;

  const { data: period } = await supabase
    .from('fiscal_period')
    .select('*')
    .eq('organization_id', organization.id)
    .eq('project_id', projectId)
    .eq('status', 'OPEN')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: entries } = await supabase
    .from('journal_entry')
    .select('status, total_debit, total_credit')
    .eq('organization_id', organization.id)
    .eq('project_id', projectId);

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
        <p className="text-sm text-muted-foreground">Project: {projectName}</p>
        {period ? (
          <p className="text-sm text-muted-foreground">
            {period.name} · {formatBusinessDate(period.start_date)} –{' '}
            {formatBusinessDate(period.end_date)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No open fiscal period for this project.</p>
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
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Link href={`/journal/new?project=${projectId}`} className={cn(buttonVariants())}>
          New Journal Entry
        </Link>
        <Link href={`/imports?project=${projectId}`} className={cn(buttonVariants({ variant: 'outline' }))}>
          Import Excel
        </Link>
        <Link href={`/reports/trial-balance?project=${projectId}`} className={cn(buttonVariants({ variant: 'outline' }))}>
          View Trial Balance
        </Link>
      </div>
    </div>
  );
}
