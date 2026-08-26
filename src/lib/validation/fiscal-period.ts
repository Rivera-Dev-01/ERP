import { z } from 'zod';
export const fiscalPeriodSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  })
  .refine((v) => new Date(v.end_date) >= new Date(v.start_date), {
    message: 'End date must be on or after start date',
    path: ['end_date'],
  });
export type FiscalPeriodInput = z.infer<typeof fiscalPeriodSchema>;

export const reopenReasonSchema = z
  .object({ reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500) })
  .strict();
export type ReopenReasonInput = z.infer<typeof reopenReasonSchema>;
