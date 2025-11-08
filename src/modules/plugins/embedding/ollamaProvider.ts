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
    this._baseUrl = config.baseUrl ?? DEFAULTS.BASE_URL;

    // Validate baseUrl to prevent SSRF attacks
    this.validateBaseUrl(this._baseUrl);

    this._model = config.model;

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

      if (embedding.length === 0) {
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
        if (firstEmbedding.length > 0) {
          this._dimensions = firstEmbedding.length;
        }
      }

      // Validate all embeddings have correct dimensions
      for (let i = 0; i < response.embeddings.length; i++) {
        const embedding = response.embeddings[i];
        if (embedding.length === 0) {
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

    if (!config.model) {
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
   * Validates the baseUrl to prevent SSRF attacks.
   * Blocks access to private IP ranges and cloud metadata endpoints.
   * @param url - The URL to validate
   * @throws {EmbeddingConfigError} If URL is invalid or blocked
   * @private
   */
  private validateBaseUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (error) {
      throw new EmbeddingConfigError(
        this.name,
        `Invalid baseUrl format: ${url}. Must be a valid HTTP/HTTPS URL.`
      );
    }

    // Whitelist allowed protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new EmbeddingConfigError(
        this.name,
        `Invalid protocol: ${parsed.protocol}. Only http:// and https:// are allowed.`
      );
    }

    // Check for embedded credentials (catches both user:pass@host and user@host patterns)
    if (parsed.username || parsed.password) {
      throw new EmbeddingConfigError(
        this.name,
        'URLs with embedded credentials are not allowed for security reasons'
      );
    }

    const hostname = parsed.hostname.toLowerCase();

    // Allow localhost explicitly (common for Ollama)
    // Note: URL parser keeps brackets for IPv6, so check both with and without
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
      return; // Localhost is safe
    }

    // Validate IPv4 addresses
    this.validateIPv4(hostname);

    // Validate IPv6 addresses
    this.validateIPv6(hostname);

    // Block common cloud metadata endpoints
    const blockedHostnames = [
      'metadata.google.internal', // GCP
      'metadata.azure.com', // Azure
      '100.100.100.200', // Alibaba Cloud
    ];

    if (blockedHostnames.includes(hostname)) {
      throw new EmbeddingConfigError(
        this.name,
        `Access to cloud metadata endpoints is not allowed: ${hostname}`
      );
    }
  }

  /**
   * Validates IPv4 addresses to block private ranges.
   * @param hostname - The hostname to validate
   * @throws {EmbeddingConfigError} If hostname is a private IPv4 address
   * @private
   */
  private validateIPv4(hostname: string): void {
    // Block private IP ranges (RFC 1918)
    const privateIPPatterns = [
      /^10\./,                          // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\./,    // 172.16.0.0/12
      /^192\.168\./,                    // 192.168.0.0/16
      /^169\.254\./,                    // Link-local (AWS metadata)
    ];

    for (const pattern of privateIPPatterns) {
      if (pattern.test(hostname)) {
        throw new EmbeddingConfigError(
          this.name,
          `Access to private IP ranges is not allowed for security reasons. ` +
          `Hostname: ${hostname}. ` +
          `For local Ollama, use "localhost" or "127.0.0.1" instead.`
        );
      }
    }
  }

  /**
   * Validates IPv6 addresses to block private and link-local ranges.
   * @param hostname - The hostname to validate
   * @throws {EmbeddingConfigError} If hostname is a private or link-local IPv6 address
   * @private
   */
  private validateIPv6(hostname: string): void {
    // URL parser keeps brackets around IPv6 addresses, so we need to strip them
    let ipv6 = hostname.toLowerCase();
    if (ipv6.startsWith('[') && ipv6.endsWith(']')) {
      ipv6 = ipv6.slice(1, -1);
    }

    // Skip if not IPv6 (no colons indicates it's a regular hostname or IPv4)
    if (!ipv6.includes(':')) {
      return;
    }

    // If there are colons, it's likely IPv6 (URL parser extracts port separately)
    // Count colons - IPv6 addresses have multiple colons
    const colonCount = (ipv6.match(/:/g) || []).length;

    // Skip if it looks like IPv4 with port notation (only one colon before first dot)
    // This shouldn't happen as URL parser extracts port, but be defensive
    if (colonCount === 1 && ipv6.includes('.')) {
      return;
    }

    // Block localhost variations (::1 and expanded form)
    // These are already allowed in main validation, so we return early
    if (ipv6 === '::1' || ipv6 === '0:0:0:0:0:0:0:1') {
      return;
    }

    // Block link-local (fe80::/10)
    if (ipv6.startsWith('fe80:')) {
      throw new EmbeddingConfigError(
        this.name,
        `Cannot use link-local IPv6 addresses. Hostname: ${hostname}. ` +
        `For local Ollama, use "localhost" instead.`
      );
    }

    // Block unique local (fc00::/7 - includes both fc00::/8 and fd00::/8)
    if (ipv6.startsWith('fc') || ipv6.startsWith('fd')) {
      throw new EmbeddingConfigError(
        this.name,
        `Cannot use private IPv6 addresses. Hostname: ${hostname}. ` +
        `For local Ollama, use "localhost" instead.`
      );
    }

    // Block IPv6-mapped IPv4 private addresses (::ffff:x.x.x.x)
    // Note: URL parser may convert dotted-decimal to hex (e.g., 127.0.0.1 -> 7f00:1)
    if (ipv6.includes('::ffff:')) {
      const ipv4Part = ipv6.split('::ffff:')[1];
      if (ipv4Part) {
        let first = 0;
        let second = 0;

        if (ipv4Part.includes('.')) {
          // Dotted-decimal notation (::ffff:127.0.0.1)
          const octets = ipv4Part.split('.');
          if (octets.length === 4) {
            first = parseInt(octets[0], 10);
            second = parseInt(octets[1], 10);
          }
        } else {
          // Hex notation (::ffff:7f00:1 for 127.0.0.1)
          // Parse hex groups: first 2 bytes are first 2 octets
          const hexParts = ipv4Part.split(':');
          if (hexParts.length >= 1) {
            const firstGroup = parseInt(hexParts[0], 16);
            // First group is 2 octets: high byte and low byte
            first = (firstGroup >> 8) & 0xff; // High byte (first octet)
            second = firstGroup & 0xff; // Low byte (second octet)
          }
        }

        // Block private ranges
        if (
          first === 10 ||
          first === 127 ||
          (first === 169 && second === 254) ||
          (first === 192 && second === 168) ||
          (first === 172 && second >= 16 && second <= 31)
        ) {
          throw new EmbeddingConfigError(
            this.name,
            `Cannot use IPv6-mapped private IPv4 addresses. Hostname: ${hostname}. ` +
            `For local Ollama, use "localhost" instead.`
          );
        }
      }
    }
  }

  /**
   * Verifies that the specified model is available in Ollama.
   *
   * @throws {EmbeddingProviderInitError} If model is not found or Ollama is unavailable
   */
  private async verifyModel(): Promise<void> {
    if (!this._client) {
      throw new EmbeddingProviderInitError(this.name, 'Client not initialized');
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
