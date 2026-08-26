import { z } from 'zod';

export const organizationUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required').max(120),
  legal_name: z.string().trim().min(1, 'Legal name is required').max(120),
  tin: z.string().trim().max(20).nullable().optional().refine((v) => !v || /^[0-9-]{9,20}$/.test(v as string), 'TIN must be 9-12 digits (dashes allowed)'),
  rdo: z.string().trim().max(10).nullable().optional().refine((v) => !v || /^[0-9]{1,5}$/.test(v as string), 'RDO must be 1-5 digits'),
  branch_code: z.string().trim().max(20).nullable().optional().refine((v) => !v || /^[A-Za-z0-9-]{1,20}$/.test(v as string), 'Branch code 1-20 alphanumeric'),
  address: z.string().trim().max(500).nullable().optional(),
  tax_classification: z.string().trim().nullable().optional().refine((v) => !v || ['VAT', 'NON_VAT', 'PERCENTAGE'].includes(v as string), 'Invalid tax classification'),
  fiscal_year_start_month: z.coerce.number().int().min(1).max(12).default(1),
});

export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
