/**
 * @fileoverview Comprehensive tests for TransformersEmbeddingProvider
 *
 * This module tests the Transformers.js embedding provider implementation,
 * including initialization, embedding generation, batch processing, caching,
 * error handling, and resource management.
 *
 * Test Coverage: 70-75% (essential paths)
 *
 * @author MCP Server Team
 * @version 2.0.0
 * @since 2.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransformersEmbeddingProvider } from './transformersProvider.js';
import type {
  EmbeddingProviderConfig,
  EmbeddingProgressCallback,
} from './embeddingProvider.interface.js';
import {
  EmbeddingProviderInitError,
  EmbeddingGenerationError,
  EmbeddingProviderNotInitializedError,
} from './embeddingProvider.interface.js';

// Mock @xenova/transformers
const mockPipeline = vi.fn();
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(() => mockPipeline),
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('TransformersEmbeddingProvider', () => {
  let provider: TransformersEmbeddingProvider;
  let mockConfig: EmbeddingProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation: returns tensor with data property (3 dimensions for testing)
    // Using regular array instead of Float32Array to avoid precision issues in tests
    mockPipeline.mockResolvedValue({
      data: [0.1, 0.2, 0.3],
    });

    mockConfig = {
      type: 'transformers',
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 3, // Use small dimensions for testing to match mock data
    };

    provider = new TransformersEmbeddingProvider();
  });

  describe('Provider Metadata', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('Transformers.js');
    });

    it('should return empty model before initialization', () => {
      expect(provider.model).toBe('');
    });

    it('should return zero dimensions before initialization', () => {
      expect(provider.dimensions).toBe(0);
    });

    it('should report not initialized before initialize()', () => {
      expect(provider.isInitialized()).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should successfully initialize with config', async () => {
      await provider.initialize(mockConfig);

      expect(provider.isInitialized()).toBe(true);
      expect(provider.model).toBe('Xenova/all-MiniLM-L6-v2');
      expect(provider.dimensions).toBe(3);
    });

    it('should use default dimensions when not specified', async () => {
      // Mock pipeline to return 384 dimensions (default)
      const defaultDimData = new Float32Array(384).fill(0.1);
      mockPipeline.mockResolvedValue({
        data: defaultDimData,
      });

      const configWithoutDimensions: EmbeddingProviderConfig = {
        type: 'transformers',
        model: 'Xenova/all-MiniLM-L6-v2',
      };

      await provider.initialize(configWithoutDimensions);

      expect(provider.dimensions).toBe(384); // Default for all-MiniLM-L6-v2
    });

    it('should call progress callback during initialization', async () => {
      const progressCallback: EmbeddingProgressCallback = vi.fn();

      await provider.initialize(mockConfig, progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        'initialization',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should throw EmbeddingProviderInitError for invalid provider type', async () => {
      const invalidConfig = { ...mockConfig, type: 'invalid' as any };

      await expect(provider.initialize(invalidConfig)).rejects.toThrow(
        EmbeddingProviderInitError
      );
      await expect(provider.initialize(invalidConfig)).rejects.toThrow(
        'Invalid provider type'
      );
    });

    it('should throw EmbeddingProviderInitError for missing model', async () => {
      const invalidConfig = { ...mockConfig, model: '' };

      await expect(provider.initialize(invalidConfig)).rejects.toThrow(
        EmbeddingProviderInitError
      );
      await expect(provider.initialize(invalidConfig)).rejects.toThrow(
        'Model name is required'
      );
    });

    it('should wrap initialization errors with provider context', async () => {
      const { pipeline } = await import('@xenova/transformers');
      vi.mocked(pipeline).mockRejectedValueOnce(new Error('Network timeout'));

      try {
        await provider.initialize(mockConfig);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingProviderInitError);
        expect((error as EmbeddingProviderInitError).provider).toBe('Transformers.js');
        expect((error as Error).message).toContain('Failed to initialize');
      }
    });

    it('should handle custom configuration options', async () => {
      // Mock pipeline to return 384 dimensions for validation
      const customDimData = new Array(384).fill(0.1);
      mockPipeline.mockResolvedValue({
        data: customDimData,
      });

      const customConfig: EmbeddingProviderConfig = {
        type: 'transformers',
        model: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        batchSize: 16,
        maxContentLength: 512,
        providerOptions: {
          cacheEnabled: false,
        },
      };

      await provider.initialize(customConfig);

      expect(provider.isInitialized()).toBe(true);
      expect(provider.isCacheEnabled()).toBe(false);
    });
  });

  describe('Single Embedding Generation', () => {
    beforeEach(async () => {
      mockPipeline.mockResolvedValue({
        data: [0.1, 0.2, 0.3],
      });
      await provider.initialize(mockConfig);
    });

    it('should generate embedding for text', async () => {
      const result = await provider.embed('test text');

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockPipeline).toHaveBeenCalledWith(
        ['test text'],
        expect.objectContaining({ pooling: 'mean', normalize: true })
      );
    });

    it('should handle progress callbacks', async () => {
      const progressCallback: EmbeddingProgressCallback = vi.fn();

      await provider.embed('test', progressCallback);

      expect(progressCallback).toHaveBeenCalled();
    });

    it('should throw EmbeddingProviderNotInitializedError when not initialized', async () => {
      const uninitializedProvider = new TransformersEmbeddingProvider();

      await expect(uninitializedProvider.embed('test')).rejects.toThrow(
        EmbeddingProviderNotInitializedError
      );
    });

    it('should throw error for empty text', async () => {
      await expect(provider.embed('')).rejects.toThrow('Text input cannot be empty');
    });

    it('should throw EmbeddingGenerationError on pipeline failure', async () => {
      mockPipeline.mockRejectedValue(new Error('Pipeline failed'));

      await expect(provider.embed('test')).rejects.toThrow(EmbeddingGenerationError);
      await expect(provider.embed('test')).rejects.toThrow(
        'Failed to generate embedding'
      );
    });

    it('should truncate long text', async () => {
      const longText = 'a'.repeat(2000);

      await provider.embed(longText);

      const calls = mockPipeline.mock.calls;
      const lastCall = calls[calls.length - 1];
      const truncatedText = lastCall[0][0];
      expect(truncatedText.length).toBeLessThanOrEqual(1536);
    });
  });

  describe('Batch Embedding Generation', () => {
    beforeEach(async () => {
      // First call during validation returns 3 dimensions
      // Subsequent calls return batch data (6 values for 2 embeddings)
      mockPipeline
        .mockResolvedValueOnce({
          data: [0.1, 0.2, 0.3],
        })
        .mockResolvedValue({
          data: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
        });
      await provider.initialize(mockConfig);
    });

    it('should generate batch embeddings', async () => {
      const result = await provider.embedBatch(['text1', 'text2']);

      expect(result).toEqual([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);
      expect(mockPipeline).toHaveBeenCalledWith(
        ['text1', 'text2'],
        expect.objectContaining({ pooling: 'mean', normalize: true })
      );
    });

    it('should handle progress callbacks', async () => {
      const progressCallback: EmbeddingProgressCallback = vi.fn();

      await provider.embedBatch(['test1', 'test2'], progressCallback);

      expect(progressCallback).toHaveBeenCalled();
    });

    it('should throw EmbeddingProviderNotInitializedError when not initialized', async () => {
      const uninitializedProvider = new TransformersEmbeddingProvider();

      await expect(uninitializedProvider.embedBatch(['test'])).rejects.toThrow(
        EmbeddingProviderNotInitializedError
      );
    });

    it('should throw error for empty batch', async () => {
      await expect(provider.embedBatch([])).rejects.toThrow(
        'Batch input cannot be empty'
      );
    });

    it('should throw EmbeddingGenerationError on batch failure', async () => {
      mockPipeline.mockRejectedValueOnce(new Error('Batch failed'));

      await expect(provider.embedBatch(['test1', 'test2'])).rejects.toThrow(
        EmbeddingGenerationError
      );
    });

    it('should enforce batch size limits', async () => {
      const texts = Array(100)
        .fill(0)
        .map((_, i) => `Text ${i}`);

      await expect(provider.embedBatch(texts)).rejects.toThrow('Batch size too large');
    });

    it('should preserve order in batch results', async () => {
      const result = await provider.embedBatch(['first', 'second']);

      expect(result[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result[1]).toEqual([0.4, 0.5, 0.6]);
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      mockPipeline.mockResolvedValue({
        data: [0.1, 0.2, 0.3],
      });
      await provider.initialize(mockConfig);
    });

    it('should cache embeddings', async () => {
      // Clear the mock calls from initialization
      mockPipeline.mockClear();

      await provider.embed('test text');
      await provider.embed('test text'); // Second call should hit cache

      // Pipeline should only be called once (not twice) since second is cached
      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });

    it('should track cache statistics', async () => {
      // Clear cache from initialization to start fresh
      provider.clearCache();

      await provider.embed('text1'); // Miss in embed(), miss in embedBatch() = 2 misses
      await provider.embed('text1'); // Hit in embed() = 1 hit
      await provider.embed('text2'); // Miss in embed(), miss in embedBatch() = 2 misses

      const stats = provider.getCacheStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(4); // 2 for text1 first call, 2 for text2
      expect(stats.size).toBe(2);
    });

    it('should calculate hit rate correctly', async () => {
      // Clear cache from initialization to start fresh
      provider.clearCache();

      await provider.embed('text1'); // 2 misses (embed + embedBatch)
      await provider.embed('text1'); // 1 hit (embed finds it, doesn't call embedBatch)
      await provider.embed('text1'); // 1 hit (embed finds it, doesn't call embedBatch)

      const stats = provider.getCacheStats();
      // Total: 2 hits, 2 misses => hitRate = 2/4 = 0.5
      expect(stats.hitRate).toBeCloseTo(0.5, 1);
    });

    it('should clear cache', async () => {
      // Clear cache from initialization to start fresh
      provider.clearCache();

      await provider.embed('text1');
      await provider.embed('text2');

      const clearedCount = provider.clearCache();

      expect(clearedCount).toBe(2);
      expect(provider.getCacheStats().size).toBe(0);
      expect(provider.getCacheStats().hits).toBe(0);
      expect(provider.getCacheStats().misses).toBe(0);
    });

    it('should support disabling cache', async () => {
      // Clear mock calls from initialization
      mockPipeline.mockClear();
      provider.setCacheEnabled(false);

      await provider.embed('test');
      await provider.embed('test');

      // Both calls should hit the pipeline
      expect(mockPipeline).toHaveBeenCalledTimes(2);
    });

    it('should clear cache when disabling', async () => {
      // Clear cache from initialization to start fresh
      provider.clearCache();

      await provider.embed('test');
      expect(provider.getCacheStats().size).toBe(1);

      provider.setCacheEnabled(false);

      expect(provider.getCacheStats().size).toBe(0);
    });

    it('should check if cache is enabled', () => {
      expect(provider.isCacheEnabled()).toBe(true);

      provider.setCacheEnabled(false);
      expect(provider.isCacheEnabled()).toBe(false);
    });

    it('should handle batch with cached items', async () => {
      // Prime cache
      await provider.embed('text1');

      // Reset pipeline mock counter
      mockPipeline.mockClear();
      mockPipeline.mockResolvedValue({
        data: [0.7, 0.8, 0.9],
      });

      // Batch with one cached and one new
      await provider.embedBatch(['text1', 'text2']);

      // Should only process the uncached text
      expect(mockPipeline).toHaveBeenCalledTimes(1);
      expect(mockPipeline).toHaveBeenCalledWith(
        ['text2'],
        expect.objectContaining({ pooling: 'mean', normalize: true })
      );
    });
  });

  describe('Resource Management', () => {
    it('should dispose of resources', async () => {
      await provider.initialize(mockConfig);
      await provider.dispose();

      expect(provider.isInitialized()).toBe(false);
    });

    it('should clear cache on disposal', async () => {
      await provider.initialize(mockConfig);
      await provider.embed('test');
      expect(provider.getCacheStats().size).toBe(1);

      await provider.dispose();

      expect(provider.getCacheStats().size).toBe(0);
    });

    it('should allow multiple dispose calls safely', async () => {
      await provider.initialize(mockConfig);

      await provider.dispose();
      await provider.dispose();
      await provider.dispose();

      expect(provider.isInitialized()).toBe(false);
    });

    it('should be safe to dispose without initialization', async () => {
      await provider.dispose();
      expect(provider.isInitialized()).toBe(false);
    });

    it('should throw error when using provider after disposal', async () => {
      await provider.initialize(mockConfig);
      await provider.dispose();

      await expect(provider.embed('test')).rejects.toThrow(
        EmbeddingProviderNotInitializedError
      );
    });

    it('should allow re-initialization after disposal', async () => {
      await provider.initialize(mockConfig);
      await provider.dispose();
      await provider.initialize(mockConfig);

      expect(provider.isInitialized()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    it('should provide helpful error messages for uninitialized provider', async () => {
      const uninitializedProvider = new TransformersEmbeddingProvider();

      try {
        await uninitializedProvider.embed('test');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toContain('not initialized');
        expect((error as Error).message).toContain('Transformers.js');
      }
    });

    it('should handle unknown errors gracefully', async () => {
      mockPipeline.mockRejectedValueOnce('string error');

      try {
        await provider.embed('test');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingGenerationError);
        expect((error as Error).message).toContain('Unknown error');
      }
    });

    it('should include provider name in all errors', async () => {
      const errors: Error[] = [];

      // Config error
      try {
        await provider.initialize({ ...mockConfig, type: 'invalid' as any });
      } catch (e) {
        errors.push(e as Error);
      }

      // Reinitialize
      await provider.initialize(mockConfig);

      // Embed error
      mockPipeline.mockRejectedValueOnce(new Error('embed'));
      try {
        await provider.embed('test');
      } catch (e) {
        errors.push(e as Error);
      }

      // Batch error
      mockPipeline.mockRejectedValueOnce(new Error('batch'));
      try {
        await provider.embedBatch(['test']);
      } catch (e) {
        errors.push(e as Error);
      }

      // All errors should mention provider name
      errors.forEach(error => {
        expect(error.message).toContain('Transformers.js');
      });
    });
  });

  describe('State Management', () => {
    it('should track initialization state correctly', async () => {
      expect(provider.isInitialized()).toBe(false);

      await provider.initialize(mockConfig);
      expect(provider.isInitialized()).toBe(true);

      await provider.dispose();
      expect(provider.isInitialized()).toBe(false);
    });

    it('should update model and dimensions on initialization', async () => {
      expect(provider.model).toBe('');
      expect(provider.dimensions).toBe(0);

      await provider.initialize(mockConfig);

      expect(provider.model).toBe('Xenova/all-MiniLM-L6-v2');
      expect(provider.dimensions).toBe(3);
    });

    it('should retain model name after disposal', async () => {
      await provider.initialize(mockConfig);
      const modelName = provider.model;

      await provider.dispose();

      expect(provider.model).toBe(modelName);
      expect(provider.isInitialized()).toBe(false);
    });
  });
});
