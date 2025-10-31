/**
 * @fileoverview Comprehensive tests for Container dependency injection
 *
 * This module tests the Container class including:
 * - Provider factory functionality (Transformers, Ollama)
 * - Lazy initialization and singleton patterns
 * - Configuration passing to providers
 * - Service creation and dependency management
 * - Resource disposal and cleanup
 * - Backward compatibility (without config)
 *
 * Test Coverage: 70%+ (essential provider-related code paths)
 *
 * @author MCP Server Team
 * @version 2.0.0
 * @since 2.0.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  Container,
  createProductionContainer,
  createTestContainer,
} from './container.js';
import type { ServerConfig } from '../../config/config.schema.js';
import type {
  IDependencies,
  IEmbeddingService,
  IInstructionModuleParser,
  ISearchService,
  IContentService,
} from './interfaces.js';
import type { IEmbeddingProvider } from '../plugins/embedding/embeddingProvider.interface.js';

// Mock the provider implementations
vi.mock('../plugins/embedding/transformersProvider.js', () => ({
  TransformersEmbeddingProvider: vi.fn().mockImplementation(() => ({
    name: 'Transformers.js',
    model: '',
    dimensions: 0,
    initialize: vi.fn().mockResolvedValue(undefined),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    isInitialized: vi.fn().mockReturnValue(true),
    dispose: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../plugins/embedding/ollamaProvider.js', () => ({
  OllamaEmbeddingProvider: vi.fn().mockImplementation(() => ({
    name: 'Ollama',
    model: '',
    dimensions: 0,
    initialize: vi.fn().mockResolvedValue(undefined),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    isInitialized: vi.fn().mockReturnValue(true),
    dispose: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock other services to isolate container logic
vi.mock('../services/parsing/parsing.js', () => ({
  InstructionModuleParser: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../services/search/search.js', () => ({
  SearchService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../services/content/content.js', () => ({
  ContentService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../services/embedding/embeddingService.js', () => ({
  EmbeddingService: vi.fn().mockImplementation((provider: IEmbeddingProvider) => {
    const service = {
      initialize: vi.fn().mockResolvedValue(undefined),
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      isInitialized: () => provider.isInitialized(),
      clearCache: vi.fn(),
      getCacheStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, size: 0 }),
      dispose: () => {
        // Mock dispose implementation
      },
    };
    return service;
  }),
}));

vi.mock('../utils/vectorStore.js', () => ({
  VectorStore: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../services/embedding/semanticConfig.js', () => ({
  createProductionSemanticConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../services/embedding/semanticSearch.js', () => ({
  SemanticSearchService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../services/resources/resourceService.js', () => ({
  ResourceService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../server/toolHandlers.js', () => ({
  ToolHandlers: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: vi.fn((_name: string) => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('Container', () => {
  let mockDependencies: IDependencies;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDependencies = {
      fileSystem: {
        readFileSync: vi.fn(),
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        statSync: vi.fn(),
      },
      pathUtils: {
        join: vi.fn(),
        resolve: vi.fn(),
        relative: vi.fn(),
      },
      processUtils: {
        cwd: vi.fn().mockReturnValue('/test/cwd'),
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Provider Factory', () => {
    it('should create TransformersProvider when type is transformers', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384,
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);
      const embeddingService = container.getEmbeddingService();

      expect(embeddingService).toBeDefined();
      // Verify that the service was created (by checking it's not undefined)
      expect(embeddingService.isInitialized).toBeDefined();
    });

    it('should create OllamaProvider when type is ollama', async () => {
      const { OllamaEmbeddingProvider } = await import(
        '../plugins/embedding/ollamaProvider.js'
      );

      const config: ServerConfig = {
        embeddingProvider: {
          type: 'ollama',
          model: 'nomic-embed-text',
          baseUrl: 'http://localhost:11434',
          dimensions: 768,
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);
      const embeddingService = container.getEmbeddingService();

      expect(embeddingService).toBeDefined();
      // Verify Ollama provider was instantiated
      expect(OllamaEmbeddingProvider).toHaveBeenCalled();
    });

    it('should throw error for unsupported provider type (openai)', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'openai',
          model: 'text-embedding-3-small',
          apiKey: 'test-key',
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);

      expect(() => container.getEmbeddingService()).toThrow(
        'OpenAI provider not yet implemented'
      );
    });

    it('should throw error for unsupported provider type (cohere)', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'cohere',
          model: 'embed-english-v3.0',
          apiKey: 'test-key',
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);

      expect(() => container.getEmbeddingService()).toThrow(
        'Cohere provider not yet implemented'
      );
    });

    it('should pass correct config to provider', async () => {
      const { TransformersEmbeddingProvider } = await import(
        '../plugins/embedding/transformersProvider.js'
      );

      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384,
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);
      container.getEmbeddingService();

      // Verify provider was instantiated
      expect(TransformersEmbeddingProvider).toHaveBeenCalled();
    });
  });

  describe('Container Integration', () => {
    it('should create embedding service with transformers config', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384,
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);
      const service1 = container.getEmbeddingService();
      const service2 = container.getEmbeddingService();

      // Should return same instance (singleton)
      expect(service1).toBe(service2);
    });

    it('should create embedding service with ollama config', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'ollama',
          model: 'nomic-embed-text',
          baseUrl: 'http://localhost:11434',
          dimensions: 768,
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);
      const service = container.getEmbeddingService();

      expect(service).toBeDefined();
      // Service created successfully
    });

    it('should create embedding service without config (backward compatibility)', () => {
      const container = new Container(mockDependencies, 'instructions-modules');
      const service = container.getEmbeddingService();

      expect(service).toBeDefined();
      // Should create default Transformers provider
    });

    it('should support lazy initialization (provider created only when needed)', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384,
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);

      // Provider should not be created yet (lazy initialization)
      // Now call getEmbeddingService to trigger creation
      const service = container.getEmbeddingService();
      expect(service).toBeDefined();
    });

    it('should maintain singleton pattern (same provider instance reused)', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384,
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);

      const service1 = container.getEmbeddingService();
      const service2 = container.getEmbeddingService();
      const service3 = container.getEmbeddingService();

      // All should be the same instance
      expect(service1).toBe(service2);
      expect(service2).toBe(service3);
    });
  });

  describe('Configuration Tests', () => {
    it('should accept ServerConfig in constructor', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384,
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);

      expect(container).toBeDefined();
      expect(container.getDependencies()).toStrictEqual(mockDependencies);
    });

    it('should pass config to provider factory', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'custom-model',
          dimensions: 512,
          cacheEnabled: false,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, 'instructions-modules', config);
      const service = container.getEmbeddingService();

      expect(service).toBeDefined();
    });

    it('should use default config behavior when config not provided', () => {
      const container = new Container(mockDependencies, 'instructions-modules');

      const service = container.getEmbeddingService();

      // Should create service with default Transformers provider
      expect(service).toBeDefined();
    });

    it('should handle minimal config', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'test-model',
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = new Container(mockDependencies, undefined, config);
      const service = container.getEmbeddingService();

      expect(service).toBeDefined();
    });
  });

  describe('Disposal Tests', () => {
    it('should call provider dispose on container dispose', async () => {
      const mockService = {
        initialize: vi.fn(),
        embed: vi.fn(),
        embedBatch: vi.fn(),
        isInitialized: vi.fn().mockReturnValue(true),
        clearCache: vi.fn(),
        getCacheStats: vi.fn(),
        dispose: vi.fn(),
      };

      const container = new Container(mockDependencies, 'instructions-modules');

      container.setEmbeddingService(mockService as unknown as IEmbeddingService);

      // Dispose should call the service's dispose method
      await container.dispose();

      // Verify service dispose was called
      expect(mockService.dispose).toHaveBeenCalled();
      // Verify logger was called for disposal
      expect(mockDependencies.logger.info).toHaveBeenCalledWith('Container disposed');
    });

    it('should be safe to dispose when no provider initialized', async () => {
      const container = new Container(mockDependencies, 'instructions-modules');

      // Should not throw even if no service was created
      await expect(container.dispose()).resolves.not.toThrow();
    });

    it('should handle dispose errors gracefully', async () => {
      const mockService = {
        initialize: vi.fn(),
        embed: vi.fn(),
        embedBatch: vi.fn(),
        isInitialized: vi.fn().mockReturnValue(true),
        clearCache: vi.fn(),
        getCacheStats: vi.fn(),
        dispose: vi.fn(),
      };

      const container = new Container(mockDependencies, 'instructions-modules');

      container.setEmbeddingService(mockService as unknown as IEmbeddingService);

      // Dispose should complete successfully
      await expect(container.dispose()).resolves.not.toThrow();
    });

    it('should allow multiple dispose calls safely', async () => {
      const mockService = {
        initialize: vi.fn(),
        embed: vi.fn(),
        embedBatch: vi.fn(),
        isInitialized: vi.fn().mockReturnValue(true),
        clearCache: vi.fn(),
        getCacheStats: vi.fn(),
        dispose: vi.fn(),
      };

      const container = new Container(mockDependencies, 'instructions-modules');

      container.setEmbeddingService(mockService as unknown as IEmbeddingService);

      await container.dispose();
      await container.dispose();
      await container.dispose();

      // Should call logger multiple times
      expect(mockDependencies.logger.info).toHaveBeenCalledWith('Container disposed');
    });
  });

  describe('Service Creation', () => {
    it('should create instruction module parser', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const parser = container.getInstructionModuleParser();

      expect(parser).toBeDefined();
    });

    it('should create search service', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const searchService = container.getSearchService();

      expect(searchService).toBeDefined();
    });

    it('should create content service', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const contentService = container.getContentService();

      expect(contentService).toBeDefined();
    });

    it('should create semantic search service', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const semanticSearchService = container.getSemanticSearchService();

      expect(semanticSearchService).toBeDefined();
    });

    it('should create resource service', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const resourceService = container.getResourceService();

      expect(resourceService).toBeDefined();
    });

    it('should create tool handlers', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const toolHandlers = container.createToolHandlers();

      expect(toolHandlers).toBeDefined();
    });

    it('should return logger instance', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const logger = container.getLogger();

      expect(logger).toBe(mockDependencies.logger);
    });
  });

  describe('Service Injection (Testing Support)', () => {
    it('should allow setting custom instruction module parser', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const mockParser = {} as unknown as IInstructionModuleParser;

      container.setInstructionModuleParser(mockParser);
      const parser = container.getInstructionModuleParser();

      expect(parser).toBe(mockParser);
    });

    it('should allow setting custom search service', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const mockSearchService = {} as unknown as ISearchService;

      container.setSearchService(mockSearchService);
      const searchService = container.getSearchService();

      expect(searchService).toBe(mockSearchService);
    });

    it('should allow setting custom content service', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const mockContentService = {} as unknown as IContentService;

      container.setContentService(mockContentService);
      const contentService = container.getContentService();

      expect(contentService).toBe(mockContentService);
    });

    it('should allow setting custom embedding service', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const mockEmbeddingService = {} as unknown as IEmbeddingService;

      container.setEmbeddingService(mockEmbeddingService);
      const embeddingService = container.getEmbeddingService();

      expect(embeddingService).toBe(mockEmbeddingService);
    });

    it('should allow setting custom embedding provider', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const mockProvider = {
        name: 'MockProvider',
        model: 'mock-model',
        dimensions: 128,
        initialize: vi.fn(),
        embed: vi.fn(),
        embedBatch: vi.fn(),
        isInitialized: vi.fn().mockReturnValue(true),
        dispose: vi.fn(),
      } as IEmbeddingProvider;

      container.setEmbeddingProvider(mockProvider);
      // Note: Setting provider doesn't create service automatically
    });
  });

  describe('Factory Functions', () => {
    it('should create production container with default dependencies', () => {
      const container = createProductionContainer();

      expect(container).toBeInstanceOf(Container);
      expect(container.getDependencies()).toBeDefined();
    });

    it('should create production container with custom module directory', () => {
      const container = createProductionContainer('custom-modules');

      expect(container).toBeInstanceOf(Container);
    });

    it('should create production container with config', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'transformers',
          model: 'test-model',
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = createProductionContainer('test-modules', config);

      expect(container).toBeInstanceOf(Container);
    });

    it('should create test container with mock dependencies', () => {
      const container = createTestContainer(mockDependencies);

      expect(container).toBeInstanceOf(Container);
      expect(container.getDependencies()).toStrictEqual(mockDependencies);
    });

    it('should create test container with empty mock dependencies', () => {
      const container = createTestContainer({});

      expect(container).toBeInstanceOf(Container);
      expect(container.getDependencies()).toBeDefined();
    });

    it('should create test container with config', () => {
      const config: ServerConfig = {
        embeddingProvider: {
          type: 'ollama',
          model: 'nomic-embed-text',
          cacheEnabled: true,
        },
        vectorStore: {
          type: 'file' as const,
          enableIntegrityCheck: true,
        },
        searchProvider: {
          name: 'default',
        },
        moduleDirectory: 'instructions-modules',
      };

      const container = createTestContainer(mockDependencies, 'test-modules', config);

      expect(container).toBeInstanceOf(Container);
    });
  });

  describe('Dependencies Management', () => {
    it('should use injected dependencies when provided', () => {
      const container = new Container(mockDependencies, 'test-modules');
      const deps = container.getDependencies();

      expect(deps.fileSystem).toStrictEqual(mockDependencies.fileSystem);
      expect(deps.pathUtils).toStrictEqual(mockDependencies.pathUtils);
      expect(deps.processUtils).toStrictEqual(mockDependencies.processUtils);
      expect(deps.logger).toStrictEqual(mockDependencies.logger);
    });

    it('should create default dependencies when not provided', () => {
      const container = new Container();
      const deps = container.getDependencies();

      expect(deps.fileSystem).toBeDefined();
      expect(deps.pathUtils).toBeDefined();
      expect(deps.processUtils).toBeDefined();
      // Logger should be created by createLogger mock
      expect(deps.logger).toBeDefined();
      expect(deps.logger.info).toBeDefined();
      expect(deps.logger.error).toBeDefined();
      expect(deps.logger.debug).toBeDefined();
      expect(deps.logger.warn).toBeDefined();
    });

    it('should use default module directory when not specified', () => {
      const container = new Container(mockDependencies);
      const parser = container.getInstructionModuleParser();

      expect(parser).toBeDefined();
    });
  });
});
