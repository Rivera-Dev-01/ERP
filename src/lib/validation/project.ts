import { z } from 'zod';

export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120),
  client_name: z.string().trim().max(120).optional().default(''),
});

export type ProjectInput = z.infer<typeof projectSchema>;
