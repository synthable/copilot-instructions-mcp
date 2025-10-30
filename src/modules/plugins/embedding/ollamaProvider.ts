/**
 * @fileoverview Ollama Embedding Provider
 *
 * This module implements the IEmbeddingProvider interface for Ollama's local inference API.
 * Ollama provides local embedding generation with models like nomic-embed-text and mxbai-embed-large.
 *
 * Features:
 * - Local inference (no cloud API calls)
 * - Health checking to verify Ollama availability
 * - Automatic retry logic via ollama-js
 * - Batch processing support
 * - Support for custom models
 *
 * @author MCP Server Team
 * @version 2.1.0
 * @since 2.0.0
 */

import { Ollama } from 'ollama';
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
 * Supported Ollama embedding models with their dimensions
 */
const OLLAMA_MODELS: Record<string, number> = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
  'snowflake-arctic-embed': 1024,
  'qwen3-embedding:0.6b': 1024,
};

/**
 * Default configuration values for Ollama provider
 */
const DEFAULTS = {
  BASE_URL: 'http://localhost:11434',
  MODEL: 'nomic-embed-text',
  DIMENSIONS: 768,
} as const;

/**
 * Ollama embedding provider implementation using the official ollama-js library.
 *
 * @remarks
 * This provider interfaces with a locally-running Ollama instance to generate embeddings.
 * It uses the official ollama-js client which provides automatic retry logic, connection
 * pooling, and better error handling compared to raw fetch API.
 *
 * @example
 * ```typescript
 * const provider = new OllamaEmbeddingProvider();
 * await provider.initialize({
 *   type: 'ollama',
 *   model: 'nomic-embed-text',
 *   baseUrl: 'http://localhost:11434',
 *   dimensions: 768
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
  private _client?: Ollama | undefined;
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

    // Determine dimensions
    if (config.dimensions) {
      this._dimensions = config.dimensions;
    } else if (OLLAMA_MODELS[this._model]) {
      this._dimensions = OLLAMA_MODELS[this._model];
    } else {
      // For custom models, we'll determine dimensions after first embedding
      this._dimensions = 0;
    }

    progressCallback?.('initialization', 0.3, 'Connecting to Ollama');

    // Create Ollama client
    this._client = new Ollama({ host: this._baseUrl });

    progressCallback?.('initialization', 0.6, 'Verifying model availability');

    // Verify the model is available in Ollama
    await this.verifyModel();

    progressCallback?.('initialization', 1.0, 'Initialization complete');

    this._initialized = true;
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
    if (!this._initialized || !this._client) {
      throw new EmbeddingProviderNotInitializedError(this.name);
    }

    progressCallback?.('processing', 0.0, 'Generating embedding');

    try {
      const response = await this._client.embed({
        model: this._model,
        input: text,
      });

      // embed() returns embeddings as number[][], take first element for single text
      const embedding = response.embeddings[0];

      if (!embedding) {
        throw new Error('No embedding returned from Ollama');
      }

      // Set dimensions from first embedding if not set (for custom models)
      if (this._dimensions === 0) {
        this._dimensions = embedding.length;
      }

      // Validate dimensions
      if (embedding.length !== this._dimensions) {
        throw new Error(
          `Dimension mismatch: expected ${String(this._dimensions)}, got ${String(embedding.length)}`
        );
      }

      progressCallback?.('processing', 1.0, 'Embedding generated');

      return embedding;
    } catch (error) {
      if (error instanceof Error) {
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
   * Uses Ollama's native batch embedding API by passing an array of texts to embed().
   */
  async embedBatch(
    texts: string[],
    progressCallback?: EmbeddingProgressCallback
  ): Promise<number[][]> {
    if (!this._initialized || !this._client) {
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

    try {
      const response = await this._client.embed({
        model: this._model,
        input: texts, // Pass array directly for batch processing
      });

      // Set dimensions from first embedding if not set (for custom models)
      if (this._dimensions === 0 && response.embeddings.length > 0) {
        const firstEmbedding = response.embeddings[0];
        if (firstEmbedding) {
          this._dimensions = firstEmbedding.length;
        }
      }

      // Validate all embeddings have correct dimensions
      for (let i = 0; i < response.embeddings.length; i++) {
        const embedding = response.embeddings[i];
        if (!embedding) {
          throw new Error(`Missing embedding at index ${String(i)}`);
        }
        if (embedding.length !== this._dimensions) {
          throw new Error(
            `Dimension mismatch at index ${String(i)}: expected ${String(this._dimensions)}, got ${String(embedding.length)}`
          );
        }
      }

      progressCallback?.('processing', 1.0, 'Batch processing complete');

      return response.embeddings;
    } catch (error) {
      if (error instanceof Error) {
        throw new EmbeddingGenerationError(
          this.name,
          `Batch embedding failed: ${error.message}`,
          error
        );
      }

      throw new EmbeddingGenerationError(
        this.name,
        'Unknown error during batch embedding generation'
      );
    }
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
    this._client = undefined;
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
  }

  /**
   * Verifies that the specified model is available in Ollama.
   *
   * @throws {EmbeddingProviderInitError} If model is not found or Ollama is unavailable
   */
  private async verifyModel(): Promise<void> {
    if (!this._client) {
      throw new EmbeddingProviderInitError(
        this.name,
        'Client not initialized'
      );
    }

    try {
      // List all available models
      const response = await this._client.list();

      // Check if the model exists in the list
      const modelExists = response.models.some(
        m => m.name === this._model || m.name.startsWith(`${this._model}:`)
      );

      if (!modelExists) {
        const availableModels = response.models.map(m => m.name).join(', ');
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
        // Connection errors from ollama-js
        if (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('connect') ||
          error.message.includes('fetch failed')
        ) {
          throw new EmbeddingProviderInitError(
            this.name,
            `Ollama not available at ${this._baseUrl}. Ensure Ollama is running.`,
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
