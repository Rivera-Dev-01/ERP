'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CompanySwitcher } from '@/components/layout/CompanySwitcher';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/companies', label: 'Companies' },
  { href: '/settings/periods', label: 'Fiscal Periods' },
  { href: '/accounts', label: 'Chart of Accounts' },
  { href: '/journal', label: 'Journal Entries' },
  { href: '/imports', label: 'Imports' },
  { href: '/reconciliation', label: 'Reconciliation' },
  { href: '/workpapers', label: 'Workpapers' },
  { href: '/reports/trial-balance', label: 'Reports' },
  { href: '/tax-center', label: 'Tax Center' },
  { href: '/activity', label: 'Activity' },
];

const REPORTS_SUBNAV = [
  { href: '/reports/trial-balance', label: 'Trial Balance' },
  { href: '/reports/income-statement', label: 'Income Statement' },
  { href: '/reports/balance-sheet', label: 'Balance Sheet' },
  { href: '/reports/cash-flow', label: 'Cash Flow' },
  { href: '/reports/general-journal', label: 'General Journal' },
  { href: '/reports/general-ledger', label: 'General Ledger' },
];

const SECONDARY_NAV = [
  { href: '/settings', label: 'Settings' },
];

export function Sidebar({
  organizationName,
  companies,
  projects,
}: {
  organizationName: string;
  companies?: Array<{ id: string; name: string; client_name?: string | null }>;
  projects?: Array<{ id: string; name: string; client_name?: string | null }>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const allCompanies = companies ?? projects ?? [];
  const paramCompany = searchParams.get('company') ?? searchParams.get('project');
  const activeCompany = (paramCompany && allCompanies.some((p) => p.id === paramCompany) ? paramCompany : allCompanies[0]?.id) ?? '';

  const withCompany = (href: string) => {
    if (href === '/companies' || href === '/projects' || href === '/settings' || !activeCompany) return href;
    // Preserve company across tabs; keep existing query if already has company
    const params = new URLSearchParams();
    params.set('company', activeCompany);
    return `${href}?${params.toString()}`;
  };

  // Backwards compat alias
  const withProject = withCompany;
  const paramProject = paramCompany;
  const activeProject = activeCompany;
  void withProject;
  void paramProject;
  void activeProject;

  return (
    <aside className="flex w-56 flex-col border-r bg-muted/30 p-4" data-sidebar>
      <p className="mb-6 px-2 text-sm font-semibold">{organizationName}</p>
      <CompanySwitcher companies={allCompanies} activeId={activeCompany} />
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === '/reports/trial-balance'
              ? pathname.startsWith('/reports')
              : pathname.startsWith(item.href);
          if (item.href === '/reports/trial-balance') {
            return (
              <div key="reports-group" className="flex flex-col gap-0.5">
                <Link
                  href={withCompany(item.href)}
                  className={cn(
                    'rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
                    active ? 'bg-muted font-medium' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </Link>
                <div className="ml-4 flex flex-col gap-0.5 border-l pl-2">
                  {REPORTS_SUBNAV.map((sub) => (
                    <Link
                      key={sub.href}
                      href={withCompany(sub.href)}
                      className={cn(
                        'rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted',
                        pathname === sub.href ? 'bg-muted font-medium' : 'text-muted-foreground',
                      )}
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={withCompany(item.href)}
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
