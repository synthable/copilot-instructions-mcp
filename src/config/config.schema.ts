import { z } from 'zod';

/**
 * Valid embedding provider types.
 * Shared constant to ensure consistency between schema and validation.
 */
export const EMBEDDING_PROVIDER_TYPES = [
  'transformers',
  'ollama',
  'cohere',
] as const;

/**
 * Valid vector store types.
 * Shared constant to ensure consistency between schema and validation.
 */
export const VECTOR_STORE_TYPES = ['file', 'sqlite'] as const;

export const configSchema = z.object({
  embeddingProvider: z
    .object({
      type: z.enum(EMBEDDING_PROVIDER_TYPES).default('transformers'),
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
      type: z.enum(VECTOR_STORE_TYPES).default('file'),
      path: z.string().optional(),
      dimensions: z.number().positive().optional(),
      enableIntegrityCheck: z.boolean().default(true),
    })
    .default({}),
  llmProvider: z
    .object({
      type: z.enum(['ollama']),
      model: z.string().min(1),
      baseUrl: z
        .string()
        .url()
        .optional()
        .or(z.literal('').transform(() => undefined)),
      apiKey: z.string().optional(),
      timeout: z.number().positive().optional(),
      maxRetries: z.number().int().min(0).optional(),
      defaultOptions: z
        .object({
          temperature: z.number().min(0).max(2).optional(),
          maxTokens: z.number().positive().optional(),
          topP: z.number().min(0).max(1).optional(),
          frequencyPenalty: z.number().min(-2).max(2).optional(),
          presencePenalty: z.number().min(-2).max(2).optional(),
          stop: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  searchProvider: z.object({
    name: z.string(),
  }),
  moduleDirectory: z.string().optional().default('instructions-modules'),
});

export type ServerConfig = z.infer<typeof configSchema>;
