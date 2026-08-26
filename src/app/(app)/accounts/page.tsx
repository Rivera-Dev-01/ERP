import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { seedDemoAccountsIfEmpty } from '@/server/actions/account-actions';
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
  const { data: projects } = await supabase
    .from('project')
    .select('id')
    .eq('organization_id', organization.id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });
  const projectId = params.project ? String(params.project) : projects?.[0]?.id;
  if (projectId) await seedDemoAccountsIfEmpty(projectId);
  const accountQuery = supabase.from('account').select('*').eq('organization_id', organization.id);
  const { data: accounts } = await (projectId ? accountQuery.eq('project_id', projectId) : accountQuery).order('code');
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/templates/chart-of-accounts.csv"
            download
            className={buttonVariants({ variant: 'outline' })}
          >
            Download template
          </Link>
          {projectId ? <CsvUpload projectId={projectId} /> : null}
        </div>
      </div>
      <AccountsTable data={accounts ?? []} />
    </div>
  );
}
