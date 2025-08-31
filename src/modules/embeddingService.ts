/**
 * @fileoverview Production embedding service implementation.
 *
 * This module provides a type-safe, properly validated embedding service
 * that abstracts transformer model operations with comprehensive error handling
 * and resource management.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import type { IEmbeddingService, ISemanticConfig, ILogger } from './interfaces.js';

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
 * Production embedding service with proper type safety and error handling.
 */
export class EmbeddingService implements IEmbeddingService {
  private pipeline: TransformerPipeline | null = null;
  private initialized = false;

  constructor(
    private config: ISemanticConfig,
    private logger: ILogger
  ) {}

  /**
   * Initializes the embedding pipeline with comprehensive error handling.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Embedding service already initialized');
      return;
    }

    try {
      this.logger.info('Initializing embedding service', {
        model: this.config.getModelName(),
        batchSize: this.config.getBatchSize(),
      });

      // Dynamic import with proper error handling
      const transformersModule = await this.loadTransformersModule();
      this.pipeline = await this.createPipeline(transformersModule);

      // Validate pipeline with test embedding
      await this.validatePipeline();

      this.initialized = true;
      this.logger.info('Embedding service initialized successfully');
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
      throw new Error(`Embedding service initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Generates embeddings for a single text input with validation.
   */
  async embed(text: string): Promise<number[]> {
    this.ensureInitialized();
    this.validateTextInput(text);

    try {
      const results = await this.embedBatch([text]);
      return results[0];
    } catch (error) {
      this.logger.error(
        'Failed to generate single embedding',
        error instanceof Error ? error : undefined,
        {
          textLength: text.length.toString(),
        }
      );
      throw new Error(
        `Single embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generates embeddings for multiple text inputs with proper batching and validation.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    this.ensureInitialized();
    this.validateBatchInput(texts);

    if (!this.pipeline) {
      throw new Error('Pipeline not initialized');
    }

    try {
      this.logger.debug('Generating batch embeddings', {
        batchSize: texts.length.toString(),
        totalChars: texts.reduce((sum, text) => sum + text.length, 0),
      });

      const result = await this.pipeline(texts, {
        pooling: 'mean',
        normalize: true,
      });

      const embeddings = this.validateAndExtractEmbeddings(result, texts.length);

      this.logger.debug('Successfully generated batch embeddings', {
        count: embeddings.length.toString(),
        dimensions: (embeddings[0]?.length || 0).toString(),
      });

      return embeddings;
    } catch (error) {
      this.logger.error(
        'Failed to generate batch embeddings',
        error instanceof Error ? error : undefined,
        {
          batchSize: texts.length.toString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
      throw new Error(
        `Batch embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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
}
