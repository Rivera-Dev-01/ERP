'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';

type R = { ok: boolean; formError?: string; attachmentId?: string };

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function uploadAttachment(_prev: R, formData: FormData): Promise<R> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const file = formData.get('file') as File | null;
  const entryId = String(formData.get('journal_entry_id') ?? '').trim();
  if (!file || file.size === 0) return { ok: false, formError: 'No file provided' };
  if (file.size > MAX_BYTES) return { ok: false, formError: 'File exceeds 10 MB limit' };
  if (!entryId) return { ok: false, formError: 'Missing journal entry' };

  const supabase = await createClient();
  const { data: entry } = await supabase.from('journal_entry').select('company_id').eq('id', entryId).eq('organization_id', ctx.organization.id).maybeSingle();
  if (!entry) return { ok: false, formError: 'Entry not found' };
  const companyId = (entry as unknown as { company_id: string }).company_id;

  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `org/${ctx.organization.id}/company/${companyId}/entry/${entryId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const buf = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage.from('attachments').upload(path, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) return { ok: false, formError: `Upload failed: ${upErr.message}` };

  const { data: att, error } = await supabase
    .from('attachment')
    .insert({
      organization_id: ctx.organization.id,
      company_id: companyId,
      journal_entry_id: entryId,
      entity_type: 'JOURNAL_ENTRY',
      file_name: file.name.slice(0, 200),
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      storage_path: path,
      uploaded_by_id: ctx.profile.id,
    })
    .select('id')
    .single();
  if (error) {
    await supabase.storage.from('attachments').remove([path]);
    return { ok: false, formError: 'Unable to save attachment metadata.' };
  }
  revalidatePath(`/journal/${entryId}`);
  return { ok: true, attachmentId: att!.id };
}

export async function deleteAttachment(attachmentId: string): Promise<{ ok: boolean; formError?: string }> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { data: att } = await supabase.from('attachment').select('storage_path,journal_entry_id').eq('id', attachmentId).eq('organization_id', ctx.organization.id).maybeSingle();
  if (!att) return { ok: false, formError: 'Attachment not found' };
  await supabase.storage.from('attachments').remove([(att as unknown as { storage_path: string }).storage_path]);
  const { error } = await supabase.from('attachment').delete().eq('id', attachmentId);
  if (error) return { ok: false, formError: 'Unable to delete attachment' };
  revalidatePath(`/journal/${(att as unknown as { journal_entry_id: string }).journal_entry_id}`);
  return { ok: true };
}

export async function getAttachmentUrl(attachmentId: string): Promise<{ ok: boolean; url?: string; formError?: string }> {
  let ctx;
  try {
    await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { data: att } = await supabase.from('attachment').select('storage_path').eq('id', attachmentId).maybeSingle();
  if (!att) return { ok: false, formError: 'Not found' };
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl((att as unknown as { storage_path: string }).storage_path, 60);
  if (error || !data) return { ok: false, formError: 'Unable to sign URL' };
  return { ok: true, url: data.signedUrl };
}
