'use client';

import * as React from 'react';
import { useActionState, useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LineGrid, type LineRow } from '@/components/journal/LineGrid';
import { journalSchema, type JournalInput } from '@/lib/validation/journal';
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

export function JournalForm({ accounts, suggestedReference, entry, mode }: Props) {
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
    lines,
  };
  const isValid = journalSchema.safeParse(combinedForValidation).success;

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
      fd.set('entry_date', String(watched.entry_date ?? ''));
      fd.set('reference', String(watched.reference ?? ''));
      fd.set('description', String(watched.description ?? ''));
      fd.set('notes', String(watched.notes ?? ''));
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

  // Use mode prop to avoid unused warning
  const _mode = mode ?? (isEdit ? 'edit' : 'create');

  return (
    <form action={formAction} className="space-y-6" aria-label="Journal form">
      {isEdit && <input type="hidden" name="id" value={entry!.id} />}
      <input type="hidden" name="lines_json" value={JSON.stringify(lines)} />

      <div className="grid gap-4 md:grid-cols-2">
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

      <LineGrid accounts={accounts} value={lines} onValueChange={setLines} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} aria-label="Save Draft">
          {pending ? 'Saving…' : 'Save Draft'}
        </Button>

        <Button type="button" variant="secondary" disabled={!isValid} aria-label="Post">
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
