'use client';

import * as React from 'react';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { reverseJournalEntry } from '@/server/actions/journal-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LineGrid, type LineRow } from '@/components/journal/LineGrid';

type ReverseDialogProps = {
  entryId: string;
  entryNumber?: string;
  lines: Array<{
    account_id: string;
    description: string | null;
    debit: number | string;
    credit: number | string;
    tax_code: string | null;
  }>;
  accounts?: Array<{ id: string; code: string; name: string }>;
};

type State = { ok: boolean; newId?: string; formError?: string };

export function ReverseDialog({ entryId, entryNumber, lines, accounts = [] }: ReverseDialogProps) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const placeholder = `Reversal of ${entryNumber ?? 'JE-YYYY-XXXX'}`;

  const swappedLines: LineRow[] = React.useMemo(
    () =>
      lines.map((l) => ({
        account_id: l.account_id,
        description: l.description ?? '',
        debit: String(l.credit ?? '0'),
        credit: String(l.debit ?? '0'),
        tax_code: l.tax_code ?? '',
      })),
    [lines],
  );

  const boundAction = async (_prev: State, formData: FormData): Promise<State> => {
    const reversalDate = String(formData.get('reversal_date') ?? '');
    const descRaw = String(formData.get('description') ?? '');
    const description = descRaw.trim() ? descRaw.trim() : undefined;
    const res = await reverseJournalEntry(entryId, reversalDate, description);
    return res as State;
  };

  const [state, formAction, pending] = useActionState(boundAction, { ok: false } as State);

  useEffect(() => {
    if (state.formError) {
      toast.error(state.formError);
    } else if (state.ok) {
      toast.success(state.newId ? 'Entry reversed' : 'Entry reversed');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Reverse</Button>} />
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reverse entry {entryNumber ?? ''}</DialogTitle>
          <DialogDescription>Select a reversal date in an open period. Swapped lines are previewed below.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reversal_date">Reversal date</Label>
            <Input id="reversal_date" name="reversal_date" type="date" defaultValue={today} required aria-label="Reversal date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <textarea
              id="description"
              name="description"
              placeholder={placeholder}
              rows={2}
              aria-label="Reversal description"
              className="flex min-h-[56px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="space-y-2">
            <Label>Preview (swapped debit ↔ credit)</Label>
            <LineGrid accounts={accounts} value={swappedLines} readOnly />
          </div>

          {state.formError ? <p className="text-sm text-destructive">{state.formError}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} aria-label="Confirm reversal">
              {pending ? 'Reversing…' : 'Confirm Reverse'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
