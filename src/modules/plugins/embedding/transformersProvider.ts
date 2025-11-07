/**
 * @fileoverview Transformers.js Embedding Provider Implementation
 *
 * This module provides a local, browser-compatible embedding provider using Transformers.js.
 * It implements the IEmbeddingProvider interface and includes full support for caching
 * via the IEmbeddingProviderCache extension interface.
 *
 * Features:
 * - Local embedding generation using @xenova/transformers
 * - MD5-based content caching with hit/miss tracking
 * - Batch processing optimization
 * - Progress callbacks for long-running operations
 * - Automatic model download and initialization
 * - Resource cleanup and disposal
 *
 * @author MCP Server Team
 * @version 2.0.0
 * @since 2.0.0
 */

import { createHash } from 'node:crypto';
import type {
  IEmbeddingProvider,
  IEmbeddingProviderCache,
  EmbeddingProviderConfig,
  EmbeddingProgressCallback,
} from './embeddingProvider.interface.js';
import {
  EmbeddingProviderInitError,
  EmbeddingGenerationError,
  EmbeddingProviderNotInitializedError,
  EmbeddingConfigError,
} from './embeddingProvider.interface.js';
import { createLogger } from '../../utils/logger.js';
import type { ILogger } from '../../core/interfaces.js';

/**
 * Validated embedding tensor type from transformer output.
 */
interface ValidatedEmbeddingTensor {
  data: Float32Array | number[];
  dimensions: number;
}

/**
 * Type-safe transformer pipeline interface.
 */
type TransformerPipeline = (
  input: string | string[],
  options?: {
    pooling?: 'mean' | 'max';
    normalize?: boolean;
  }
) => Promise<unknown>;

/**
 * Type-safe transformers module interface.
 */
interface TransformersModule {
  pipeline: (task: string, model: string) => Promise<TransformerPipeline>;
}

/**
 * Cache entry for embeddings with MD5-based invalidation.
 */
interface EmbeddingCacheEntry {
  /** MD5 hash of the input text */
  hash: string;
  /** Cached embedding vector */
  embedding: number[];
  /** Timestamp when cached */
  timestamp: number;
}

/**
 * Transformers.js embedding provider with full caching support.
 *
 * @remarks
 * This provider uses @xenova/transformers for local, serverless embedding generation.
 * It implements both IEmbeddingProvider and IEmbeddingProviderCache interfaces.
 *
 * The provider handles:
 * - Automatic model download from HuggingFace
 * - Efficient batch processing
 * - MD5-based result caching
 * - Progress tracking for initialization and processing
 * - Proper resource cleanup
 *
 * @example
 * ```typescript
 * const provider = new TransformersEmbeddingProvider();
 * await provider.initialize({
 *   type: 'transformers',
 *   model: 'Xenova/all-mpnet-base-v2',
 *   dimensions: 768,
 *   batchSize: 32
 * });
 *
 * const embedding = await provider.embed("Hello, world!");
 * await provider.dispose();
 * ```
 */
