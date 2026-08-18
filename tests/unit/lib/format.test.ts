import { describe, expect, it } from 'vitest';
import { formatBusinessDate, formatPHP } from '@/lib/format';

describe('format', () => {
  it('formats PHP amounts with en-PH locale', () => {
    expect(formatPHP('1234.56')).toBe('₱1,234.56');
    expect(formatPHP('1000000')).toBe('₱1,000,000.00');
  });

  it('formats zero', () => {
    expect(formatPHP('0')).toBe('₱0.00');
  });

  it('formats ISO dates without timezone drift', () => {
    expect(formatBusinessDate('2026-07-15')).toBe('Jul 15, 2026');
  });
});
