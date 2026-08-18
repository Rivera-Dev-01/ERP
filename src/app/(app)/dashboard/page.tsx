import Link from 'next/link';
import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { add, toDecimal } from '@/lib/money';
import { formatBusinessDate, formatPHP } from '@/lib/format';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default async function DashboardPage() {
  const { organization } = await requireOrganization();
  const supabase = await createClient();

  const { data: period } = await supabase
    .from('fiscal_period')
    .select('*')
    .eq('organization_id', organization.id)
    .eq('status', 'OPEN')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: entries } = await supabase
    .from('journal_entry')
    .select('status, total_debit, total_credit')
    .eq('organization_id', organization.id);

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
        {period ? (
          <p className="text-sm text-muted-foreground">
            {period.name} · {formatBusinessDate(period.start_date)} –{' '}
            {formatBusinessDate(period.end_date)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No open fiscal period.</p>
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
        <Link href="/journal/new" className={cn(buttonVariants())}>
          New Journal Entry
        </Link>
        <Link href="/imports" className={cn(buttonVariants({ variant: 'outline' }))}>
          Import Excel
        </Link>
        <Link href="/reports/trial-balance" className={cn(buttonVariants({ variant: 'outline' }))}>
          View Trial Balance
        </Link>
      </div>
    </div>
  );
}
