/**
 * @fileoverview Dependency injection container for the MCP server.
 *
 * This module provides a simple dependency injection container that manages
 * the creation and lifecycle of service instances. Includes factory functions
 * for creating production implementations and test doubles.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { InstructionModuleParser } from '../services/parsing/parsing.js';
import { SearchService } from '../services/search/search.js';
import { ContentService } from '../services/content/content.js';
import { EmbeddingService } from '../services/embedding/embeddingService.js';
import { VectorStore } from '../utils/vectorStore.js';
import { createProductionSemanticConfig } from '../services/embedding/semanticConfig.js';
import { createLogger } from '../utils/logger.js';
import { ResourceService } from '../services/resources/resourceService.js';
import type {
  IDependencies,
  IFileSystem,
  IPathUtils,
  IProcessUtils,
  IInstructionModuleParser,
  ISearchService,
  IContentService,
  ISemanticSearchService,
  IEmbeddingService,
  ISemanticConfig,
  IVectorStore,
  IResourceService,
} from './interfaces.js';
import { SemanticSearchService } from '../services/embedding/semanticSearch.js';
import { ToolHandlers } from '../server/toolHandlers.js';
import type { IEmbeddingProvider } from '../plugins/embedding/embeddingProvider.interface.js';
import { TransformersEmbeddingProvider } from '../plugins/embedding/transformersProvider.js';
import { OllamaEmbeddingProvider } from '../plugins/embedding/ollamaProvider.js';
import type { ServerConfig } from '../../config/config.schema.js';
import type { EmbeddingProviderConfig } from '../plugins/embedding/embeddingProvider.interface.js';
import type {
  IVectorStorePlugin,
  VectorStoreConfig,
} from '../plugins/vectorStore/vectorStore.interface.js';
import { FileVectorStore } from '../plugins/vectorStore/fileVectorStore.js';
import { SqliteVectorStore } from '../plugins/vectorStore/sqliteVectorStore.js';

/**
 * Production implementation of file system operations.
 * Wraps Node.js fs module methods.
 */
class FileSystem implements IFileSystem {
  readFileSync(path: string, encoding: BufferEncoding): string {
    return readFileSync(path, encoding);
  }

  existsSync(path: string): boolean {
    return existsSync(path);
  }

  readdirSync(path: string): string[] {
    return readdirSync(path);
  }

  statSync(path: string): { isDirectory(): boolean } {
    return statSync(path);
  }
}

/**
 * Production implementation of path utilities.
 * Wraps Node.js path module methods.
 */
class PathUtils implements IPathUtils {
  join(...paths: string[]): string {
    return join(...paths);
  }

  resolve(...paths: string[]): string {
    return resolve(...paths);
  }

  relative(from: string, to: string): string {
    return relative(from, to);
  }
}

/**
 * Production implementation of process utilities.
 * Wraps Node.js process methods.
 */
class ProcessUtils implements IProcessUtils {
  cwd(): string {
    return process.cwd();
  }
}

/**
 * Converts ServerConfig.embeddingProvider to EmbeddingProviderConfig.
 * Extracts cacheEnabled and maxCacheSize into providerOptions so they are
 * available to embedding providers that support caching.
 *
 * @param serverConfig - The server configuration object containing embedding provider config
 * @returns A properly typed EmbeddingProviderConfig with cache settings in providerOptions
 */
function extractEmbeddingProviderConfig(
  serverConfig: ServerConfig
): EmbeddingProviderConfig {
  const { cacheEnabled, maxCacheSize, ...rest } = serverConfig.embeddingProvider;

  return {
    ...rest,
    providerOptions: {
      cacheEnabled,
      maxCacheSize,
    },
  } as EmbeddingProviderConfig;
}

/**
 * Simple dependency injection container.
 * Manages service instances and their dependencies.
 */
export class Container {
  private dependencies: IDependencies;
  private instructionModuleParser?: IInstructionModuleParser;
  private searchService?: ISearchService;
  private contentService?: IContentService;
  private semanticSearchService?: ISemanticSearchService;
  private embeddingService: IEmbeddingService | undefined;
  private embeddingProvider: IEmbeddingProvider | undefined;
  private semanticConfig?: ISemanticConfig;
  private vectorStore?: IVectorStore;
  private vectorStorePlugin: IVectorStorePlugin | undefined;
  private resourceService?: IResourceService;
  private moduleDirectory: string;
  private config?: ServerConfig;
  private initPromise?: Promise<void>;

