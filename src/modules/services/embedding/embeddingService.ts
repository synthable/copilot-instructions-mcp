/**
 * @fileoverview Embedding service wrapper for provider abstraction.
 *
 * This module provides a thin wrapper around IEmbeddingProvider implementations,
 * maintaining backward compatibility with the IEmbeddingService interface while
 * delegating all embedding operations to the underlying provider.
 *
 * The service acts as an adapter between the legacy IEmbeddingService interface
 * and the new plugin-based IEmbeddingProvider architecture, enabling:
 * - Seamless provider swapping (Transformers.js, Ollama, OpenAI, etc.)
 * - Consistent error handling and logging
 * - Optional caching support when providers implement IEmbeddingProviderCache
 * - Progress callback standardization
 *
 * @author MCP Server Team
 * @version 2.0.0
 * @since 1.0.0
 */

import type {
  IEmbeddingService,
  ILogger,
  EmbeddingProgressCallback,
} from '../../core/interfaces.js';
import type {
  IEmbeddingProvider,
  IEmbeddingProviderCache,
  EmbeddingProviderConfig,
} from '../../plugins/embedding/embeddingProvider.interface.js';

/**
 * Type guard to check if a provider supports caching.
 */
function isCacheableProvider(
  provider: IEmbeddingProvider
): provider is IEmbeddingProvider & IEmbeddingProviderCache {
  return (
    'clearCache' in provider &&
    'getCacheStats' in provider &&
    'isCacheEnabled' in provider &&
    'setCacheEnabled' in provider &&
    typeof (provider as IEmbeddingProviderCache).clearCache === 'function' &&
    typeof (provider as IEmbeddingProviderCache).getCacheStats === 'function' &&
    typeof (provider as IEmbeddingProviderCache).isCacheEnabled === 'function' &&
    typeof (provider as IEmbeddingProviderCache).setCacheEnabled === 'function'
  );
}

/**
 * Embedding service that delegates to an IEmbeddingProvider implementation.
 *
 * @remarks
 * This service provides backward compatibility with the IEmbeddingService interface
 * while delegating all actual embedding operations to the injected provider.
 * It supports optional caching when the provider implements IEmbeddingProviderCache.
 *
 * The service is designed to be provider-agnostic and can work with any provider
 * implementation (Transformers.js, Ollama, OpenAI, Cohere, etc.).
 *
 * @example
 * ```typescript
 * // Using Transformers.js provider
 * const provider = new TransformersEmbeddingProvider();
 * const service = new EmbeddingService(provider, logger);
 *
 * await service.initialize({
 *   type: 'transformers',
 *   model: 'Xenova/all-MiniLM-L6-v2',
 *   dimensions: 384
 * });
 *
 * const embedding = await service.embed("Hello, world!");
 * ```
 */
export class EmbeddingService implements IEmbeddingService {
  private config: EmbeddingProviderConfig | null = null;

  constructor(
    private readonly provider: IEmbeddingProvider,
    private readonly logger: ILogger
  ) {}

  /**
   * Initializes the embedding provider with the given configuration.
   *
   * @param config - Provider configuration (will be passed to the underlying provider)
   * @param progressCallback - Optional callback for initialization progress
   *
   * @throws {Error} If provider initialization fails
   *
   * @remarks
   * This method delegates to the underlying provider's initialize() method.
   * The provider handles all model loading, downloads, and setup.
   */
  async initialize(
    config: EmbeddingProviderConfig,
    progressCallback?: EmbeddingProgressCallback
  ): Promise<void>;

  /**
   * Legacy initialize signature for backward compatibility.
   * Initializes with stored configuration.
   */
  async initialize(progressCallback?: EmbeddingProgressCallback): Promise<void>;

