import { requireOrganization, getActiveCompanies } from '@/server/auth';
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
  const companies = await getActiveCompanies(organization.id);
  const companyId = (params.company ?? params.project) ? String(params.company ?? params.project) : companies?.[0]?.id ?? '';

  // Accounts + sequence in parallel
  const accountQuery = supabase.from('account').select('*').eq('organization_id', organization.id).eq('is_active', true);
  const accountsPromise = (companyId ? accountQuery.eq('company_id', companyId) : accountQuery).order('code');
  const seqPromise = (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { last_number: number } | null }> } } } }).from('journal_entry_sequence').select('last_number').eq('organization_id', organization.id).maybeSingle();

  const [{ data: accounts }, { data: seq }] = await Promise.all([accountsPromise, seqPromise]);

  let suggestedReference = '';
  try {
    // seq already fetched above
    void seq;
    const lastNumber = (seq as { last_number?: number } | null)?.last_number ?? 0;
    const today = new Date().toISOString().slice(0, 10);
    suggestedReference = nextReferencePreview(lastNumber, today);
  } catch {
    const today = new Date().toISOString().slice(0, 10);
    suggestedReference = nextReferencePreview(0, today);
  }

  return <JournalForm mode="create" accounts={accounts ?? []} suggestedReference={suggestedReference} companyId={companyId} />;
}
