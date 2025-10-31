/**
 * @fileoverview Tests for configuration migration helpers.
 *
 * These tests verify that:
 * - Legacy configs are properly detected
 * - Migration from old to new format works correctly
 * - Provider-specific defaults are applied correctly
 * - Validation catches provider-specific issues
 * - Edge cases and error conditions are handled
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isLegacyConfig,
  getProviderDefaults,
  migrateConfig,
  validateProviderConfig,
} from './config.migration.js';
import type { ServerConfig } from './config.schema.js';

// Mock the logger
vi.mock('../modules/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('config.migration', () => {
  describe('isLegacyConfig', () => {
    it('should detect legacy config with name field', () => {
      const config = {
        embeddingProvider: { name: 'transformers' },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
      };

      expect(isLegacyConfig(config)).toBe(true);
    });

    it('should return false for new config with type field', () => {
      const config = {
        embeddingProvider: { type: 'transformers' },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
      };

      expect(isLegacyConfig(config)).toBe(false);
    });

    it('should return false for config with both name and type', () => {
      const config = {
        embeddingProvider: { name: 'transformers', type: 'ollama' },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
      };

      expect(isLegacyConfig(config)).toBe(false);
    });

    it('should return false for invalid config', () => {
      expect(isLegacyConfig(null)).toBe(false);
      expect(isLegacyConfig(undefined)).toBe(false);
      expect(isLegacyConfig('string')).toBe(false);
      expect(isLegacyConfig(123)).toBe(false);
      expect(isLegacyConfig({})).toBe(false);
    });

    it('should return false for config without embeddingProvider', () => {
      const config = {
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
      };

      expect(isLegacyConfig(config)).toBe(false);
    });
  });

  describe('getProviderDefaults', () => {
    it('should return correct defaults for transformers', () => {
      const defaults = getProviderDefaults('transformers');

      expect(defaults).toEqual({
        type: 'transformers',
        model: 'all-mpnet-base-v2',
        dimensions: 768,
        cacheEnabled: true,
      });
    });

    it('should return correct defaults for ollama', () => {
      const defaults = getProviderDefaults('ollama');

      expect(defaults).toEqual({
        type: 'ollama',
        model: 'nomic-embed-text',
        baseUrl: 'http://localhost:11434',
        dimensions: 768,
        cacheEnabled: true,
      });
    });

    it('should return correct defaults for openai', () => {
      const defaults = getProviderDefaults('openai');

      expect(defaults).toEqual({
        type: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        cacheEnabled: true,
      });
    });

    it('should return correct defaults for cohere', () => {
      const defaults = getProviderDefaults('cohere');

      expect(defaults).toEqual({
        type: 'cohere',
        model: 'embed-english-v3.0',
        dimensions: 1024,
        cacheEnabled: true,
      });
    });

    it('should return minimal defaults for unknown provider', () => {
      const defaults = getProviderDefaults('unknown-provider');

      expect(defaults).toEqual({
        type: 'unknown-provider',
        cacheEnabled: true,
      });
    });
  });

  describe('migrateConfig', () => {
    it('should throw error for invalid config', () => {
      expect(() => migrateConfig(null)).toThrow('Invalid config: must be an object');
      expect(() => migrateConfig(undefined)).toThrow(
        'Invalid config: must be an object'
      );
      expect(() => migrateConfig('string')).toThrow(
        'Invalid config: must be an object'
      );
    });

    it('should migrate legacy transformers config', () => {
      const oldConfig = {
        embeddingProvider: { name: 'transformers' },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.embeddingProvider.type).toBe('transformers');
      expect(migrated.embeddingProvider.model).toBe('all-mpnet-base-v2');
      expect(migrated.embeddingProvider.dimensions).toBe(768);
      expect(migrated.embeddingProvider.cacheEnabled).toBe(true);
      expect(migrated.searchProvider.name).toBe('fuzzy');
      expect(migrated.moduleDirectory).toBe('instructions-modules');
    });

    it('should migrate legacy ollama config', () => {
      const oldConfig = {
        embeddingProvider: { name: 'ollama', model: 'llama3' },
        searchProvider: { name: 'semantic' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.embeddingProvider.type).toBe('ollama');
      expect(migrated.embeddingProvider.model).toBe('llama3');
      expect(migrated.embeddingProvider.baseUrl).toBe('http://localhost:11434');
      expect(migrated.searchProvider.name).toBe('semantic');
    });

    it('should preserve existing values during migration', () => {
      const oldConfig = {
        embeddingProvider: {
          name: 'openai',
          model: 'custom-model',
          apiKey: 'test-key',
          dimensions: 512,
          cacheEnabled: false,
          maxCacheSize: 1000,
        },
        searchProvider: { name: 'hybrid' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'custom-modules',
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.embeddingProvider.type).toBe('openai');
      expect(migrated.embeddingProvider.model).toBe('custom-model');
      expect(migrated.embeddingProvider.apiKey).toBe('test-key');
      expect(migrated.embeddingProvider.dimensions).toBe(512);
      expect(migrated.embeddingProvider.cacheEnabled).toBe(false);
      expect(migrated.embeddingProvider.maxCacheSize).toBe(1000);
      expect(migrated.moduleDirectory).toBe('custom-modules');
    });

    it('should handle config without embeddingProvider', () => {
      const oldConfig = {
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.embeddingProvider.type).toBe('transformers');
      expect(migrated.embeddingProvider.model).toBe('all-mpnet-base-v2');
    });

    it('should handle config already in new format', () => {
      const newConfig = {
        embeddingProvider: {
          type: 'ollama' as const,
          model: 'nomic-embed-text',
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
      };

      const migrated = migrateConfig(newConfig);

      expect(migrated.embeddingProvider.type).toBe('ollama');
      expect(migrated.embeddingProvider.model).toBe('nomic-embed-text');
      expect(migrated.embeddingProvider.baseUrl).toBe('http://localhost:11434');
    });

    it('should handle legacy name variations', () => {
      const configs = [
        { embeddingProvider: { name: 'transformer' } },
        { embeddingProvider: { name: 'huggingface-transformers' } },
        { embeddingProvider: { name: 'huggingface' } },
        { embeddingProvider: { name: 'openai-embeddings' } },
        { embeddingProvider: { name: 'cohere-embed' } },
      ];

      const expectedTypes = [
        'transformers',
        'transformers',
        'transformers',
        'openai',
        'cohere',
      ];

      configs.forEach((config, index) => {
        const migrated = migrateConfig({
          ...config,
          searchProvider: { name: 'fuzzy' },
          vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        });
        expect(migrated.embeddingProvider.type).toBe(expectedTypes[index]);
      });
    });

    it('should default to transformers for unknown provider name', () => {
      const oldConfig = {
        embeddingProvider: { name: 'unknown-provider' },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.embeddingProvider.type).toBe('transformers');
    });

    it('should apply defaults when optional fields are missing', () => {
      const oldConfig = {
        embeddingProvider: { name: 'ollama' },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.embeddingProvider.baseUrl).toBe('http://localhost:11434');
      expect(migrated.embeddingProvider.dimensions).toBe(768);
      expect(migrated.embeddingProvider.cacheEnabled).toBe(true);
    });
  });

  describe('validateProviderConfig', () => {
    it('should return no warnings for valid transformers config', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'all-mpnet-base-v2',
          dimensions: 768,
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toEqual([]);
    });

    it('should warn about missing ollama baseUrl', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'ollama',
          model: 'nomic-embed-text',
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Ollama provider requires baseUrl');
    });

    it('should return no warnings for ollama with baseUrl', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'ollama',
          model: 'nomic-embed-text',
          baseUrl: 'http://localhost:11434',
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toEqual([]);
    });

    it('should warn about missing openai apiKey', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'openai',
          model: 'text-embedding-3-small',
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('OpenAI provider requires apiKey');
    });

    it('should return no warnings for openai with apiKey', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'openai',
          model: 'text-embedding-3-small',
          apiKey: 'test-key',
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toEqual([]);
    });

    it('should warn about missing cohere apiKey', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'cohere',
          model: 'embed-english-v3.0',
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Cohere provider requires apiKey');
    });

    it('should return no warnings for cohere with apiKey', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'cohere',
          model: 'embed-english-v3.0',
          apiKey: 'test-key',
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toEqual([]);
    });

    it('should warn about empty model', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: '',
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Embedding model not specified');
    });

    it('should warn about invalid dimensions', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'all-mpnet-base-v2',
          dimensions: -10,
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Invalid embedding dimensions');
    });

    it('should warn about invalid maxCacheSize', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'all-mpnet-base-v2',
          maxCacheSize: -100,
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Invalid maxCacheSize');
    });

    it('should collect multiple warnings', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'openai',
          model: '',
          dimensions: 0,
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings.length).toBeGreaterThan(1);
      expect(warnings.some(w => w.includes('apiKey'))).toBe(true);
      expect(warnings.some(w => w.includes('model'))).toBe(true);
      expect(warnings.some(w => w.includes('dimensions'))).toBe(true);
    });

    it('should warn about unknown provider type', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'unknown-provider' as 'transformers',
          model: 'test-model',
          cacheEnabled: true,
        },
        searchProvider: { name: 'fuzzy' },
        vectorStore: { type: 'file' as const, enableIntegrityCheck: true },
        moduleDirectory: 'instructions-modules',
      };

      const warnings = validateProviderConfig(config);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Unknown provider type');
    });
  });
});
