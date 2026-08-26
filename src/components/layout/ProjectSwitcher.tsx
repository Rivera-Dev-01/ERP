'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ProjectOption = { id: string; name: string; client_name?: string | null };

export function ProjectSwitcher({ projects, activeId }: { projects: ProjectOption[]; activeId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (value: string | null) => {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('project', value);
    const qs = params.toString();
    // persist for server default on next load
    try {
      document.cookie = `active_project=${value}; path=/; max-age=31536000`;
    } catch {}
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const activeProject = projects.find((p) => p.id === activeId);
  const displayName = activeProject ? `${activeProject.name}${activeProject.client_name ? ` — ${activeProject.client_name}` : ''}` : undefined;
  // Fallback to first project if activeId not found (e.g., stale URL)
  const effectiveDisplay = displayName ?? (projects[0] ? `${projects[0].name}${projects[0].client_name ? ` — ${projects[0].client_name}` : ''}` : undefined);

  if (!projects.length) return null;

  return (
    <div className="px-2 py-2" data-project-switcher>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">Project</label>
      <Select value={activeId} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select project">{effectiveDisplay ?? ''}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
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
