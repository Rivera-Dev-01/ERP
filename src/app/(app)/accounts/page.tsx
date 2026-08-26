import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { AccountsTable } from '@/components/accounts/AccountsTable';
import { CsvUpload } from '@/components/imports/CsvUpload';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

export default async function AccountsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { organization } = await requireOrganization();
  const params = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const companies = await getActiveCompanies(organization.id);
  // Backwards compat: support ?project= as fallback, redirect to ?company=
  const rawCompany = params.company ?? params.project;
  const companyId = rawCompany ? String(rawCompany) : companies?.[0]?.id;

  if (!companyId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
          <Link href="/companies" className={buttonVariants({ variant: 'default' })}>Create Company</Link>
        </div>
        <div className="p-8 text-center text-muted-foreground">No companies yet. Create a company to manage accounts.</div>
      </div>
    );
  }

  if (params.project && !params.company) {
    redirect(`/accounts?company=${companyId}`);
  }

  if (!params.company) {
    redirect(`/accounts?company=${companyId}`);
  }

  const validIds = new Set((companies ?? []).map((p) => p.id));
  if (!validIds.has(String(companyId))) {
    const fallback = companies?.[0]?.id;
    if (fallback) redirect(`/accounts?company=${fallback}`);
  }

  const companyName = companies?.find((p) => p.id === companyId)?.name ?? companyId;

  const { data: accounts } = await supabase
    .from('account')
    .select('*')
    .eq('organization_id', organization.id)
    .eq('company_id', companyId)
    .order('code');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">Company: {companyName} — Code unique per Company</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/templates/chart-of-accounts.csv"
            download
            className={buttonVariants({ variant: 'outline' })}
          >
            Download template
          </Link>
          <CsvUpload companyId={companyId} />
        </div>
      </div>
      <AccountsTable data={accounts ?? []} />
    </div>
  );
}
