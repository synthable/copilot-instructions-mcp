/**
 * @fileoverview Test fixtures for server configuration testing
 *
 * Provides factory functions for creating consistent server configuration
 * objects for testing different scenarios.
 *
 * @author MCP Server Team
 * @version 2.0.0
 */

import type { ServerConfig } from '../../src/config/config.interface.js';

/**
 * Configuration fixture factory functions
 */
export const ConfigFixtures = {
  /**
   * Standard server config for tests
   */
  createServerConfig(overrides?: Partial<ServerConfig>): ServerConfig {
    return {
      embeddingProvider: {
        type: 'transformers',
        model: 'test-model',
        cacheEnabled: true,
      },
      vectorStore: {
        type: 'file',
        enableIntegrityCheck: false,
      },
      searchProvider: {
        name: 'default',
      },
      moduleDirectory: 'instructions-modules',
      ...overrides,
    };
  },

  /**
   * Config with Ollama embedding provider
   */
  createServerConfigWithOllama(overrides?: Partial<ServerConfig>): ServerConfig {
    return this.createServerConfig({
      embeddingProvider: {
        type: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
        baseUrl: 'http://localhost:11434',
      },
      ...overrides,
    });
  },

  /**
   * Config with integrity checks enabled
   */
  createServerConfigWithIntegrityCheck(overrides?: Partial<ServerConfig>): ServerConfig {
    return this.createServerConfig({
      vectorStore: {
        type: 'file',
        enableIntegrityCheck: true,
      },
      ...overrides,
    });
  },

  /**
   * Minimal config with defaults
   */
  createMinimalServerConfig(): ServerConfig {
    return {
      embeddingProvider: {
        type: 'transformers',
        model: 'test-model',
      },
      vectorStore: {
        type: 'file',
      },
      searchProvider: {
        name: 'default',
      },
    };
  },
};
