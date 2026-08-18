import { Decimal } from 'decimal.js';

export const MONEY_SCALE = 4;

export function toDecimal(value: string | number | Decimal): Decimal {
  let d: Decimal;
  try {
    d = value instanceof Decimal ? value : new Decimal(value);
  } catch {
    throw new Error('Invalid monetary value');
  }
  if (!d.isFinite()) {
    throw new Error('Invalid monetary value');
  }
  return d;
}

export function add(a: string | number | Decimal, b: string | number | Decimal): Decimal {
  return toDecimal(a).plus(toDecimal(b));
}

export function sub(a: string | number | Decimal, b: string | number | Decimal): Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

export function isZero(value: string | number | Decimal): boolean {
  return toDecimal(value).isZero();
}

export function isPositive(value: string | number | Decimal): boolean {
  const d = toDecimal(value);
  return d.isPositive() && !d.isZero();
}

export function isNegative(value: string | number | Decimal): boolean {
  return toDecimal(value).isNegative();
}

export function isBalanced(debits: string[], credits: string[]): boolean {
  const debitTotal = debits.reduce((sum, d) => sum.plus(toDecimal(d)), new Decimal(0));
  const creditTotal = credits.reduce((sum, c) => sum.plus(toDecimal(c)), new Decimal(0));
  return debitTotal.equals(creditTotal);
}

export function toDbString(value: string | number | Decimal): string {
  return toDecimal(value).toFixed(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}
