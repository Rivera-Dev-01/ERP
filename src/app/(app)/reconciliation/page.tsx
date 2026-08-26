import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ReconCreateForm } from '@/components/recon/ReconCreateForm';
import { ReconStatementImport } from '@/components/recon/ReconStatementImport';
import { ReconItemsTable } from '@/components/recon/ReconItemsTable';
import { formatBusinessDate, formatPHP } from '@/lib/format';

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { organization } = await requireOrganization();
  const params = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const companies = await getActiveCompanies(organization.id);
  const rawCompany = params.company ?? params.project;
  const companyId = rawCompany ? String(rawCompany) : companies?.[0]?.id;

  if (!companyId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Reconciliation</h1>
        <p className="text-sm text-muted-foreground">No companies yet.</p>
        <Link href="/companies" className="text-sm underline">Create a company</Link>
      </div>
    );
  }
  if (params.project && !params.company) redirect(`/reconciliation?company=${companyId}`);
  if (!params.company) redirect(`/reconciliation?company=${companyId}`);
  const validIds = new Set(companies.map((c) => c.id));
  if (!validIds.has(String(companyId))) {
    const fallback = companies[0]?.id;
    if (fallback) redirect(`/reconciliation?company=${fallback}`);
  }
  const companyName = companies.find((c) => c.id === companyId)?.name ?? companyId;

  const { data: accounts } = await supabase
    .from('account')
    .select('id,code,name')
    .eq('company_id', companyId)
    .order('code');

  const { data: recons } = await supabase
    .from('reconciliation')
    .select('id,account_id,start_date,end_date,statement_balance,status,created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(20);

  // For each recon, fetch items and ledger lines for matching
  const reconIds = (recons ?? []).map((r) => r.id);
  const { data: items } = reconIds.length
    ? await supabase.from('reconciliation_item').select('*').in('reconciliation_id', reconIds).order('item_date')
    : { data: [] as unknown as never[] };

  // Fetch ledger lines for the recon accounts in their date ranges (for Difference calc)
  // For simplicity, compute book balance as sum of posted journal_line for that account in range
  const bookBalances = new Map<string, number>();
  for (const r of recons ?? []) {
    const { data: lines } = await supabase
      .from('journal_line')
      .select('debit,credit,journal_entry!inner(entry_date,status,company_id)')
      .eq('journal_entry.company_id', companyId)
      .eq('account_id', r.account_id)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .gte('journal_entry.entry_date', r.start_date)
      .lte('journal_entry.entry_date', r.end_date);
    let d = 0, c = 0;
    for (const l of (lines as unknown as Array<{ debit: number; credit: number }>) ?? []) {
      d += Number(l.debit);
      c += Number(l.credit);
    }
    // For demo, book balance = debits - credits (cash/bank)
    bookBalances.set(r.id, d - c);
  }

  // Also fetch available journal lines per recon for matching dropdown (limit 100)
  const ledgerLinesByRecon = new Map<string, Array<{ id: string; debit: number; credit: number; description: string | null; journal_entry_id: string }>>();
  for (const r of recons ?? []) {
    const { data: ledger } = await supabase
      .from('journal_line')
      .select('id,debit,credit,description,journal_entry_id,journal_entry!inner(entry_date,company_id,status)')
      .eq('journal_entry.company_id', companyId)
      .eq('account_id', r.account_id)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .gte('journal_entry.entry_date', r.start_date)
      .lte('journal_entry.entry_date', r.end_date)
      .limit(100);
    ledgerLinesByRecon.set(r.id, (ledger as unknown as Array<{ id: string; debit: number; credit: number; description: string | null; journal_entry_id: string }>) ?? []);
  }

  const accountMap = new Map((accounts ?? []).map((a) => [`${a.code} — ${a.name}`, a.id]));
  void accountMap;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reconciliation</h1>
          <p className="text-sm text-muted-foreground">Company: {companyName} — Ledger − Statement = Difference</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">New reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <ReconCreateForm companyId={companyId} accounts={accounts ?? []} />
        </CardContent>
      </Card>

      {(recons ?? []).length ? (
        (recons ?? []).map((r) => {
          const its = (items as unknown as Array<{ id: string; reconciliation_id: string; item_date: string; description: string; amount: number; matched_line_id: string | null }>)?.filter((it) => it.reconciliation_id === r.id) ?? [];
          const matchedSum = its.filter((it) => it.matched_line_id).reduce((s, it) => s + Number(it.amount), 0);
          const book = bookBalances.get(r.id) ?? 0;
          const diff = book - Number(r.statement_balance);
          const allMatched = its.length > 0 && its.every((it) => it.matched_line_id);
          return (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  {r.start_date} – {r.end_date} · <Badge variant={r.status === 'COMPLETE' ? 'default' : 'secondary'}>{r.status}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">Statement {formatPHP(Number(r.statement_balance))} · Book {formatPHP(book)} · Diff {formatPHP(diff)} {Math.abs(diff) < 0.01 ? '✓' : ''}</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">Account: {(accounts ?? []).find((a) => a.id === r.account_id)?.code ?? r.account_id} — Ledger − Statement = Difference</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ReconStatementImport reconId={r.id} />
                {its.length ? (
                  <ReconItemsTable reconId={r.id} items={its} ledgerLines={ledgerLinesByRecon.get(r.id) ?? []} />
                ) : (
                  <p className="text-sm text-muted-foreground">No statement items yet. Import a CSV/XLSX with Date, Description, Amount.</p>
                )}
                {!allMatched && its.length > 0 && diff === 0 && <p className="text-xs text-amber-600">All amounts net to Difference 0 — you can now mark Complete manually when ready.</p>}
              </CardContent>
            </Card>
          );
        })
      ) : (
        <p className="text-sm text-muted-foreground">No reconciliations yet. Create one for a cash/bank account and date range.</p>
      )}
    </div>
  );
}
