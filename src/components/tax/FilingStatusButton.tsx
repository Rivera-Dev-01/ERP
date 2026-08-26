'use client';
import { useActionState, useEffect } from 'react';
import { toggleFilingStatus } from '@/server/actions/filing-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export function FilingStatusButton({ companyId, form, periodLabel, dueDate, current }: { companyId: string; form: string; periodLabel: string; dueDate: string; current: string }) {
  const [state, formAction, pending] = useActionState(toggleFilingStatus as unknown as (p: { ok: boolean }, fd: FormData) => Promise<{ ok: boolean; formError?: string }>, { ok: false } as never);
  useEffect(() => {
    const s = state as { ok?: boolean; formError?: string };
    if (s.formError) toast.error(s.formError);
    if (s.ok) toast.success(current === 'FILED' ? 'Marked not started' : 'Marked filed');
  }, [state, current]);
  const isFiled = current === 'FILED';
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="form" value={form} />
      <input type="hidden" name="period_label" value={periodLabel} />
      <input type="hidden" name="due_date" value={dueDate} />
      <input type="hidden" name="current_status" value={current} />
      <Badge variant={isFiled ? 'default' : 'secondary'}>{current}</Badge>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? '…' : isFiled ? 'Unfile' : 'File'}</Button>
    </form>
  );
}
