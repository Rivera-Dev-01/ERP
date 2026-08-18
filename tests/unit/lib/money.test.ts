import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  add,
  isBalanced,
  isNegative,
  isPositive,
  isZero,
  sub,
  toDbString,
  toDecimal,
} from '@/lib/money';

describe('money', () => {
  it('adds without floating-point drift', () => {
    expect(add('0.1', '0.2').toString()).toBe('0.3');
  });

  it('subtracts exactly', () => {
    expect(sub('1.00', '0.01').toString()).toBe('0.99');
  });

  it('wraps Decimal instances unchanged', () => {
    const d = toDecimal(new Decimal('42.50'));
    expect(d.toString()).toBe('42.5');
  });

  it('rejects NaN and non-numeric strings', () => {
    expect(() => toDecimal('abc')).toThrow('Invalid monetary value');
    expect(() => toDecimal('')).toThrow('Invalid monetary value');
    expect(() => toDecimal(NaN)).toThrow('Invalid monetary value');
    expect(() => toDecimal(Infinity)).toThrow('Invalid monetary value');
  });

  it('detects zero, positive, and negative', () => {
    expect(isZero('0')).toBe(true);
    expect(isPositive('0.01')).toBe(true);
    expect(isNegative('-0.01')).toBe(true);
    expect(isPositive('0')).toBe(false);
  });

  it('detects balanced debit/credit sets', () => {
    expect(isBalanced(['100.00', '50.00'], ['150.00'])).toBe(true);
    expect(isBalanced(['100.00'], ['99.99'])).toBe(false);
  });

  it('serializes to the NUMERIC(19,4) database scale', () => {
    expect(toDbString('1.5')).toBe('1.5000');
    expect(toDbString('1.23456')).toBe('1.2346');
    expect(toDbString('0')).toBe('0.0000');
  });
});
