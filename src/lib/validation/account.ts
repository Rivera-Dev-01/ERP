import { z } from 'zod';
export const accountSchema = z.object({
  code: z.string().trim().regex(/^\d+$/, 'Code must be numeric').min(1).max(20),
  name: z.string().trim().min(1, 'Account name is required').max(120),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  normal_balance: z.enum(['DEBIT', 'CREDIT']),
  is_active: z.coerce.boolean(),
  is_cash: z.coerce.boolean().optional().default(false),
  cf_category: z.enum(['OPERATING', 'INVESTING', 'FINANCING']).optional().default('OPERATING'),
});
export type AccountInput = z.infer<typeof accountSchema>;
