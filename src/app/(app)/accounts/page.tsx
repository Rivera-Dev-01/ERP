import { redirect } from 'next/navigation';
import { requireOrganization, getActiveProjects } from '@/server/auth';
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
  const projects = await getActiveProjects(organization.id);
  const projectId = params.project ? String(params.project) : projects?.[0]?.id;

  if (!projectId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
          <Link href="/projects" className={buttonVariants({ variant: 'default' })}>Create Project</Link>
        </div>
        <div className="p-8 text-center text-muted-foreground">No projects yet. Create a project to manage accounts.</div>
      </div>
    );
  }

  if (!params.project) {
    redirect(`/accounts?project=${projectId}`);
  }

  const validIds = new Set((projects ?? []).map((p) => p.id));
  if (!validIds.has(String(projectId))) {
    const fallback = projects?.[0]?.id;
    if (fallback) redirect(`/accounts?project=${fallback}`);
  }

  const projectName = projects?.find((p) => p.id === projectId)?.name ?? projectId;

  const { data: accounts } = await supabase
    .from('account')
    .select('*')
    .eq('organization_id', organization.id)
    .eq('project_id', projectId)
    .order('code');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">Project: {projectName} — Code unique per Project</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/templates/chart-of-accounts.csv"
            download
            className={buttonVariants({ variant: 'outline' })}
          >
            Download template
          </Link>
          <CsvUpload projectId={projectId} />
        </div>
      </div>
      <AccountsTable data={accounts ?? []} />
    </div>
  );
}
