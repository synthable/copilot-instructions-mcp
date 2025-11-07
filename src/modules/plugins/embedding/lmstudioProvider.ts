/**
 * @fileoverview LM Studio Embedding Provider
 *
 * This module implements the IEmbeddingProvider interface for LM Studio's local inference API.
 * LM Studio provides local embedding generation with an official TypeScript SDK that connects
 * via WebSocket for efficient communication.
 *
 * Features:
 * - Local inference (no cloud API calls)
 * - Official SDK with WebSocket communication
 * - Automatic model loading and management
 * - Batch processing support
 * - Support for custom models
 *
 * @author MCP Server Team
 * @version 2.1.0
 * @since 2.1.0
 */

import { LMStudioClient } from '@lmstudio/sdk';
import { promises as dns } from 'dns';
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
 * Supported LM Studio embedding models with their dimensions
 */
const LMSTUDIO_MODELS: Record<string, number> = {
  'nomic-ai/nomic-embed-text-v1.5-GGUF': 768,
  'nomic-embed-text': 768,
  'nomic-embed-text-v1.5': 768,
  'bge-large-en': 1024,
  'all-MiniLM-L6-v2': 384,
  'gte-large': 1024,
  'e5-large-v2': 1024,
};

/**
 * Default configuration values for LM Studio provider
 */
const DEFAULTS = {
  BASE_URL: 'ws://localhost:1234',
  MODEL: 'nomic-embed-text',
  DIMENSIONS: 768,
} as const;

/**
 * Type definition for LM Studio embedding model
 */
interface EmbeddingModel {
  embed(text: string): Promise<{ embedding: number[] }>;
  embed(texts: string[]): Promise<{ embedding: number[] }[]>;
  getModelInfo(): Promise<unknown>;
}

/**
 * LM Studio embedding provider implementation using the official @lmstudio/sdk.
 *
 * @remarks
 * This provider interfaces with a locally-running LM Studio instance via WebSocket.
 * It uses the official SDK which provides automatic retry logic, connection pooling,
 * and better error handling compared to raw HTTP/WebSocket calls.
 *
 * @example
 * ```typescript
 * const provider = new LMStudioEmbeddingProvider();
 * await provider.initialize({
 *   type: 'lmstudio',
 *   model: 'nomic-embed-text',
 *   baseUrl: 'ws://localhost:1234',
 *   dimensions: 768
 * });
 *
 * const embedding = await provider.embed("Hello, world!");
 * console.log(embedding.length); // 768
 * ```
 */
