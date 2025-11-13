/**
 * @fileoverview Embedding Provider Plugin Interface
 *
 * This module defines the core interface and supporting types for embedding provider plugins.
 * All embedding providers (Transformers.js, Ollama, OpenAI, Cohere, etc.) must implement
 * this interface to ensure consistent behavior and interoperability.
 *
 * The interface is designed to be provider-agnostic while supporting advanced features like:
 * - Async initialization with progress tracking
 * - Batch processing for efficiency
 * - Graceful resource cleanup
 * - Comprehensive error handling
 *
 * @author MCP Server Team
 * @version 2.0.0
 * @since 2.0.0
 */

/**
 * Supported embedding provider types.
 *
 * @remarks
 * This type can be extended as new providers are added. Each provider type
 * corresponds to a specific implementation of the IEmbeddingProvider interface.
 */
export type EmbeddingProviderType =
  | 'transformers' // Transformers.js (local, browser-compatible)
  | 'ollama' // Ollama (local, self-hosted)
  | 'lmstudio' // LM Studio (local, OpenAI-compatible)
  | 'openai' // OpenAI API
  | 'cohere' // Cohere API
  | 'voyage' // Voyage AI API
  | 'custom'; // Custom/plugin provider

/**
 * Progress stages for embedding operations.
 *
 * @remarks
 * Used in progress callbacks to indicate which stage of the operation is executing.
 * Different providers may support different subsets of these stages.
 */
export type EmbeddingProgressStage =
  | 'initialization' // Provider initialization
  | 'download' // Model/resource download
  | 'loading' // Model loading into memory
  | 'processing' // Active embedding generation
  | 'cleanup'; // Resource cleanup/disposal

/**
 * Progress callback function for long-running embedding operations.
 *
 * @param stage - The current stage of the operation
 * @param progress - Progress within the current stage (0.0 to 1.0)
 * @param message - Optional human-readable status message
 *
 * @remarks
 * Implementations should call this callback periodically during initialization
 * and batch processing to provide feedback to the caller. Progress values should
 * be monotonically increasing within each stage.
 *
 * @example
 * ```typescript
 * const callback: EmbeddingProgressCallback = (stage, progress, message) => {
 *   console.log(`${stage}: ${(progress * 100).toFixed(1)}% - ${message || ''}`);
 * };
 * await provider.initialize(config, callback);
 * ```
 */
export type EmbeddingProgressCallback = (
  stage: EmbeddingProgressStage,
  progress: number,
  message?: string
) => void;

/**
 * Configuration options common to all embedding providers.
 *
 * @remarks
 * Each provider type may require additional provider-specific configuration
 * passed through the `providerOptions` field. This base interface ensures
 * consistent configuration patterns across all providers.
 */
export interface EmbeddingProviderConfig {
  /**
   * The type of embedding provider.
   *
   * @remarks
   * This determines which provider implementation will be used and what
   * additional options are valid in `providerOptions`.
   */
  type: EmbeddingProviderType;

  /**
   * The model identifier/name to use.
   *
   * @remarks
   * Format and available values depend on the provider type:
   * - transformers: HuggingFace model ID (e.g., "Xenova/all-MiniLM-L6-v2")
   * - ollama: Model name (e.g., "nomic-embed-text")
   * - openai: Model ID (e.g., "text-embedding-3-small")
   * - cohere: Model name (e.g., "embed-english-v3.0")
   */
  model: string;

  /**
   * Expected embedding vector dimensions.
   *
   * @remarks
   * Must match the dimensions produced by the specified model. Used for
   * validation and pre-allocation. If undefined, provider will auto-detect
   * from the first embedding generated.
   */
  dimensions?: number;

  /**
   * API key for cloud-based providers.
   *
   * @remarks
   * Required for: openai, cohere, voyage
   * Not used for: transformers, ollama
   */
  apiKey?: string;

  /**
   * Base URL for API or self-hosted endpoints.
   *
   * @remarks
   * - For API providers: Override default API endpoint
   * - For Ollama: Server URL (default: http://localhost:11434)
   * - For Transformers: Model cache directory path
   */
  baseUrl?: string;

  /**
   * Batch size for processing multiple embeddings.
   *
   * @remarks
   * Optimal value depends on model size, available memory, and provider capabilities.
   * Default values are provider-specific.
   */
  batchSize?: number;

  /**
   * Maximum content length (in tokens or characters) before truncation.
   *
   * @remarks
   * Different models have different context windows. Providers should validate
   * against model-specific limits.
   */
  maxContentLength?: number;

  /**
   * Request timeout in milliseconds.
   *
   * @remarks
   * For API providers: HTTP request timeout
   * For local providers: Model loading timeout
   * Default: 30000ms (30 seconds)
   */
  timeout?: number;

  /**
   * Number of retry attempts for failed operations.
   *
   * @remarks
   * Primarily for API providers to handle transient failures.
   * Default: 3
   */
  retries?: number;

