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
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  if (!projects.length) return null;

  return (
    <div className="px-2 py-2" data-project-switcher>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">Project</label>
      <Select value={activeId} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select project" />
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
