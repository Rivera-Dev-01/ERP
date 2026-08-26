import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { PeriodTable } from '@/components/periods/PeriodTable';
import { PeriodForm } from '@/components/periods/PeriodForm';
import { buttonVariants } from '@/components/ui/button';

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fiscal Periods</h1>
          <p className="text-sm text-muted-foreground">Company: {companyName} — Manage accounting periods (one OPEN per Company)</p>
        </div>
        <PeriodForm />
      </div>
      <PeriodTable data={periods ?? []} />
    </div>
  );
}
