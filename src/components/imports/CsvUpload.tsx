'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { importAccountsCsv } from '@/server/actions/account-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ErrorPanel } from '@/components/imports/ErrorPanel';
import { toast } from 'sonner';

export function CsvUpload({ projectId }: { projectId?: string }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(
    importAccountsCsv as unknown as (
      prev: { ok: boolean },
      fd: FormData,
    ) => Promise<{ ok: boolean; rowErrors?: unknown; rowCount?: number; formError?: string }>,
    { ok: false } as never,
  );

  useEffect(() => {
    const s = state as {
      ok?: boolean;
      rowCount?: number;
      rowErrors?: Array<{ row: number; code: string; message: string }>;
      formError?: string;
    };
    if (!s) return;
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success(`Imported ${s.rowCount ?? 0} accounts`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [state]);

  const rowErrors =
    (state as { rowErrors?: Array<{ row: number; code: string; message: string }> })?.rowErrors ??
    [];
  const formError = (state as { formError?: string })?.formError;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="sm">
            Import CSV
          </Button>
        }
      />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Chart of Accounts</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {projectId && <input type="hidden" name="project_id" value={projectId} />}
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV/XLSX file</Label>
            <Input ref={fileRef} id="csv-file" name="file" type="file" accept=".csv,.xlsx,.xls" required />
            <p className="text-xs text-muted-foreground">
              Accepted: .csv, .xlsx (.xls). Header must be: Account Code, Account Name, Account Type, Normal Balance, Active
            </p>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Importing…' : 'Upload'}
          </Button>
        </form>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        {rowErrors.length > 0 && <ErrorPanel rows={rowErrors} />}
      </DialogContent>
    </Dialog>
  );
}
