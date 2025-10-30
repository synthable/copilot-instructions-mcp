/**
 * @fileoverview Ollama Embedding Provider
 *
 * This module implements the IEmbeddingProvider interface for Ollama's local inference API.
 * Ollama provides local embedding generation with models like nomic-embed-text and mxbai-embed-large.
 *
 * Features:
 * - Local inference (no cloud API calls)
 * - Health checking to verify Ollama availability
 * - Sequential batch processing (Ollama has no native batch API)
 * - Configurable timeout and retry handling
 * - Support for custom models
 *
 * @author MCP Server Team
 * @version 2.0.0
 * @since 2.0.0
 */

import type {
  IEmbeddingProvider,
  EmbeddingProviderConfig,
  EmbeddingProgressCallback,
} from './embeddingProvider.interface.js';
import {
  EmbeddingProviderInitError,
  EmbeddingGenerationError,
  EmbeddingProviderNotInitializedError,
  EmbeddingConfigError,
} from './embeddingProvider.interface.js';

/**
 * Response format from Ollama's /api/embeddings endpoint
 */
interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Response format from Ollama's /api/tags endpoint
 */
interface OllamaTagsResponse {
  models: {
    name: string;
    modified_at: string;
    size: number;
    digest: string;
  }[];
}

/**
 * Supported Ollama embedding models with their dimensions
 */
const OLLAMA_MODELS: Record<string, number> = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
  'snowflake-arctic-embed': 1024,
};

/**
 * Default configuration values for Ollama provider
 */
const DEFAULTS = {
  BASE_URL: 'http://localhost:11434',
  MODEL: 'nomic-embed-text',
  DIMENSIONS: 768,
  TIMEOUT: 30000,
  BATCH_SIZE: 1,
} as const;

/**
 * Ollama embedding provider implementation.
 *
 * @remarks
 * This provider interfaces with a locally-running Ollama instance to generate embeddings.
 * It uses the native fetch API (Node.js 18+) and provides health checking to ensure
 * Ollama is available before attempting to generate embeddings.
 *
 * @example
 * ```typescript
 * const provider = new OllamaEmbeddingProvider();
 * await provider.initialize({
 *   type: 'ollama',
 *   model: 'nomic-embed-text',
 *   baseUrl: 'http://localhost:11434',
 *   dimensions: 768,
 *   timeout: 30000
 * });
 *
 * const embedding = await provider.embed("Hello, world!");
 * console.log(embedding.length); // 768
 * ```
 */
