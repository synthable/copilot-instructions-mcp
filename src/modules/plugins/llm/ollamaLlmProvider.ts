/**
 * Ollama LLM Provider Implementation
 *
 * HTTP client for Ollama API (localhost or remote Ollama server)
 * Supports chat completions, text generation, and streaming.
 *
 * API Documentation: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import type {
  ILLMProvider,
  ILLMProviderHealthCheck,
  ILLMProviderModelList,
  ChatMessage,
  ChatResponse,
  ChatStreamChunk,
  LLMOptions,
  LLMProviderConfig,
  LLMInitializeCallback,
} from './llmProvider.interface.js';
import {
  LLMProviderError,
  RateLimitError,
  ContextLengthError,
} from './llmProvider.interface.js';

/**
 * Ollama API chat request format
 */
interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number; // max tokens
    stop?: string[];
    frequency_penalty?: number;
    presence_penalty?: number;
  };
}

/**
 * Ollama API chat response format
 */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama API generate request format
 */
interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
  };
}

/**
 * Ollama API generate response format
 */
interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Ollama API tags (models list) response
 */
interface OllamaTagsResponse {
  models: {
    name: string;
    modified_at: string;
    size: number;
    digest: string;
    details?: {
      format?: string;
      family?: string;
      parameter_size?: string;
      quantization_level?: string;
    };
  }[];
}

/**
 * Ollama LLM Provider
 *
 * Connects to Ollama server for chat completions and text generation.
 * Supports streaming responses and model management.
 */
