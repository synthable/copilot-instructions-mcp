/**
 * LLM Provider Plugin Interface
 *
 * Defines the contract for LLM (Large Language Model) provider implementations.
 * Supports chat completions, text generation, and streaming responses.
 *
 * Following the plugin architecture pattern established by IEmbeddingProvider.
 */

/**
 * Chat message role types
 */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Individual chat message
 */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string; // Optional name for tool messages
  toolCallId?: string; // For tool responses
}

/**
 * Tool call specification (for function calling)
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Chat completion response
 */
export interface ChatResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: ToolCall[];
  model?: string;
}

/**
 * Options for chat/completion requests
 */
export interface LLMOptions {
  temperature?: number; // 0.0-2.0, controls randomness
  maxTokens?: number; // Maximum tokens to generate
  topP?: number; // 0.0-1.0, nucleus sampling
  frequencyPenalty?: number; // -2.0 to 2.0, penalize repetition
  presencePenalty?: number; // -2.0 to 2.0, encourage new topics
  stop?: string[]; // Stop sequences
  stream?: boolean; // Enable streaming (use streamChat instead)
  tools?: ToolDefinition[]; // Function calling tools (optional)
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

/**
 * Tool definition for function calling
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

/**
 * Streaming chunk from chat response
 */
export interface ChatStreamChunk {
  content: string;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  toolCalls?: Partial<ToolCall>[];
}

/**
 * Configuration for LLM provider initialization
 */
export interface LLMProviderConfig {
  type: string; // 'ollama', 'openai', 'anthropic'
  model: string; // Model name/ID
  baseUrl?: string; // API base URL (for Ollama, custom OpenAI endpoints)
  apiKey?: string; // API key (for OpenAI, Anthropic)
  timeout?: number; // Request timeout in ms
  maxRetries?: number; // Max retry attempts for failed requests
  defaultOptions?: Partial<LLMOptions>; // Default generation options
}

/**
 * Provider initialization callback for progress reporting
 */
export type LLMInitializeCallback = (status: {
  stage: 'validating' | 'connecting' | 'ready';
  message: string;
}) => void;

/**
 * Core LLM Provider Interface
 *
 * All LLM provider implementations must implement this interface.
 * Provides abstraction over different LLM APIs (Ollama, OpenAI, Anthropic, etc.)
 */
export interface ILLMProvider {
  /**
   * Provider name (e.g., 'ollama', 'openai', 'anthropic')
   */
  readonly name: string;

  /**
   * Model name/ID being used
   */
  readonly model: string;

  /**
   * Maximum context window size in tokens (if known)
   */
  readonly maxContextTokens?: number;

  /**
   * Initialize the provider
   *
   * @param config - Provider configuration
   * @param callback - Optional callback for initialization progress
   * @throws Error if initialization fails
   */
  initialize(
    config: LLMProviderConfig,
    callback?: LLMInitializeCallback
  ): Promise<void>;

  /**
   * Chat completion with message history
   *
   * @param messages - Array of chat messages
   * @param options - Optional generation parameters
   * @returns Chat response with content and metadata
   * @throws Error if request fails
   */
  chat(messages: ChatMessage[], options?: LLMOptions): Promise<ChatResponse>;

  /**
   * Stream chat completion with message history
   *
   * @param messages - Array of chat messages
   * @param options - Optional generation parameters
   * @returns Async generator yielding response chunks
   * @throws Error if request fails
   */
  streamChat(
    messages: ChatMessage[],
    options?: LLMOptions
  ): AsyncGenerator<ChatStreamChunk, void, unknown>;

  /**
   * Single-shot text completion (no message history)
   *
   * @param prompt - Text prompt
   * @param options - Optional generation parameters
   * @returns Generated text completion
   * @throws Error if request fails
   */
  complete(prompt: string, options?: LLMOptions): Promise<string>;

  /**
   * Check if provider is initialized and ready
   *
   * @returns true if initialized
   */
  isInitialized(): boolean;

  /**
   * Estimate token count for text (approximate)
   *
   * @param text - Text to estimate tokens for
   * @returns Approximate token count
   */
  estimateTokens(text: string): number;

  /**
   * Dispose of provider resources
   * Should be called when provider is no longer needed
   */
  dispose(): Promise<void>;
}

/**
 * Optional interface for providers that support health checking
 */
export interface ILLMProviderHealthCheck {
  /**
   * Check if the provider service is available and healthy
   *
   * @returns true if healthy, false otherwise
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Optional interface for providers that support model listing
 */
export interface ILLMProviderModelList {
  /**
   * List available models from the provider
   *
   * @returns Array of model names/IDs
   */
  listModels(): Promise<string[]>;
}

/**
 * Error class for LLM provider errors
 */
export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

/**
 * Error class for rate limiting
 */
export class RateLimitError extends LLMProviderError {
  constructor(
    provider: string,
    public readonly retryAfter?: number // seconds
  ) {
    super(
      `Rate limit exceeded${retryAfter ? ` (retry after ${String(retryAfter)}s)` : ''}`,
      provider,
      'RATE_LIMIT',
      429
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Error class for invalid API keys
 */
export class AuthenticationError extends LLMProviderError {
  constructor(provider: string) {
    super('Authentication failed - invalid API key', provider, 'AUTH_FAILED', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error class for context length exceeded
 */
export class ContextLengthError extends LLMProviderError {
  constructor(
    provider: string,
    public readonly requestedTokens: number,
    public readonly maxTokens: number
  ) {
    super(
      `Context length exceeded: ${String(requestedTokens)} > ${String(maxTokens)}`,
      provider,
      'CONTEXT_LENGTH',
      400
    );
    this.name = 'ContextLengthError';
  }
}
