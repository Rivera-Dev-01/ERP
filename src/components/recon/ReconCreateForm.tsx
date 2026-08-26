'use client';
import { useActionState, useEffect } from 'react';
import { createReconciliation } from '@/server/actions/reconciliation-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function ReconCreateForm({ companyId, accounts }: { companyId: string; accounts: Array<{ id: string; code: string; name: string }> }) {
  const [state, formAction, pending] = useActionState(createReconciliation as unknown as (p: { ok: boolean }, fd: FormData) => Promise<{ ok: boolean; formError?: string }>, { ok: false } as never);
  useEffect(() => {
    const s = state as { ok?: boolean; formError?: string };
    if (s.formError) toast.error(s.formError);
    if (s.ok) toast.success('Reconciliation created');
  }, [state]);
  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-5">
      <input type="hidden" name="company_id" value={companyId} />
      <div className="space-y-1">
        <Label>Account</Label>
        <select name="account_id" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label>Start</Label>
        <Input type="date" name="start_date" required />
      </div>
      <div className="space-y-1">
        <Label>End</Label>
        <Input type="date" name="end_date" required />
      </div>
      <div className="space-y-1">
        <Label>Statement balance</Label>
        <Input type="number" step="0.01" name="statement_balance" required placeholder="0.00" />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create'}</Button>
      </div>
    </form>
  );
}
