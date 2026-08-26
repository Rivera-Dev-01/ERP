import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { UserMenu } from '@/components/layout/user-menu';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { organization, profile } = await requireOrganization();
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('project')
    .select('id,name,client_name')
    .eq('organization_id', organization.id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });

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
