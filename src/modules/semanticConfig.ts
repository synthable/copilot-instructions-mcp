/**
 * @fileoverview Semantic search configuration service.
 *
 * This module provides configurable semantic search parameters with
 * sensible defaults and validation for production use.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import type { ISemanticConfig } from './interfaces.js';

/**
 * Relevance level mapping for semantic search results.
 */
export interface RelevanceThresholds {
  high: number;    // Default: 0.8
  medium: number;  // Default: 0.6
  low: number;     // Default: 0.4
}

/**
 * Configuration options for semantic search service.
 */
export interface SemanticConfigOptions {
  modelName?: string;
  batchSize?: number;
  maxContentLength?: number;
  defaultAlpha?: number;
  embeddingDimensions?: number;
  indexingBatchSize?: number;
  maxMemoryUsageMB?: number;
  enableLazyLoading?: boolean;
  relevanceThresholds?: Partial<RelevanceThresholds>;
  similarityThreshold?: number;
}

/**
 * Production semantic search configuration with validation.
 */
export class SemanticConfig implements ISemanticConfig {
  private readonly modelName: string;
  private readonly batchSize: number;
  private readonly maxContentLength: number;
  private readonly defaultAlpha: number;
  private readonly embeddingDimensions: number;
  private readonly indexingBatchSize: number;
  private readonly maxMemoryUsageMB: number;
  private readonly enableLazyLoading: boolean;
  private readonly relevanceThresholds: RelevanceThresholds;
  private readonly similarityThreshold: number;

  constructor(options: SemanticConfigOptions = {}) {
    this.modelName = this.validateModelName(
      options.modelName ?? 'Xenova/all-mpnet-base-v2'
    );
    this.batchSize = this.validateBatchSize(options.batchSize ?? 32);
    this.maxContentLength = this.validateMaxContentLength(
      options.maxContentLength ?? 5000
    );
    this.defaultAlpha = this.validateDefaultAlpha(options.defaultAlpha ?? 0.6);
    this.embeddingDimensions = this.validateEmbeddingDimensions(
      options.embeddingDimensions ?? 768
    );
    this.indexingBatchSize = this.validateIndexingBatchSize(
      options.indexingBatchSize ?? 8
    );
    this.maxMemoryUsageMB = this.validateMaxMemoryUsage(
      options.maxMemoryUsageMB ?? 512
    );
    this.enableLazyLoading = options.enableLazyLoading ?? true;
    this.relevanceThresholds = this.validateRelevanceThresholds(
      options.relevanceThresholds ?? {}
    );
    this.similarityThreshold = this.validateSimilarityThreshold(
      options.similarityThreshold ?? 0.1
    );
  }

  /**
   * Gets the embedding model name to use.
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Gets the batch size for processing embeddings.
   */
  getBatchSize(): number {
    return this.batchSize;
  }

  /**
   * Gets the maximum content length for embedding.
   */
  getMaxContentLength(): number {
    return this.maxContentLength;
  }

  /**
   * Gets the default alpha value for hybrid search weighting.
   */
  getDefaultAlpha(): number {
    return this.defaultAlpha;
  }

  /**
   * Gets the embedding dimensions for the configured model.
   */
  getEmbeddingDimensions(): number {
    return this.embeddingDimensions;
  }

  /**
   * Gets the batch size for indexing operations.
   */
  getIndexingBatchSize(): number {
    return this.indexingBatchSize;
  }

  /**
   * Gets the maximum memory usage limit in MB.
   */
  getMaxMemoryUsageMB(): number {
    return this.maxMemoryUsageMB;
  }

  /**
   * Gets whether lazy loading is enabled.
   */
  isLazyLoadingEnabled(): boolean {
    return this.enableLazyLoading;
  }

  /**
   * Gets the relevance thresholds for semantic search results.
   */
  getRelevanceThresholds(): RelevanceThresholds {
    return this.relevanceThresholds;
  }

  /**
   * Gets the similarity threshold for filtering search results.
   */
  getSimilarityThreshold(): number {
    return this.similarityThreshold;
  }

  /**
   * Gets relevance level for a given similarity score.
   */
  getRelevanceLevel(score: number): 'high' | 'medium' | 'low' | 'none' {
    if (score >= this.relevanceThresholds.high) {
      return 'high';
    }
    if (score >= this.relevanceThresholds.medium) {
      return 'medium';
    }
    if (score >= this.relevanceThresholds.low) {
      return 'low';
    }
    return 'none';
  }

  /**
   * Validates model name configuration.
   */
  private validateModelName(modelName: string): string {
    if (typeof modelName !== 'string' || modelName.trim().length === 0) {
      throw new Error('Model name must be a non-empty string');
    }

    const trimmed = modelName.trim();

    // Basic validation for HuggingFace model format
    if (!trimmed.includes('/') && !trimmed.startsWith('Xenova/')) {
      throw new Error(
        'Model name should follow HuggingFace format (e.g., "Xenova/all-mpnet-base-v2")'
      );
    }

    return trimmed;
  }

