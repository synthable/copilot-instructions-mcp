/**
 * @fileoverview Tests for OllamaEmbeddingProvider with ollama-js
 *
 * @author MCP Server Team
 * @version 2.1.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaEmbeddingProvider } from './ollamaProvider.js';
import {
  EmbeddingProviderInitError,
  EmbeddingGenerationError,
  EmbeddingProviderNotInitializedError,
  EmbeddingConfigError,
  type EmbeddingProviderConfig,
} from './embeddingProvider.interface.js';

// Mock the ollama module
const mockList = vi.fn();
const mockEmbed = vi.fn();
const mockOllamaInstance = {
  list: mockList,
  embed: mockEmbed,
  host: 'http://localhost:11434',
};

vi.mock('ollama', () => ({
  Ollama: vi.fn(() => mockOllamaInstance),
}));

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
    it('should initialize successfully with valid configuration', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      mockList.mockResolvedValueOnce({
        models: [
          {
            name: 'nomic-embed-text',
            modified_at: '2024-01-01',
            size: 274301970,
            digest: 'abc123',
          },
        ],
      });

      await provider.initialize(config);

      expect(provider.isInitialized()).toBe(true);
      expect(provider.model).toBe('nomic-embed-text');
      expect(provider.dimensions).toBe(768);
      expect(mockList).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid provider type', async () => {
      const config = {
        type: 'invalid',
        model: 'test',
      } as unknown as EmbeddingProviderConfig;

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
    });

    it('should throw error when model not found', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nonexistent-model',
      };

      mockList.mockResolvedValueOnce({
        models: [{ name: 'other-model', modified_at: '', size: 0, digest: '' }],
      });

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingProviderInitError);
    });
  });

  describe('Embedding Generation', () => {
    beforeEach(async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      mockList.mockResolvedValueOnce({
        models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
      });

      await provider.initialize(config);
      vi.clearAllMocks();
    });

    it('should generate embedding for single text', async () => {
      const embedding = new Array(768).fill(0.5);
      mockEmbed.mockResolvedValueOnce({ embeddings: [embedding] });

      const result = await provider.embed('test text');

      expect(result).toEqual(embedding);
      expect(mockEmbed).toHaveBeenCalledWith({
        model: 'nomic-embed-text',
        input: 'test text',
      });
    });

    it('should throw error when not initialized', async () => {
      const uninitProvider = new OllamaEmbeddingProvider();

      await expect(uninitProvider.embed('test')).rejects.toThrow(
        EmbeddingProviderNotInitializedError
      );
    });

    it('should generate embeddings for batch', async () => {
      const embedding1 = new Array(768).fill(0.5);
      const embedding2 = new Array(768).fill(0.6);

      mockEmbed.mockResolvedValueOnce({ embeddings: [embedding1, embedding2] });

      const result = await provider.embedBatch(['text1', 'text2']);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(embedding1);
      expect(result[1]).toEqual(embedding2);
      expect(mockEmbed).toHaveBeenCalledWith({
        model: 'nomic-embed-text',
        input: ['text1', 'text2'],
      });
      expect(mockEmbed).toHaveBeenCalledTimes(1); // Single batch call
    });

    it('should return empty array for empty batch', async () => {
      const result = await provider.embedBatch([]);
      expect(result).toEqual([]);
      expect(mockEmbed).not.toHaveBeenCalled();
    });

    it('should throw error on embedding failure', async () => {
      mockEmbed.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(provider.embed('test')).rejects.toThrow(EmbeddingGenerationError);
    });
  });

  describe('Resource Management', () => {
    it('should dispose properly', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'ollama',
        model: 'nomic-embed-text',
      };

      mockList.mockResolvedValueOnce({
        models: [{ name: 'nomic-embed-text', modified_at: '', size: 0, digest: '' }],
      });

      await provider.initialize(config);
      expect(provider.isInitialized()).toBe(true);

      await provider.dispose();

      expect(provider.isInitialized()).toBe(false);
      expect(provider.model).toBe('');
      expect(provider.dimensions).toBe(0);
    });
  });
});
