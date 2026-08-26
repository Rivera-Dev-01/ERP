import { z } from 'zod';

export const companySchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(120),
  client_name: z.string().trim().max(120).optional().default(''),
});

export type CompanyInput = z.infer<typeof companySchema>;

// Backwards compat aliases
export const projectSchema = companySchema;
export type ProjectInput = CompanyInput;
