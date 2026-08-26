import 'server-only';
import { createClient } from '@/server/supabase/server';
import { toDecimal, toDbString } from '@/lib/money';
import type { Tables } from '@/types/database';

type BalanceSide = 'DEBIT' | 'CREDIT';
export function computeBalance(
  type: string,
  normalBalance: BalanceSide,
  totalDebitStr: string,
  totalCreditStr: string,
): { side: BalanceSide; amount: string } {
  const debit = toDecimal(totalDebitStr);
  const credit = toDecimal(totalCreditStr);
  // ASSET/EXPENSE: debits - credits; else credits - debits
  const diff =
    type === 'ASSET' || type === 'EXPENSE' ? debit.minus(credit) : credit.minus(debit);
  const isZero = diff.isZero();
  const isNegative = diff.isNegative();
  // For ASSET/EXPENSE, positive diff is DEBIT, negative is CREDIT (and vice versa for the other group)
  const side: BalanceSide = isZero ? normalBalance : isNegative ? (normalBalance === 'DEBIT' ? 'CREDIT' : 'DEBIT') : normalBalance;
  const absValue = isNegative ? diff.negated() : diff;
  return { side, amount: toDbString(absValue.toString()) };
}

export async function getBalances(opts: {
  organizationId: string;
  companyId?: string;
  projectId?: string;
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
  accountIds?: string[];
}): Promise<
  Array<{
    account: Tables<'account'>;
    opening: { side: BalanceSide; amount: string };
    period: { debit: string; credit: string };
    ending: { side: BalanceSide; amount: string };
  }>
> {
  const supabase = await createClient();
  const companyId = opts.companyId ?? opts.projectId;
  let accountQuery = supabase.from('account').select('*').eq('organization_id', opts.organizationId);
  if (companyId) accountQuery = accountQuery.eq('company_id', companyId);
  const { data: accounts } = await accountQuery.order('code');
  if (!accounts) return [];
  const filteredAccounts = opts.accountIds?.length
    ? accounts.filter((a) => opts.accountIds!.includes(a.id))
    : accounts;
  // Fetch all journal_line joined via journal_entry where organization_id + status IN (...) + date filters
  // Opening: entry_date < from
  let openingQuery: any = supabase
    .from('journal_line')
    .select('account_id,debit,credit,journal_entry!inner(entry_date,status,organization_id,company_id)')
    .eq('journal_entry.organization_id', opts.organizationId)
    .in('journal_entry.status', ['POSTED', 'REVERSED'])
    .lt('journal_entry.entry_date', opts.from);
  if (companyId) openingQuery = openingQuery.eq('journal_entry.company_id', companyId);
  const openingPromise = openingQuery;
  // Period: BETWEEN from AND to inclusive
  let periodQuery: any = supabase
    .from('journal_line')
    .select('account_id,debit,credit,journal_entry!inner(entry_date,status,organization_id,company_id)')
    .eq('journal_entry.organization_id', opts.organizationId)
    .in('journal_entry.status', ['POSTED', 'REVERSED'])
    .gte('journal_entry.entry_date', opts.from)
    .lte('journal_entry.entry_date', opts.to);
  if (companyId) periodQuery = periodQuery.eq('journal_entry.company_id', companyId);
  const periodPromise = periodQuery;

  const [openingRes, periodRes] = await Promise.all([openingPromise, periodPromise]);
  const openingLines = (openingRes.data ?? []) as unknown as Array<{ account_id: string; debit: string; credit: string }>;
  const periodLines = (periodRes.data ?? []) as unknown as Array<{ account_id: string; debit: string; credit: string }>;

  return filteredAccounts.map((account) => {
    const oLines = openingLines.filter((l) => l.account_id === account.id);
    const pLines = periodLines.filter((l) => l.account_id === account.id);
    const openingDebit = oLines.reduce((s, l) => s.plus(toDecimal(l.debit as unknown as string)), toDecimal('0'));
    const openingCredit = oLines.reduce((s, l) => s.plus(toDecimal(l.credit as unknown as string)), toDecimal('0'));
    const periodDebit = pLines.reduce((s, l) => s.plus(toDecimal(l.debit as unknown as string)), toDecimal('0'));
    const periodCredit = pLines.reduce((s, l) => s.plus(toDecimal(l.credit as unknown as string)), toDecimal('0'));
    const openingBal = computeBalance(account.type, account.normal_balance, toDbString(openingDebit.toString()), toDbString(openingCredit.toString()));
    const endingDebit = openingDebit.plus(periodDebit);
    const endingCredit = openingCredit.plus(periodCredit);
    const endingBal = computeBalance(
      account.type,
      account.normal_balance,
      toDbString(endingDebit.toString()),
      toDbString(endingCredit.toString()),
    );
    return {
      account,
      opening: { side: openingBal.side, amount: openingBal.amount },
      period: { debit: toDbString(periodDebit.toString()), credit: toDbString(periodCredit.toString()) },
      ending: { side: endingBal.side, amount: endingBal.amount },
    };
  });
}