export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'Ollama';

  private _model = '';
  private _dimensions = 0;
  private _baseUrl = '';
  private _timeout: number = DEFAULTS.TIMEOUT;
  private _initialized = false;

  /**
   * Gets the currently loaded model identifier.
   */
  get model(): string {
    return this._model;
  }

  /**
   * Gets the dimensionality of embeddings produced by this provider.
   */
  get dimensions(): number {
    return this._dimensions;
  }

  /**
   * Initializes the Ollama provider with the given configuration.
   *
   * @param config - Provider configuration
   * @param progressCallback - Optional callback for initialization progress
   *
   * @throws {EmbeddingConfigError} If configuration is invalid
   * @throws {EmbeddingProviderInitError} If Ollama is not available or model not found
   */
  async initialize(
    config: EmbeddingProviderConfig,
    progressCallback?: EmbeddingProgressCallback
  ): Promise<void> {
    progressCallback?.('initialization', 0.0, 'Validating configuration');

    // Validate configuration
    this.validateConfig(config);

    // Set configuration
    this._baseUrl = config.baseUrl || DEFAULTS.BASE_URL;
    this._model = config.model || DEFAULTS.MODEL;
    this._timeout = config.timeout || DEFAULTS.TIMEOUT;

    // Determine dimensions
    if (config.dimensions) {
      this._dimensions = config.dimensions;
    } else if (OLLAMA_MODELS[this._model]) {
      this._dimensions = OLLAMA_MODELS[this._model];
    } else {
      // For custom models, we'll need to generate a test embedding to determine dimensions
      this._dimensions = 0; // Will be set after first embedding
    }

    progressCallback?.('initialization', 0.3, 'Checking Ollama availability');

    // Health check: verify Ollama is running
    await this.healthCheck();

    progressCallback?.('initialization', 0.6, 'Verifying model availability');

    // Verify the model is available in Ollama
    await this.verifyModel();

    progressCallback?.('initialization', 0.9, 'Finalizing initialization');

    this._initialized = true;

    progressCallback?.('initialization', 1.0, 'Initialization complete');
  }

  /**
   * Generates an embedding vector for a single text input.
   *
   * @param text - The input text to embed
   * @param progressCallback - Optional callback for progress updates
   * @returns Promise resolving to the embedding vector
   *
   * @throws {EmbeddingProviderNotInitializedError} If provider is not initialized
   * @throws {EmbeddingGenerationError} If embedding generation fails
   */
  async embed(
    text: string,
    progressCallback?: EmbeddingProgressCallback
  ): Promise<number[]> {
    if (!this._initialized) {
      throw new EmbeddingProviderNotInitializedError(this.name);
    }

    progressCallback?.('processing', 0.0, 'Sending request to Ollama');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this._timeout);

      const response = await fetch(`${this._baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this._model,
          prompt: text,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      progressCallback?.('processing', 0.5, 'Parsing response');

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${String(response.status)}: ${errorText}`);
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid response format: missing or invalid embedding field');
      }

      // Set dimensions from first embedding if not set (for custom models)
      if (this._dimensions === 0) {
        this._dimensions = data.embedding.length;
      }

      // Validate dimensions
      if (data.embedding.length !== this._dimensions) {
        throw new Error(
          `Dimension mismatch: expected ${String(this._dimensions)}, got ${String(data.embedding.length)}`
        );
      }

      progressCallback?.('processing', 1.0, 'Embedding generated');

      return data.embedding;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new EmbeddingGenerationError(
            this.name,
            `Ollama request timeout after ${String(this._timeout)}ms`,
            error
          );
        }

        if (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('fetch failed')
        ) {
          throw new EmbeddingGenerationError(
            this.name,
            `Ollama not available at ${this._baseUrl}`,
            error
          );
        }

        throw new EmbeddingGenerationError(this.name, error.message, error);
      }

      throw new EmbeddingGenerationError(
        this.name,
        'Unknown error during embedding generation'
      );
    }
  }

  /**
   * Generates embedding vectors for multiple text inputs in a batch.
   *
   * @param texts - Array of input texts to embed
   * @param progressCallback - Optional callback for batch processing progress
   * @returns Promise resolving to array of embedding vectors
   *
   * @throws {EmbeddingProviderNotInitializedError} If provider is not initialized
   * @throws {EmbeddingGenerationError} If batch generation fails
   *
   * @remarks
   * Ollama does not have a native batch API, so this implementation processes
   * texts sequentially. Progress is reported for each individual embedding.
   */
  async embedBatch(
    texts: string[],
    progressCallback?: EmbeddingProgressCallback
  ): Promise<number[][]> {
    if (!this._initialized) {
      throw new EmbeddingProviderNotInitializedError(this.name);
    }

    if (texts.length === 0) {
      return [];
    }

    progressCallback?.(
      'processing',
      0.0,
      `Processing batch of ${String(texts.length)} texts`
    );

    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i++) {
      const progress = i / texts.length;
      progressCallback?.(
        'processing',
        progress,
        `Processing text ${String(i + 1)} of ${String(texts.length)}`
      );

      try {
        const embedding = await this.embed(texts[i]);
        embeddings.push(embedding);
      } catch (error) {
        throw new EmbeddingGenerationError(
          this.name,
          `Failed to embed text at index ${String(i)}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error instanceof Error ? error : undefined
        );
      }
    }

    progressCallback?.('processing', 1.0, 'Batch processing complete');

    return embeddings;
  }

  /**
   * Checks whether the provider has been successfully initialized.
   *
   * @returns true if initialized and ready to generate embeddings
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Disposes of the provider and releases all resources.
   *
   * @remarks
   * For the Ollama provider, this simply resets the initialization state.
   * No model unloading is needed as Ollama manages model lifecycle independently.
   */
  async dispose(): Promise<void> {
    this._initialized = false;
    this._model = '';
    this._dimensions = 0;
    this._baseUrl = '';
    this._timeout = 30000;
    return Promise.resolve();
  }

  /**
   * Validates the provider configuration.
   *
   * @param config - Configuration to validate
   * @throws {EmbeddingConfigError} If configuration is invalid
   */
  private validateConfig(config: EmbeddingProviderConfig): void {
    if (config.type !== 'ollama') {
      throw new EmbeddingConfigError(
        this.name,
        `Invalid provider type: expected 'ollama', got '${config.type}'`
      );
    }

    if (!config.model && !DEFAULTS.MODEL) {
      throw new EmbeddingConfigError(this.name, 'Model name is required');
    }

    if (config.dimensions !== undefined && config.dimensions <= 0) {
      throw new EmbeddingConfigError(
        this.name,
        `Invalid dimensions: must be positive, got ${String(config.dimensions)}`
      );
    }

    if (config.timeout !== undefined && config.timeout <= 0) {
      throw new EmbeddingConfigError(
        this.name,
        `Invalid timeout: must be positive, got ${String(config.timeout)}`
      );
    }
  }

  /**
   * Performs a health check to verify Ollama is running and accessible.
   *
   * @throws {EmbeddingProviderInitError} If Ollama is not available
   */
  private async healthCheck(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this._timeout);

      const response = await fetch(`${this._baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Health check failed with status ${String(response.status)}`);
      }

      // Verify response is valid JSON
      await response.json();
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new EmbeddingProviderInitError(
            this.name,
            `Ollama health check timeout after ${String(this._timeout)}ms`,
            error
          );
        }

        if (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('fetch failed')
        ) {
          throw new EmbeddingProviderInitError(
            this.name,
            `Ollama not available at ${this._baseUrl}. Ensure Ollama is running.`,
            error
          );
        }

        throw new EmbeddingProviderInitError(this.name, error.message, error);
      }

      throw new EmbeddingProviderInitError(
        this.name,
        'Unknown error during health check'
      );
    }
  }

  /**
   * Verifies that the specified model is available in Ollama.
   *
   * @throws {EmbeddingProviderInitError} If model is not found
   */
  private async verifyModel(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this._timeout);

      const response = await fetch(`${this._baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch model list: HTTP ${String(response.status)}`);
      }

      const data = (await response.json()) as OllamaTagsResponse;

      // Check if the model exists in the list
      const modelExists = data.models.some(
        m => m.name === this._model || m.name.startsWith(`${this._model}:`)
      );

      if (!modelExists) {
        const availableModels = data.models.map(m => m.name).join(', ');
        throw new EmbeddingProviderInitError(
          this.name,
          `Model '${this._model}' not found in Ollama. Available models: ${availableModels || 'none'}. ` +
            `Pull the model first: ollama pull ${this._model}`
        );
      }
    } catch (error) {
      if (error instanceof EmbeddingProviderInitError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new EmbeddingProviderInitError(
            this.name,
            `Model verification timeout after ${String(this._timeout)}ms`,
            error
          );
        }

        throw new EmbeddingProviderInitError(
          this.name,
          `Failed to verify model availability: ${error.message}`,
          error
        );
      }

      throw new EmbeddingProviderInitError(
        this.name,
        'Unknown error during model verification'
      );
    }
  }
}
