'use client';

import * as React from 'react';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { postJournalEntry } from '@/server/actions/journal-actions';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

type State = { ok: boolean; entryNumber?: string; formError?: string; fieldErrors?: Record<string, string> };

export function PostConfirm({ entryId, entryNumber }: { entryId: string; entryNumber?: string }) {
  const display = entryNumber ?? 'JE-YYYY-XXXX';
  const [open, setOpen] = useState(false);

  const boundAction = async (_prev: State, _formData: FormData): Promise<State> => {
    const res = await postJournalEntry(entryId);
    return res as State;
  };

  const [state, formAction, pending] = useActionState(boundAction, { ok: false } as State);

  useEffect(() => {
    if (state.fieldErrors?.entry_date) {
      toast.error(state.fieldErrors.entry_date);
    } else if (state.formError) {
      toast.error(state.formError);
    } else if (state.ok) {
      toast.success(state.entryNumber ? `Posted ${state.entryNumber}` : 'Entry posted');
      setOpen(false);
    }
  }, [state]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="default">Post</Button>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Post entry {display}?</AlertDialogTitle>
          <AlertDialogDescription>
            Post entry {display}? This cannot be undone. Posted entries cannot be edited or deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <AlertDialogAction type="submit" disabled={pending}>
              {pending ? 'Posting…' : 'Confirm Post'}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
