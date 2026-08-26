import { describe, expect, it } from 'vitest';
import { toDecimal } from '@/lib/money';
import { Decimal } from 'decimal.js';

// Pure classification math extracted conceptually from getCashFlow
function signed(side: string, amount: string): Decimal {
  const a = toDecimal(amount);
  return side === 'DEBIT' ? a : a.negated();
}

function effect(openSide: string, openAmt: string, endSide: string, endAmt: string): Decimal {
  return signed(endSide, endAmt).minus(signed(openSide, openAmt)).negated();
}

describe('cash flow signed deltas', () => {
  it('AR increase (debit-normal) consumes cash', () => {
    // AR opening DEBIT 0 → ending DEBIT 10000 ⇒ Δ=+10000 ⇒ cash effect −10000
    expect(effect('DEBIT', '0.0000', 'DEBIT', '10000.0000').toNumber()).toBe(-10000);
  });
  it('Loan increase (credit-normal) provides cash', () => {
    expect(effect('CREDIT', '0.0000', 'CREDIT', '50000.0000').toNumber()).toBe(50000);
  });
  it('Capital increase provides cash (financing)', () => {
    expect(effect('CREDIT', '0.0000', 'CREDIT', '100000.0000').toNumber()).toBe(100000);
  });
  it('Cash movement equals sum of section effects', () => {
    // Fixture: CFO = NI 12000 − AR 10000 = 2000; CFF = +100000; CFI = 0; net = 102000
    const cfo = toDecimal('12000').plus(effect('DEBIT','0','DEBIT','10000'));
    const cff = effect('CREDIT','0','CREDIT','100000');
    expect(cfo.plus(cff).toNumber()).toBe(102000);
  });
});
