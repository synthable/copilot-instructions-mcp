import { z } from 'zod';

export const configSchema = z.object({
  embeddingProvider: z
    .object({
      type: z
        .enum(['transformers', 'ollama', 'lmstudio', 'openai', 'cohere'])
        .default('transformers'),
      model: z.string().min(1).default('all-mpnet-base-v2'),
      baseUrl: z
        .string()
        .url()
        .optional()
        .or(z.literal('').transform(() => undefined)),
      apiKey: z.string().optional(),
      dimensions: z.number().positive().optional(),
      cacheEnabled: z.boolean().default(true),
      maxCacheSize: z.number().positive().optional(),
    })
    .default({}),
  vectorStore: z
    .object({
      type: z.enum(['file', 'sqlite']).default('file'),
      path: z.string().optional(),
      dimensions: z.number().positive().optional(),
      enableIntegrityCheck: z.boolean().default(true),
    })
    .default({}),
  searchProvider: z.object({
    name: z.string(),
  }),
  moduleDirectory: z.string().optional().default('instructions-modules'),
});

export type ServerConfig = z.infer<typeof configSchema>;
