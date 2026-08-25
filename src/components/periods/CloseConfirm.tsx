'use client';
import { useActionState, useEffect, useState } from 'react';
import { closeFiscalPeriod } from '@/server/actions/period-actions';
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

export function CloseConfirm({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(closeFiscalPeriod, { ok: false } as never);

  useEffect(() => {
    const s = state as { ok?: boolean; formError?: string };
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success('Period closed');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm">
            Close
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close period &apos;{name}&apos;?</AlertDialogTitle>
          <AlertDialogDescription>
            Postings into a closed period will be blocked.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <AlertDialogAction
              render={<Button type="submit" variant="destructive" disabled={pending} />}
            >
              {pending ? 'Closing…' : 'Close period'}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
