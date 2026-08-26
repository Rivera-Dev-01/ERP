import { redirect } from 'next/navigation';
import { requireOrganization, getActiveCompanies } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { FilingStatusButton } from '@/components/tax/FilingStatusButton';
import { formatBusinessDate } from '@/lib/format';

function generateCalendar(year: number, classification: string | null) {
  const isVAT = classification === 'VAT';
  const isNonVAT = classification === 'NON_VAT';
  const isPercentage = classification === 'PERCENTAGE';
  const items: Array<{ form: string; label: string; due: string }> = [];
  // VAT: 2550M monthly 20th next month, 2550Q quarterly 25th after quarter
  // For simplicity, generate common forms
  for (let m = 1; m <= 12; m++) {
    const due = new Date(year, m, 20).toISOString().slice(0, 10); // 20th next month
    if (isVAT) items.push({ form: '2550M', label: `VAT Monthly ${m}/${year}`, due });
    // 1601C monthly 15th next month
    const due15 = new Date(year, m, 15).toISOString().slice(0, 10);
    items.push({ form: '1601C', label: `Withholding ${m}/${year}`, due: due15 });
    // Percentage tax 2551Q quarterly if non-VAT/percentage
    if ((isNonVAT || isPercentage) && [3,6,9,12].includes(m)) {
      const q = Math.ceil(m / 3);
      const qDue = new Date(year, m, 25).toISOString().slice(0, 10);
      items.push({ form: '2551Q', label: `Percentage Q${q} ${year}`, due: qDue });
    }
    if (isVAT && [3,6,9,12].includes(m)) {
      const q = Math.ceil(m / 3);
      const qDue = new Date(year, m, 25).toISOString().slice(0, 10);
      items.push({ form: '2550Q', label: `VAT Quarterly Q${q} ${year}`, due: qDue });
    }
  }
  // Quarterly income 1701Q/1702Q
  for (const q of [1,2,3,4]) {
    const m = q * 3;
    const due = new Date(year, m, q === 4 ? 15 : 15); // 15th after quarter, Q4 Apr 15 next year handled separately
    // For Q4, due is Apr 15 next year
    const dueDate = q === 4 ? `${year + 1}-04-15` : new Date(year, m, 15).toISOString().slice(0, 10);
    items.push({ form: q === 4 ? '1701/1702 Annual' : `1701Q`, label: q === 4 ? `Annual ITR ${year}` : `Quarterly ITR Q${q} ${year}`, due: dueDate });
  }
  items.sort((a, b) => a.due.localeCompare(b.due));
  return items;
}

