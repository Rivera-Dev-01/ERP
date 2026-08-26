'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { importJournalCsv } from '@/server/actions/import-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Preview = { headers: string[]; rows: Array<Record<string, string>>; rowCount: number; totalDebit: string | null; totalCredit: string | null } | null;

export function JournalUpload({ companyId, projectId }: { companyId?: string; projectId?: string }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
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
      setPreview(null);
      setPreviewError(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [state]);

  const rowErrors = (state as { rowErrors?: Array<{ row: number; group: string; message: string }> })?.rowErrors ?? [];
  const formError = (state as { formError?: string })?.formError;

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setPreview(null);
    setPreviewError(null);
    if (!file) return;
    setPreviewLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/preview', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Preview failed');
      setPreview({ headers: json.headers, rows: json.rows, rowCount: json.rowCount, totalDebit: json.totalDebit, totalCredit: json.totalCredit });
    } catch (err) {
      setPreviewError(String((err as Error).message ?? 'Preview failed'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const debitHeader = preview?.headers.find((h) => h.toLowerCase() === 'debit');
  const creditHeader = preview?.headers.find((h) => h.toLowerCase() === 'credit');

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPreview(null); setPreviewError(null); } }}>
      <DialogTrigger render={<Button variant="default" size="sm">Import Journal CSV/XLSX</Button>} />
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Import Journal Entries</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId ?? projectId ?? ''} />
          <div className="space-y-2">
            <Label htmlFor="journal-file">CSV/XLSX file</Label>
            <Input ref={fileRef} id="journal-file" name="file" type="file" accept=".csv,.xlsx,.xls" required onChange={onFileChange} />
            <p className="text-xs text-muted-foreground">Accepted: .csv, .xlsx (.xls). Header must be: Entry Group, Entry Date, Reference, Entry Description, Account Code, Line Description, Debit, Credit, Tax Code</p>
          </div>
          {previewLoading && <p className="text-xs text-muted-foreground">Loading preview…</p>}
          {previewError && <p className="text-xs text-destructive">{previewError}</p>}
          {preview && (
            <div className="rounded border p-2">
              <p className="text-xs font-medium mb-1">Preview — {preview.rowCount} rows total, showing first {preview.rows.length} {preview.totalDebit !== null ? `· Debit ${preview.totalDebit} · Credit ${preview.totalCredit}` : ''}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      {preview.headers.map((h) => <th key={h} className="p-1 text-left font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {preview.headers.map((h) => <td key={h} className="p-1 truncate max-w-[120px]" title={String(r[h] ?? '')}>{String(r[h] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