  constructor(
    dependencies?: Partial<IDependencies>,
    moduleDirectory: string = 'instructions-modules',
    config?: ServerConfig
  ) {
    this.dependencies = {
      fileSystem: dependencies?.fileSystem ?? new FileSystem(),
      pathUtils: dependencies?.pathUtils ?? new PathUtils(),
      processUtils: dependencies?.processUtils ?? new ProcessUtils(),
      logger: dependencies?.logger ?? createLogger('container'),
    };
    this.moduleDirectory = moduleDirectory;
    if (config) {
      this.config = config;
    }
  }

  /**
   * Initialize plugins and resources.
   * Call this once after container creation, before accessing services that depend on plugins.
   *
   * @returns Promise that resolves when all plugins are initialized
   * @throws Error if plugin initialization fails
   */
  async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializePluginsInternal();
    }
    return this.initPromise;
  }

  /**
   * Validates the container configuration for common errors.
   * Throws descriptive errors for invalid configurations.
   * @private
   */
  private validateConfiguration(): void {
    if (!this.config) {
      return; // No config is valid - will use defaults
    }

    // Validate embedding provider type
    const validProviders: readonly string[] = ['transformers', 'ollama'];
    const providerType = this.config.embeddingProvider.type;

    if (!validProviders.includes(providerType)) {
      // Check if it's a known but unimplemented provider
      if (providerType === 'openai' || providerType === 'cohere') {
        throw new Error(
          `Embedding provider "${providerType}" is not yet implemented. ` +
            `Available providers: ${validProviders.join(', ')}. ` +
            `Please use "transformers" (local, offline) or "ollama" (requires Ollama server).`
        );
      }

      // Unknown provider type
      throw new Error(
        `Invalid embedding provider type: "${providerType}". ` +
          `Valid options: ${validProviders.join(', ')}. ` +
          `Check your config.json for typos.`
      );
    }

    // Validate provider-specific requirements
    if (providerType === 'ollama') {
      const baseUrl = this.config.embeddingProvider.baseUrl;
      if (!baseUrl) {
        throw new Error(
          'Ollama provider requires "baseUrl" in configuration. ' +
            'Example: "baseUrl": "http://localhost:11434"'
        );
      }
    }

    // Validate vector store type
    const validStoreTypes: readonly string[] = ['file', 'sqlite'];
    const storeType = this.config.vectorStore?.type;

    if (storeType && !validStoreTypes.includes(storeType)) {
      throw new Error(
        `Invalid vector store type: "${storeType}". ` +
          `Valid options: ${validStoreTypes.join(', ')}.`
      );
    }

    if (storeType === 'sqlite') {
      throw new Error(
        'SQLite vector store is not yet implemented. ' +
          'Please use "file" type in your configuration.'
      );
    }

    this.dependencies.logger.debug('Configuration validated successfully', {
      provider: providerType,
      vectorStore: storeType || 'file',
    });
  }

  /**
   * Internal method to initialize all plugins.
   * Handles vector store plugin initialization with proper error handling.
   */
  private async initializePluginsInternal(): Promise<void> {
    // Validate configuration before initializing plugins
    this.validateConfiguration();

    if (!this.config) {
      this.dependencies.logger.debug(
        'No config provided, skipping plugin initialization'
      );
      return;
    }

    const plugin = this.getVectorStorePlugin();
    if (plugin) {
      const storeConfig: VectorStoreConfig = {
        type: this.config.vectorStore.type,
        path: this.config.vectorStore.path,
        dimensions: this.config.vectorStore.dimensions,
        enableIntegrityCheck: this.config.vectorStore.enableIntegrityCheck,
      };

      try {
        await plugin.initialize(storeConfig);
        this.dependencies.logger.info('Vector store plugin initialized successfully');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.dependencies.logger.error(
          'Vector store plugin initialization failed',
          error instanceof Error ? error : undefined
        );
        throw new Error(`Failed to initialize vector store plugin: ${errorMessage}`);
      }
    }
  }

  /**
   * Gets the external dependencies bundle.
   */
  getDependencies(): IDependencies {
    return this.dependencies;
  }

  /**
   * Gets or creates the instruction module parser service.
   */
  getInstructionModuleParser(): IInstructionModuleParser {
    this.instructionModuleParser ??= new InstructionModuleParser(
      this.dependencies,
      this.moduleDirectory
    );
    return this.instructionModuleParser;
  }

  /**
   * Gets or creates the search service.
   */
  getSearchService(): ISearchService {
    this.searchService ??= new SearchService(
      this.dependencies,
      this.getInstructionModuleParser()
    );
    return this.searchService;
  }

  /**
   * Gets or creates the content service.
   */
  getContentService(): IContentService {
    this.contentService ??= new ContentService(
      this.dependencies,
      this.getInstructionModuleParser()
    );
    return this.contentService;
  }

  /**
   * Gets or creates the semantic search service.
   */
  getSemanticSearchService(): ISemanticSearchService {
    this.semanticSearchService ??= new SemanticSearchService(
      this.dependencies,
      this.getInstructionModuleParser(),
      this.getEmbeddingService(),
      this.getSemanticConfig(),
      this.getVectorStore()
    );
    return this.semanticSearchService;
  }

  /**
   * Creates an embedding provider based on configuration.
   */
  private createEmbeddingProvider(config: ServerConfig): IEmbeddingProvider {
    const providerConfig = config.embeddingProvider;

    switch (providerConfig.type) {
      case 'transformers':
        return new TransformersEmbeddingProvider();
      case 'ollama':
        return new OllamaEmbeddingProvider();
      case 'openai':
        throw new Error('OpenAI provider not yet implemented');
      case 'cohere':
        throw new Error('Cohere provider not yet implemented');
      default:
        throw new Error(`Unknown embedding provider: ${providerConfig.type as string}`);
    }
  }

  /**
   * Creates a vector store plugin based on configuration.
   */
  private createVectorStorePlugin(config: ServerConfig): IVectorStorePlugin {
    const storeConfig = config.vectorStore;

    switch (storeConfig.type) {
      case 'file':
        return new FileVectorStore(this.dependencies.logger);
      case 'sqlite':
        return new SqliteVectorStore(this.dependencies.logger);
      default:
        throw new Error(`Unknown vector store type: ${storeConfig.type as string}`);
    }
  }

  /**
   * Gets or creates the vector store plugin (if config is available).
   */
  private getVectorStorePlugin(): IVectorStorePlugin | null {
    if (!this.config) {
      return null;
    }

    this.vectorStorePlugin ??= this.createVectorStorePlugin(this.config);

    return this.vectorStorePlugin;
  }

  /**
   * Gets or creates the embedding provider (if config is available).
   */
  private getEmbeddingProvider(): IEmbeddingProvider | null {
    if (!this.config) {
      return null;
    }

    this.embeddingProvider ??= this.createEmbeddingProvider(this.config);

    return this.embeddingProvider;
  }

  /**
   * Gets or creates the embedding service.
   * If a config is provided and supports plugins, uses the provider-based approach.
   * Otherwise, creates a default Transformers provider.
   */
  getEmbeddingService(): IEmbeddingService {
    if (!this.embeddingService) {
      // Try to use provider-based approach if config is available
      let provider = this.getEmbeddingProvider();
      let providerConfig: EmbeddingProviderConfig;

      // If no provider from config, create a default Transformers provider
      if (!provider) {
        this.dependencies.logger.debug(
          'No config provided, creating default Transformers provider'
        );
        provider = new TransformersEmbeddingProvider();
        providerConfig = {
          type: 'transformers',
          model: 'Xenova/all-mpnet-base-v2',
        };
      } else {
        // If provider exists, config must exist (see getEmbeddingProvider() method)
        if (!this.config) {
          throw new Error('Config unexpectedly undefined despite provider existence');
        }
        providerConfig = extractEmbeddingProviderConfig(this.config);
      }

      // Wrap provider in EmbeddingService with initial config
      this.embeddingService = new EmbeddingService(
        provider,
        this.dependencies.logger,
        providerConfig
      );
    }

    return this.embeddingService;
  }

  /**
   * Gets or creates the semantic configuration.
   */
  getSemanticConfig(): ISemanticConfig {
    this.semanticConfig ??= createProductionSemanticConfig();
    return this.semanticConfig;
  }

  /**
   * Gets or creates the vector store.
   *
   * Note: If using plugins, call container.initialize() before calling this method
   * to ensure plugins are properly initialized.
   *
   * @returns The vector store instance
   */
  getVectorStore(): IVectorStore {
    if (!this.vectorStore) {
      // Plugin initialization is handled by container.initialize()
      // Here we just create the vector store instance
      this.vectorStore = new VectorStore(this.dependencies, this.dependencies.logger);
    }

    return this.vectorStore;
  }

  /**
   * Gets or creates the resource service.
   */
  getResourceService(): IResourceService {
    this.resourceService ??= new ResourceService(
      this.dependencies,
      this.getInstructionModuleParser(),
      this.moduleDirectory
    );
    return this.resourceService;
  }

  /**
   * Creates a new ToolHandlers instance with proper dependency injection.
   */
  createToolHandlers(): ToolHandlers {
    return new ToolHandlers(
      this.getInstructionModuleParser(),
      this.getSearchService(),
      this.getContentService(),
      this.getSemanticSearchService(),
      this.dependencies.logger
    );
  }

  /**
   * Gets the logger instance for direct use (primarily for CLI and composition root).
   */
  getLogger(): IDependencies['logger'] {
    return this.dependencies.logger;
  }

  /**
   * Sets a custom instruction module parser (mainly for testing).
   */
  setInstructionModuleParser(parser: IInstructionModuleParser): void {
    this.instructionModuleParser = parser;
  }

  /**
   * Sets a custom search service (mainly for testing).
   */
  setSearchService(searchService: ISearchService): void {
    this.searchService = searchService;
  }

  /**
   * Sets a custom content service (mainly for testing).
   */
  setContentService(contentService: IContentService): void {
    this.contentService = contentService;
  }

  /** Set a custom semantic search service (testing). */
  setSemanticSearchService(svc: ISemanticSearchService): void {
    this.semanticSearchService = svc;
  }

  /** Set a custom embedding service (testing). */
  setEmbeddingService(service: IEmbeddingService): void {
    this.embeddingService = service;
  }

  /** Set a custom semantic config (testing). */
  setSemanticConfig(config: ISemanticConfig): void {
    this.semanticConfig = config;
  }

  /** Set a custom resource service (testing). */
  setResourceService(service: IResourceService): void {
    this.resourceService = service;
  }

  /** Set a custom embedding provider (testing). */
  setEmbeddingProvider(provider: IEmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  /**
   * Disposes all services and releases resources.
   * Call this when shutting down the container.
   */
  async dispose(): Promise<void> {
    // Dispose embedding service if it exists (which will dispose the provider internally)
    if (this.embeddingService) {
      await this.embeddingService.dispose();
    }

    // Dispose vector store plugin if it exists
    if (this.vectorStorePlugin) {
      try {
        await this.vectorStorePlugin.close();
      } catch (error) {
        this.dependencies.logger.error(
          'Error closing vector store plugin during disposal',
          error instanceof Error ? error : undefined
        );
      }
    }

    // Reset services to undefined to allow re-initialization
    this.embeddingService = undefined;
    this.embeddingProvider = undefined;
    this.vectorStorePlugin = undefined;

    this.dependencies.logger.info('Container disposed');
  }
}

