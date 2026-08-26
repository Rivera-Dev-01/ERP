import 'server-only';
import { getBalances } from './balances';
import { toDecimal } from '@/lib/money';
import { Decimal } from 'decimal.js';

export type CashFlowLine = {
  accountId: string;
  code: string;
  name: string;
  delta: string; // signed effect on cash (positive = provides cash)
};

export type CashFlowResult = {
  netIncome: string;
  operating: { lines: CashFlowLine[]; total: string };
  investing: { lines: CashFlowLine[]; total: string };
  financing: { lines: CashFlowLine[]; total: string };
  cashOpening: string;
  cashEnding: string;
  netChange: string;
  computedNetChange: string;
  isReconciled: boolean;
};

/** Signed balance in debit-positive terms from a {side, amount} pair */
function signed(side: string, amount: string): Decimal {
  const a = toDecimal(amount);
  return side === 'DEBIT' ? a : a.negated();
}

export async function getCashFlow(opts: {
  organizationId: string;
  companyId: string;
  from: string;
  to: string;
}): Promise<CashFlowResult> {
  const balances = await getBalances({
    organizationId: opts.organizationId,
    companyId: opts.companyId,
    // opening = everything before `from`
    from: opts.from,
    to: opts.to,
  });

  const zero = toDecimal('0');
  let cashOpening = zero;
  let cashEnding = zero;
  const groups: Record<'OPERATING' | 'INVESTING' | 'FINANCING', Map<string, CashFlowLine>> = {
    OPERATING: new Map(),
    INVESTING: new Map(),
    FINANCING: new Map(),
  };
  const deltas: Array<{ account: (typeof balances)[number]['account']; delta: Decimal }> = [];

  for (const b of balances) {
    const openS = signed(b.opening.side, b.opening.amount);
    const endS = signed(b.ending.side, b.ending.amount);
    const delta = endS.minus(openS);
    if (b.account.is_cash) {
      cashOpening = cashOpening.plus(openS);
      cashEnding = cashEnding.plus(endS);
      continue; // cash accounts are the reconciliation target, not line items
    }
    if (b.account.type === 'INCOME' || b.account.type === 'EXPENSE') continue; // folded into NI
    deltas.push({ account: b.account, delta });
  }

  for (const { account, delta } of deltas) {
    if (delta.isZero()) continue;
    const cat = ((account as unknown as { cf_category?: string }).cf_category ?? 'OPERATING') as
      | 'OPERATING'
      | 'INVESTING'
      | 'FINANCING';
    // Effect on cash is the negative of the account's debit-positive movement
    const effect = delta.negated();
    const map = groups[cat];
    const prev = map.get(account.id);
    if (prev) {
      prev.delta = toDecimal(prev.delta).plus(effect).toFixed(4);
    } else {
      map.set(account.id, { accountId: account.id, code: account.code, name: account.name, delta: effect.toFixed(4) });
    }
  }

  // Net income for the period via income/expense deltas already inside balances
  let ni = zero;
  for (const b of balances) {
    if (b.account.type === 'INCOME' || b.account.type === 'EXPENSE') {
      const openS = signed(b.opening.side, b.opening.amount);
      const endS = signed(b.ending.side, b.ending.amount);
      const d = endS.minus(openS);
      // signed() is debit-positive: both P&L types contribute the negative of that movement
      ni = ni.plus(d.negated());
    }
  }

  const sumGroup = (m: Map<string, CashFlowLine>) =>
    [...m.values()].reduce((s, l) => s.plus(toDecimal(l.delta)), zero);

  const opTotal = sumGroup(groups.OPERATING).plus(ni);
  const invTotal = sumGroup(groups.INVESTING);
  const finTotal = sumGroup(groups.FINANCING);

  const computedNetChange = opTotal.plus(invTotal).plus(finTotal);
  const netChange = cashEnding.minus(cashOpening);
  const diffAbs = computedNetChange.minus(netChange).abs();
  const isReconciled = diffAbs.lessThanOrEqualTo('0.0001');

  return {
    netIncome: ni.toFixed(4),
    operating: { lines: [...groups.OPERATING.values()], total: opTotal.toFixed(4) },
    investing: { lines: [...groups.INVESTING.values()], total: invTotal.toFixed(4) },
    financing: { lines: [...groups.FINANCING.values()], total: finTotal.toFixed(4) },
    cashOpening: cashOpening.toFixed(4),
    cashEnding: cashEnding.toFixed(4),
    netChange: netChange.toFixed(4),
    computedNetChange: computedNetChange.toFixed(4),
    isReconciled,
  };
}
