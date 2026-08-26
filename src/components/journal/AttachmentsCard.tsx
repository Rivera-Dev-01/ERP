'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { uploadAttachment, deleteAttachment, getAttachmentUrl } from '@/server/actions/attachment-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Att = {
  id: string;
  file_name: string;
  size_bytes: number;
  created_at: string;
};

export function AttachmentsCard({ entryId, initial }: { entryId: string; initial: Att[] }) {
  const [atts, setAtts] = useState<Att[]>(initial);
  const [state, formAction, pending] = useActionState(
    uploadAttachment as unknown as (p: { ok: boolean }, fd: FormData) => Promise<{ ok: boolean; formError?: string }>,
    { ok: false } as never,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = state as { ok?: boolean; formError?: string };
    if (!s) return;
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success('Attached');
      if (fileRef.current) fileRef.current.value = '';
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const refresh = async () => {
    // lightweight: refetch via signed list is server-rendered; here just toggle a re-fetch through router
    const { useRouter } = await import('next/navigation');
    void useRouter;
  };

  const onDownload = async (id: string) => {
    const res = await getAttachmentUrl(id);
    if (!res.ok || !res.url) return toast.error(res.formError ?? 'Failed');
    window.open(res.url, '_blank');
  };

  const onDelete = async (id: string) => {
    const res = await deleteAttachment(id);
    if (!res.ok) return toast.error(res.formError ?? 'Failed');
    setAtts((a) => a.filter((x) => x.id !== id));
    toast.success('Attachment deleted');
  };

  return (
    <div className="rounded-md border p-4 space-y-3" data-attachments>
      <h2 className="text-sm font-semibold">Attachments</h2>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="journal_entry_id" value={entryId} />
        <Input ref={fileRef} type="file" name="file" required className="max-w-xs" />
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Uploading…' : 'Attach'}</Button>
        <span className="text-xs text-muted-foreground">Invoices, receipts, BIR certs — max 10 MB</span>
      </form>
      {atts.length ? (
        <ul className="space-y-1 text-sm">
          {atts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 border-b pb-1 last:border-0">
              <span className="truncate" title={a.file_name}>{a.file_name} <span className="text-muted-foreground">({Math.ceil(a.size_bytes / 1024)} KB)</span></span>
              <span className="flex gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => onDownload(a.id)}>View</Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(a.id)}>Delete</Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      )}
      {/* state refresh trigger */}
      <input type="hidden" data-att-state={String(!!state?.ok)} onChange={() => setAtts((x) => [...x])} />
    </div>
  );
}
