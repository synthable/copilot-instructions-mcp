/**
 * @fileoverview Comprehensive tests for OllamaEmbeddingProvider
 *
 * Test Coverage:
 * - Provider metadata and initial state
 * - Initialization (success, custom config, progress callbacks, errors)
 * - Single embedding generation (success, errors, validation)
 * - Batch embedding generation (sequential processing, progress, errors)
 * - Resource management (dispose, re-initialization)
 * - Error handling (network, timeouts, Ollama-specific errors)
 *
 * @author MCP Server Team
 * @version 2.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaEmbeddingProvider } from './ollamaProvider.js';
import {
  EmbeddingProviderInitError,
  EmbeddingGenerationError,
  EmbeddingProviderNotInitializedError,
  EmbeddingConfigError,
  type EmbeddingProviderConfig,
  type EmbeddingProgressCallback,
} from './embeddingProvider.interface.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('OllamaEmbeddingProvider', () => {
  let provider: OllamaEmbeddingProvider;

  beforeEach(() => {
    provider = new OllamaEmbeddingProvider();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await provider.dispose();
    vi.restoreAllMocks();
  });

  describe('Provider Metadata', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('Ollama');
    });

    it('should have empty model before initialization', () => {
      expect(provider.model).toBe('');
    });

    it('should have zero dimensions before initialization', () => {
      expect(provider.dimensions).toBe(0);
    });

    it('should not be initialized initially', () => {
      expect(provider.isInitialized()).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully with default configuration', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      // Mock health check (GET /api/tags)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      // Mock model verification (GET /api/tags)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [
            {
              name: 'nomic-embed-text',
              modified_at: '2024-01-01',
              size: 274301970,
              digest: 'abc123',
            },
          ],
        }),
      });

      await provider.initialize(config);

      expect(provider.isInitialized()).toBe(true);
      expect(provider.model).toBe('nomic-embed-text');
      expect(provider.dimensions).toBe(768);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use custom baseUrl when provided', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
        baseUrl: 'http://custom-host:8080',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom-host:8080/api/tags',
        expect.any(Object)
      );
    });

    it('should use default model when not specified', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: '', // Will use default
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config);

      expect(provider.model).toBe('nomic-embed-text');
    });

    it('should auto-detect dimensions for known models', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'mxbai-embed-large',
        // No dimensions specified
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'mxbai-embed-large', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config);

      expect(provider.dimensions).toBe(1024); // mxbai-embed-large has 1024 dimensions
    });

    it('should set dimensions to 0 for unknown custom models', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'custom-model',
        // No dimensions specified
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'custom-model', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config);

      expect(provider.dimensions).toBe(0); // Will be set on first embedding
    });

    it('should call progress callback during initialization', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
      };

      const progressCallback = vi.fn() as EmbeddingProgressCallback;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(
        'initialization',
        0.0,
        'Validating configuration'
      );
      expect(progressCallback).toHaveBeenCalledWith(
        'initialization',
        0.3,
        'Checking Ollama availability'
      );
      expect(progressCallback).toHaveBeenCalledWith(
        'initialization',
        0.6,
        'Verifying model availability'
      );
      expect(progressCallback).toHaveBeenCalledWith(
        'initialization',
        1.0,
        'Initialization complete'
      );
    });

    it('should throw EmbeddingConfigError for invalid provider type', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'openai' as 'ollama', // Wrong type
        model: 'test',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(
        "Invalid provider type: expected 'ollama', got 'openai'"
      );
    });

    it('should throw EmbeddingConfigError for invalid dimensions', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'test',
        dimensions: -1,
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(
        'Invalid dimensions: must be positive'
      );
    });

    it('should throw EmbeddingConfigError for invalid timeout', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'test',
        timeout: 0,
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(
        'Invalid timeout: must be positive'
      );
    });

    it('should throw EmbeddingProviderInitError when Ollama is not available (ECONNREFUSED)', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'test',
      };

      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      try {
        await provider.initialize(config);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingProviderInitError);
        expect(error).toHaveProperty('message');
        expect((error as Error).message).toContain(
          'Ollama not available at http://localhost:11434'
        );
      }
    });

    it('should throw EmbeddingProviderInitError on health check timeout', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'test',
        timeout: 100,
      };

      // Simulate timeout by delaying the response
      mockFetch.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve({
                ok: true,
                // eslint-disable-next-line @typescript-eslint/require-await
                json: async () => ({ models: [] }),
              });
            }, 200);
          })
      );

      await expect(provider.initialize(config)).rejects.toThrow(
        EmbeddingProviderInitError
      );
    });

    it('should throw EmbeddingProviderInitError when model is not found', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nonexistent-model',
      };

      // Health check succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      // Model verification shows model not found
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [
            { name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' },
            { name: 'mxbai-embed-large', modified_at: '', size: 0, digest: '' },
          ],
        }),
      });

      try {
        await provider.initialize(config);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingProviderInitError);
        expect((error as Error).message).toContain(
          "Model 'nonexistent-model' not found in Ollama"
        );
        expect((error as Error).message).toContain('ollama pull nonexistent-model');
      }
    });

    it('should accept model with tag suffix', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [
            { name: 'nomic-embed-text:latest', modified_at: '', size: 0, digest: '' },
          ],
        }),
      });

      await expect(provider.initialize(config)).resolves.not.toThrow();
    });
  });

  describe('Single Embedding Generation', () => {
    beforeEach(async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      // Mock initialization
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config);
      vi.clearAllMocks();
    });

    it('should generate embedding for text', async () => {
      const mockEmbedding = new Array(768).fill(0).map(() => Math.random());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ embedding: mockEmbedding }),
      });

      const result = await provider.embed('Hello, world!');

      expect(result).toEqual(mockEmbedding);
      expect(result.length).toBe(768);
    });

    it('should send correct request format to Ollama API', async () => {
      const mockEmbedding = new Array(768).fill(0).map(() => Math.random());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ embedding: mockEmbedding }),
      });

      await provider.embed('Test text');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'nomic-embed-text',
            prompt: 'Test text',
          }),
        })
      );
    });

    it('should validate embedding dimensions', async () => {
      const wrongDimensionEmbedding = new Array(512).fill(0).map(() => Math.random());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ embedding: wrongDimensionEmbedding }),
      });

      try {
        await provider.embed('Test');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingGenerationError);
        expect((error as Error).message).toContain(
          `Dimension mismatch: expected ${String(768)}`
        );
      }
    });

    it('should auto-detect dimensions on first embedding for custom models', async () => {
      // Create new provider with custom model
      const customProvider = new OllamaEmbeddingProvider();
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'custom-model',
        // No dimensions specified
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'custom-model', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await customProvider.initialize(config);
      vi.clearAllMocks();

      const mockEmbedding = new Array(512).fill(0).map(() => Math.random());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ embedding: mockEmbedding }),
      });

      await customProvider.embed('Test');

      expect(customProvider.dimensions).toBe(512);

      await customProvider.dispose();
    });

    it('should call progress callback during embedding', async () => {
      const mockEmbedding = new Array(768).fill(0).map(() => Math.random());
      const progressCallback = vi.fn() as EmbeddingProgressCallback;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ embedding: mockEmbedding }),
      });

      await provider.embed('Test', progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(
        'processing',
        0.0,
        'Sending request to Ollama'
      );
      expect(progressCallback).toHaveBeenCalledWith(
        'processing',
        0.5,
        'Parsing response'
      );
      expect(progressCallback).toHaveBeenCalledWith(
        'processing',
        1.0,
        'Embedding generated'
      );
    });

    it('should throw EmbeddingProviderNotInitializedError when not initialized', async () => {
      const uninitializedProvider = new OllamaEmbeddingProvider();

      await expect(uninitializedProvider.embed('Test')).rejects.toThrow(
        EmbeddingProviderNotInitializedError
      );
      await expect(uninitializedProvider.embed('Test')).rejects.toThrow(
        'Provider not initialized'
      );
    });

    it('should throw EmbeddingGenerationError on Ollama API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        // eslint-disable-next-line @typescript-eslint/require-await
        text: async () => 'Internal server error',
      });

      try {
        await provider.embed('Test');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingGenerationError);
        expect((error as Error).message).toContain(`HTTP ${String(500)}`);
      }
    });

    it('should throw EmbeddingGenerationError on timeout', async () => {
      // Create provider with short timeout
      const timeoutProvider = new OllamaEmbeddingProvider();
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
        timeout: 100,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await timeoutProvider.initialize(config);
      vi.clearAllMocks();

      // Simulate timeout
      mockFetch.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve({
                ok: true,
                // eslint-disable-next-line @typescript-eslint/require-await
                json: async () => ({ embedding: [] }),
              });
            }, 200);
          })
      );

      await expect(timeoutProvider.embed('Test')).rejects.toThrow(
        EmbeddingGenerationError
      );

      await timeoutProvider.dispose();
    });

    it('should throw EmbeddingGenerationError when Ollama becomes unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      try {
        await provider.embed('Test');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingGenerationError);
        expect((error as Error).message).toContain(
          'Ollama not available at http://localhost:11434'
        );
      }
    });

    it('should throw EmbeddingGenerationError for invalid response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ invalid: 'response' }),
      });

      try {
        await provider.embed('Test');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingGenerationError);
        expect((error as Error).message).toContain('Invalid response format');
      }
    });

    it('should throw EmbeddingGenerationError when embedding field is not an array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ embedding: 'not an array' }),
      });

      try {
        await provider.embed('Test');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingGenerationError);
        expect((error as Error).message).toContain('Invalid response format');
      }
    });
  });

  describe('Batch Embedding Generation', () => {
    beforeEach(async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config);
      vi.clearAllMocks();
    });

    it('should process multiple texts sequentially', async () => {
      const texts = ['First text', 'Second text', 'Third text'];
      const mockEmbeddings = texts.map(() =>
        new Array(768).fill(0).map(() => Math.random())
      );

      // Mock responses for each text
      mockEmbeddings.forEach(embedding => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          // eslint-disable-next-line @typescript-eslint/require-await
          json: async () => ({ embedding }),
        });
      });

      const results = await provider.embedBatch(texts);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual(mockEmbeddings[0]);
      expect(results[1]).toEqual(mockEmbeddings[1]);
      expect(results[2]).toEqual(mockEmbeddings[2]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should return empty array for empty input', async () => {
      const results = await provider.embedBatch([]);

      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call progress callback for batch operations', async () => {
      const texts = ['First', 'Second', 'Third'];
      const progressCallback = vi.fn() as EmbeddingProgressCallback;
      const mockEmbedding = new Array(768).fill(0).map(() => Math.random());

      // Mock responses
      texts.forEach(() => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          // eslint-disable-next-line @typescript-eslint/require-await
          json: async () => ({ embedding: mockEmbedding }),
        });
      });

      await provider.embedBatch(texts, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(
        'processing',
        0.0,
        `Processing batch of ${String(3)} texts`
      );
      expect(progressCallback).toHaveBeenCalledWith(
        'processing',
        0,
        `Processing text ${String(1)} of ${String(3)}`
      );
      expect(progressCallback).toHaveBeenCalledWith(
        'processing',
        1 / 3,
        `Processing text ${String(2)} of ${String(3)}`
      );
      expect(progressCallback).toHaveBeenCalledWith(
        'processing',
        2 / 3,
        `Processing text ${String(3)} of ${String(3)}`
      );
      expect(progressCallback).toHaveBeenCalledWith(
        'processing',
        1.0,
        'Batch processing complete'
      );
    });

    it('should throw EmbeddingProviderNotInitializedError when not initialized', async () => {
      const uninitializedProvider = new OllamaEmbeddingProvider();

      await expect(uninitializedProvider.embedBatch(['Test'])).rejects.toThrow(
        EmbeddingProviderNotInitializedError
      );
    });

    it('should stop processing and throw error if one embedding fails', async () => {
      const texts = ['First', 'Second', 'Third'];
      const mockEmbedding = new Array(768).fill(0).map(() => Math.random());

      // First embedding succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ embedding: mockEmbedding }),
      });

      // Second embedding fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        // eslint-disable-next-line @typescript-eslint/require-await
        text: async () => 'Server error',
      });

      try {
        await provider.embedBatch(texts);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingGenerationError);
        expect((error as Error).message).toContain(
          `Failed to embed text at index ${String(1)}`
        );
      }

      // Should have only called fetch twice (stopped after failure)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should include original error message in batch error', async () => {
      const texts = ['First'];

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await provider.embedBatch(texts);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingGenerationError);
        expect((error as Error).message).toContain(
          `Failed to embed text at index ${String(0)}`
        );
        expect((error as Error).message).toContain('Network error');
      }
    });
  });

  describe('Resource Management', () => {
    it('should dispose and reset state properly', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config);

      expect(provider.isInitialized()).toBe(true);
      expect(provider.model).toBe('nomic-embed-text');
      expect(provider.dimensions).toBe(768);

      await provider.dispose();

      expect(provider.isInitialized()).toBe(false);
      expect(provider.model).toBe('');
      expect(provider.dimensions).toBe(0);
    });

    it('should allow multiple dispose calls safely', async () => {
      await provider.dispose();
      await provider.dispose();
      await provider.dispose();

      expect(provider.isInitialized()).toBe(false);
    });

    it('should allow re-initialization after dispose', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      // First initialization
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config);
      expect(provider.isInitialized()).toBe(true);

      await provider.dispose();
      expect(provider.isInitialized()).toBe(false);

      vi.clearAllMocks();

      // Re-initialization
      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config);
      expect(provider.isInitialized()).toBe(true);
      expect(provider.model).toBe('nomic-embed-text');
    });

    it('should not allow embedding after dispose', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
        }),
      });

      await provider.initialize(config);
      await provider.dispose();

      await expect(provider.embed('Test')).rejects.toThrow(
        EmbeddingProviderNotInitializedError
      );
    });
  });

  describe('Error Context and Messages', () => {
    it('should include provider name in all errors', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'test',
      };

      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      try {
        await provider.initialize(config);
        expect.fail('Should have thrown error');
      } catch (error) {
        if (error instanceof EmbeddingProviderInitError) {
          expect(error.provider).toBe('Ollama');
          expect(error.message).toContain('[Ollama]');
        } else {
          throw error;
        }
      }
    });

    it('should provide helpful error messages for common issues', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'missing-model',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({ models: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        // eslint-disable-next-line @typescript-eslint/require-await
        json: async () => ({
          models: [],
        }),
      });

      try {
        await provider.initialize(config);
        expect.fail('Should have thrown error');
      } catch (error) {
        if (error instanceof EmbeddingProviderInitError) {
          expect(error.message).toContain('ollama pull missing-model');
        } else {
          throw error;
        }
      }
    });

    it('should include cause in error chain', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'test',
      };

      const originalError = new Error('Original error');
      mockFetch.mockRejectedValueOnce(originalError);

      try {
        await provider.initialize(config);
        expect.fail('Should have thrown error');
      } catch (error) {
        if (error instanceof EmbeddingProviderInitError) {
          expect(error.cause).toBe(originalError);
        } else {
          throw error;
        }
      }
    });
  });
});