  /**
   * Provider-specific configuration options.
   *
   * @remarks
   * Each provider can define its own additional options schema.
   * See provider-specific documentation for available options.
   *
   * @example
   * ```typescript
   * // Transformers.js options
   * providerOptions: {
   *   quantized: true,
   *   device: 'cpu',
   *   dtype: 'fp32'
   * }
   *
   * // OpenAI options
   * providerOptions: {
   *   user: 'user-123',
   *   encodingFormat: 'float'
   * }
   * ```
   */
  providerOptions?: Record<string, unknown>;
}

/**
 * Error thrown when provider initialization fails.
 */
export class EmbeddingProviderInitError extends Error {
  public readonly provider: string;
  declare public readonly cause: Error | undefined;

  constructor(provider: string, message: string, cause?: Error) {
    super(`[${provider}] Initialization failed: ${message}`);
    this.name = 'EmbeddingProviderInitError';
    this.provider = provider;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Error thrown when embedding generation fails.
 */
export class EmbeddingGenerationError extends Error {
  public readonly provider: string;
  declare public readonly cause: Error | undefined;

  constructor(provider: string, message: string, cause?: Error) {
    super(`[${provider}] Embedding generation failed: ${message}`);
    this.name = 'EmbeddingGenerationError';
    this.provider = provider;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Error thrown when provider is used before initialization.
 */
export class EmbeddingProviderNotInitializedError extends Error {
  constructor(public readonly provider: string) {
    super(`[${provider}] Provider not initialized. Call initialize() first.`);
    this.name = 'EmbeddingProviderNotInitializedError';
  }
}

/**
 * Error thrown when configuration is invalid.
 */
export class EmbeddingConfigError extends Error {
  constructor(
    public readonly provider: string,
    message: string
  ) {
    super(`[${provider}] Invalid configuration: ${message}`);
    this.name = 'EmbeddingConfigError';
  }
}

/**
 * Core interface that all embedding providers must implement.
 *
 * @remarks
 * This interface defines the contract for embedding providers in the plugin system.
 * Implementations must ensure thread-safety for concurrent operations and provide
 * proper resource cleanup through the dispose() method.
 *
 * Lifecycle:
 * 1. Construct provider instance
 * 2. Call initialize() with configuration
 * 3. Call embed() or embedBatch() as needed
 * 4. Call dispose() when done to free resources
 *
 * @example
 * ```typescript
 * class MyEmbeddingProvider implements IEmbeddingProvider {
 *   readonly name = 'my-provider';
 *   private _model: string = '';
 *   private _dimensions: number = 0;
 *   private _initialized: boolean = false;
 *
 *   get model(): string { return this._model; }
 *   get dimensions(): number { return this._dimensions; }
 *
 *   async initialize(config: EmbeddingProviderConfig): Promise<void> {
 *     // Initialize provider
 *     this._model = config.model;
 *     this._dimensions = config.dimensions || 384;
 *     this._initialized = true;
 *   }
 *
 *   async embed(text: string): Promise<number[]> {
 *     if (!this._initialized) {
 *       throw new EmbeddingProviderNotInitializedError(this.name);
 *     }
 *     // Generate embedding
 *     return [];
 *   }
 *
 *   async embedBatch(texts: string[]): Promise<number[][]> {
 *     return Promise.all(texts.map(t => this.embed(t)));
 *   }
 *
 *   isInitialized(): boolean {
 *     return this._initialized;
 *   }
 *
 *   async dispose(): Promise<void> {
 *     // Cleanup resources
 *     this._initialized = false;
 *   }
 * }
 * ```
 */
export interface IEmbeddingProvider {
  /**
   * Human-readable name of the provider.
   *
   * @remarks
   * Used for logging and error messages. Should be unique and descriptive.
   *
   * @example "Transformers.js", "Ollama", "OpenAI"
   */
  readonly name: string;

  /**
   * The currently loaded model identifier.
   *
   * @remarks
   * Returns empty string if not initialized. This should match the model
   * specified in the configuration passed to initialize().
   */
  readonly model: string;

  /**
   * The dimensionality of the embedding vectors produced by this provider.
   *
   * @remarks
   * Returns 0 if not initialized. Must be consistent for all embeddings
   * generated by this provider instance. Used for validation and storage.
   */
  readonly dimensions: number;

  /**
   * Initializes the embedding provider with the given configuration.
   *
   * @param config - Provider configuration including model, credentials, and options
   * @param progressCallback - Optional callback for initialization progress updates
   *
   * @throws {EmbeddingProviderInitError} If initialization fails
   * @throws {EmbeddingConfigError} If configuration is invalid
   *
   * @remarks
   * This method must be called before any embedding operations. It may perform
   * expensive operations like downloading models, loading into memory, or
   * establishing API connections.
   *
   * The method should be idempotent - calling it multiple times with the same
   * configuration should not cause errors (though it may reload the model).
   *
   * Implementations should validate the configuration and throw descriptive
   * errors for invalid or missing required fields.
   *
   * @example
   * ```typescript
   * await provider.initialize({
   *   type: 'transformers',
   *   model: 'Xenova/all-MiniLM-L6-v2',
   *   dimensions: 384
   * }, (stage, progress, message) => {
   *   console.log(`${stage}: ${(progress * 100).toFixed(0)}% ${message || ''}`);
   * });
   * ```
   */
  initialize(
    config: EmbeddingProviderConfig,
    progressCallback?: EmbeddingProgressCallback
  ): Promise<void>;

  /**
   * Generates an embedding vector for a single text input.
   *
   * @param text - The input text to embed
   * @param progressCallback - Optional callback for progress updates (for long texts)
   * @returns Promise resolving to the embedding vector
   *
   * @throws {EmbeddingProviderNotInitializedError} If provider is not initialized
   * @throws {EmbeddingGenerationError} If embedding generation fails
   *
   * @remarks
   * The returned vector will have length equal to the provider's dimensions property.
   * Empty or whitespace-only inputs should return a zero vector or throw an error
   * depending on provider implementation.
   *
   * For very long texts, providers may:
   * - Truncate to maxContentLength
   * - Throw an error
   * - Use chunking/pooling strategies
   *
   * @example
   * ```typescript
   * const embedding = await provider.embed("Hello, world!");
   * console.log(embedding.length); // e.g., 384
   * ```
   */
  embed(text: string, progressCallback?: EmbeddingProgressCallback): Promise<number[]>;

  /**
   * Generates embedding vectors for multiple text inputs in a batch.
   *
   * @param texts - Array of input texts to embed
   * @param progressCallback - Optional callback for batch processing progress
   * @returns Promise resolving to array of embedding vectors (same order as input)
   *
   * @throws {EmbeddingProviderNotInitializedError} If provider is not initialized
   * @throws {EmbeddingGenerationError} If batch generation fails
   *
   * @remarks
   * Implementations should batch process for efficiency when possible, respecting
   * the configured batchSize. For API providers, this may reduce API calls.
   * For local models, this may use GPU batching.
   *
   * The returned array will have the same length as the input array, with
   * embeddings in corresponding positions. If any individual embedding fails,
   * implementations should either:
   * - Fail the entire batch (recommended)
   * - Return partial results with error indicators
   *
   * @example
   * ```typescript
   * const embeddings = await provider.embedBatch([
   *   "First text",
   *   "Second text",
   *   "Third text"
   * ], (stage, progress) => {
   *   console.log(`Processing: ${(progress * 100).toFixed(0)}%`);
   * });
   * console.log(embeddings.length); // 3
   * ```
   */
  embedBatch(
    texts: string[],
    progressCallback?: EmbeddingProgressCallback
  ): Promise<number[][]>;

  /**
   * Checks whether the provider has been successfully initialized.
   *
   * @returns true if initialized and ready to generate embeddings, false otherwise
   *
   * @remarks
   * This should return true only after initialize() has completed successfully.
   * Providers should check this state at the start of embed() and embedBatch()
   * and throw EmbeddingProviderNotInitializedError if false.
   *
   * @example
   * ```typescript
   * if (!provider.isInitialized()) {
   *   await provider.initialize(config);
   * }
   * const embedding = await provider.embed(text);
   * ```
   */
  isInitialized(): boolean;

  /**
   * Disposes of the provider and releases all resources.
   *
   * @throws {Error} If disposal fails (should be rare)
   *
   * @remarks
   * This method should:
   * - Free model memory
   * - Close API connections
   * - Clear caches
   * - Reset initialization state
   *
   * After calling dispose(), the provider should return false from isInitialized()
   * and throw errors if embed() or embedBatch() are called.
   *
   * It's safe to call dispose() multiple times - subsequent calls should be no-ops.
   * It's safe to call initialize() again after dispose() to reload the provider.
   *
   * @example
   * ```typescript
   * try {
   *   await provider.dispose();
   *   console.log('Provider disposed successfully');
   * } finally {
   *   // Provider is no longer usable
   *   console.log(provider.isInitialized()); // false
   * }
   * ```
   */
  dispose(): Promise<void>;
}

/**
 * Optional interface for providers that support caching.
 *
 * @remarks
 * Providers can implement this interface to expose caching functionality.
 * This is useful for avoiding redundant API calls or expensive computations.
 */
export interface IEmbeddingProviderCache {
  /**
   * Clears the embedding cache.
   *
   * @returns Number of entries cleared
   */
  clearCache(): number;

  /**
   * Gets cache statistics.
   *
   * @returns Cache hit/miss statistics and current size
   */
  getCacheStats(): {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  };

  /**
   * Checks if caching is enabled.
   */
  isCacheEnabled(): boolean;

  /**
   * Enables or disables caching.
   */
  setCacheEnabled(enabled: boolean): void;
}

/**
 * Optional interface for providers that support model information introspection.
 *
 * @remarks
 * Providers can implement this interface to expose model metadata and capabilities.
 */
export interface IEmbeddingProviderInfo {
  /**
   * Gets information about the loaded model.
   */
  getModelInfo(): {
    name: string;
    dimensions: number;
    maxSequenceLength?: number;
    tokenizer?: string;
    architecture?: string;
    parameters?: number;
  };

  /**
   * Gets provider capabilities.
   */
  getCapabilities(): {
    supportsBatching: boolean;
    supportsStreaming: boolean;
    supportsProgressCallbacks: boolean;
    maxBatchSize?: number;
  };
}
