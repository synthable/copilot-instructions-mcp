/**
 * @fileoverview Tests for FileVectorStore
 *
 * @author MCP Server Team
 * @version 2.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VectorStoreConfig, VectorQuery } from './vectorStore.interface.js';
import type { VectorIndex, ModuleVector } from '../../core/types.js';
import type { ILogger } from '../../core/interfaces.js';
import { VectorFixtures, FIXED_TEST_TIMESTAMP } from '../../../../test/fixtures/index.js';

// Mock node:fs (includes both promises and existsSync)
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
    access: vi.fn(),
  },
}));

// Mock @msgpack/msgpack
vi.mock('@msgpack/msgpack', () => ({
  decode: vi.fn(),
}));

// Mock node:crypto
vi.mock('node:crypto', () => ({
  createHash: vi.fn(),
}));

// Import after mocks are set up
const { FileVectorStore } = await import('./fileVectorStore.js');
const nodeFs = await import('node:fs');
const msgpack = await import('@msgpack/msgpack');
const crypto = await import('node:crypto');

// Create typed mock accessors
const mockReadFile = vi.mocked(nodeFs.promises.readFile);
const mockExistsSync = vi.mocked(nodeFs.existsSync);
const mockMsgpackDecode = vi.mocked(msgpack.decode);
const mockCreateHash = vi.mocked(crypto.createHash);

describe('FileVectorStore', () => {
  let store: FileVectorStore;
  let mockLogger: ILogger;

  // Sample test data using fixtures for consistent, deterministic tests
  const sampleVectorIndex: VectorIndex = VectorFixtures.createVectorIndex();

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    store = new FileVectorStore(mockLogger);
    vi.clearAllMocks();
  });

  afterEach(() => {
    store.close();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };

      await store.initialize(config);

      expect(store.isInitialized()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'FileVectorStore initialized successfully'
      );
    });

    it('should use default path when no path provided', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        enableIntegrityCheck: false,
      };

      await store.initialize(config);

      expect(store.isInitialized()).toBe(true);
    });

    it('should not re-initialize if already initialized', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        enableIntegrityCheck: false,
      };

      await store.initialize(config);
      await store.initialize(config);

      expect(mockLogger.debug).toHaveBeenCalledWith('FileVectorStore already initialized');
    });

    it('should throw error for invalid dimensions configuration', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        dimensions: 'invalid' as any,
        enableIntegrityCheck: false,
      };

      await expect(store.initialize(config)).rejects.toThrow(
        'Invalid dimensions configuration'
      );
    });
  });

  describe('Path Validation (Security)', () => {
    it('should accept valid relative paths', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };

      await expect(store.initialize(config)).resolves.not.toThrow();
    });

    it('should reject directory traversal attacks with ../', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: '../../../etc/passwd',
        enableIntegrityCheck: false,
      };

      await expect(store.initialize(config)).rejects.toThrow(
        /Invalid vector store path|Security violation/
      );
    });

    it('should reject absolute paths outside app directory', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: '/etc/passwd',
        enableIntegrityCheck: false,
      };

      await expect(store.initialize(config)).rejects.toThrow(
        /Invalid vector store path|Security violation/
      );
    });

    it('should accept nested relative paths within app directory', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'data/nested/vectors',
        enableIntegrityCheck: false,
      };

      await expect(store.initialize(config)).resolves.not.toThrow();
    });
  });

  describe('Vector Availability', () => {
    it('should return false when vectors directory not set', () => {
      expect(store.isAvailable()).toBe(false);
    });

    it('should return true when MessagePack file exists', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };

      await store.initialize(config);

      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('vectors.msgpack');
      });

      expect(store.isAvailable()).toBe(true);
    });

    it('should return true when JSON file exists', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };

      await store.initialize(config);

      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('vectors.json');
      });

      expect(store.isAvailable()).toBe(true);
    });

    it('should return false when no vector files exist', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };

      await store.initialize(config);
      mockExistsSync.mockReturnValue(false);

      expect(store.isAvailable()).toBe(false);
    });

    it('should handle existsSync errors gracefully', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };

      await store.initialize(config);
      mockExistsSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(store.isAvailable()).toBe(false);
    });
  });

  describe('Vector Loading', () => {
    beforeEach(async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await store.initialize(config);
    });

    it('should load vectors from MessagePack format', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('msgpack-data'));
      mockMsgpackDecode.mockReturnValue(sampleVectorIndex);

      const result = await store.loadVectors();

      expect(result).toEqual(sampleVectorIndex);
      expect(mockMsgpackDecode).toHaveBeenCalled();
    });

    it('should fall back to JSON format if MessagePack fails', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('vectors.json');
      });
      mockReadFile.mockResolvedValue(JSON.stringify(sampleVectorIndex));

      const result = await store.loadVectors();

      expect(result).toEqual(sampleVectorIndex);
      expect(result?.metadata).toBeDefined();
      expect(result?.vectors).toHaveLength(2);
    });

    it('should return null if no vector files exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await store.loadVectors();

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No valid vector files found',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle MessagePack decode errors', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('invalid-data'));
      mockMsgpackDecode.mockImplementation(() => {
        throw new Error('Decode failed');
      });

      const result = await store.loadVectors();

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle JSON parse errors', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('vectors.json');
      });
      mockReadFile.mockResolvedValue('invalid-json{');

      const result = await store.loadVectors();

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should validate vector index structure', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('vectors.msgpack');
      });
      mockReadFile.mockResolvedValue(Buffer.from('msgpack-data'));
      mockMsgpackDecode.mockReturnValue({ invalid: 'structure' });

      const result = await store.loadVectors();

      // Invalid structure should return null
      expect(result).toBeNull();
    });
  });

  describe('File System Error Handling', () => {
    beforeEach(async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await store.initialize(config);
    });

    it('should handle permission denied errors (EACCES)', async () => {
      mockExistsSync.mockReturnValue(true);
      const permissionError = Object.assign(
        new Error('Permission denied'),
        { code: 'EACCES' }
      );
      mockReadFile.mockRejectedValue(permissionError);

      const result = await store.loadVectors();

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load vectors'),
        permissionError,
        expect.any(Object)
      );
    });

    it('should handle disk full errors (ENOSPC)', async () => {
      mockExistsSync.mockReturnValue(true);
      const diskFullError = Object.assign(
        new Error('No space left on device'),
        { code: 'ENOSPC' }
      );
      mockReadFile.mockRejectedValue(diskFullError);

      const result = await store.loadVectors();

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load vectors'),
        diskFullError,
        expect.any(Object)
      );
    });

    it('should handle file not found errors (ENOENT)', async () => {
      mockExistsSync.mockReturnValue(false);
      const notFoundError = Object.assign(
        new Error('File not found'),
        { code: 'ENOENT' }
      );
      mockReadFile.mockRejectedValue(notFoundError);

      const result = await store.loadVectors();

      expect(result).toBeNull();
    });

    it('should handle directory instead of file errors (EISDIR)', async () => {
      mockExistsSync.mockReturnValue(true);
      const isDirError = Object.assign(
        new Error('Illegal operation on a directory'),
        { code: 'EISDIR' }
      );
      mockReadFile.mockRejectedValue(isDirError);

      const result = await store.loadVectors();

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load vectors'),
        isDirError,
        expect.any(Object)
      );
    });

    it('should handle corrupt file data', async () => {
      mockExistsSync.mockReturnValue(true);
      // Return truncated/corrupt data
      mockReadFile.mockResolvedValue(Buffer.from('{"incomplete": '));

      const result = await store.loadVectors();

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load vectors'),
        expect.any(Error),
        expect.any(Object)
      );
    });

    it('should handle empty file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from(''));

      const result = await store.loadVectors();

      expect(result).toBeNull();
    });

    it('should handle file read timeout', async () => {
      mockExistsSync.mockReturnValue(true);
      const timeoutError = Object.assign(
        new Error('Operation timed out'),
        { code: 'ETIMEDOUT' }
      );
      mockReadFile.mockRejectedValue(timeoutError);

      const result = await store.loadVectors();

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle concurrent access errors', async () => {
      mockExistsSync.mockReturnValue(true);
      const lockError = Object.assign(
        new Error('Resource temporarily unavailable'),
        { code: 'EAGAIN' }
      );
      mockReadFile.mockRejectedValue(lockError);

      const result = await store.loadVectors();

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Vector Search', () => {
    beforeEach(async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await store.initialize(config);

      // Mock successful vector loading
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('msgpack-data'));
      mockMsgpackDecode.mockReturnValue(sampleVectorIndex);
    });

    it('should find similar vectors using cosine similarity', async () => {
      const query: VectorQuery = {
        vector: [0.1, 0.2, 0.3],
        limit: 2,
      };

      const results = await store.search(query);

      expect(results).toHaveLength(2);
      expect(results[0].vector.id).toBe('module1'); // Exact match should be first
      expect(results[0].similarity).toBeGreaterThan(0.9);
    });

    it('should respect limit parameter', async () => {
      const query: VectorQuery = {
        vector: [0.1, 0.2, 0.3],
        limit: 1,
      };

      const results = await store.search(query);

      expect(results).toHaveLength(1);
    });

    it('should filter by IDs', async () => {
      const query: VectorQuery = {
        vector: [0.1, 0.2, 0.3],
        limit: 10,
        filters: { ids: ['module2'] },
      };

      const results = await store.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].vector.id).toBe('module2');
    });

    it('should filter by tier', async () => {
      const query: VectorQuery = {
        vector: [0.1, 0.2, 0.3],
        limit: 10,
        filters: { tier: 'foundation' },
      };

      const results = await store.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].vector.id).toBe('module1');
    });

    it('should apply similarity threshold', async () => {
      const query: VectorQuery = {
        vector: [1.0, 0.0, 0.0], // Very different from test vectors
        limit: 10,
        threshold: 0.99, // Very high threshold
      };

      const results = await store.search(query);

      expect(results.length).toBeLessThan(2); // Should filter out low similarity
    });

    it('should log errors for malformed vectors during search and exclude them from results', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await store.initialize(config);

      // Create index with one good vector and one malformed vector using fixtures
      const malformedIndex: VectorIndex = VectorFixtures.createMalformedVectorIndex();

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('msgpack-data'));
      mockMsgpackDecode.mockReturnValue(malformedIndex);

      const query: VectorQuery = {
        vector: [0.1, 0.2, 0.3],
        limit: 10,
      };

      const results = await store.search(query);

      // Should only return valid vectors (malformed vector with NaN excluded)
      expect(results.length).toBe(2);

      // The malformed vector should NOT be in results
      const malformedResult = results.find(r => r.vector.id === 'malformed');
      expect(malformedResult).toBeUndefined();

      // Only valid vectors should be present (fixtures use 'valid1' and 'valid2')
      expect(results[0].vector.id).toMatch(/valid1|valid2/);
      expect(results[1].vector.id).toMatch(/valid1|valid2/);

      // Verify logger was called with warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Skipping vector with NaN values during search',
        undefined,
        expect.objectContaining({ moduleId: 'malformed' })
      );
    });

    it('should return empty array when no vectors loaded', async () => {
      const newStore = new FileVectorStore(mockLogger);
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await newStore.initialize(config);

      mockExistsSync.mockReturnValue(false);

      const query: VectorQuery = {
        vector: [0.1, 0.2, 0.3],
        limit: 5,
      };

      const results = await newStore.search(query);

      expect(results).toEqual([]);
      newStore.close();
    });
  });

  describe('Vector Retrieval by ID', () => {
    beforeEach(async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await store.initialize(config);

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('msgpack-data'));
      mockMsgpackDecode.mockReturnValue(sampleVectorIndex);
    });

    it('should retrieve vectors by IDs', async () => {
      const vectors = await store.getVectorsByIds(['module1', 'module2']);

      expect(vectors).toHaveLength(2);
      expect(vectors[0].id).toBe('module1');
      expect(vectors[1].id).toBe('module2');
    });

    it('should return empty array for non-existent IDs', async () => {
      const vectors = await store.getVectorsByIds(['nonexistent']);

      expect(vectors).toEqual([]);
    });

    it('should handle mixed existing and non-existing IDs', async () => {
      const vectors = await store.getVectorsByIds(['module1', 'nonexistent']);

      expect(vectors).toHaveLength(1);
      expect(vectors[0].id).toBe('module1');
    });

    it('should return empty array when empty ID list provided', async () => {
      const vectors = await store.getVectorsByIds([]);

      expect(vectors).toEqual([]);
    });
  });

  describe('Vector Retrieval by Tier', () => {
    beforeEach(async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await store.initialize(config);

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('msgpack-data'));
      mockMsgpackDecode.mockReturnValue(sampleVectorIndex);
    });

    it('should retrieve vectors by tier', async () => {
      const vectors = await store.getVectorsByTier('foundation');

      expect(vectors).toHaveLength(1);
      expect(vectors[0].tier).toBe('foundation');
    });

    it('should handle case-insensitive tier matching', async () => {
      const vectors = await store.getVectorsByTier('FOUNDATION');

      expect(vectors).toHaveLength(1);
      expect(vectors[0].tier).toBe('foundation');
    });

    it('should return empty array for non-existent tier', async () => {
      const vectors = await store.getVectorsByTier('nonexistent');

      expect(vectors).toEqual([]);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await store.initialize(config);

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('metadata.json')) {
          return Promise.resolve(JSON.stringify(sampleVectorIndex.metadata));
        }
        if (path.includes('vectors.msgpack')) {
          return Promise.resolve(Buffer.from('msgpack-data'));
        }
        return Promise.reject(new Error('File not found'));
      });
      mockMsgpackDecode.mockReturnValue(sampleVectorIndex);
    });

    it('should return vector store statistics', async () => {
      const stats = await store.getStats();

      expect(stats).toMatchObject({
        count: 2,
        dimensions: 3,
        type: 'file',
        model: 'test-model',
      });
    });

    it('should return zero stats when no vectors loaded', async () => {
      const newStore = new FileVectorStore(mockLogger);
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await newStore.initialize(config);

      mockExistsSync.mockReturnValue(false);

      const stats = await newStore.getStats();

      expect(stats.count).toBe(0);
      expect(stats.type).toBe('file');
      newStore.close();
    });

    it('should include model and dimensions in statistics', async () => {
      const stats = await store.getStats();

      expect(stats.model).toBe('test-model');
      expect(stats.dimensions).toBe(3);
      expect(stats.count).toBe(2);
    });
  });

  describe('Metadata Retrieval', () => {
    beforeEach(async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await store.initialize(config);

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('metadata.json')) {
          return Promise.resolve(JSON.stringify(sampleVectorIndex.metadata));
        }
        return Promise.reject(new Error('File not found'));
      });
    });

    it('should retrieve metadata', async () => {
      const metadata = await store.getMetadata();

      expect(metadata).not.toBeNull();
      expect(metadata?.count).toBe(2);
      expect(metadata?.model).toBe('test-model');
      expect(metadata?.dimensions).toBe(3);
    });

    it('should return null when no vectors loaded', async () => {
      const newStore = new FileVectorStore(mockLogger);
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await newStore.initialize(config);

      mockExistsSync.mockReturnValue(false);

      const metadata = await newStore.getMetadata();

      expect(metadata).toBeNull();
      newStore.close();
    });
  });

  describe('Integrity Validation', () => {
    beforeEach(async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };
      await store.initialize(config);
    });

    it('should validate integrity when checksums match', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        // checksums.json exists, vectors.msgpack exists
        return path.includes('checksums.json') || path.includes('vectors.msgpack');
      });

      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('checksums.json')) {
          return Promise.resolve(
            JSON.stringify({
              'vectors.msgpack': 'expected-hash',
            })
          );
        }
        if (path.includes('vectors.msgpack')) {
          return Promise.resolve(Buffer.from('msgpack-data'));
        }
        return Promise.reject(new Error('File not found'));
      });

      // Mock crypto.createHash to return expected hash
      const mockHash = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('expected-hash'),
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockCreateHash.mockReturnValue(mockHash as any);

      const isValid = await store.validateIntegrity();

      expect(isValid).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Vector integrity validation passed',
        expect.any(Object)
      );
    });

    it('should fail validation when checksums do not match', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        // checksums.json exists, vectors.msgpack exists
        return path.includes('checksums.json') || path.includes('vectors.msgpack');
      });

      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('checksums.json')) {
          return Promise.resolve(
            JSON.stringify({
              'vectors.msgpack': 'expected-hash',
            })
          );
        }
        if (path.includes('vectors.msgpack')) {
          return Promise.resolve(Buffer.from('msgpack-data'));
        }
        return Promise.reject(new Error('File not found'));
      });

      // Mock crypto.createHash to return different hash
      const mockHash = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('different-hash'),
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockCreateHash.mockReturnValue(mockHash as any);

      const isValid = await store.validateIntegrity();

      expect(isValid).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Checksum mismatch detected',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle missing checksum file', async () => {
      mockExistsSync.mockReturnValue(false);

      const isValid = await store.validateIntegrity();

      expect(isValid).toBe(false); // Returns false when checksums not available
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Checksums file not found',
        undefined,
        expect.any(Object)
      );
    });
  });

  describe('Resource Management', () => {
    it('should close and cleanup resources', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };

      await store.initialize(config);

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(Buffer.from('msgpack-data'));
      mockMsgpackDecode.mockReturnValue(sampleVectorIndex);

      // Load vectors
      await store.loadVectors();

      // Close store
      store.close();

      expect(store.isInitialized()).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Closing FileVectorStore');
    });

    it('should allow re-initialization after close', async () => {
      const config: VectorStoreConfig = {
        type: 'file',
        path: 'dist/vectors',
        enableIntegrityCheck: false,
      };

      await store.initialize(config);
      store.close();
      await store.initialize(config);

      expect(store.isInitialized()).toBe(true);
    });
  });
});