/**
 * Global container instance for production use.
 */
let globalContainer: Container | null = null;

/**
 * Gets the global container instance, creating it if necessary.
 */
export function getContainer(): Container {
  globalContainer ??= new Container();
  return globalContainer;
}

/**
 * Sets a custom global container (mainly for testing).
 */
export function setContainer(container: Container): void {
  globalContainer = container;
}

/**
 * Resets the global container to null (mainly for testing).
 */
export function resetContainer(): void {
  globalContainer = null;
}

/**
 * Factory function to create a container with production dependencies.
 * @param moduleDirectory - Base directory for instruction modules (default: 'instructions-modules')
 * @param config - Optional server configuration
 */
export function createProductionContainer(
  moduleDirectory?: string,
  config?: ServerConfig
): Container {
  return new Container(undefined, moduleDirectory, config);
}

/**
 * Factory function to create a container with test dependencies.
 * Allows injection of mock implementations for testing.
 * @param mockDependencies - Partial dependencies to override defaults
 * @param moduleDirectory - Base directory for instruction modules (default: 'instructions-modules')
 * @param config - Optional server configuration
 */
export function createTestContainer(
  mockDependencies: Partial<IDependencies> = {},
  moduleDirectory?: string,
  config?: ServerConfig
): Container {
  return new Container(mockDependencies, moduleDirectory, config);
}
