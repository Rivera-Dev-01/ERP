'use client';
import { useActionState, useEffect, useState } from 'react';
import { deactivateAccount } from '@/server/actions/account-actions';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export function DeactivateConfirm({
  accountId,
  disabled,
}: {
  accountId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deactivateAccount as unknown as (
      prev: { ok: boolean; warningCount?: number; formError?: string },
      fd: FormData,
    ) => Promise<{ ok: boolean; warningCount?: number; formError?: string }>,
    { ok: false } as never,
  );

  const warningCount = (state as { warningCount?: number } | null)?.warningCount;
  const hasWarning = typeof warningCount === 'number' && warningCount > 0;

  useEffect(() => {
    const s = state as { ok?: boolean; formError?: string; warningCount?: number };
    if (!s) return;
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success('Account deactivated');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="sm" disabled={disabled}>
            Deactivate
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasWarning ? 'Confirm deactivation' : 'Deactivate account?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasWarning
              ? `This account is used in ${warningCount} journal lines — deactivate anyway? It will be hidden from future entry forms but retained in history and reports.`
              : 'This account will be hidden from future entry forms but retained in history and reports.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="id" value={accountId} />
            <input type="hidden" name="confirmed" value={hasWarning ? 'true' : 'false'} />
            <AlertDialogAction
              render={
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending ? 'Deactivating…' : hasWarning ? 'Deactivate anyway' : 'Deactivate'}
                </Button>
              }
            />
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