  async initialize(
    configOrCallback?: EmbeddingProviderConfig | EmbeddingProgressCallback,
    progressCallback?: EmbeddingProgressCallback
  ): Promise<void> {
    try {
      // Handle overloaded signatures
      let config: EmbeddingProviderConfig | null = null;
      let callback: EmbeddingProgressCallback | undefined = undefined;

      if (typeof configOrCallback === 'function') {
        // Legacy signature: initialize(progressCallback?)
        callback = configOrCallback;
        config = this.config;

        if (!config) {
          throw new Error(
            'No configuration available. Call initialize with configuration first.'
          );
        }
      } else if (configOrCallback && typeof configOrCallback === 'object') {
        // New signature: initialize(config, progressCallback?)
        config = configOrCallback;
        callback = progressCallback;
        this.config = config;
      } else if (!configOrCallback) {
        // initialize() with no arguments - use stored config
        config = this.config;

        if (!config) {
          throw new Error(
            'No configuration available. Call initialize with configuration first.'
          );
        }
      }

      if (!config) {
        throw new Error('Invalid configuration provided');
      }

      this.logger.debug('Initializing embedding service', {
        provider: this.provider.name,
        model: config.model,
      });

      await this.provider.initialize(config, callback);

      this.logger.info('Embedding service initialized successfully', {
        provider: this.provider.name,
        model: this.provider.model,
        dimensions: this.provider.dimensions,
      });
    } catch (error) {
      this.logger.error(
        'Failed to initialize embedding service',
        error instanceof Error ? error : undefined,
        {
          provider: this.provider.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
      throw error;
    }
  }

  /**
   * Generates an embedding vector for a single text input.
   *
   * @param text - The text to embed
   * @param progressCallback - Optional callback for progress updates
   * @returns Promise resolving to the embedding vector
   *
   * @throws {Error} If provider is not initialized or embedding generation fails
   *
   * @remarks
   * Delegates to the underlying provider's embed() method. The provider handles
   * all validation, truncation, and transformation logic.
   */
  async embed(
    text: string,
    progressCallback?: EmbeddingProgressCallback
  ): Promise<number[]> {
    try {
      this.logger.debug('Generating single embedding', {
        textLength: text.length,
        provider: this.provider.name,
      });

      const embedding = await this.provider.embed(text, progressCallback);

      this.logger.debug('Successfully generated embedding', {
        dimensions: embedding.length,
        provider: this.provider.name,
      });

      return embedding;
    } catch (error) {
      this.logger.error(
        'Failed to generate single embedding',
        error instanceof Error ? error : undefined,
        {
          provider: this.provider.name,
          textLength: text.length,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
      throw error;
    }
  }

  /**
   * Generates embedding vectors for multiple text inputs in a batch.
   *
   * @param texts - Array of texts to embed
   * @param progressCallback - Optional callback for batch processing progress
   * @returns Promise resolving to array of embedding vectors
   *
   * @throws {Error} If provider is not initialized or batch generation fails
   *
   * @remarks
   * Delegates to the underlying provider's embedBatch() method. The provider handles
   * all batching, optimization, and parallel processing logic.
   */
  async embedBatch(
    texts: string[],
    progressCallback?: EmbeddingProgressCallback
  ): Promise<number[][]> {
    try {
      this.logger.debug('Generating batch embeddings', {
        batchSize: texts.length,
        provider: this.provider.name,
      });

      const embeddings = await this.provider.embedBatch(texts, progressCallback);

      this.logger.debug('Successfully generated batch embeddings', {
        count: embeddings.length,
        dimensions: embeddings[0]?.length || 0,
        provider: this.provider.name,
      });

      return embeddings;
    } catch (error) {
      this.logger.error(
        'Failed to generate batch embeddings',
        error instanceof Error ? error : undefined,
        {
          provider: this.provider.name,
          batchSize: texts.length,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
      throw error;
    }
  }

  /**
   * Checks if the embedding service is properly initialized.
   *
   * @returns true if the underlying provider is initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.provider.isInitialized();
  }

  /**
   * Clears the embedding cache if the provider supports caching.
   *
   * @remarks
   * This method only works if the underlying provider implements IEmbeddingProviderCache.
   * If the provider doesn't support caching, this method logs a warning and does nothing.
   */
  clearCache(): void {
    if (isCacheableProvider(this.provider)) {
      const cleared = this.provider.clearCache();
      this.logger.debug('Embedding cache cleared', {
        entriesCleared: cleared,
        provider: this.provider.name,
      });
    } else {
      this.logger.warn('Provider does not support caching', undefined, {
        provider: this.provider.name,
      });
    }
  }

  /**
   * Gets cache statistics if the provider supports caching.
   *
   * @returns Cache statistics or default values if caching is not supported
   *
   * @remarks
   * Returns cache hit/miss statistics and current size if the provider implements
   * IEmbeddingProviderCache. Otherwise returns zeros.
   */
  getCacheStats(): { hits: number; misses: number; size: number } {
    if (isCacheableProvider(this.provider)) {
      const stats = this.provider.getCacheStats();
      return {
        hits: stats.hits,
        misses: stats.misses,
        size: stats.size,
      };
    }

    this.logger.debug('Provider does not support caching, returning empty stats', {
      provider: this.provider.name,
    });

    return {
      hits: 0,
      misses: 0,
      size: 0,
    };
  }

  /**
   * Disposes of the embedding provider and releases all resources.
   *
   * @remarks
   * Delegates to the underlying provider's dispose() method. After disposal,
   * isInitialized() will return false and embedding operations will fail.
   *
   * Safe to call multiple times - subsequent calls are no-ops.
   */
  async dispose(): Promise<void> {
    this.logger.info('Disposing embedding service', {
      provider: this.provider.name,
    });

    await this.provider.dispose();

    this.logger.debug('Embedding service disposed successfully', {
      provider: this.provider.name,
    });
  }
}
