'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CompanyOption = { id: string; name: string; client_name?: string | null };

export function CompanySwitcher({ companies, activeId }: { companies: CompanyOption[]; activeId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (value: string | null) => {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    // Use company as primary, also set project for backwards compat
    params.set('company', value);
    params.delete('project');
    const qs = params.toString();
    // persist for server default on next load
    try {
      document.cookie = `active_company=${value}; path=/; max-age=31536000`;
      document.cookie = `active_project=${value}; path=/; max-age=31536000`;
    } catch {}
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const activeCompany = companies.find((p) => p.id === activeId);
  const displayName = activeCompany ? `${activeCompany.name}${activeCompany.client_name ? ` — ${activeCompany.client_name}` : ''}` : undefined;
  // Fallback to first company if activeId not found (e.g., stale URL)
  const effectiveDisplay = displayName ?? (companies[0] ? `${companies[0].name}${companies[0].client_name ? ` — ${companies[0].client_name}` : ''}` : undefined);

  if (!companies.length) return null;

  return (
    <div className="px-2 py-2" data-company-switcher data-project-switcher>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">Company</label>
      <Select value={activeId} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select company">{effectiveDisplay ?? ''}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {companies.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {p.client_name ? ` — ${p.client_name}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Backwards compat aliases
export type ProjectOption = CompanyOption;
export const ProjectSwitcher = CompanySwitcher;
export function ProjectSwitcherWrapper(props: { projects: CompanyOption[]; activeId: string }) {
  return CompanySwitcher({ companies: props.projects, activeId: props.activeId });
}
