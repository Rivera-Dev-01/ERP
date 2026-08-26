'use client';
import { useActionState, useEffect, useRef } from 'react';
import { importReconStatement } from '@/server/actions/reconciliation-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function ReconStatementImport({ reconId }: { reconId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(importReconStatement as unknown as (p: { ok: boolean }, fd: FormData) => Promise<{ ok: boolean; formError?: string }>, { ok: false } as never);
  useEffect(() => {
    const s = state as { ok?: boolean; formError?: string };
    if (s?.formError) toast.error(s.formError);
    if (s?.ok) {
      toast.success('Statement imported');
      if (ref.current) ref.current.value = '';
    }
  }, [state]);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="reconciliation_id" value={reconId} />
      <Input ref={ref} type="file" name="file" accept=".csv,.xlsx,.xls" required className="max-w-xs" />
      <Button type="submit" size="sm" disabled={pending}>{pending ? 'Importing…' : 'Import statement'}</Button>
      <span className="text-xs text-muted-foreground">Columns: Date, Description, Amount (or Debit/Credit)</span>
    </form>
  );
}
