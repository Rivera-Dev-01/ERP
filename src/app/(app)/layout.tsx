import { requireOrganization, getActiveProjects } from '@/server/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { UserMenu } from '@/components/layout/user-menu';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { organization, profile } = await requireOrganization();
  // Reuse React.cache — page-level project fetches dedupe to 0 extra DB round trips per request
  const projects = await getActiveProjects(organization.id);

  return (
    <div className="flex min-h-screen">
      <Sidebar organizationName={organization.name} projects={projects ?? []} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <p className="text-sm text-muted-foreground">{organization.legal_name}</p>
          <UserMenu userName={profile.name} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
