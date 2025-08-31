/**
 * @fileoverview Dependency injection interfaces for the MCP server.
 *
 * This module defines interfaces for external dependencies that can be injected
 * into various modules, enabling better testability and modularity. Abstracts
 * file system operations, path utilities, and other external dependencies.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

/**
 * Interface for file system operations.
 * Abstracts Node.js fs module for dependency injection and testing.
 */
export interface IFileSystem {
  /**
   * Synchronously reads the entire contents of a file.
   */
  readFileSync(path: string, encoding: BufferEncoding): string;

  /**
   * Synchronously tests whether or not the given path exists.
   */
  existsSync(path: string): boolean;

  /**
   * Synchronously reads the contents of a directory.
   */
  readdirSync(path: string): string[];

  /**
   * Synchronously returns file/directory stats (at least isDirectory()).
   */
  statSync(path: string): { isDirectory(): boolean };
}

/**
 * Interface for path manipulation utilities.
 * Abstracts Node.js path module for dependency injection and testing.
 */
export interface IPathUtils {
  /**
   * Joins all given path segments together using the platform-specific separator.
   */
  join(...paths: string[]): string;

  /**
   * Resolves a sequence of paths or path segments into an absolute path.
   */
  resolve(...paths: string[]): string;

  /**
   * Determines the relative path from one path to another.
   */
  relative(from: string, to: string): string;
}

/**
 * Interface for process utilities.
 * Abstracts Node.js process for dependency injection and testing.
 */
export interface IProcessUtils {
  /**
   * Returns the current working directory of the Node.js process.
   */
  cwd(): string;
}

/**
 * Interface for logging operations.
 * Abstracts logging functionality for dependency injection and testing.
 */
export interface ILogger {
  /**
   * Logs an informational message.
   */
  info(message: string, metadata?: Record<string, unknown>): void;

  /**
   * Logs a warning message.
   */
  warn(message: string, error?: Error, metadata?: Record<string, unknown>): void;

  /**
   * Logs an error message.
   */
  error(message: string, error?: Error, metadata?: Record<string, unknown>): void;

  /**
   * Logs a debug message.
   */
  debug(message: string, metadata?: Record<string, unknown>): void;
}

/**
 * Combined interface for all external dependencies.
 * Provides a single injection point for all external dependencies.
 */
export interface IDependencies {
  fileSystem: IFileSystem;
  pathUtils: IPathUtils;
  processUtils: IProcessUtils;
  logger: ILogger;
}

/**
 * Interface for instruction module parsing functionality.
 * Enables dependency injection for the parsing operations.
 */
export interface IInstructionModuleParser {
  /**
   * Parses instruction modules from the README file.
   */
  parseInstructionModules(): Promise<import('./types.js').InstructionModule[]>;

  /**
   * Clears the cached instruction modules.
   */
  clearModuleCache(): void;
}

/**
 * Interface for search functionality.
 * Enables dependency injection for search operations.
 */
export interface ISearchService {
  /**
   * Performs fuzzy search over instruction modules.
   */
  searchInstructionModules(
    searchTerms: string[]
  ): Promise<import('./types.js').SearchResult[]>;
}

/**
 * Interface for semantic search functionality.
 */
export interface ISemanticSearchService {
  /** Build or rebuild the embedding index. */
  buildIndex(force?: boolean): Promise<void>;
  /** Pure semantic search using embeddings. */
  semanticSearch(
    query: string,
    limit?: number
  ): Promise<import('./types.js').SearchResult[]>;
  /** Hybrid re-rank combining lexical and semantic signals. */
  hybridSearch(
    queryTerms: string[],
    lexicalResults: import('./types.js').SearchResult[],
    alpha?: number,
    limit?: number
  ): Promise<import('./types.js').SearchResult[]>;
}

/**
 * Interface for content retrieval functionality.
 * Enables dependency injection for content operations.
 */
export interface IContentService {
  /**
   * Retrieves and combines content from multiple instruction modules.
   */
  getModulesContent(
    moduleIds: string[]
  ): Promise<import('./types.js').GetModulesContentResult>;
}

/**
 * Progress callback for embedding operations.
 * Called during model initialization and batch processing.
 */
export type EmbeddingProgressCallback = (
  stage: 'initialization' | 'download' | 'loading' | 'processing',
  progress: number, // 0-1
  message?: string
) => void;

/**
 * Cache entry for embeddings with MD5-based invalidation.
 */
export interface EmbeddingCacheEntry {
  /** MD5 hash of the input text */
  hash: string;
  /** Cached embedding vector */
  embedding: number[];
  /** Timestamp when cached */
  timestamp: number;
}

/**
 * Interface for embedding service operations.
 * Abstracts transformer model operations for dependency injection and testing.
 */
export interface IEmbeddingService {
  /**
   * Initializes the embedding pipeline with the configured model.
   */
  initialize(progressCallback?: EmbeddingProgressCallback): Promise<void>;

  /**
   * Generates embeddings for a single text input.
   */
  embed(text: string, progressCallback?: EmbeddingProgressCallback): Promise<number[]>;

  /**
   * Generates embeddings for multiple text inputs in a batch.
   */
  embedBatch(texts: string[], progressCallback?: EmbeddingProgressCallback): Promise<number[][]>;

  /**
   * Checks if the service is properly initialized.
   */
  isInitialized(): boolean;

  /**
   * Clears the embedding cache.
   */
  clearCache(): void;

  /**
   * Gets cache statistics.
   */
  getCacheStats(): { hits: number; misses: number; size: number };

  /**
   * Disposes of the embedding model to free memory.
   */
  dispose(): void;
}

/**
 * Interface for semantic search configuration.
 * Enables dependency injection for semantic search parameters.
 */
export interface ISemanticConfig {
  /**
   * Gets the embedding model name to use.
   */
  getModelName(): string;

  /**
   * Gets the batch size for processing embeddings.
   */
  getBatchSize(): number;

  /**
   * Gets the maximum content length for embedding.
   */
  getMaxContentLength(): number;

  /**
   * Gets the default alpha value for hybrid search weighting.
   */
  getDefaultAlpha(): number;

  /**
   * Gets the embedding dimensions for the configured model.
   */
  getEmbeddingDimensions(): number;

  /**
   * Gets the batch size for indexing operations.
   */
  getIndexingBatchSize(): number;

  /**
   * Gets the maximum memory usage limit in MB.
   */
  getMaxMemoryUsageMB(): number;

  /**
   * Gets whether lazy loading is enabled.
   */
  isLazyLoadingEnabled(): boolean;
}
