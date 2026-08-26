'use client';
import { useActionState, useEffect } from 'react';
import { batchPostDrafts } from '@/server/actions/journal-actions';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function BatchPostButton({ companyId, draftCount }: { companyId: string; draftCount: number }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => {
      const cid = String(fd.get('company_id') ?? companyId);
      return batchPostDrafts(cid);
    },
    null as unknown as { ok: boolean; posted: number; failed: number; formError?: string },
  );

  useEffect(() => {
    if (!state) return;
    const s = state as { ok: boolean; posted: number; failed: number; formError?: string };
    if (s.formError) toast.error(s.formError);
    else if (s.ok) {
      if (s.posted === 0 && s.failed === 0) toast.info('No draft entries to post');
      else toast.success(`Posted ${s.posted} · Failed ${s.failed}`);
    }
  }, [state]);

  if (draftCount === 0) return null;

  return (
    <form action={formAction}>
      <input type="hidden" name="company_id" value={companyId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending} title={`Post ${draftCount} drafts`}>
        {pending ? 'Posting…' : `Post all drafts (${draftCount})`}
      </Button>
    </form>
  );
}
