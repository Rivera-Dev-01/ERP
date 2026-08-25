import { z } from 'zod';

export const organizationUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required').max(120),
  legal_name: z.string().trim().min(1, 'Legal name is required').max(120),
});

export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
