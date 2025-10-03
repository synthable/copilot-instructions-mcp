import { z } from 'zod';

export const configSchema = z.object({
  embeddingProvider: z.object({
    name: z.string(),
  }),
  searchProvider: z.object({
    name: z.string(),
  }),
  moduleDirectory: z.string().optional().default('instructions-modules'),
});

export type ServerConfig = z.infer<typeof configSchema>;
