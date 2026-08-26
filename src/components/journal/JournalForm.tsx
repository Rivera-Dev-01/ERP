'use client';

import * as React from 'react';
import { useActionState, useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LineGrid, type LineRow } from '@/components/journal/LineGrid';
import { formatPHP } from '@/lib/format';
import { toDecimal } from '@/lib/money';
import { journalSchema, sumLineAmounts, type JournalInput } from '@/lib/validation/journal';
import {
  deleteJournalEntry,
  duplicateJournalEntry,
  upsertJournalEntry,
} from '@/server/actions/journal-actions';

type AccountOption = { id: string; code: string; name: string };

type EntryData = {
  id: string;
  entry_date: string;
  reference: string;
  description: string;
  notes: string | null;
  entry_type?: string | null;
  status: string;
  lines: Array<{
    account_id: string;
    description: string | null;
    debit: string | number;
    credit: string | number;
    tax_code: string | null;
  }>;
};

type Props = {
  accounts: AccountOption[];
  suggestedReference?: string;
  entry?: EntryData | null;
  mode?: 'create' | 'edit';
  companyId?: string;
  projectId?: string;
};

function toLineRow(l: EntryData['lines'][number]): LineRow {
  return {
    account_id: l.account_id,
    description: l.description ?? '',
    debit: String(l.debit ?? '0'),
    credit: String(l.credit ?? '0'),
    tax_code: l.tax_code ?? '',
  };
}

function blankRow(): LineRow {
  return { account_id: '', description: '', debit: '0', credit: '0', tax_code: '' };
}

