import { redirect } from 'next/navigation';
import { requireOrganization, getActiveProjects } from '@/server/auth';
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
  const projects = await getActiveProjects(organization.id);
  const projectId = params.project ? String(params.project) : projects?.[0]?.id ?? '';
  if (projectId && !params.project) {
    redirect(`/imports?project=${projectId}`);
  }
  if (projectId && projects && !projects.some((p) => p.id === projectId)) {
    const fallback = projects?.[0]?.id;
    if (fallback) redirect(`/imports?project=${fallback}`);
  }
  const projectName = projects?.find((p) => p.id === projectId)?.name ?? projectId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Imports</h1>
        <p className="text-sm text-muted-foreground">Project: {projectName || '—'} — imports are per Project. JE stays per Organization.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Chart of Accounts</h2>
          <p className="text-sm text-muted-foreground">Import accounts via CSV. Code unique per Project.</p>
          {projectId ? <CsvUpload projectId={projectId} /> : <p className="text-sm text-muted-foreground">Create a project first.</p>}
          <Link href="/templates/chart-of-accounts.csv" download className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Download template
          </Link>
        </div>
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Journal Entries</h2>
          <p className="text-sm text-muted-foreground">Import Entry Groups as Drafts. Must be balanced per Group, open period, active account in this Project.</p>
          {projectId ? <JournalUpload projectId={projectId} /> : <p className="text-sm text-muted-foreground">Create a project first.</p>}
        </div>
      </div>
    </div>
  );
}
