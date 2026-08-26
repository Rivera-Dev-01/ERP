import 'server-only';
import { getBalances } from '@/server/reports/balances';
import { createClient } from '@/server/supabase/server';
import { toDecimal, toDbString } from '@/lib/money';

export type GeneralLedgerLine = {
  debit: string;
  credit: string;
  runningBalance: string;
  runningSide: 'DEBIT' | 'CREDIT';
  journal_entry: {
    entry_date: string;
    entry_number: number | null;
    reference: string;
    description: string;
    status: string;
  };
};

export type GeneralLedgerResult = {
  opening: { side: 'DEBIT' | 'CREDIT'; amount: string };
  lines: GeneralLedgerLine[];
};

export async function getGeneralLedger(opts: {
  organizationId: string;
  companyId?: string;
  projectId?: string;
  accountId: string;
  from: string;
  to: string;
}): Promise<GeneralLedgerResult> {
  const companyId = opts.companyId ?? opts.projectId;
  const balances = await getBalances({
    organizationId: opts.organizationId,
    companyId,
    from: opts.from,
    to: opts.to,
    accountIds: [opts.accountId],
  });
  const opening = balances[0]?.opening ?? { side: 'DEBIT' as const, amount: '0.0000' };

  const supabase = await createClient();

  const { data: accountRes } = await supabase
    .from('account')
    .select('type,normal_balance')
    .eq('id', opts.accountId)
    .maybeSingle();

  const normal = (accountRes?.normal_balance ?? 'DEBIT') as 'DEBIT' | 'CREDIT';
  const isDebitNormal = normal === 'DEBIT';

  let ledgerQuery: any = supabase
    .from('journal_line')
    .select('debit,credit,journal_entry!inner(entry_date,entry_number,reference,description,status,organization_id,company_id)')
    .eq('account_id', opts.accountId)
    .eq('journal_entry.organization_id', opts.organizationId)
    .in('journal_entry.status', ['POSTED', 'REVERSED'])
    .gte('journal_entry.entry_date', opts.from)
    .lte('journal_entry.entry_date', opts.to)
    .order('journal_entry.entry_date', { ascending: true });
  if (companyId) ledgerQuery = ledgerQuery.eq('journal_entry.company_id', companyId);
  const { data: lines } = await ledgerQuery;

  // signed opening: if side != normal, negated
  const openingSigned =
    opening.side === normal ? toDecimal(opening.amount) : toDecimal(opening.amount).negated();

  let running = openingSigned;

  const rows: GeneralLedgerLine[] = (lines ?? [])
    .slice()
    .sort((a: unknown, b: unknown) => {
      const ja = (a as { journal_entry: { entry_date: string; entry_number: number | null } }).journal_entry;
      const jb = (b as { journal_entry: { entry_date: string; entry_number: number | null } }).journal_entry;
      const cmp = ja.entry_date.localeCompare(jb.entry_date);
      if (cmp !== 0) return cmp;
      return (ja.entry_number ?? 0) - (jb.entry_number ?? 0);
    })
    .map((l: unknown) => {
      const raw = l as { debit: string | number; credit: string | number; journal_entry: GeneralLedgerLine['journal_entry'] & { organization_id: string } };
      const debit = toDecimal(raw.debit as unknown as string);
      const credit = toDecimal(raw.credit as unknown as string);
      const delta = isDebitNormal ? debit.minus(credit) : credit.minus(debit);
      running = running.plus(delta);
      const runningSide: 'DEBIT' | 'CREDIT' = running.isNegative()
        ? isDebitNormal
          ? 'CREDIT'
          : 'DEBIT'
        : normal;
      const absRunning = running.isNegative() ? running.negated() : running;
      return {
        debit: toDbString(debit.toString()),
        credit: toDbString(credit.toString()),
        journal_entry: {
          entry_date: raw.journal_entry.entry_date,
          reference: raw.journal_entry.reference,
          description: raw.journal_entry.description,
          status: raw.journal_entry.status,
        },
        runningBalance: toDbString(absRunning.toString()),
        runningSide,
      };
    });

  return { opening, lines: rows };
}
