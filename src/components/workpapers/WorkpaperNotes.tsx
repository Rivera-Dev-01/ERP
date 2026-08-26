'use client';
import { useActionState, useEffect, useState } from 'react';
import { upsertWorkpaperNote } from '@/server/actions/workpaper-actions';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function WorkpaperNotes({ companyId, scheduleKey, periodEnd, initial }: { companyId: string; scheduleKey: string; periodEnd: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [state, formAction, pending] = useActionState(upsertWorkpaperNote as unknown as (p: { ok: boolean }, fd: FormData) => Promise<{ ok: boolean; formError?: string }>, { ok: false } as never);
  useEffect(() => {
    const s = state as { ok?: boolean; formError?: string };
    if (s.formError) toast.error(s.formError);
    if (s.ok) toast.success('Notes saved');
  }, [state]);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="schedule_key" value={scheduleKey} />
      <input type="hidden" name="period_end" value={periodEnd} />
      <textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Adjusting entries, assumptions, references…" className="w-full rounded border p-2 text-sm" />
      <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save notes'}</Button>
    </form>
  );
}