export function JournalForm({ accounts, suggestedReference, entry, mode, companyId, projectId }: Props) {
  const effectiveCompanyId = companyId ?? projectId;
  const router = useRouter();
  const isEdit = !!entry?.id;
  const entryStatus = entry?.status ?? 'DRAFT';
  const canMutateDraft = entryStatus === 'DRAFT';

  const initialLines: LineRow[] = React.useMemo(() => {
    if (entry?.lines && entry.lines.length > 0) return entry.lines.map(toLineRow);
    return [blankRow(), blankRow()];
  }, [entry]);

  const [lines, setLines] = useState<LineRow[]>(initialLines);

  // keep lines in sync if entry changes (e.g., navigation)
  const prevEntryId = useRef<string | undefined>(entry?.id);
  useEffect(() => {
    if (prevEntryId.current !== entry?.id) {
      prevEntryId.current = entry?.id;
      if (entry?.lines && entry.lines.length > 0) setLines(entry.lines.map(toLineRow));
      else if (!entry) setLines([blankRow(), blankRow()]);
    }
  }, [entry]);

  const {
    register,
    watch,
    setError,
    formState: { errors },
  } = useForm<JournalInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(journalSchema as any),
    defaultValues: {
      entry_date: entry?.entry_date ?? new Date().toISOString().slice(0, 10),
      reference: entry?.reference ?? '',
      description: entry?.description ?? '',
      notes: entry?.notes ?? '',
      entry_type: (entry?.entry_type as JournalInput['entry_type']) ?? 'STANDARD',
      lines: initialLines as unknown as JournalInput['lines'],
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const watched = watch();
  const combinedForValidation = {
    entry_date: watched.entry_date ?? '',
    reference: watched.reference ?? '',
    description: watched.description ?? '',
    notes: watched.notes ?? '',
    entry_type: (watched as unknown as { entry_type?: string }).entry_type ?? 'STANDARD',
    lines,
  };
  const isValid = journalSchema.safeParse(combinedForValidation).success;

  // Sticky totals — derived from current lines state via shared sumLineAmounts arithmetic
  const totals = React.useMemo(() => {
    try {
      return sumLineAmounts(lines.map((l) => ({ debit: l.debit || '0', credit: l.credit || '0' })));
    } catch {
      return { totalDebit: '0.0000', totalCredit: '0.0000', difference: '0.0000' };
    }
  }, [lines]);

  const isBalancedViaSum = React.useMemo(() => {
    try {
      return toDecimal(totals.difference).isZero();
    } catch {
      return totals.difference === '0.0000';
    }
  }, [totals.difference]);

  const hasPositiveTotal = React.useMemo(() => {
    try {
      return !toDecimal(totals.totalDebit).isZero() || !toDecimal(totals.totalCredit).isZero();
    } catch {
      return totals.totalDebit !== '0.0000' || totals.totalCredit !== '0.0000';
    }
  }, [totals.totalDebit, totals.totalCredit]);

  const canPostViaSum = isBalancedViaSum && hasPositiveTotal && lines.length >= 2;
  const isPostDisabled = !isValid || !canPostViaSum;

  const [state, formAction, pending] = useActionState(upsertJournalEntry, {
    ok: false,
  } as never);

  useEffect(() => {
    if (!state) return;
    const s = state as {
      ok?: boolean;
      entryId?: string;
      fieldErrors?: Record<string, string>;
      formError?: string;
    };
    if (s.fieldErrors) {
      for (const [k, v] of Object.entries(s.fieldErrors)) {
        // journalSchema fields: entry_date, reference, description, notes, lines
        setError(k as keyof JournalInput, { message: v });
      }
    }
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success(isEdit ? 'Journal entry updated' : 'Journal entry created');
      if (s.entryId && !isEdit) router.push(`/journal/${s.entryId}`);
    }
  }, [state, setError, isEdit, router]);

  // Auto-save: debounced 800ms on header + lines when valid and DRAFT
  const autoSaveRef = useRef<number | null>(null);
  const watchedJson = JSON.stringify([
    watched.entry_date,
    watched.reference,
    watched.description,
    watched.notes,
    (watched as unknown as { entry_type?: string }).entry_type,
  ]);
  const linesJson = JSON.stringify(lines);

  useEffect(() => {
    if (!canMutateDraft) return;
    // only auto-save when editing an existing draft or when we have an id? For create, we can still auto-save to create draft silently
    // Do not auto-save if not valid
    if (!isValid) return;
    // debounce 800ms
    if (autoSaveRef.current) window.clearTimeout(autoSaveRef.current);
    autoSaveRef.current = window.setTimeout(async () => {
      const fd = new FormData();
      if (entry?.id) fd.set('id', entry.id);
      if (effectiveCompanyId) fd.set('company_id', effectiveCompanyId);
      fd.set('entry_date', String(watched.entry_date ?? ''));
      fd.set('reference', String(watched.reference ?? ''));
      fd.set('description', String(watched.description ?? ''));
      fd.set('notes', String(watched.notes ?? ''));
      fd.set('entry_type', String((watched as unknown as { entry_type?: string }).entry_type ?? 'STANDARD'));
      fd.set('lines_json', JSON.stringify(lines));
      try {
        // silent call - ignore toast on success, only surface formError if needed?
        await upsertJournalEntry({ ok: false } as never, fd);
      } catch {
        // ignore silent auto-save errors
      }
    }, 800);
    return () => {
      if (autoSaveRef.current) window.clearTimeout(autoSaveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedJson, linesJson, isValid, canMutateDraft, entry?.id]);

  const handleDuplicate = async () => {
    if (!entry?.id) return;
    const res = await duplicateJournalEntry(entry.id);
    if (!res.ok) toast.error(res.formError ?? 'Unable to duplicate');
    else {
      toast.success('Journal entry duplicated');
      if (res.newId) router.push(`/journal/${res.newId}`);
    }
  };

  const handleDelete = async () => {
    if (!entry?.id) return;
    const res = await deleteJournalEntry(entry.id);
    if (!res.ok) toast.error(res.formError ?? 'Unable to delete');
    else {
      toast.success('Journal entry deleted');
      router.push('/journal');
    }
  };

  // Keyboard nav: scoped to journal line inputs only, prevent default form submit on Enter
  const journalGridRef = React.useRef<HTMLDivElement>(null);

  const handleJournalKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      // Scope handler to journal line inputs only
      if (!target.hasAttribute('data-grid-input')) return;

      if (e.key === 'Enter') {
        // prevent default form submit on Enter
        e.preventDefault();
        e.stopPropagation();
        const inputs = Array.from(
          journalGridRef.current?.querySelectorAll<HTMLElement>('[data-grid-input]') ?? [],
        );
        const idx = inputs.indexOf(target);
        if (idx === -1) return;
        if (e.shiftKey) {
          // Shift+Enter goes back
          if (idx > 0) {
            inputs[idx - 1].focus();
          }
          return;
        }
        // Enter without Shift — move focus to next field in order: account -> description -> debit -> credit -> tax_code -> next row account
        if (idx + 1 < inputs.length) {
          inputs[idx + 1].focus();
        } else {
          // at last row last field — create new row via append and focus its account picker
          const next = [...lines, blankRow()];
          setLines(next);
          requestAnimationFrame(() => {
            const newInputs = journalGridRef.current?.querySelectorAll<HTMLElement>('[data-grid-input]');
            if (!newInputs || newInputs.length === 0) return;
            for (let i = newInputs.length - 1; i >= 0; i--) {
              if (newInputs[i].getAttribute('data-col') === 'account') {
                newInputs[i].focus();
                break;
              }
            }
          });
        }
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const inputs = Array.from(
          journalGridRef.current?.querySelectorAll<HTMLElement>('[data-grid-input]') ?? [],
        );
        const idx = inputs.indexOf(target);
        if (idx === -1) return;
        const col = target.getAttribute('data-col');
        if (!col) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'ArrowDown') {
          for (let i = idx + 1; i < inputs.length; i++) {
            if (inputs[i].getAttribute('data-col') === col) {
              inputs[i].focus();
              break;
            }
          }
        } else {
          for (let i = idx - 1; i >= 0; i--) {
            if (inputs[i].getAttribute('data-col') === col) {
              inputs[i].focus();
              break;
            }
          }
        }
      }
    },
    [lines],
  );

  // Use mode prop to avoid unused warning
  const _mode = mode ?? (isEdit ? 'edit' : 'create');

  return (
    <form action={formAction} className="space-y-6" aria-label="Journal form">
      {isEdit && <input type="hidden" name="id" value={entry!.id} />}
      {effectiveCompanyId && <input type="hidden" name="company_id" value={effectiveCompanyId} />}
      <input type="hidden" name="lines_json" value={JSON.stringify(lines)} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="entry_date">Entry date</Label>
          <Input
            id="entry_date"
            type="date"
            {...register('entry_date')}
            name="entry_date"
            aria-label="Entry date"
          />
          {errors.entry_date && (
            <p className="text-sm text-destructive">{errors.entry_date.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="reference">Reference</Label>
          <Input
            id="reference"
            {...register('reference')}
            name="reference"
            placeholder={suggestedReference ?? ''}
            aria-label="Reference"
          />
          {errors.reference && (
            <p className="text-sm text-destructive">{errors.reference.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="entry_type">Entry type</Label>
          <select
            id="entry_type"
            {...register('entry_type')}
            name="entry_type"
            aria-label="Entry type"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            <option value="STANDARD">STANDARD</option>
            <option value="OPENING">OPENING</option>
            <option value="ADJUSTING">ADJUSTING</option>
          </select>
          {errors.entry_type && (
            <p className="text-sm text-destructive">{String(errors.entry_type.message)}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          {...register('description')}
          name="description"
          placeholder="Journal description"
          aria-label="Description"
          rows={3}
          className="flex min-h-[72px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          {...register('notes')}
          name="notes"
          placeholder="Optional notes"
          aria-label="Notes"
          rows={2}
          className="flex min-h-[56px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
      </div>

      {errors.lines && (
        <p className="text-sm text-destructive" role="alert">
          {String(errors.lines.message)}
        </p>
      )}

      <div ref={journalGridRef} onKeyDownCapture={handleJournalKeyDown}>
        <LineGrid accounts={accounts} value={lines} onValueChange={setLines} />
      </div>

      {/* Sticky bottom footer — three columns Total Debit / Total Credit / Difference (formatPHP), Difference 0 => green Balanced badge else destructive */}
      <div
        className="sticky bottom-0 z-10 flex flex-col gap-2 border-t bg-background p-2 sm:grid sm:grid-cols-3 sm:items-center"
        aria-label="Journal totals"
      >
        <div className="flex flex-col" aria-label="Total debit">
          <span className="text-xs text-muted-foreground">Total Debit</span>
          <span className="font-medium" data-testid="total-debit">
            {formatPHP(totals.totalDebit)}
          </span>
        </div>
        <div className="flex flex-col" aria-label="Total credit">
          <span className="text-xs text-muted-foreground">Total Credit</span>
          <span className="font-medium" data-testid="total-credit">
            {formatPHP(totals.totalCredit)}
          </span>
        </div>
        <div className="flex flex-col" aria-label="Difference">
          <span className="text-xs text-muted-foreground">Difference</span>
          <span className="flex items-center gap-2 font-medium" data-testid="difference">
            <span>{formatPHP(totals.difference)}</span>
            {isBalancedViaSum ? (
              <Badge
                variant="outline"
                className="border-green-200 bg-green-50 text-green-700"
                aria-label="Balanced"
              >
                Balanced
              </Badge>
            ) : (
              <Badge variant="destructive" aria-label="Unbalanced">
                Unbalanced {formatPHP(totals.difference)}
              </Badge>
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} aria-label="Save Draft">
          {pending ? 'Saving…' : 'Save Draft'}
        </Button>

        <Button type="button" variant="secondary" disabled={isPostDisabled} aria-label="Post">
          Post
        </Button>

        {isEdit && canMutateDraft && (
          <>
            <Button type="button" variant="outline" onClick={handleDuplicate} aria-label="Duplicate">
              Duplicate
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} aria-label="Delete">
              Delete
            </Button>
          </>
        )}
      </div>

      {/* hidden mode for lint */}
      <span className="hidden" data-mode={_mode} />
    </form>
  );
}
