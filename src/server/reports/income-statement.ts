import 'server-only';
import { getBalances } from '@/server/reports/balances';
import { toDecimal, toDbString } from '@/lib/money';

export async function getIncomeStatement(opts: {
  organizationId: string;
  from: string;
  to: string;
  accountIds?: string[];
}) {
  const balances = await getBalances(opts);
  const incomeRows = balances.filter((b) => b.account.type === 'INCOME');
  const expenseRows = balances.filter((b) => b.account.type === 'EXPENSE');
  const income = incomeRows.reduce((s, r) => {
    const periodIncome = toDecimal(r.period.credit).minus(toDecimal(r.period.debit));
    return s.plus(periodIncome);
  }, toDecimal('0'));
  const expenses = expenseRows.reduce(
    (s, r) => s.plus(toDecimal(r.period.debit).minus(toDecimal(r.period.credit))),
    toDecimal('0'),
  );
  const net = income.minus(expenses);
  return {
    income: toDbString(income.toString()),
    expenses: toDbString(expenses.toString()),
    net: toDbString(net.toString()),
    incomeRows,
    expenseRows,
  };
}
