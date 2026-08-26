import 'server-only';
import { getBalances } from '@/server/reports/balances';
import { toDecimal, toDbString } from '@/lib/money';

export async function getTrialBalance(opts: {
  organizationId: string;
  companyId?: string;
  projectId?: string;
  from: string;
  to: string;
  accountIds?: string[];
}) {
  const companyId = opts.companyId ?? opts.projectId;
  const balances = await getBalances({ organizationId: opts.organizationId, companyId, from: opts.from, to: opts.to, accountIds: opts.accountIds });
  const rows = balances.filter(
    (b) => b.opening.amount !== '0.0000' || b.period.debit !== '0.0000' || b.period.credit !== '0.0000',
  );
  const totalEndingDebits = rows
    .filter((r) => r.ending.side === 'DEBIT')
    .reduce((s, r) => s.plus(toDecimal(r.ending.amount)), toDecimal('0'));
  const totalEndingCredits = rows
    .filter((r) => r.ending.side === 'CREDIT')
    .reduce((s, r) => s.plus(toDecimal(r.ending.amount)), toDecimal('0'));
  const isBalanced = totalEndingDebits.equals(totalEndingCredits);
  return {
    rows,
    totalEndingDebits: toDbString(totalEndingDebits.toString()),
    totalEndingCredits: toDbString(totalEndingCredits.toString()),
    isBalanced,
  };
}