export default async function TaxCenterPage({
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
  const year = Number.parseInt(String(params.year ?? new Date().getFullYear()), 10) || new Date().getFullYear();

  if (!companyId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Tax Center</h1>
        <p className="text-sm text-muted-foreground">No companies yet.</p>
        <Link href="/companies" className="text-sm underline">Create a company</Link>
      </div>
    );
  }
  if (params.project && !params.company) redirect(`/tax-center?company=${companyId}&year=${year}`);
  if (!params.company) redirect(`/tax-center?company=${companyId}&year=${year}`);
  const validIds = new Set(companies.map((c) => c.id));
  if (!validIds.has(String(companyId))) {
    const fallback = companies[0]?.id;
    if (fallback) redirect(`/tax-center?company=${fallback}&year=${year}`);
  }
  const companyName = companies.find((c) => c.id === companyId)?.name ?? companyId;
  const classification = organization.tax_classification ?? null;

  const calendar = generateCalendar(year, classification);
  const { data: statuses } = await supabase
    .from('filing_status')
    .select('*')
    .eq('company_id', companyId)
    .gte('due_date', `${year}-01-01`)
    .lte('due_date', `${year}-12-31`);

  const statusMap = new Map((statuses ?? []).map((s) => [`${(s as unknown as { form: string }).form}|${(s as unknown as { period_label: string }).period_label}`, s]));

  // Compute tax account reconciliation: VAT payable (22*), Withholding (23*) balances as-of today
  const asOf = new Date().toISOString().slice(0, 10);
  const { data: taxAccounts } = await supabase.from('account').select('id,code,name').eq('company_id', companyId).or('code.like.22%,code.like.23%');
  const taxBalances = new Map<string, number>();
  if (taxAccounts?.length) {
    const ids = taxAccounts.map((a) => a.id);
    const { data: lines } = await supabase
      .from('journal_line')
      .select('account_id,debit,credit,journal_entry!inner(entry_date,status,company_id)')
      .eq('journal_entry.company_id', companyId)
      .in('journal_entry.status', ['POSTED', 'REVERSED'])
      .lte('journal_entry.entry_date', asOf)
      .in('account_id', ids);
    for (const a of taxAccounts) {
      let d = 0, c = 0;
      for (const l of (lines as unknown as Array<{ account_id: string; debit: number; credit: number }>) ?? []) if (l.account_id === a.id) { d += Number(l.debit); c += Number(l.credit); }
      // For liability (credit normal), balance = credit - debit
      taxBalances.set(a.id, c - d);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tax Center</h1>
        <p className="text-sm text-muted-foreground">Company: {companyName} · TIN {organization.tin ?? '—'} · RDO {organization.rdo ?? '—'} · {classification ?? '—'} · Branch { (organization as unknown as { branch_code?: string }).branch_code ?? '—'}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Company tax profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">TIN</span><span>{organization.tin ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">RDO</span><span>{organization.rdo ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Branch</span><span>{(organization as unknown as { branch_code?: string }).branch_code ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span className="truncate max-w-[260px]">{(organization as unknown as { address?: string }).address ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Classification</span><span>{classification ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Fiscal year start</span><span>Month {organization.fiscal_year_start_month}</span></div>
          <Link href="/settings" className="text-xs underline mt-1">Edit in Settings →</Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Filing calendar {year}
            <span className="ml-auto flex gap-1">
              <Link href={`/tax-center?company=${companyId}&year=${year - 1}`} className="text-xs underline">← {year - 1}</Link>
              <Link href={`/tax-center?company=${companyId}&year=${year + 1}`} className="text-xs underline">{year + 1} →</Link>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Form</th>
                  <th className="p-2 text-left">Period</th>
                  <th className="p-2 text-left">Due</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Proof</th>
                </tr>
              </thead>
              <tbody>
                {calendar.map((it) => {
                  const key = `${it.form}|${it.label}`;
                  const st = statusMap.get(key) as unknown as { status: string; filed_at: string | null } | undefined;
                  const isOverdue = new Date(it.due) < new Date() && st?.status !== 'FILED';
                  return (
                    <tr key={key} className="border-b last:border-0">
                      <td className="p-2"><Badge variant="outline">{it.form}</Badge></td>
                      <td className="p-2">{it.label}</td>
                      <td className="p-2 whitespace-nowrap">{formatBusinessDate(it.due)} {isOverdue ? <Badge variant="destructive" className="ml-1">Overdue</Badge> : null}</td>
                      <td className="p-2"><FilingStatusButton companyId={companyId} form={it.form} periodLabel={it.label} dueDate={it.due} current={st?.status ?? 'NOT_STARTED'} /></td>
                      <td className="p-2 text-xs text-muted-foreground">{st?.status === 'FILED' ? 'Filed' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 flex gap-2">
            <a href={`/api/export/tax-workpaper?company=${companyId}&year=${year}`} className="text-xs underline">Export tax workpaper CSV</a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tax account reconciliation (as of {asOf})</CardTitle>
        </CardHeader>
        <CardContent>
          {taxAccounts?.length ? (
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
                  {taxAccounts.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="p-2">{a.code}</td>
                      <td className="p-2">{a.name}</td>
                      <td className="p-2 text-right">{(taxBalances.get(a.id) ?? 0).toFixed(2)}</td>
                      <td className="p-2"><Link href={`/reports/general-ledger?company=${companyId}&account=${a.id}&to=${asOf}`} className="text-xs underline">Ledger</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No VAT/Withholding accounts (code 22*/23*) found. Create them in Chart of Accounts.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
