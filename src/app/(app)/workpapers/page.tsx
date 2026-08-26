import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { WorkpaperNotes } from '@/components/workpapers/WorkpaperNotes';
import { formatPHP } from '@/lib/format';

const SCHEDULES: Array<{ key: string; label: string; filter: (code: string, name: string, type: string) => boolean }> = [
  { key: 'PREPAID', label: 'Prepaid Expenses', filter: (c) => c.startsWith('14') || c.startsWith('15') },
  { key: 'ACCRUED', label: 'Accrued Expenses', filter: (c) => c.startsWith('21') || c.startsWith('22') },
  { key: 'FIXED_ASSETS', label: 'Fixed Assets & Depreciation', filter: (c) => c.startsWith('15') || c.startsWith('16') },
  { key: 'LOANS_PAYABLE', label: 'Loans Payable', filter: (c) => c.startsWith('25') },
  { key: 'ADVANCES', label: 'Advances', filter: (c, n) => n.toLowerCase().includes('advance') },
  { key: 'RECEIVABLES', label: 'Receivables', filter: (c) => c.startsWith('11') },
  { key: 'PAYABLES', label: 'Payables', filter: (c) => c.startsWith('20') },
  { key: 'VAT', label: 'VAT', filter: (c, n) => n.toLowerCase().includes('vat') || c.startsWith('22') },
  { key: 'WITHHOLDING', label: 'Withholding Tax', filter: (c, n) => n.toLowerCase().includes('withholding') || c.startsWith('23') },
  { key: 'ADJUSTING', label: 'Adjusting Entries', filter: () => false },
];

export default async function WorkpapersPage({
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
  const asOf = params.asOf ?? new Date().toISOString().slice(0, 10);

  if (!companyId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Workpapers</h1>
        <p className="text-sm text-muted-foreground">No companies yet.</p>
        <Link href="/companies" className="text-sm underline">Create a company</Link>
      </div>
    );
  }
  if (params.project && !params.company) redirect(`/workpapers?company=${companyId}&asOf=${asOf}`);
  if (!params.company) redirect(`/workpapers?company=${companyId}&asOf=${asOf}`);
  const validIds = new Set(companies.map((c) => c.id));
  if (!validIds.has(String(companyId))) {
    const fallback = companies[0]?.id;
    if (fallback) redirect(`/workpapers?company=${fallback}&asOf=${asOf}`);
  }
  const companyName = companies.find((c) => c.id === companyId)?.name ?? companyId;

  const { data: accounts } = await supabase.from('account').select('id,code,name,type').eq('company_id', companyId).order('code');
  const { data: notes } = await supabase.from('workpaper_note').select('*').eq('company_id', companyId).eq('period_end', asOf);

  // For each schedule, compute balances as-of via journal_line sums (simple)
  const balances = new Map<string, { debit: number; credit: number }>();
  if (accounts?.length) {
    const ids = accounts.map((a) => a.id);
    const { data: lines } = await supabase
      .from('journal_line')
      .select('account_id,debit,credit,journal_entry!inner(entry_date,status,company_id)')
      .eq('journal_entry.company_id', companyId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .lte('journal_entry.entry_date', asOf)
      .in('account_id', ids);
    for (const l of (lines as unknown as Array<{ account_id: string; debit: number; credit: number }>) ?? []) {
      const cur = balances.get(l.account_id) ?? { debit: 0, credit: 0 };
      cur.debit += Number(l.debit);
      cur.credit += Number(l.credit);
      balances.set(l.account_id, cur);
    }
  }

  const noteMap = new Map((notes ?? []).map((n) => [(n as unknown as { schedule_key: string }).schedule_key, n]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Workpapers</h1>
        <p className="text-sm text-muted-foreground">Company: {companyName} · As of {asOf}</p>
        <form className="flex gap-2 mt-2">
          <input type="hidden" name="company" value={companyId} />
          <input type="date" name="asOf" defaultValue={asOf} className="h-8 rounded border px-2 text-sm" />
          <button type="submit" className="h-8 rounded bg-primary px-3 text-sm text-primary-foreground">Go</button>
        </form>
      </div>

      {SCHEDULES.map((s) => {
        const matched = (accounts ?? []).filter((a) => s.filter(a.code, a.name, a.type));
        const note = noteMap.get(s.key) as unknown as { notes: string } | undefined;
        return (
          <Card key={s.key}>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                {s.label} <Badge variant="outline">{matched.length} accounts</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {matched.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/50">
                      <tr>
                        <th className="p-2 text-left">Code</th>
                        <th className="p-2 text-left">Name</th>
                        <th className="p-2 text-right">Balance</th>
                        <th className="p-2 text-left">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matched.map((a) => {
                        const bal = balances.get(a.id);
                        const net = bal ? bal.debit - bal.credit : 0;
                        return (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="p-2">{a.code}</td>
                            <td className="p-2">{a.name}</td>
                            <td className="p-2 text-right">{formatPHP(net)}</td>
                            <td className="p-2"><Link href={`/reports/general-ledger?company=${companyId}&account=${a.id}&to=${asOf}`} className="text-xs underline">Ledger</Link></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : s.key === 'ADJUSTING' ? (
                <p className="text-sm text-muted-foreground">Create adjusting entries via Journal with Entry type ADJUSTING. They will appear in reports as POSTED.</p>
              ) : (
                <p className="text-sm text-muted-foreground">No accounts match this schedule. Adjust codes or add accounts.</p>
              )}
              <WorkpaperNotes companyId={companyId} scheduleKey={s.key} periodEnd={asOf} initial={note?.notes ?? ''} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
