import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { PeriodTable } from '@/components/periods/PeriodTable';
import { PeriodForm } from '@/components/periods/PeriodForm';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getTrialBalance } from '@/server/reports/trial-balance';

export default async function PeriodsPage({
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Fiscal Periods</h1>
            <p className="text-sm text-muted-foreground">No companies yet. Create a company to manage periods.</p>
          </div>
          <Link href="/companies" className={buttonVariants({ variant: 'default' })}>Create Company</Link>
        </div>
      </div>
    );
  }

  if (params.project && !params.company) {
    redirect(`/settings/periods?company=${companyId}`);
  }

  if (!params.company) {
    redirect(`/settings/periods?company=${companyId}`);
  }

  const validIds = new Set((companies ?? []).map((p) => p.id));
  if (!validIds.has(String(companyId))) {
    const fallback = companies?.[0]?.id;
    if (fallback) redirect(`/settings/periods?company=${fallback}`);
  }

  const companyName = companies?.find((p) => p.id === companyId)?.name ?? companyId;

  const { data: periods } = await supabase
    .from('fiscal_period')
    .select('*')
    .eq('organization_id', organization.id)
    .eq('company_id', companyId)
    .order('start_date', { ascending: false });

  const openPeriods = (periods ?? []).filter((p) => p.status === 'OPEN');
  // Parallel checklist per OPEN period: draft count + TB balanced
  const checkResults = await Promise.all(
    openPeriods.map(async (p) => {
      const [{ count }, tbRes] = await Promise.all([
        supabase
          .from('journal_entry')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'DRAFT')
          .gte('entry_date', p.start_date)
          .lte('entry_date', p.end_date),
        (async () => {
          try {
            const tb = await getTrialBalance({ organizationId: organization.id, companyId, from: p.start_date, to: p.end_date });
            return tb.isBalanced;
          } catch {
            return null;
          }
        })(),
      ]);
      return { id: p.id, name: p.name, start: p.start_date, end: p.end_date, companyId, draftCount: count ?? 0, tbBalanced: tbRes as boolean | null };
    }),
  );
  const checkMap = Object.fromEntries(checkResults.map((r) => [r.id, r])) as Record<string, { draftCount: number; tbBalanced: boolean | null; companyId: string; start: string; end: string; name: string }>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fiscal Periods</h1>
          <p className="text-sm text-muted-foreground">Company: {companyName} — Manage accounting periods (one OPEN per Company)</p>
        </div>
        <PeriodForm />
      </div>

      {openPeriods.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Month-end checklist</h2>
          {checkResults.map((ch) => (
            <Card key={ch.id}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">{ch.name} · {ch.start} – {ch.end}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-2">
                  Drafts in period: <Badge variant={ch.draftCount === 0 ? 'default' : 'destructive'}>{ch.draftCount}</Badge>
                  {ch.draftCount > 0 && <Link href={`/journal?company=${companyId}&status=DRAFT&from=${ch.start}&to=${ch.end}`} className="text-xs underline">View drafts</Link>}
                </span>
                <span className="flex items-center gap-2">
                  Trial Balance: {ch.tbBalanced === null ? <Badge variant="outline">—</Badge> : ch.tbBalanced ? <Badge variant="default">Balanced</Badge> : <Badge variant="destructive">Not Balanced</Badge>}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PeriodTable data={periods ?? []} checks={checkMap} />
    </div>
  );
}