export class TransformersEmbeddingProvider
  implements IEmbeddingProvider, IEmbeddingProviderCache
{
  readonly name = 'Transformers.js';

  private _model = '';
  private _dimensions = 0;
  private _initialized = false;
  private _batchSize = 32;
  private _maxContentLength = 1536;
  private _cacheEnabled = true;

  private pipeline: TransformerPipeline | null = null;
  private embeddingCache = new Map<string, EmbeddingCacheEntry>();
  private cacheStats = { hits: 0, misses: 0 };
  private disposeTimer: NodeJS.Timeout | null = null;
  private logger: ILogger;

  constructor() {
    this.logger = createLogger('transformers-provider');
  }

  get model(): string {
    return this._model;
  }

  get dimensions(): number {
    return this._dimensions;
  }

  /**
   * Initializes the Transformers.js provider.
   */
  async initialize(
    config: EmbeddingProviderConfig,
    progressCallback?: EmbeddingProgressCallback
  ): Promise<void> {
    try {
      // Validate configuration
      if (config.type !== 'transformers') {
        throw new EmbeddingConfigError(
          this.name,
          `Invalid provider type: ${config.type}, expected 'transformers'`
        );
      }

      if (!config.model) {
        throw new EmbeddingConfigError(this.name, 'Model name is required');
      }

      this._model = config.model;

      // Set dimensions with model-specific defaults or validation
      if (config.dimensions !== undefined) {
        this._dimensions = config.dimensions;
      } else {
        // Try to infer dimensions from known model patterns
        if (config.model.includes('all-MiniLM')) {
          this._dimensions = 384; // all-MiniLM models
        } else if (config.model.includes('all-mpnet-base-v2')) {
          this._dimensions = 768; // all-mpnet-base-v2
        } else {
          // Unknown model - default to 768 with warning
          this._dimensions = 768;
          this.logger.warn(
            `Using default dimensions (768) with model '${config.model}'. ` +
              `Consider explicitly specifying 'dimensions' in config to match your model's output.`
          );
        }
      }

      this._batchSize = config.batchSize ?? 32;
      this._maxContentLength = config.maxContentLength ?? 1536;

      // Handle provider-specific options
      if (config.providerOptions) {
        if (typeof config.providerOptions.cacheEnabled === 'boolean') {
          this._cacheEnabled = config.providerOptions.cacheEnabled;
        }
      }

      this.logger.info('Initializing Transformers provider', {
        model: this._model,
        dimensions: this._dimensions,
        batchSize: this._batchSize,
        cacheEnabled: this._cacheEnabled,
      });

      progressCallback?.('initialization', 0.1, 'Starting initialization');

      // Load transformers module
      progressCallback?.('loading', 0.2, 'Loading transformers module');
      const transformersModule = await this.loadTransformersModule();

      // Create pipeline
      progressCallback?.('loading', 0.5, 'Creating pipeline');
      this.pipeline = await this.createPipeline(transformersModule, progressCallback);

      // Validate pipeline
      progressCallback?.('loading', 0.8, 'Validating pipeline');
      await this.validatePipeline();

      this._initialized = true;
      progressCallback?.('initialization', 1.0, 'Initialization complete');

      this.logger.info('Transformers provider initialized successfully');

      // Set up idle disposal timer
      this.resetDisposeTimer();
    } catch (error) {
      throw new EmbeddingProviderInitError(
        this.name,
        `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generates an embedding for a single text.
   */
  async embed(
    text: string,
    progressCallback?: EmbeddingProgressCallback
  ): Promise<number[]> {
    if (!this._initialized || !this.pipeline) {
      throw new EmbeddingProviderNotInitializedError(this.name);
    }

    const truncatedText = this.validateAndTruncateText(text);

    // Check cache first
    if (this._cacheEnabled) {
      const hash = this.computeTextHash(truncatedText);
      const cached = this.embeddingCache.get(hash);

      if (cached) {
        this.cacheStats.hits++;
        progressCallback?.('processing', 1.0, 'Retrieved from cache');
        this.logger.debug('Cache hit for embedding', {
          hash,
          textLength: truncatedText.length,
        });
        this.resetDisposeTimer();
        return cached.embedding;
      }

      this.cacheStats.misses++;
    }

    try {
      progressCallback?.('processing', 0.1, 'Computing embedding');
      const results = await this.embedBatch([truncatedText], progressCallback);
      const embedding = results[0];

      // Cache the result
      if (this._cacheEnabled) {
        const hash = this.computeTextHash(truncatedText);
        this.embeddingCache.set(hash, {
          hash,
          embedding,
          timestamp: Date.now(),
        });
      }

      progressCallback?.('processing', 1.0, 'Embedding computed and cached');
      this.resetDisposeTimer();
      return embedding;
    } catch (error) {
      throw new EmbeddingGenerationError(
        this.name,
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generates embeddings for multiple texts in a batch.
   * Processes items individually to handle partial failures gracefully.
   */
  async embedBatch(
    texts: string[],
    progressCallback?: EmbeddingProgressCallback
  ): Promise<number[][]> {
    if (!this._initialized || !this.pipeline) {
      throw new EmbeddingProviderNotInitializedError(this.name);
    }

    if (texts.length === 0) {
      return [];
    }

    // Enforce batch size limit
    if (texts.length > this._batchSize) {
      throw new EmbeddingGenerationError(
        this.name,
        `Batch size ${texts.length} exceeds limit of ${this._batchSize}`
      );
    }

    progressCallback?.('processing', 0.0, 'Processing batch');

    const results: number[][] = [];
    const errors: Map<number, Error> = new Map();

    // Process each text individually to handle failures
    for (let i = 0; i < texts.length; i++) {
      try {
        const text = texts[i];

        // Validate and truncate text
        const truncated = this.validateAndTruncateText(text);

        // Check cache first
        let embedding: number[] | undefined;
        if (this._cacheEnabled) {
          const hash = this.computeTextHash(truncated);
          const cached = this.embeddingCache.get(hash);

          if (cached) {
            this.cacheStats.hits++;
            embedding = cached.embedding;
            this.logger.debug('Cache hit for embedding in batch', {
              hash,
              textLength: truncated.length,
              index: i,
            });
          } else {
            this.cacheStats.misses++;
          }
        }

        // Generate embedding if not cached
        if (!embedding) {
          const result = await this.pipeline([truncated], {
            pooling: 'mean',
            normalize: true,
          });

          const embeddings = this.validateAndExtractEmbeddings(result, 1);
          embedding = embeddings[0];

          // Cache the result
          if (this._cacheEnabled) {
            const hash = this.computeTextHash(truncated);
            this.embeddingCache.set(hash, {
              hash,
              embedding,
              timestamp: Date.now(),
            });
          }
        }

        results.push(embedding);
        progressCallback?.('processing', (i + 1) / texts.length, `Processed ${i + 1}/${texts.length}`);
      } catch (error) {
        // Log error but continue processing
        const err = error instanceof Error ? error : new Error(String(error));
        errors.set(i, err);

        this.logger.error(
          `Failed to generate embedding for item ${i} in batch`,
          err,
          { index: i, text: texts[i].slice(0, 50) }
        );

        // Add empty array as placeholder to maintain order
        results.push([]);
      }
    }

    // If ALL items failed, throw error
    if (errors.size === texts.length) {
      throw new EmbeddingGenerationError(
        this.name,
        `All ${texts.length} items in batch failed to generate embeddings`
      );
    }

    // If SOME items failed, log warning
    if (errors.size > 0) {
      this.logger.warn(
        `Partial batch failure: ${errors.size}/${texts.length} items failed`,
        undefined,
        { failedIndices: Array.from(errors.keys()) }
      );
    }

    progressCallback?.('processing', 1.0, 'Batch complete');

    this.resetDisposeTimer();
    return results;
  }

  /**
   * Checks if the provider is initialized.
   */
  isInitialized(): boolean {
    return this._initialized && this.pipeline !== null;
  }

  /**
   * Disposes of the provider and releases resources.
   */
  async dispose(): Promise<void> {
    if (this.disposeTimer) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = null;
    }

    this.pipeline = null;
    this._initialized = false;
    this.clearCache();

    this.logger.info('Transformers provider disposed');

    // Method is async to satisfy IEmbeddingProvider interface
    return Promise.resolve();
  }

  // IEmbeddingProviderCache implementation

  /**
   * Clears the embedding cache.
   */
  clearCache(): number {
    const size = this.embeddingCache.size;
    this.embeddingCache.clear();
    this.cacheStats = { hits: 0, misses: 0 };
    this.logger.debug('Embedding cache cleared', { entriesCleared: size });
    return size;
  }

  /**
   * Gets cache statistics.
   */
  getCacheStats(): {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? this.cacheStats.hits / total : 0;

    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      size: this.embeddingCache.size,
      hitRate,
    };
  }

  /**
   * Checks if caching is enabled.
   */
  isCacheEnabled(): boolean {
    return this._cacheEnabled;
  }

  /**
   * Enables or disables caching.
   */
  setCacheEnabled(enabled: boolean): void {
    this._cacheEnabled = enabled;
    if (!enabled) {
      this.clearCache();
    }
    this.logger.debug('Cache enabled status changed', { enabled });
  }

  // Private helper methods

  /**
   * Loads the transformers module with proper error handling.
   */
  private async loadTransformersModule(): Promise<TransformersModule> {
    try {
      const module = await import('@xenova/transformers');

      if (typeof module.pipeline !== 'function') {
        throw new Error('Invalid transformers module: missing pipeline function');
      }

      return module as TransformersModule;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot resolve module')) {
        throw new Error(
          'Transformers module not installed. Run: npm install @xenova/transformers'
        );
      }
      throw error;
    }
  }

  /**
   * Creates a validated transformer pipeline with download progress feedback.
   */
  private async createPipeline(
    transformersModule: TransformersModule,
    progressCallback?: EmbeddingProgressCallback
  ): Promise<TransformerPipeline> {
    try {
      progressCallback?.('download', 0.0, 'Starting model download');

      const pipeline = await transformersModule.pipeline(
        'feature-extraction',
        this._model
      );

      progressCallback?.('download', 1.0, 'Model download complete');

      if (typeof pipeline !== 'function') {
        throw new Error('Pipeline creation returned invalid function');
      }

      return pipeline;
    } catch (error) {
      throw new Error(
        `Failed to create pipeline for model "${this._model}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validates the pipeline with a test embedding.
   */
  private async validatePipeline(): Promise<void> {
    if (!this.pipeline) {
      throw new Error('Pipeline not available for validation');
    }

    try {
      const testResult = await this.pipeline('test validation', {
        pooling: 'mean',
        normalize: true,
      });

      const validated = this.validateAndExtractEmbeddings(testResult, 1);

      if (validated.length !== 1 || validated[0].length !== this._dimensions) {
        throw new Error(
          `Pipeline validation failed: expected ${this._dimensions.toString()} dimensions, got ${(validated[0]?.length || 0).toString()}`
        );
      }

      this.logger.debug('Pipeline validation successful', {
        dimensions: validated[0].length.toString(),
      });
    } catch (error) {
      throw new Error(
        `Pipeline validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validates and truncates individual text input.
   */
  private validateAndTruncateText(text: string): string {
    if (typeof text !== 'string') {
      throw new Error(
        `Text input must be a string, got ${typeof text === 'object' ? JSON.stringify(text) : String(text)}`
      );
    }

    if (text.length === 0) {
      throw new Error('Text input cannot be empty');
    }

    if (text.length > this._maxContentLength) {
      this.logger.warn('Text input truncated due to model length limit', undefined, {
        originalLength: text.length,
        maxLength: this._maxContentLength,
        truncated: text.length - this._maxContentLength,
      });
      return text.substring(0, this._maxContentLength);
    }

    return text;
  }


  /**
   * Validates and extracts embeddings from transformer output.
   */
  private validateAndExtractEmbeddings(
    result: unknown,
    expectedCount: number
  ): number[][] {
    if (!result) {
      throw new Error('Transformer returned null or undefined result');
    }

    // Handle array of results (individual tensor objects)
    if (Array.isArray(result)) {
      if (result.length !== expectedCount) {
        throw new Error(
          `Expected ${expectedCount.toString()} results, got ${result.length.toString()}`
        );
      }
      return result.map((item, index) => this.extractSingleEmbedding(item, index));
    }

    // Handle single tensor object
    if (expectedCount === 1) {
      return [this.extractSingleEmbedding(result, 0)];
    }

    // For batch processing, the transformer returns a single tensor with all embeddings
    try {
      const validated = this.validateTensorStructure(result);
      const totalExpectedElements = expectedCount * this._dimensions;

      if (validated.data.length !== totalExpectedElements) {
        throw new Error(
          `Invalid batch tensor size: expected ${totalExpectedElements.toString()} elements (${expectedCount.toString()} × ${this._dimensions.toString()}), got ${validated.data.length.toString()}`
        );
      }

      // Split the flattened data into individual embeddings
      const embeddings: number[][] = [];
      const numbers = this.convertToNumbers(validated.data);

      for (let i = 0; i < expectedCount; i++) {
        const start = i * this._dimensions;
        const end = start + this._dimensions;
        embeddings.push(numbers.slice(start, end));
      }

      return embeddings;
    } catch (error) {
      throw new Error(
        `Failed to extract batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extracts a single embedding vector from transformer output.
   */
  private extractSingleEmbedding(item: unknown, index: number): number[] {
    try {
      const validated = this.validateTensorStructure(item);
      const numbers = this.convertToNumbers(validated.data);

      if (numbers.length !== this._dimensions) {
        throw new Error(
          `Invalid embedding dimensions: expected ${this._dimensions.toString()}, got ${numbers.length.toString()}`
        );
      }

      return numbers;
    } catch (error) {
      throw new Error(
        `Failed to extract embedding at index ${index.toString()}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validates tensor structure with proper type checking.
   */
  private validateTensorStructure(item: unknown): ValidatedEmbeddingTensor {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid tensor: not an object');
    }

    const obj = item as Record<string, unknown>;

    if (!('data' in obj) || !obj.data) {
      throw new Error('Invalid tensor: missing data property');
    }

    const data = obj.data;

    if (!this.isArrayLike(data)) {
      throw new Error('Invalid tensor: data is not array-like');
    }

    return {
      data,
      dimensions: data.length,
    };
  }

  /**
   * Checks if value is array-like (Float32Array or number array).
   */
  private isArrayLike(value: unknown): value is Float32Array | number[] {
    return (
      value instanceof Float32Array ||
      (Array.isArray(value) && value.every(item => typeof item === 'number'))
    );
  }

  /**
   * Converts Float32Array or number array to number array.
   */
  private convertToNumbers(data: Float32Array | number[]): number[] {
    if (data instanceof Float32Array) {
      return Array.from(data);
    }

    if (Array.isArray(data)) {
      return data.map(Number);
    }

    throw new Error('Invalid data type for conversion to numbers');
  }

  /**
   * Computes MD5 hash of text for cache keys.
   */
  private computeTextHash(text: string): string {
    return createHash('md5').update(text, 'utf8').digest('hex');
  }

  /**
   * Resets the dispose timer for idle disposal.
   */
  private resetDisposeTimer(): void {
    if (this.disposeTimer) {
      clearTimeout(this.disposeTimer);
    }

    // Dispose after 5 minutes of inactivity
    this.disposeTimer = setTimeout(
      () => {
        this.logger.debug('Disposing embedding provider due to inactivity');
        void this.dispose();
      },
      5 * 60 * 1000
    ).unref();
  }
}