  /**
   * Validates batch size configuration.
   */
  private validateBatchSize(batchSize: number): number {
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error('Batch size must be a positive integer');
    }

    if (batchSize > 1000) {
      throw new Error('Batch size too large (max 1000)');
    }

    return batchSize;
  }

  /**
   * Validates maximum content length configuration.
   */
  private validateMaxContentLength(maxContentLength: number): number {
    if (!Number.isInteger(maxContentLength) || maxContentLength < 1) {
      throw new Error('Max content length must be a positive integer');
    }

    if (maxContentLength > 50000) {
      throw new Error('Max content length too large (max 50000 characters)');
    }

    return maxContentLength;
  }

  /**
   * Validates default alpha configuration.
   */
  private validateDefaultAlpha(defaultAlpha: number): number {
    if (typeof defaultAlpha !== 'number' || isNaN(defaultAlpha)) {
      throw new Error('Default alpha must be a valid number');
    }

    if (defaultAlpha < 0 || defaultAlpha > 1) {
      throw new Error('Default alpha must be between 0 and 1');
    }

    return defaultAlpha;
  }

  /**
   * Validates embedding dimensions configuration.
   */
  private validateEmbeddingDimensions(embeddingDimensions: number): number {
    if (!Number.isInteger(embeddingDimensions) || embeddingDimensions < 1) {
      throw new Error('Embedding dimensions must be a positive integer');
    }

    if (embeddingDimensions > 4096) {
      throw new Error('Embedding dimensions too large (max 4096)');
    }

    return embeddingDimensions;
  }

  /**
   * Validates indexing batch size configuration.
   */
  private validateIndexingBatchSize(indexingBatchSize: number): number {
    if (!Number.isInteger(indexingBatchSize) || indexingBatchSize < 1) {
      throw new Error('Indexing batch size must be a positive integer');
    }

    if (indexingBatchSize > 100) {
      throw new Error('Indexing batch size too large (max 100)');
    }

    return indexingBatchSize;
  }

  /**
   * Validates maximum memory usage configuration.
   */
  private validateMaxMemoryUsage(maxMemoryUsageMB: number): number {
    if (!Number.isInteger(maxMemoryUsageMB) || maxMemoryUsageMB < 64) {
      throw new Error('Max memory usage must be at least 64 MB');
    }

    if (maxMemoryUsageMB > 8192) {
      throw new Error('Max memory usage too large (max 8192 MB)');
    }

    return maxMemoryUsageMB;
  }

  /**
   * Validates relevance thresholds configuration.
   */
  private validateRelevanceThresholds(thresholds: Partial<RelevanceThresholds>): RelevanceThresholds {
    const defaults: RelevanceThresholds = {
      high: 0.8,
      medium: 0.6,
      low: 0.4
    };

    const result = { ...defaults, ...thresholds };

    // Validate individual thresholds
    if (typeof result.high !== 'number' || result.high < 0 || result.high > 1) {
      throw new Error('High relevance threshold must be between 0 and 1');
    }
    if (typeof result.medium !== 'number' || result.medium < 0 || result.medium > 1) {
      throw new Error('Medium relevance threshold must be between 0 and 1');
    }
    if (typeof result.low !== 'number' || result.low < 0 || result.low > 1) {
      throw new Error('Low relevance threshold must be between 0 and 1');
    }

    // Validate threshold ordering
    if (result.high <= result.medium) {
      throw new Error('High threshold must be greater than medium threshold');
    }
    if (result.medium <= result.low) {
      throw new Error('Medium threshold must be greater than low threshold');
    }

    return result;
  }

  /**
   * Validates similarity threshold configuration.
   */
  private validateSimilarityThreshold(threshold: number): number {
    if (typeof threshold !== 'number' || isNaN(threshold)) {
      throw new Error('Similarity threshold must be a valid number');
    }

    if (threshold < 0 || threshold > 1) {
      throw new Error('Similarity threshold must be between 0 and 1');
    }

    return threshold;
  }
}

/**
 * Creates a production semantic configuration with validated defaults.
 */
export function createProductionSemanticConfig(
  options?: SemanticConfigOptions
): SemanticConfig {
  return new SemanticConfig(options);
}

/**
 * Creates a test semantic configuration with minimal settings.
 */
export function createTestSemanticConfig(
  options?: SemanticConfigOptions
): SemanticConfig {
  const testDefaults: SemanticConfigOptions = {
    modelName: 'test/mock-model',
    batchSize: 4,
    maxContentLength: 1000,
    defaultAlpha: 0.5,
    embeddingDimensions: 384,
    indexingBatchSize: 4,
    maxMemoryUsageMB: 128,
    enableLazyLoading: false, // Disable for testing
    ...options,
  };

  return new SemanticConfig(testDefaults);
}
