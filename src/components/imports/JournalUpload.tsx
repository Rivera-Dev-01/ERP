'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { importJournalCsv } from '@/server/actions/import-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

export function JournalUpload({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(
    importJournalCsv as unknown as (prev: { ok: boolean }, fd: FormData) => Promise<{ ok: boolean; rowErrors?: unknown; rowCount?: number; formError?: string }>,
    { ok: false } as never,
  );

  useEffect(() => {
    const s = state as { ok?: boolean; rowCount?: number; validGroupCount?: number; rowErrors?: Array<{ row: number; group: string; message: string }>; formError?: string };
    if (!s) return;
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success(`Imported ${s.validGroupCount ?? s.rowCount ?? 0} journal groups`);
      setOpen(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [state]);

  const rowErrors = (state as { rowErrors?: Array<{ row: number; group: string; message: string }> })?.rowErrors ?? [];
  const formError = (state as { formError?: string })?.formError;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm">Import Journal CSV</Button>} />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Journal Entries</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="journal-file">CSV file</Label>
            <Input ref={fileRef} id="journal-file" name="file" type="file" accept=".csv" required />
            <p className="text-xs text-muted-foreground">Header must be: Entry Group, Entry Date, Reference, Entry Description, Account Code, Line Description, Debit, Credit, Tax Code</p>
          </div>
          <Button type="submit" disabled={pending}>{pending ? 'Importing…' : 'Upload'}</Button>
        </form>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        {rowErrors.length > 0 && (
          <div className="max-h-64 overflow-auto rounded border p-2 text-xs">
            {rowErrors.map((e, i) => (
              <div key={i}>Row {e.row} (Group {e.group}): {e.message}</div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
