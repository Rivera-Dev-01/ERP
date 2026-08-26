import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOrganization, getActiveProjects } from '@/server/auth';
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

  const projects = await getActiveProjects(organization.id);

  const projectId = params.project ? String(params.project) : projects?.[0]?.id;

  if (!projectId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Fiscal Periods</h1>
            <p className="text-sm text-muted-foreground">No projects yet. Create a project to manage periods.</p>
          </div>
          <Link href="/projects" className={buttonVariants({ variant: 'default' })}>Create Project</Link>
        </div>
      </div>
    );
  }

  if (!params.project) {
    redirect(`/settings/periods?project=${projectId}`);
  }

  const validIds = new Set((projects ?? []).map((p) => p.id));
  if (!validIds.has(String(projectId))) {
    const fallback = projects?.[0]?.id;
    if (fallback) redirect(`/settings/periods?project=${fallback}`);
  }

  const projectName = projects?.find((p) => p.id === projectId)?.name ?? projectId;

  const { data: periods } = await supabase
    .from('fiscal_period')
    .select('*')
    .eq('organization_id', organization.id)
    .eq('project_id', projectId)
    .order('start_date', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fiscal Periods</h1>
          <p className="text-sm text-muted-foreground">Project: {projectName} — Manage accounting periods (one OPEN per Project)</p>
        </div>
        <PeriodForm />
      </div>
      <PeriodTable data={periods ?? []} />
    </div>
  );
}
