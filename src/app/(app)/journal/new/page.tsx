import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { nextReferencePreview } from '@/lib/validation/journal';
import { JournalForm } from '@/components/journal/JournalForm';

export default async function NewJournalEntryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { organization } = await requireOrganization();
  const params = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('project')
    .select('id')
    .eq('organization_id', organization.id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });
  const projectId = params.project ? String(params.project) : projects?.[0]?.id ?? '';

  const accountQuery = supabase.from('account').select('*').eq('organization_id', organization.id).eq('is_active', true);
  const { data: accounts } = await (projectId ? accountQuery.eq('project_id', projectId) : accountQuery).order('code');

  let suggestedReference = '';
  try {
    const { data: seq } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { last_number: number } | null }> } } } }).from('journal_entry_sequence').select('last_number').eq('organization_id', organization.id).maybeSingle();
    const lastNumber = (seq as { last_number?: number } | null)?.last_number ?? 0;
    const today = new Date().toISOString().slice(0, 10);
    suggestedReference = nextReferencePreview(lastNumber, today);
  } catch {
    const today = new Date().toISOString().slice(0, 10);
    suggestedReference = nextReferencePreview(0, today);
  }

  return <JournalForm mode="create" accounts={accounts ?? []} suggestedReference={suggestedReference} projectId={projectId} />;
}