export class LMStudioEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'LM Studio';

  private _model = '';
  private _dimensions = 0;
  private _baseUrl = '';
  private _client?: LMStudioClient | undefined;
  private _embeddingModel?: EmbeddingModel | undefined;
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
   * Initializes the LM Studio provider with the given configuration.
   *
   * @param config - Provider configuration
   * @param progressCallback - Optional callback for initialization progress
   *
   * @throws {EmbeddingConfigError} If configuration is invalid
   * @throws {EmbeddingProviderInitError} If LM Studio is not available or model not found
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
    await this.validateBaseUrl(this._baseUrl);

    this._model = config.model;

    // Determine dimensions
    if (config.dimensions) {
      this._dimensions = config.dimensions;
    } else if (LMSTUDIO_MODELS[this._model]) {
      this._dimensions = LMSTUDIO_MODELS[this._model];
    } else {
      // For custom models, we'll determine dimensions after first embedding
      this._dimensions = 0;
    }

    progressCallback?.('initialization', 0.3, 'Connecting to LM Studio');

    // Create LM Studio client
    this._client = new LMStudioClient({ baseUrl: this._baseUrl });

    progressCallback?.('initialization', 0.6, 'Loading embedding model');

    // Load the model
    await this.loadModel();

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
    if (!this._initialized || !this._embeddingModel) {
      throw new EmbeddingProviderNotInitializedError(this.name);
    }

    progressCallback?.('processing', 0.0, 'Generating embedding');

    try {
      const response = await this._embeddingModel.embed(text);

      const embedding = response.embedding;

      if (embedding.length === 0) {
        throw new Error('No embedding returned from LM Studio');
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
   * Uses LM Studio's native batch embedding API by passing an array of texts.
   */
  async embedBatch(
    texts: string[],
    progressCallback?: EmbeddingProgressCallback
  ): Promise<number[][]> {
    if (!this._initialized || !this._embeddingModel) {
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
      const responses = await this._embeddingModel.embed(texts);

      // Validate response count matches input count
      if (responses.length !== texts.length) {
        throw new Error(
          `Batch size mismatch: requested ${String(texts.length)} embeddings but received ${String(responses.length)}. ` +
            `This could indicate data corruption or a provider error.`
        );
      }

      // Set dimensions from first embedding if not set (for custom models)
      if (this._dimensions === 0 && responses.length > 0) {
        const firstEmbedding = responses[0].embedding;
        if (firstEmbedding.length > 0) {
          this._dimensions = firstEmbedding.length;
        }
      }

      // Extract embeddings and validate
      const embeddings: number[][] = [];
      for (let i = 0; i < responses.length; i++) {
        const embedding = responses[i].embedding;
        if (embedding.length === 0) {
          throw new Error(`Missing embedding at index ${String(i)}`);
        }
        if (embedding.length !== this._dimensions) {
          throw new Error(
            `Dimension mismatch at index ${String(i)}: expected ${String(this._dimensions)}, got ${String(embedding.length)}`
          );
        }
        embeddings.push(embedding);
      }

      progressCallback?.('processing', 1.0, 'Batch processing complete');

      return embeddings;
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
   * For the LM Studio provider, this resets the initialization state.
   * Model unloading is managed by LM Studio independently.
   */
  async dispose(): Promise<void> {
    this._initialized = false;
    this._model = '';
    this._dimensions = 0;
    this._baseUrl = '';
    this._client = undefined;
    this._embeddingModel = undefined;
    return Promise.resolve();
  }

  /**
   * Validates the provider configuration.
   *
   * @param config - Configuration to validate
   * @throws {EmbeddingConfigError} If configuration is invalid
   */
  private validateConfig(config: EmbeddingProviderConfig): void {
    if (config.type !== 'lmstudio') {
      throw new EmbeddingConfigError(
        this.name,
        `Invalid provider type: expected 'lmstudio', got '${config.type}'`
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
   * Uses an allow-list approach for localhost, and resolves DNS names to IPs
   * to prevent DNS rebinding attacks that could bypass hostname-based checks.
   *
   * @param url - The URL to validate
   * @throws {EmbeddingConfigError} If URL is invalid or blocked
   * @private
   */
  private async validateBaseUrl(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new EmbeddingConfigError(
        this.name,
        `Invalid baseUrl format: ${url}. Must be a valid WebSocket URL (ws:// or wss://).`
      );
    }

    // Whitelist allowed protocols
    if (!['ws:', 'wss:', 'http:', 'https:'].includes(parsed.protocol)) {
      throw new EmbeddingConfigError(
        this.name,
        `Invalid protocol: ${parsed.protocol}. Only ws://, wss://, http://, and https:// are allowed.`
      );
    }

    const hostname = parsed.hostname.toLowerCase();

    // Allow-list: Only allow localhost variants (common for LM Studio)
    const localhostVariants = ['localhost', '127.0.0.1', '::1'];
    if (localhostVariants.includes(hostname)) {
      return; // Localhost is safe
    }

    // Define blocked IPs and private IP patterns
    const privateIPPatterns = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
      /^169\.254\./, // Link-local (AWS metadata)
      /^127\./, // Loopback (but hostname wasn't "localhost")
      /^fd[0-9a-f]{2}:/i, // IPv6 private (ULA)
      /^fe80:/i, // IPv6 link-local
      /^::1$/, // IPv6 loopback (but hostname wasn't "::1")
    ];

    const blockedIPs = [
      '169.254.169.254', // AWS/Azure/DigitalOcean metadata
      '100.100.100.200', // Alibaba Cloud metadata
      'fd00:ec2::254', // AWS IPv6 metadata
    ];

    // Check for known cloud metadata hostnames
    const blockedHostnames = [
      'metadata.google.internal', // GCP metadata
      'metadata.azure.com', // Azure metadata
    ];

    if (blockedHostnames.includes(hostname)) {
      throw new EmbeddingConfigError(
        this.name,
        `Access to cloud metadata endpoint "${hostname}" is not allowed for security reasons.`
      );
    }

    // Check if hostname is already an IP address (IPv4 or IPv6)
    const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const isIPv6 = hostname.includes(':') && !hostname.startsWith('[');

    let resolvedIPs: string[] = [];

    if (isIPv4 || isIPv6) {
      // Hostname is an IP address - validate it directly
      resolvedIPs = [hostname];
    } else {
      // Hostname is a domain name - resolve to IPs to prevent DNS rebinding attacks
      try {
        const [ipv4Addresses, ipv6Addresses] = await Promise.allSettled([
          dns.resolve4(hostname).catch(() => []),
          dns.resolve6(hostname).catch(() => []),
        ]);

        if (ipv4Addresses.status === 'fulfilled') {
          resolvedIPs.push(...ipv4Addresses.value);
        }
        if (ipv6Addresses.status === 'fulfilled') {
          resolvedIPs.push(...ipv6Addresses.value);
        }
      } catch {
        // DNS resolution failed - allow it to proceed and let the connection fail naturally
        // This prevents DNS errors from being used as an oracle for internal network mapping
        return;
      }

      // If we couldn't resolve any IPs, it's likely a typo or the hostname doesn't exist
      // Allow it through - the connection will fail anyway
      if (resolvedIPs.length === 0) {
        return;
      }
    }

    // Validate resolved IPs against blocked lists and private ranges
    for (const ip of resolvedIPs) {
      // Check against blocked IPs
      if (blockedIPs.includes(ip)) {
        throw new EmbeddingConfigError(
          this.name,
          `Access to blocked cloud metadata IP ${ip} is not allowed for security reasons.`
        );
      }

      // Check against private IP patterns
      for (const pattern of privateIPPatterns) {
        if (pattern.test(ip)) {
          throw new EmbeddingConfigError(
            this.name,
            `Access to private IP ranges is not allowed for security reasons. ` +
              `IP: ${ip}. For local LM Studio, use "localhost" or "127.0.0.1" instead.`
          );
        }
      }
    }
  }

  /**
   * Loads the embedding model in LM Studio.
   *
   * @throws {EmbeddingProviderInitError} If model loading fails
   */
  private async loadModel(): Promise<void> {
    if (!this._client) {
      throw new EmbeddingProviderInitError(this.name, 'Client not initialized');
    }

    try {
      // Load the model with verbose: false to reduce logging
      this._embeddingModel = (await this._client.embedding.model(this._model, {
        verbose: false,
      })) as EmbeddingModel;
    } catch (error) {
      if (error instanceof Error) {
        // Common error patterns
        if (
          error.message.includes('connect') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('WebSocket')
        ) {
          throw new EmbeddingProviderInitError(
            this.name,
            `LM Studio not available at ${this._baseUrl}. Ensure LM Studio is running.`,
            error
          );
        }

        if (error.message.includes('not found') || error.message.includes('Model')) {
          throw new EmbeddingProviderInitError(
            this.name,
            `Model '${this._model}' not found in LM Studio. Please load the model in LM Studio first.`,
            error
          );
        }

        throw new EmbeddingProviderInitError(
          this.name,
          `Failed to load model: ${error.message}`,
          error
        );
      }

      throw new EmbeddingProviderInitError(
        this.name,
        'Unknown error during model loading'
      );
    }
  }
}
