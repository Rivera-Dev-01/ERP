'use client';
import { useActionState, useEffect, useState } from 'react';
import { reopenFiscalPeriod } from '@/server/actions/period-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { toast } from 'sonner';

export function ReopenDialog({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [state, formAction, pending] = useActionState(reopenFiscalPeriod as unknown as (prev: { ok: boolean }, fd: FormData) => Promise<{ ok: boolean; fieldErrors?: Record<string, string>; formError?: string }>, { ok: false } as never);

  useEffect(() => {
    const s = state as { ok?: boolean; fieldErrors?: Record<string, string>; formError?: string };
    if (!s) return;
    if (s.fieldErrors?.reason) toast.error(s.fieldErrors.reason);
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success('Period reopened');
      setOpen(false);
      setReason('');
    }
  }, [state]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm">Reopen</Button>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reopen period ‘{name}’?</AlertDialogTitle>
          <AlertDialogDescription>Posting will be allowed again in this period. A reason is required and will be recorded in the audit log.</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <div className="space-y-2">
            <Label htmlFor={`reopen-reason-${id}`}>Reason (5–500 chars)</Label>
            <textarea
              id={`reopen-reason-${id}`}
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="e.g., Correction for July adjusting entry"
              required
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="submit" disabled={pending || reason.trim().length < 5}>
              {pending ? 'Reopening…' : 'Reopen period'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
