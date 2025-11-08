/**
 * @fileoverview Tests for LMStudioEmbeddingProvider with @lmstudio/sdk
 *
 * @author MCP Server Team
 * @version 2.1.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LMStudioEmbeddingProvider } from './lmstudioProvider.js';
import {
  EmbeddingProviderInitError,
  EmbeddingGenerationError,
  EmbeddingProviderNotInitializedError,
  EmbeddingConfigError,
  type EmbeddingProviderConfig,
} from './embeddingProvider.interface.js';

// Mock the @lmstudio/sdk module
const mockEmbed = vi.fn();
const mockModelInstance = {
  embed: mockEmbed,
  getModelInfo: vi.fn(),
};
const mockEmbeddingModel = vi.fn();
const mockClientInstance = {
  embedding: {
    model: mockEmbeddingModel,
  },
};

vi.mock('@lmstudio/sdk', () => ({
  LMStudioClient: vi.fn(() => mockClientInstance),
}));

// Mock dns module for SSRF protection tests
vi.mock('dns', async () => {
  const actual = await vi.importActual('dns');
  return {
    ...actual,
    promises: {
      resolve4: vi.fn(),
      resolve6: vi.fn(),
    },
  };
});

// Get the mocked DNS functions after the mock is set up
let mockResolve4: ReturnType<typeof vi.fn>;
let mockResolve6: ReturnType<typeof vi.fn>;

describe('LMStudioEmbeddingProvider', () => {
  let provider: LMStudioEmbeddingProvider;

  beforeEach(async () => {
    provider = new LMStudioEmbeddingProvider();
    vi.clearAllMocks();

    // Get the mocked DNS functions
    const dns = await import('dns');
    mockResolve4 = vi.mocked(dns.promises.resolve4);
    mockResolve6 = vi.mocked(dns.promises.resolve6);
  });

  afterEach(async () => {
    await provider.dispose();
    vi.restoreAllMocks();
  });

  describe('Provider Metadata', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('LM Studio');
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
        type: 'lmstudio',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);

      await provider.initialize(config);

      expect(provider.isInitialized()).toBe(true);
      expect(provider.model).toBe('nomic-embed-text');
      expect(provider.dimensions).toBe(768);
      expect(mockEmbeddingModel).toHaveBeenCalledWith('nomic-embed-text', {
        verbose: false,
      });
    });

    it('should use default baseUrl if not provided', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);

      await provider.initialize(config);

      expect(provider.isInitialized()).toBe(true);
    });

    it('should use custom baseUrl if provided', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://localhost:8080',
        dimensions: 768,
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);

      await provider.initialize(config);

      expect(provider.isInitialized()).toBe(true);
    });

    it('should allow localhost URLs', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://localhost:1234',
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);

      await expect(provider.initialize(config)).resolves.not.toThrow();
      expect(provider.isInitialized()).toBe(true);
    });

    it('should allow 127.0.0.1 URLs', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://127.0.0.1:1234',
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);

      await expect(provider.initialize(config)).resolves.not.toThrow();
      expect(provider.isInitialized()).toBe(true);
    });

    it('should allow wss:// protocol', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'wss://localhost:1234',
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);

      await expect(provider.initialize(config)).resolves.not.toThrow();
      expect(provider.isInitialized()).toBe(true);
    });

    it('should block AWS metadata endpoint (169.254.169.254)', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://169.254.169.254:1234',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/cloud metadata IP/i);
    });

    it('should block private IP ranges (10.x.x.x)', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://10.0.0.1:1234',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/private IP ranges/i);
    });

    it('should block private IP ranges (192.168.x.x)', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://192.168.1.1:1234',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/private IP ranges/i);
    });

    it('should block private IP ranges (172.16-31.x.x)', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://172.20.0.1:1234',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/private IP ranges/i);
    });

    it('should block GCP metadata endpoint', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://metadata.google.internal:1234',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/cloud metadata/i);
    });

    it('should block Azure metadata endpoint', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://metadata.azure.com:1234',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/cloud metadata/i);
    });

    it('should block hostnames that resolve to private IPs via DNS', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://corp-tunnel.example.com:1234',
      };

      // Mock DNS resolution to return a private IP
      mockResolve4.mockResolvedValue(['10.0.0.5']);
      mockResolve6.mockResolvedValue([]);

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/private IP/i);
      expect(mockResolve4).toHaveBeenCalledWith('corp-tunnel.example.com');

      // Reset mocks
      mockResolve4.mockReset();
      mockResolve6.mockReset();
    });

    it('should block hostnames that resolve to cloud metadata IPs', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://evil-redirect.example.com:1234',
      };

      // Mock DNS resolution to return AWS metadata IP
      mockResolve4.mockResolvedValue(['169.254.169.254']);
      mockResolve6.mockResolvedValue([]);

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/cloud metadata IP/i);

      // Reset mocks
      mockResolve4.mockReset();
      mockResolve6.mockReset();
    });

    it('should block invalid protocols (ftp)', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ftp://localhost:1234',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/Invalid protocol/i);
    });

    it('should block malformed URLs', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'not-a-valid-url',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(
        /Invalid baseUrl format/i
      );
    });

    it('should allow IPv6 localhost literal with brackets [::1]', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://[::1]:1234',
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);

      await expect(provider.initialize(config)).resolves.not.toThrow();
      expect(provider.isInitialized()).toBe(true);
    });

    it('should block IPv6 link-local address with brackets [fe80::1]', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://[fe80::1]:1234',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/private IP ranges/i);
    });

    it('should block IPv6 ULA address with brackets [fc00::1]', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://[fc00::1]:1234',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/private IP ranges/i);
    });

    it('should block IPv6 ULA address with brackets [fd00::1]', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        baseUrl: 'ws://[fd00::1]:1234',
      };

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(/private IP ranges/i);
    });

    it('should throw error for invalid provider type', async () => {
      const config = {
        type: 'invalid',
        model: 'test',
      } as unknown as EmbeddingProviderConfig;

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
    });

    it('should throw error when model is missing', async () => {
      const config = {
        type: 'lmstudio',
      } as unknown as EmbeddingProviderConfig;

      await expect(provider.initialize(config)).rejects.toThrow(EmbeddingConfigError);
      await expect(provider.initialize(config)).rejects.toThrow(
        /Model name is required/i
      );
    });

    it('should throw error when model loading fails', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nonexistent-model',
      };

      mockEmbeddingModel.mockRejectedValueOnce(new Error('Model not found'));

      try {
        await provider.initialize(config);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingProviderInitError);
        expect((error as Error).message).toMatch(/not found/i);
      }
    });

    it('should throw error when LM Studio is not running', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
      };

      mockEmbeddingModel.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      try {
        await provider.initialize(config);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingProviderInitError);
        expect((error as Error).message).toMatch(/not available/i);
      }
    });
  });

  describe('Embedding Generation', () => {
    beforeEach(async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);

      await provider.initialize(config);
      vi.clearAllMocks();
    });

    it('should generate embedding for single text', async () => {
      const embedding = new Array(768).fill(0.5);
      mockEmbed.mockResolvedValueOnce({ embedding });

      const result = await provider.embed('test text');

      expect(result).toEqual(embedding);
      expect(mockEmbed).toHaveBeenCalledWith('test text');
    });

    it('should throw error when not initialized', async () => {
      const uninitProvider = new LMStudioEmbeddingProvider();

      await expect(uninitProvider.embed('test')).rejects.toThrow(
        EmbeddingProviderNotInitializedError
      );
    });

    it('should generate embeddings for batch', async () => {
      const embedding1 = new Array(768).fill(0.5);
      const embedding2 = new Array(768).fill(0.6);

      mockEmbed.mockResolvedValueOnce([
        { embedding: embedding1 },
        { embedding: embedding2 },
      ]);

      const result = await provider.embedBatch(['text1', 'text2']);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(embedding1);
      expect(result[1]).toEqual(embedding2);
      expect(mockEmbed).toHaveBeenCalledWith(['text1', 'text2']);
      expect(mockEmbed).toHaveBeenCalledTimes(1); // Single batch call
    });

    it('should return empty array for empty batch', async () => {
      const result = await provider.embedBatch([]);
      expect(result).toEqual([]);
      expect(mockEmbed).not.toHaveBeenCalled();
    });

    it('should throw error on batch size mismatch', async () => {
      const embedding1 = new Array(768).fill(0.5);
      const embedding2 = new Array(768).fill(0.6);

      // Return only 2 embeddings when 3 were requested
      mockEmbed.mockResolvedValue([
        { embedding: embedding1 },
        { embedding: embedding2 },
      ]);

      try {
        await provider.embedBatch(['text1', 'text2', 'text3']);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingGenerationError);
        expect((error as Error).message).toMatch(/Batch size mismatch/i);
        expect((error as Error).message).toMatch(/requested 3/i);
        expect((error as Error).message).toMatch(/received 2/i);
      }
    });

    it('should throw error on embedding failure', async () => {
      mockEmbed.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(provider.embed('test')).rejects.toThrow(EmbeddingGenerationError);
    });

    it('should throw error when no embeddings returned', async () => {
      mockEmbed.mockResolvedValueOnce({ embedding: [] });

      await expect(provider.embed('test')).rejects.toThrow(EmbeddingGenerationError);
    });

    it('should throw error on dimension mismatch', async () => {
      const embedding = new Array(512).fill(0.5); // Wrong dimensions
      mockEmbed.mockResolvedValueOnce({ embedding });

      try {
        await provider.embed('test');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingGenerationError);
        expect((error as Error).message).toMatch(/Dimension mismatch/i);
      }
    });

    it('should determine dimensions from first embedding if not configured', async () => {
      // Initialize without dimensions
      const uninitProvider = new LMStudioEmbeddingProvider();
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'custom-model',
        // No dimensions specified
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);
      await uninitProvider.initialize(config);

      expect(uninitProvider.dimensions).toBe(0); // Not set yet

      const embedding = new Array(512).fill(0.5);
      mockEmbed.mockResolvedValueOnce({ embedding });

      const result = await uninitProvider.embed('test');

      expect(result).toEqual(embedding);
      expect(uninitProvider.dimensions).toBe(512); // Now set from first embedding

      await uninitProvider.dispose();
    });
  });

  describe('Resource Management', () => {
    it('should dispose properly', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);

      await provider.initialize(config);
      expect(provider.isInitialized()).toBe(true);

      await provider.dispose();

      expect(provider.isInitialized()).toBe(false);
      expect(provider.model).toBe('');
      expect(provider.dimensions).toBe(0);
    });

    it('should allow re-initialization after dispose', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      // First initialization
      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);
      await provider.initialize(config);
      expect(provider.isInitialized()).toBe(true);

      await provider.dispose();
      expect(provider.isInitialized()).toBe(false);

      // Second initialization
      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);
      await provider.initialize(config);
      expect(provider.isInitialized()).toBe(true);
    });
  });

  describe('Progress Callbacks', () => {
    it('should call progress callback during initialization', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);

      const progressCallback = vi.fn();
      await provider.initialize(config, progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        'initialization',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should call progress callback during embedding generation', async () => {
      const config: EmbeddingProviderConfig = {
        type: 'lmstudio',
        model: 'nomic-embed-text',
        dimensions: 768,
      };

      mockEmbeddingModel.mockResolvedValueOnce(mockModelInstance);
      await provider.initialize(config);

      const embedding = new Array(768).fill(0.5);
      mockEmbed.mockResolvedValueOnce({ embedding });

      const progressCallback = vi.fn();
      await provider.embed('test', progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        'processing',
        expect.any(Number),
        expect.any(String)
      );
    });
  });
});