export class OllamaLLMProvider
  implements ILLMProvider, ILLMProviderHealthCheck, ILLMProviderModelList
{
  public readonly name = 'ollama';
  public model = '';
  public readonly maxContextTokens?: number;

  private baseUrl = 'http://localhost:11434';
  private timeout = 120000; // 2 minutes for LLM requests
  private maxRetries = 3;
  private defaultOptions: Partial<LLMOptions> = {};
  private initialized = false;

  /**
   * Initialize the Ollama provider
   */
  async initialize(
    config: LLMProviderConfig,
    callback?: LLMInitializeCallback
  ): Promise<void> {
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? this.baseUrl;
    this.timeout = config.timeout ?? this.timeout;
    this.maxRetries = config.maxRetries ?? this.maxRetries;
    this.defaultOptions = config.defaultOptions ?? {};

    callback?.({ stage: 'validating', message: 'Validating configuration' });

    if (!this.model) {
      throw new LLMProviderError(
        'Model name is required for Ollama provider',
        this.name,
        'MISSING_MODEL'
      );
    }

    callback?.({ stage: 'connecting', message: `Connecting to ${this.baseUrl}` });

    // Health check: verify Ollama server is accessible
    const isHealthy = await this.healthCheck();
    if (!isHealthy) {
      throw new LLMProviderError(
        `Failed to connect to Ollama server at ${this.baseUrl}`,
        this.name,
        'CONNECTION_FAILED'
      );
    }

    // Verify model exists
    try {
      const models = await this.listModels();
      const modelExists = models.some(
        m => m === this.model || m.startsWith(this.model)
      );

      if (!modelExists) {
        throw new LLMProviderError(
          `Model "${this.model}" not found. Available models: ${models.join(', ')}`,
          this.name,
          'MODEL_NOT_FOUND'
        );
      }
    } catch (error) {
      if (error instanceof LLMProviderError) throw error;
      // If listing models fails, warn but continue (model might still work)
      console.warn(
        `Warning: Could not verify model "${this.model}" exists:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    callback?.({ stage: 'ready', message: 'Provider initialized successfully' });
    this.initialized = true;
  }

  /**
   * Chat completion with message history
   */
  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<ChatResponse> {
    this.ensureInitialized();

    const mergedOptions = { ...this.defaultOptions, ...options };
    const ollamaOptions = this.buildOllamaOptions(mergedOptions);
    const requestBody: OllamaChatRequest = {
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      ...(ollamaOptions && { options: ollamaOptions }),
    };

    try {
      const response = await this.fetchWithRetry<OllamaChatResponse>(
        `${this.baseUrl}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      return {
        content: response.message.content,
        finishReason: response.done ? 'stop' : 'length',
        usage: {
          promptTokens: response.prompt_eval_count ?? 0,
          completionTokens: response.eval_count ?? 0,
          totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
        },
        model: response.model,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Stream chat completion with message history
   */
  async *streamChat(
    messages: ChatMessage[],
    options?: LLMOptions
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    this.ensureInitialized();

    const mergedOptions = { ...this.defaultOptions, ...options };
    const ollamaOptions = this.buildOllamaOptions(mergedOptions);
    const requestBody: OllamaChatRequest = {
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      ...(ollamaOptions && { options: ollamaOptions }),
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw await this.createErrorFromResponse(response);
      }

      if (!response.body) {
        throw new LLMProviderError('Response body is null', this.name, 'STREAM_ERROR');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const result = await reader.read();
        if (result.done) {
          break;
        }

        buffer += decoder.decode(result.value as Uint8Array, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line) as OllamaChatResponse;

              const streamChunk: ChatStreamChunk = {
                content: chunk.message.content,
              };

              if (chunk.done) {
                streamChunk.finishReason = 'stop';
              }

              yield streamChunk;

              if (chunk.done) {
                return;
              }
            } catch (parseError) {
              console.warn('Failed to parse streaming chunk:', line);
            }
          }
        }
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Single-shot text completion
   */
  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    this.ensureInitialized();

    const mergedOptions = { ...this.defaultOptions, ...options };
    const ollamaOptions = this.buildOllamaOptions(mergedOptions);
    const requestBody: OllamaGenerateRequest = {
      model: this.model,
      prompt,
      stream: false,
      ...(ollamaOptions && { options: ollamaOptions }),
    };

    try {
      const response = await this.fetchWithRetry<OllamaGenerateResponse>(
        `${this.baseUrl}/api/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      return response.response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Check if provider is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Estimate token count (approximate using word count heuristic)
   * Ollama doesn't provide a tokenization API, so we use rough estimation
   */
  estimateTokens(text: string): number {
    // Rough heuristic: ~1.3 tokens per word for English
    const words = text.split(/\s+/).length;
    return Math.ceil(words * 1.3);
  }

  /**
   * Dispose of provider resources
   */
  dispose(): Promise<void> {
    this.initialized = false;
    return Promise.resolve();
  }

  /**
   * Health check: verify Ollama server is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5s timeout for health check
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models from Ollama server
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new LLMProviderError(
          `Failed to list models: ${response.statusText}`,
          this.name,
          'LIST_MODELS_FAILED',
          response.status
        );
      }

      const data = (await response.json()) as OllamaTagsResponse;
      return data.models.map(m => m.name);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Fetch with automatic retry on transient failures
   */
  private async fetchWithRetry<T>(url: string, init: RequestInit): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
          const error = await this.createErrorFromResponse(response);

          // Don't retry on client errors (4xx except 429)
          if (
            response.status >= 400 &&
            response.status < 500 &&
            response.status !== 429
          ) {
            throw error;
          }

          lastError = error;

          // Exponential backoff for retry
          if (attempt < this.maxRetries - 1) {
            await this.sleep(Math.pow(2, attempt) * 1000);
            continue;
          }

          throw error;
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx except 429) - these are not transient
        if (
          lastError instanceof LLMProviderError &&
          lastError.statusCode &&
          lastError.statusCode >= 400 &&
          lastError.statusCode < 500 &&
          lastError.statusCode !== 429
        ) {
          throw lastError;
        }

        // Don't retry on timeout or network errors on last attempt
        if (attempt === this.maxRetries - 1) {
          throw lastError;
        }

        // Exponential backoff
        await this.sleep(Math.pow(2, attempt) * 1000);
      }
    }

    throw lastError ?? new Error('Max retries exceeded');
  }

  /**
   * Build Ollama-specific options from standard LLMOptions
   * Returns undefined if no options are set, otherwise returns object with only defined properties
   */
  private buildOllamaOptions(
    options: Partial<LLMOptions>
  ): OllamaChatRequest['options'] | undefined {
    const ollamaOptions: NonNullable<OllamaChatRequest['options']> = {};
    let hasOptions = false;

    if (options.temperature !== undefined) {
      ollamaOptions.temperature = options.temperature;
      hasOptions = true;
    }
    if (options.topP !== undefined) {
      ollamaOptions.top_p = options.topP;
      hasOptions = true;
    }
    if (options.maxTokens !== undefined) {
      ollamaOptions.num_predict = options.maxTokens;
      hasOptions = true;
    }
    if (options.stop !== undefined) {
      ollamaOptions.stop = options.stop;
      hasOptions = true;
    }
    if (options.frequencyPenalty !== undefined) {
      ollamaOptions.frequency_penalty = options.frequencyPenalty;
      hasOptions = true;
    }
    if (options.presencePenalty !== undefined) {
      ollamaOptions.presence_penalty = options.presencePenalty;
      hasOptions = true;
    }

    return hasOptions ? ollamaOptions : undefined;
  }

  /**
   * Create error from HTTP response
   */
  private async createErrorFromResponse(response: Response): Promise<LLMProviderError> {
    let errorMessage = response.statusText;

    try {
      const body = (await response.json()) as { error?: string };
      if ('error' in body && typeof body.error === 'string') {
        errorMessage = body.error;
      }
    } catch {
      // Ignore JSON parse errors
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return new RateLimitError(
        this.name,
        retryAfter ? parseInt(retryAfter) : undefined
      );
    }

    if (response.status === 400 && errorMessage.includes('context length')) {
      return new ContextLengthError(this.name, 0, 0); // Ollama doesn't provide exact counts
    }

    return new LLMProviderError(errorMessage, this.name, 'API_ERROR', response.status);
  }

  /**
   * Handle and normalize errors
   */
  private handleError(error: unknown): LLMProviderError {
    if (error instanceof LLMProviderError) {
      return error;
    }

    if (error instanceof Error) {
      return new LLMProviderError(
        error.message,
        this.name,
        'UNKNOWN_ERROR',
        undefined,
        error
      );
    }

    return new LLMProviderError(String(error), this.name, 'UNKNOWN_ERROR');
  }

  /**
   * Ensure provider is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new LLMProviderError(
        'Provider not initialized. Call initialize() first.',
        this.name,
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
