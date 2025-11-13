/**
 * @fileoverview Tests for EmbeddingService
 *
 * @author MCP Server Team
 * @version 2.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbeddingService } from './embeddingService.js';
import type { ILogger, EmbeddingProgressCallback } from '../../core/interfaces.js';
import type {
  IEmbeddingProvider,
  IEmbeddingProviderCache,
  EmbeddingProviderConfig,
} from '../../plugins/embedding/embeddingProvider.interface.js';

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let mockProvider: IEmbeddingProvider;
  let mockLogger: ILogger;

  const sampleConfig: EmbeddingProviderConfig = {
    type: 'transformers',
    model: 'test-model',
    dimensions: 384,
  };

  beforeEach(() => {
    // Create mock provider
    mockProvider = {
      name: 'TestProvider',
      model: '',
      dimensions: 0,
      initialize: vi.fn(),
      embed: vi.fn(),
      embedBatch: vi.fn(),
      isInitialized: vi.fn(),
      dispose: vi.fn(),
    };

    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    service = new EmbeddingService(mockProvider, mockLogger);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await service.dispose();
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create service with provider and logger', () => {
      expect(service).toBeInstanceOf(EmbeddingService);
    });

    it('should accept optional initial config', () => {
      const serviceWithConfig = new EmbeddingService(
        mockProvider,
        mockLogger,
        sampleConfig
      );
      expect(serviceWithConfig).toBeInstanceOf(EmbeddingService);
    });
  });

  describe('Initialization', () => {
    it('should initialize with config successfully', async () => {
      vi.mocked(mockProvider.initialize).mockResolvedValue();
      // Use Object.defineProperty to modify readonly properties
      Object.defineProperty(mockProvider, 'model', {
        value: 'test-model',
        writable: true,
        configurable: true,
      });
      Object.defineProperty(mockProvider, 'dimensions', {
        value: 384,
        writable: true,
        configurable: true,
      });

      await service.initialize(sampleConfig);

      expect(mockProvider.initialize).toHaveBeenCalledWith(sampleConfig, undefined);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Embedding service initialized successfully',
        expect.any(Object)
      );
    });

    it('should initialize with config and progress callback', async () => {
      const progressCallback: EmbeddingProgressCallback = vi.fn();
      vi.mocked(mockProvider.initialize).mockResolvedValue();

      await service.initialize(sampleConfig, progressCallback);

      expect(mockProvider.initialize).toHaveBeenCalledWith(
        sampleConfig,
        progressCallback
      );
    });

    it('should support legacy initialize with callback only', async () => {
      const progressCallback: EmbeddingProgressCallback = vi.fn();
      const serviceWithConfig = new EmbeddingService(
        mockProvider,
        mockLogger,
        sampleConfig
      );
      vi.mocked(mockProvider.initialize).mockResolvedValue();

      await serviceWithConfig.initialize(progressCallback);

      expect(mockProvider.initialize).toHaveBeenCalledWith(
        sampleConfig,
        progressCallback
      );
    });

    it('should initialize with no arguments if config was provided previously', async () => {
      vi.mocked(mockProvider.initialize).mockResolvedValue();

      await service.initialize(sampleConfig);
      vi.clearAllMocks();

      await service.initialize();

      expect(mockProvider.initialize).toHaveBeenCalledWith(sampleConfig, undefined);
    });

    it('should throw error when initializing without config', async () => {
      await expect(service.initialize()).rejects.toThrow('No configuration available');
    });

    it('should throw error when using legacy signature without config', async () => {
      const progressCallback: EmbeddingProgressCallback = vi.fn();

      await expect(service.initialize(progressCallback)).rejects.toThrow(
        'No configuration available'
      );
    });

    it('should handle initialization errors and log them', async () => {
      const error = new Error('Provider initialization failed');
      vi.mocked(mockProvider.initialize).mockRejectedValue(error);

      await expect(service.initialize(sampleConfig)).rejects.toThrow(
        'Provider initialization failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize embedding service',
        error,
        expect.any(Object)
      );
    });

    it('should store config for later use', async () => {
      vi.mocked(mockProvider.initialize).mockResolvedValue();

      await service.initialize(sampleConfig);

      // Should be able to call initialize again without config
      await service.initialize();
      expect(mockProvider.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe('Single Embedding', () => {
    beforeEach(async () => {
      vi.mocked(mockProvider.initialize).mockResolvedValue();
      // Use Object.defineProperty to modify readonly properties
      Object.defineProperty(mockProvider, 'model', {
        value: 'test-model',
        writable: true,
        configurable: true,
      });
      Object.defineProperty(mockProvider, 'dimensions', {
        value: 384,
        writable: true,
        configurable: true,
      });
      await service.initialize(sampleConfig);
      vi.clearAllMocks();
    });

    it('should generate embedding for single text', async () => {
      const expectedEmbedding = new Array(384).fill(0.5) as number[];
      vi.mocked(mockProvider.embed).mockResolvedValue(expectedEmbedding);

      const result = await service.embed('test text');

      expect(result).toEqual(expectedEmbedding);
      expect(mockProvider.embed).toHaveBeenCalledWith('test text', undefined);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Generating single embedding',
        expect.any(Object)
      );
    });

    it('should support progress callback for single embedding', async () => {
      const progressCallback: EmbeddingProgressCallback = vi.fn();
      const expectedEmbedding = new Array(384).fill(0.5) as number[];
      vi.mocked(mockProvider.embed).mockResolvedValue(expectedEmbedding);

      await service.embed('test text', progressCallback);

      expect(mockProvider.embed).toHaveBeenCalledWith('test text', progressCallback);
    });

    it('should handle embedding errors', async () => {
      const error = new Error('Embedding generation failed');
      vi.mocked(mockProvider.embed).mockRejectedValue(error);

      await expect(service.embed('test text')).rejects.toThrow(
        'Embedding generation failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate single embedding',
        error,
        expect.any(Object)
      );
    });
  });

  describe('Batch Embedding', () => {
    beforeEach(async () => {
      vi.mocked(mockProvider.initialize).mockResolvedValue();
      // Use Object.defineProperty to modify readonly properties
      Object.defineProperty(mockProvider, 'model', {
        value: 'test-model',
        writable: true,
        configurable: true,
      });
      Object.defineProperty(mockProvider, 'dimensions', {
        value: 384,
        writable: true,
        configurable: true,
      });
      await service.initialize(sampleConfig);
      vi.clearAllMocks();
    });

    it('should generate embeddings for batch of texts', async () => {
      const texts = ['text1', 'text2', 'text3'];
      const expectedEmbeddings = [
        new Array(384).fill(0.5),
        new Array(384).fill(0.6),
        new Array(384).fill(0.7),
      ] as number[][];
      vi.mocked(mockProvider.embedBatch).mockResolvedValue(expectedEmbeddings);

      const result = await service.embedBatch(texts);

      expect(result).toEqual(expectedEmbeddings);
      expect(mockProvider.embedBatch).toHaveBeenCalledWith(texts, undefined);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Generating batch embeddings',
        expect.any(Object)
      );
    });

    it('should support progress callback for batch embedding', async () => {
      const progressCallback: EmbeddingProgressCallback = vi.fn();
      const texts = ['text1', 'text2'];
      const expectedEmbeddings = [
        new Array(384).fill(0.5),
        new Array(384).fill(0.6),
      ] as number[][];
      vi.mocked(mockProvider.embedBatch).mockResolvedValue(expectedEmbeddings);

      await service.embedBatch(texts, progressCallback);

      expect(mockProvider.embedBatch).toHaveBeenCalledWith(texts, progressCallback);
    });

    it('should handle empty batch', async () => {
      vi.mocked(mockProvider.embedBatch).mockResolvedValue([]);

      const result = await service.embedBatch([]);

      expect(result).toEqual([]);
      expect(mockProvider.embedBatch).toHaveBeenCalledWith([], undefined);
    });

    it('should handle batch embedding errors', async () => {
      const error = new Error('Batch embedding failed');
      vi.mocked(mockProvider.embedBatch).mockRejectedValue(error);

      await expect(service.embedBatch(['text1', 'text2'])).rejects.toThrow(
        'Batch embedding failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate batch embeddings',
        error,
        expect.any(Object)
      );
    });
  });

  describe('Cache Operations', () => {
    describe('With Cacheable Provider', () => {
      let cacheableProvider: IEmbeddingProvider & IEmbeddingProviderCache;

      beforeEach(async () => {
        // Create provider with cache support
        cacheableProvider = {
          ...mockProvider,
          clearCache: vi.fn().mockReturnValue(true),
          getCacheStats: vi.fn().mockReturnValue({ hits: 10, misses: 5, size: 15 }),
          isCacheEnabled: vi.fn().mockReturnValue(true),
          setCacheEnabled: vi.fn(),
        };

        service = new EmbeddingService(cacheableProvider, mockLogger);
        vi.mocked(cacheableProvider.initialize).mockResolvedValue();
        await service.initialize(sampleConfig);
        vi.clearAllMocks();
      });

      it('should clear cache when provider supports it', () => {
        service.clearCache();

        expect(cacheableProvider.clearCache).toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Embedding cache cleared',
          expect.any(Object)
        );
      });

      it('should get cache stats when provider supports it', () => {
        const stats = service.getCacheStats();

        expect(stats).toEqual({ hits: 10, misses: 5, size: 15 });
        expect(cacheableProvider.getCacheStats).toHaveBeenCalled();
      });
    });

    describe('Without Cacheable Provider', () => {
      beforeEach(async () => {
        vi.mocked(mockProvider.initialize).mockResolvedValue();
        await service.initialize(sampleConfig);
        vi.clearAllMocks();
      });

      it('should log warning when clearing cache on non-cacheable provider', () => {
        service.clearCache();

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Provider does not support caching',
          undefined,
          expect.any(Object)
        );
      });

      it('should return zero stats when provider does not support caching', () => {
        const stats = service.getCacheStats();

        expect(stats).toEqual({ hits: 0, misses: 0, size: 0 });
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Provider does not support caching, returning empty stats',
          expect.any(Object)
        );
      });
    });
  });

  describe('Resource Management', () => {
    beforeEach(async () => {
      vi.mocked(mockProvider.initialize).mockResolvedValue();
      await service.initialize(sampleConfig);
      vi.clearAllMocks();
    });

    it('should dispose provider when service is disposed', async () => {
      vi.mocked(mockProvider.dispose).mockResolvedValue();

      await service.dispose();

      expect(mockProvider.dispose).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Disposing embedding service',
        expect.any(Object)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Embedding service disposed successfully',
        expect.any(Object)
      );
    });

    it('should propagate provider disposal errors', async () => {
      const error = new Error('Disposal failed');
      vi.mocked(mockProvider.dispose).mockRejectedValue(error);

      await expect(service.dispose()).rejects.toThrow('Disposal failed');

      // Error logs before throwing
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Disposing embedding service',
        expect.any(Object)
      );

      // Reset mock so afterEach doesn't fail
      vi.mocked(mockProvider.dispose).mockResolvedValue();
    });
  });

  describe('Provider Delegation', () => {
    beforeEach(async () => {
      vi.mocked(mockProvider.initialize).mockResolvedValue();
      // Use Object.defineProperty to modify readonly properties
      Object.defineProperty(mockProvider, 'model', {
        value: 'test-model',
        writable: true,
        configurable: true,
      });
      Object.defineProperty(mockProvider, 'dimensions', {
        value: 384,
        writable: true,
        configurable: true,
      });
      await service.initialize(sampleConfig);
      vi.clearAllMocks();
    });

    it('should delegate all calls to underlying provider', async () => {
      const embedding = new Array(384).fill(0.5) as number[];
      vi.mocked(mockProvider.embed).mockResolvedValue(embedding);

      await service.embed('test');

      expect(mockProvider.embed).toHaveBeenCalledWith('test', undefined);
    });

    it('should pass progress callbacks to provider', async () => {
      const progressCallback: EmbeddingProgressCallback = vi.fn();
      const embedding = new Array(384).fill(0.5) as number[];
      vi.mocked(mockProvider.embed).mockResolvedValue(embedding);

      await service.embed('test', progressCallback);

      expect(mockProvider.embed).toHaveBeenCalledWith('test', progressCallback);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-Error exceptions in initialization', async () => {
      vi.mocked(mockProvider.initialize).mockRejectedValue('String error');

      await expect(service.initialize(sampleConfig)).rejects.toBe('String error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize embedding service',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle non-Error exceptions in embedding', async () => {
      vi.mocked(mockProvider.initialize).mockResolvedValue();
      await service.initialize(sampleConfig);
      vi.clearAllMocks();

      vi.mocked(mockProvider.embed).mockRejectedValue('String error');

      await expect(service.embed('test')).rejects.toBe('String error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate single embedding',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle non-Error exceptions in batch embedding', async () => {
      vi.mocked(mockProvider.initialize).mockResolvedValue();
      await service.initialize(sampleConfig);
      vi.clearAllMocks();

      vi.mocked(mockProvider.embedBatch).mockRejectedValue('String error');

      await expect(service.embedBatch(['test'])).rejects.toBe('String error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate batch embeddings',
        undefined,
        expect.any(Object)
      );
    });
  });
});
