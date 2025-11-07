/**
 * @fileoverview Test fixtures for embedding provider testing
 *
 * Provides factory functions for creating consistent test configurations
 * and sample embeddings for testing various embedding providers.
 *
 * @author MCP Server Team
 * @version 2.0.0
 */

import type { EmbeddingProviderConfig } from '../../src/modules/plugins/embedding/embeddingProvider.interface.js';

/**
 * Embedding fixture factory functions
 */
export const EmbeddingFixtures = {
  /**
   * Standard Transformers.js config
   */
  transformersConfig(overrides?: Partial<EmbeddingProviderConfig>): EmbeddingProviderConfig {
    return {
      type: 'transformers',
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
      cacheEnabled: true,
      ...overrides,
    };
  },

  /**
   * Small Transformers.js config for testing (3 dimensions)
   */
  transformersConfigSmall(overrides?: Partial<EmbeddingProviderConfig>): EmbeddingProviderConfig {
    return {
      type: 'transformers',
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 3,
      cacheEnabled: true,
      ...overrides,
    };
  },

  /**
   * Standard Ollama config
   */
  ollamaConfig(overrides?: Partial<EmbeddingProviderConfig>): EmbeddingProviderConfig {
    return {
      type: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
      baseUrl: 'http://localhost:11434',
      ...overrides,
    };
  },

  /**
   * Creates sample embedding vector with specified dimensions
   */
  createEmbedding(dimensions: number = 384): number[] {
    return Array(dimensions)
      .fill(0)
      .map((_, i) => 0.1 * (i % 10));
  },

  /**
   * Creates normalized embedding vector (unit length)
   */
  createNormalizedEmbedding(dimensions: number = 384): number[] {
    const vector = this.createEmbedding(dimensions);
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => val / magnitude);
  },

  /**
   * Creates a batch of embedding vectors
   */
  createEmbeddingBatch(count: number, dimensions: number = 384): number[][] {
    return Array(count)
      .fill(0)
      .map((_, i) => {
        return Array(dimensions)
          .fill(0)
          .map((_, j) => 0.1 * ((i + j) % 10));
      });
  },

  /**
   * Creates mock tensor response for Transformers.js
   */
  createMockTensorResponse(data: number[]) {
    return {
      data,
    };
  },

  /**
   * Creates mock batch tensor response for Transformers.js
   */
  createMockBatchTensorResponse(embeddings: number[][]): { data: number[] } {
    const flatData = embeddings.flat();
    return {
      data: flatData,
    };
  },
};
