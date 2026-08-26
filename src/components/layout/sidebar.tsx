'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ProjectSwitcher } from '@/components/layout/ProjectSwitcher';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/journal', label: 'Journal' },
  { href: '/imports', label: 'Imports' },
  { href: '/reports/trial-balance', label: 'Reports' },
];

const SECONDARY_NAV = [
  { href: '/projects', label: 'Projects' },
  { href: '/settings', label: 'Settings' },
];

export function Sidebar({
  organizationName,
  projects,
}: {
  organizationName: string;
  projects: Array<{ id: string; name: string; client_name?: string | null }>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramProject = searchParams.get('project');
  const activeProject = (paramProject && projects.some((p) => p.id === paramProject) ? paramProject : projects[0]?.id) ?? '';

  const withProject = (href: string) => {
    if (href === '/projects' || href === '/settings' || !activeProject) return href;
    // Preserve project across tabs; keep existing query if already has project
    const params = new URLSearchParams();
    params.set('project', activeProject);
    return `${href}?${params.toString()}`;
  };

  return (
    <aside className="flex w-56 flex-col border-r bg-muted/30 p-4" data-sidebar>
      <p className="mb-6 px-2 text-sm font-semibold">{organizationName}</p>
      <ProjectSwitcher projects={projects} activeId={activeProject} />
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === '/reports/trial-balance'
              ? pathname.startsWith('/reports')
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={withProject(item.href)}
              className={cn(
                'rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
                active ? 'bg-muted font-medium' : 'text-muted-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t pt-4">
        {SECONDARY_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
                active ? 'bg-muted font-medium' : 'text-muted-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
