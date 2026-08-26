import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { CsvUpload } from '@/components/imports/CsvUpload';
import { JournalUpload } from '@/components/imports/JournalUpload';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default async function ImportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { organization } = await requireOrganization();
  const params = searchParams ? await searchParams : {};
  const companies = await getActiveCompanies(organization.id);
  const rawCompany = params.company ?? params.project;
  const companyId = rawCompany ? String(rawCompany) : companies?.[0]?.id ?? '';
  if (params.project && !params.company && companyId) {
    redirect(`/imports?company=${companyId}`);
  }
  if (companyId && !params.company) {
    redirect(`/imports?company=${companyId}`);
  }
  if (companyId && companies && !companies.some((p) => p.id === companyId)) {
    const fallback = companies?.[0]?.id;
    if (fallback) redirect(`/imports?company=${fallback}`);
  }
  const companyName = companies?.find((p) => p.id === companyId)?.name ?? companyId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Imports</h1>
        <p className="text-sm text-muted-foreground">Company: {companyName || '—'} — imports are per Company. JE stays per Organization.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Chart of Accounts</h2>
          <p className="text-sm text-muted-foreground">Import accounts via CSV. Code unique per Company.</p>
          {companyId ? <CsvUpload companyId={companyId} /> : <p className="text-sm text-muted-foreground">Create a company first.</p>}
          <Link href="/templates/chart-of-accounts.csv" download className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Download template
          </Link>
        </div>
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Journal Entries</h2>
          <p className="text-sm text-muted-foreground">Import Entry Groups as Drafts. Must be balanced per Group, open period, active account in this Company.</p>
          {companyId ? <JournalUpload companyId={companyId} /> : <p className="text-sm text-muted-foreground">Create a company first.</p>}
        </div>
      </div>
    </div>
  );
}
