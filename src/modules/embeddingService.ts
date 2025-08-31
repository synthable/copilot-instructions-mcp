/**
 * @fileoverview Production embedding service implementation.
 *
 * This module provides a type-safe, properly validated embedding service
 * that abstracts transformer model operations with comprehensive error handling,
 * resource management, embedding caching, and progress callbacks.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { createHash } from 'node:crypto';
import type { 
  IEmbeddingService, 
  ISemanticConfig, 
  ILogger,
  EmbeddingProgressCallback,
  EmbeddingCacheEntry
} from './interfaces.js';

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
 * Production embedding service with proper type safety, error handling, caching, and progress callbacks.
 */
export class EmbeddingService implements IEmbeddingService {
  private pipeline: TransformerPipeline | null = null;
  private initialized = false;
  private embeddingCache = new Map<string, EmbeddingCacheEntry>();
  private cacheStats = { hits: 0, misses: 0 };
  private disposeTimer: NodeJS.Timeout | null = null;

  constructor(
    private config: ISemanticConfig,
    private logger: ILogger
  ) {}

  /**
   * Initializes the embedding pipeline with comprehensive error handling and progress callbacks.
   */
  async initialize(progressCallback?: EmbeddingProgressCallback): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Embedding service already initialized');
      progressCallback?.('initialization', 1.0, 'Already initialized');
      return;
    }

    try {
      this.logger.info('Initializing embedding service', {
        model: this.config.getModelName(),
        batchSize: this.config.getBatchSize(),
      });

      progressCallback?.('initialization', 0.1, 'Starting initialization');

      // Dynamic import with proper error handling
      progressCallback?.('loading', 0.2, 'Loading transformers module');
      const transformersModule = await this.loadTransformersModule();
      
      progressCallback?.('loading', 0.5, 'Creating pipeline');
      this.pipeline = await this.createPipeline(transformersModule);

      // Validate pipeline with test embedding
      progressCallback?.('loading', 0.8, 'Validating pipeline');
      await this.validatePipeline();

      this.initialized = true;
      progressCallback?.('initialization', 1.0, 'Initialization complete');
      this.logger.info('Embedding service initialized successfully');

      // Set up idle disposal timer
      this.resetDisposeTimer();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown initialization error';
      this.logger.error(
        'Failed to initialize embedding service',
        error instanceof Error ? error : undefined,
        {
          model: this.config.getModelName(),
          error: errorMessage,
        }
      );
      progressCallback?.('initialization', 0, `Initialization failed: ${errorMessage}`);
      throw new Error(`Embedding service initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Generates embeddings for a single text input with validation, caching, and progress callbacks.
   */
  async embed(text: string, progressCallback?: EmbeddingProgressCallback): Promise<number[]> {
    this.ensureInitialized();
    this.validateTextInput(text);

    // Check cache first
    const hash = this.computeTextHash(text);
    const cached = this.embeddingCache.get(hash);
    
    if (cached) {
      this.cacheStats.hits++;
      progressCallback?.('processing', 1.0, 'Retrieved from cache');
      this.logger.debug('Cache hit for embedding', { hash, textLength: text.length });
      this.resetDisposeTimer();
      return cached.embedding;
    }

    this.cacheStats.misses++;

    try {
      progressCallback?.('processing', 0.1, 'Computing embedding');
      const results = await this.embedBatch([text], progressCallback);
      const embedding = results[0];
      
      // Cache the result
      this.embeddingCache.set(hash, {
        hash,
        embedding,
        timestamp: Date.now()
      });
      
      progressCallback?.('processing', 1.0, 'Embedding computed and cached');
      this.resetDisposeTimer();
      return embedding;
    } catch (error) {
      this.logger.error(
        'Failed to generate single embedding',
        error instanceof Error ? error : undefined,
        {
          textLength: text.length.toString(),
          hash,
        }
      );
      throw new Error(
        `Single embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generates embeddings for multiple text inputs with proper batching, caching, and validation.
   */
  async embedBatch(texts: string[], progressCallback?: EmbeddingProgressCallback): Promise<number[][]> {
    this.ensureInitialized();
    this.validateBatchInput(texts);

    if (!this.pipeline) {
      throw new Error('Pipeline not initialized');
    }

    // Check cache for existing embeddings
    const results: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    progressCallback?.('processing', 0.1, 'Checking cache for batch');

    texts.forEach((text, index) => {
      const hash = this.computeTextHash(text);
      const cached = this.embeddingCache.get(hash);
      
      if (cached) {
        results[index] = cached.embedding;
        this.cacheStats.hits++;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(index);
        this.cacheStats.misses++;
      }
    });

    this.logger.debug('Batch cache analysis', {
      totalTexts: texts.length,
      cachedCount: texts.length - uncachedTexts.length,
      uncachedCount: uncachedTexts.length,
    });

    // Process uncached texts
    if (uncachedTexts.length > 0) {
      try {
        progressCallback?.('processing', 0.3, `Computing ${uncachedTexts.length.toString()} new embeddings`);

        this.logger.debug('Generating batch embeddings', {
          batchSize: uncachedTexts.length.toString(),
          totalChars: uncachedTexts.reduce((sum, text) => sum + text.length, 0),
        });

        const result = await this.pipeline(uncachedTexts, {
          pooling: 'mean',
          normalize: true,
        });

        progressCallback?.('processing', 0.8, 'Extracting embeddings');
        const embeddings = this.validateAndExtractEmbeddings(result, uncachedTexts.length);

        // Cache new embeddings and fill results
        embeddings.forEach((embedding, embeddingIndex) => {
          const originalIndex = uncachedIndices[embeddingIndex];
          const text = uncachedTexts[embeddingIndex];
          const hash = this.computeTextHash(text);
          
          // Cache the result
          this.embeddingCache.set(hash, {
            hash,
            embedding,
            timestamp: Date.now()
          });
          
          results[originalIndex] = embedding;
        });

        progressCallback?.('processing', 1.0, 'Batch processing complete');

        this.logger.debug('Successfully generated batch embeddings', {
          count: embeddings.length.toString(),
          dimensions: (embeddings[0]?.length || 0).toString(),
        });
      } catch (error) {
        this.logger.error(
          'Failed to generate batch embeddings',
          error instanceof Error ? error : undefined,
          {
            batchSize: uncachedTexts.length.toString(),
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        );
        throw new Error(
          `Batch embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    } else {
      progressCallback?.('processing', 1.0, 'All embeddings retrieved from cache');
    }

    this.resetDisposeTimer();
    return results;
  }

  /**
   * Checks if the service is properly initialized.
   */
  isInitialized(): boolean {
    return this.initialized && this.pipeline !== null;
  }

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
   * Creates a validated transformer pipeline.
   */
  private async createPipeline(
    transformersModule: TransformersModule
  ): Promise<TransformerPipeline> {
    try {
      const pipeline = await transformersModule.pipeline(
        'feature-extraction',
        this.config.getModelName()
      );

      if (typeof pipeline !== 'function') {
        throw new Error('Pipeline creation returned invalid function');
      }

      return pipeline;
    } catch (error) {
      const modelName = this.config.getModelName();
      throw new Error(
        `Failed to create pipeline for model "${modelName}": ${error instanceof Error ? error.message : 'Unknown error'}`
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

      if (
        validated.length !== 1 ||
        validated[0].length !== this.config.getEmbeddingDimensions()
      ) {
        throw new Error(
          `Pipeline validation failed: expected ${this.config.getEmbeddingDimensions().toString()} dimensions, got ${(validated[0]?.length || 0).toString()}`
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
   * Ensures the service is initialized before operations.
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.pipeline) {
      throw new Error('Embedding service not initialized. Call initialize() first.');
    }
  }

  /**
   * Validates text input for embedding.
   */
  private validateTextInput(text: string): void {
    if (typeof text !== 'string') {
      throw new Error('Text input must be a string');
    }

    if (text.length === 0) {
      throw new Error('Text input cannot be empty');
    }

    const maxLength = this.config.getMaxContentLength();
    if (text.length > maxLength) {
      throw new Error(
        `Text input too long: ${text.length.toString()} > ${maxLength.toString()} characters`
      );
    }
  }

  /**
   * Validates batch input for embedding.
   */
  private validateBatchInput(texts: string[]): void {
    if (!Array.isArray(texts)) {
      throw new Error('Batch input must be an array of strings');
    }

    if (texts.length === 0) {
      throw new Error('Batch input cannot be empty');
    }

    const maxBatchSize = this.config.getBatchSize();
    if (texts.length > maxBatchSize) {
      throw new Error(
        `Batch size too large: ${texts.length.toString()} > ${maxBatchSize.toString()}`
      );
    }

    texts.forEach((text, index) => {
      try {
        this.validateTextInput(text);
      } catch (error) {
        throw new Error(
          `Invalid text at index ${index.toString()}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
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

    // Handle array of results
    if (Array.isArray(result)) {
      if (result.length !== expectedCount) {
        throw new Error(
          `Expected ${expectedCount.toString()} results, got ${result.length.toString()}`
        );
      }
      return result.map((item, index) => this.extractSingleEmbedding(item, index));
    }

    // Handle single result
    if (expectedCount === 1) {
      return [this.extractSingleEmbedding(result, 0)];
    }

    throw new Error(
      `Expected array result for batch of ${expectedCount.toString()}, got single result`
    );
  }

  /**
   * Extracts a single embedding vector from transformer output.
   */
  private extractSingleEmbedding(item: unknown, index: number): number[] {
    try {
      const validated = this.validateTensorStructure(item);
      const numbers = this.convertToNumbers(validated.data);

      if (numbers.length !== this.config.getEmbeddingDimensions()) {
        throw new Error(
          `Invalid embedding dimensions: expected ${this.config.getEmbeddingDimensions().toString()}, got ${numbers.length.toString()}`
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

    // Check for data property
    if (!('data' in obj) || !obj.data) {
      throw new Error('Invalid tensor: missing data property');
    }

    const data = obj.data;

    // Validate data is array-like
    if (!this.isArrayLike(data)) {
      throw new Error('Invalid tensor: data is not array-like');
    }

    const arrayData = data;

    return {
      data: arrayData,
      dimensions: arrayData.length,
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
   * Clears the embedding cache.
   */
  clearCache(): void {
    this.embeddingCache.clear();
    this.cacheStats = { hits: 0, misses: 0 };
    this.logger.debug('Embedding cache cleared');
  }

  /**
   * Gets cache statistics.
   */
  getCacheStats(): { hits: number; misses: number; size: number } {
    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      size: this.embeddingCache.size
    };
  }

  /**
   * Disposes of the embedding model to free memory.
   */
  dispose(): void {
    if (this.disposeTimer) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = null;
    }

    this.pipeline = null;
    this.initialized = false;
    this.clearCache();
    
    this.logger.info('Embedding service disposed');
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
    this.disposeTimer = setTimeout(() => {
      this.logger.debug('Disposing embedding service due to inactivity');
      this.dispose();
    }, 5 * 60 * 1000);
  }
}
