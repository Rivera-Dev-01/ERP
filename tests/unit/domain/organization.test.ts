import { describe, expect, it } from 'vitest';
import { organizationUpdateSchema } from '@/lib/validation/organization';

describe('organizationUpdateSchema', () => {
  it('accepts trimmed legal names', () => {
    expect(organizationUpdateSchema.parse({ name: ' Acme ', legal_name: ' Acme LLC ' })).toMatchObject({
      name: 'Acme',
      legal_name: 'Acme LLC',
      fiscal_year_start_month: 1,
    });
  });
  it('rejects empty name', () => {
    expect(() => organizationUpdateSchema.parse({ name: ' ', legal_name: 'x' })).toThrow();
  });
  it('rejects overlong name', () => {
    expect(() =>
      organizationUpdateSchema.parse({ name: 'a'.repeat(121), legal_name: 'x' }),
    ).toThrow();
  });
});
