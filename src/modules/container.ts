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
import { InstructionModuleParser } from './parsing.js';
import { SearchService } from './search.js';
import { ContentService } from './content.js';
import { EmbeddingService } from './embeddingService.js';
import { VectorStore } from './vectorStore.js';
import { createProductionSemanticConfig } from './semanticConfig.js';
import { createLogger } from './logger.js';
import { ResourceService } from './resourceService.js';
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
import { SemanticSearchService } from './semanticSearch.js';
import { ToolHandlers } from './toolHandlers.js';

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
 * Simple dependency injection container.
 * Manages service instances and their dependencies.
 */
export class Container {
  private dependencies: IDependencies;
  private instructionModuleParser?: IInstructionModuleParser;
  private searchService?: ISearchService;
  private contentService?: IContentService;
  private semanticSearchService?: ISemanticSearchService;
  private embeddingService?: IEmbeddingService;
  private semanticConfig?: ISemanticConfig;
  private vectorStore?: IVectorStore;
  private resourceService?: IResourceService;
  private moduleDirectory: string;

  constructor(
    dependencies?: Partial<IDependencies>,
    moduleDirectory: string = 'instructions-modules'
  ) {
    this.dependencies = {
      fileSystem: dependencies?.fileSystem ?? new FileSystem(),
      pathUtils: dependencies?.pathUtils ?? new PathUtils(),
      processUtils: dependencies?.processUtils ?? new ProcessUtils(),
      logger: dependencies?.logger ?? createLogger('container'),
    };
    this.moduleDirectory = moduleDirectory;
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
   * Gets or creates the embedding service.
   */
  getEmbeddingService(): IEmbeddingService {
    this.embeddingService ??= new EmbeddingService(
      this.getSemanticConfig(),
      this.dependencies.logger
    );
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
   */
  getVectorStore(): IVectorStore {
    this.vectorStore ??= new VectorStore(this.dependencies, this.dependencies.logger);
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
 */
export function createProductionContainer(moduleDirectory?: string): Container {
  return new Container(undefined, moduleDirectory);
}

/**
 * Factory function to create a container with test dependencies.
 * Allows injection of mock implementations for testing.
 * @param mockDependencies - Partial dependencies to override defaults
 * @param moduleDirectory - Base directory for instruction modules (default: 'instructions-modules')
 */
export function createTestContainer(
  mockDependencies: Partial<IDependencies> = {},
  moduleDirectory?: string
): Container {
  return new Container(mockDependencies, moduleDirectory);
}
