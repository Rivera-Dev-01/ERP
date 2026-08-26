'use client';
import { useActionState, useEffect, useState } from 'react';
import { closeFiscalPeriod } from '@/server/actions/period-actions';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import Link from 'next/link';

type Checks = { draftCount: number; tbBalanced: boolean | null; companyId: string; start: string; end: string } | null;

export function CloseConfirm({ id, name, checks }: { id: string; name: string; checks?: Checks }) {
  const [open, setOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [state, formAction, pending] = useActionState(closeFiscalPeriod as unknown as (prev: { ok: boolean }, fd: FormData) => Promise<{ ok: boolean; formError?: string }>, { ok: false } as never);

  useEffect(() => {
    const s = state as { ok?: boolean; formError?: string };
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success('Period closed');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      setForce(false);
    }
  }, [state]);

  const hasFailures = checks ? checks.draftCount > 0 || checks.tbBalanced === false : false;
  const canClose = !hasFailures || force;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForce(false); }}>
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm">
            Close
          </Button>
        }
      />
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Close period ‘{name}’?</AlertDialogTitle>
          <AlertDialogDescription>Postings into a closed period will be blocked.</AlertDialogDescription>
        </AlertDialogHeader>
        {checks && (
          <div className="rounded border p-3 space-y-2">
            <p className="text-sm font-medium">Month-end checklist</p>
            <div className="flex items-center justify-between text-sm">
              <span>No Draft entries in period</span>
              <span className="flex items-center gap-2">
                {checks.draftCount === 0 ? <Badge variant="default">Pass</Badge> : <Badge variant="destructive">Fail · {checks.draftCount} drafts</Badge>}
                {checks.draftCount > 0 && <Link href={`/journal?company=${checks.companyId}&status=DRAFT&from=${checks.start}&to=${checks.end}`} className="text-xs underline">View drafts</Link>}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Trial Balance balanced</span>
              {checks.tbBalanced === null ? <Badge variant="outline">—</Badge> : checks.tbBalanced ? <Badge variant="default">Pass</Badge> : <Badge variant="destructive">Fail</Badge>}
            </div>
            {hasFailures && (
              <label className="flex items-center gap-2 text-sm pt-2 border-t">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-4" />
                Force close anyway (audited)
              </label>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            {hasFailures && <input type="hidden" name="force" value={force ? 'true' : 'false'} />}
            <Button type="submit" variant="destructive" disabled={pending || !canClose}>
              {pending ? 'Closing…' : 'Close period'}
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
