import 'server-only';
import { getBalances } from '@/server/reports/balances';
import { getIncomeStatement } from '@/server/reports/income-statement';
import { toDecimal, toDbString } from '@/lib/money';

export async function getBalanceSheet(opts: {
  organizationId: string;
  companyId?: string;
  projectId?: string;
  asOf: string;
  accountIds?: string[];
}) {
  const from = '1970-01-01';
  const to = opts.asOf;
  const companyId = opts.companyId ?? opts.projectId;
  const balances = await getBalances({
    organizationId: opts.organizationId,
    companyId,
    from,
    to,
    accountIds: opts.accountIds,
  });
  const assets = balances
    .filter((b) => b.account.type === 'ASSET')
    .reduce((s, r) => {
      const signed = r.ending.side === 'DEBIT' ? toDecimal(r.ending.amount) : toDecimal(r.ending.amount).negated();
      return s.plus(signed);
    }, toDecimal('0'));
  const liabilities = balances
    .filter((b) => b.account.type === 'LIABILITY')
    .reduce(
      (s, r) => s.plus(r.ending.side === 'CREDIT' ? toDecimal(r.ending.amount) : toDecimal(r.ending.amount).negated()),
      toDecimal('0'),
    );
  const equity = balances
    .filter((b) => b.account.type === 'EQUITY')
    .reduce(
      (s, r) => s.plus(r.ending.side === 'CREDIT' ? toDecimal(r.ending.amount) : toDecimal(r.ending.amount).negated()),
      toDecimal('0'),
    );
  const incomeStmt = await getIncomeStatement({
    organizationId: opts.organizationId,
    companyId,
    from,
    to,
    accountIds: opts.accountIds,
  });
  const currentEarnings = toDecimal(incomeStmt.net);
  const rightSide = liabilities.plus(equity).plus(currentEarnings);
  const isBalanced = assets.equals(rightSide);
  return {
    assets: toDbString(assets.toString()),
    liabilities: toDbString(liabilities.toString()),
    equity: toDbString(equity.toString()),
    currentEarnings: toDbString(currentEarnings.toString()),
    isBalanced,
  };
}
