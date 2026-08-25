import { describe, expect, it } from 'vitest';
import { fiscalPeriodSchema } from '@/lib/validation/fiscal-period';
describe('fiscalPeriodSchema', () => {
  it('accepts valid open period', () => {
    expect(
      fiscalPeriodSchema.parse({
        name: 'Aug 2026',
        start_date: '2026-08-01',
        end_date: '2026-08-31',
      }),
    ).toEqual({ name: 'Aug 2026', start_date: '2026-08-01', end_date: '2026-08-31' });
  });
  it('rejects end before start', () => {
    expect(() =>
      fiscalPeriodSchema.parse({ name: 'Bad', start_date: '2026-08-31', end_date: '2026-08-01' }),
    ).toThrow();
  });
  it('rejects empty name', () => {
    expect(() =>
      fiscalPeriodSchema.parse({ name: ' ', start_date: '2026-08-01', end_date: '2026-08-31' }),
    ).toThrow();
  });
});
