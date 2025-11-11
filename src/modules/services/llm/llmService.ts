/**
 * LLM Service
 *
 * Unified service wrapper for LLM providers.
 * Provides logging, error handling, and a consistent interface for the application.
 *
 * Follows the pattern established by EmbeddingService.
 */

import type {
  ILLMProvider,
  ChatMessage,
  ChatResponse,
  ChatStreamChunk,
  LLMOptions,
} from '../../plugins/llm/llmProvider.interface.js';
import { LLMProviderError } from '../../plugins/llm/llmProvider.interface.js';
import type { ILogger } from '../../core/interfaces.js';

/**
 * LLM Service Interface
 *
 * Provides high-level LLM operations with logging and error handling.
 */
export interface ILLMService {
  /**
   * Chat completion with message history
   */
  chat(messages: ChatMessage[], options?: LLMOptions): Promise<ChatResponse>;

  /**
   * Stream chat completion with message history
   */
  streamChat(
    messages: ChatMessage[],
    options?: LLMOptions
  ): AsyncGenerator<ChatStreamChunk, void, unknown>;

  /**
   * Single-shot text completion
   */
  complete(prompt: string, options?: LLMOptions): Promise<string>;

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number;

  /**
   * Get provider name
   */
  getProviderName(): string;

  /**
   * Get model name
   */
  getModelName(): string;

  /**
   * Get max context tokens (if known)
   */
  getMaxContextTokens(): number | undefined;
}

/**
 * LLM Service Implementation
 *
 * Wraps an ILLMProvider with logging, metrics, and error handling.
 */
export class LLMService implements ILLMService {
  constructor(
    private provider: ILLMProvider,
    private logger: ILogger
  ) {}

  /**
   * Chat completion with message history
   */
  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<ChatResponse> {
    const startTime = Date.now();
    this.logger.debug('Starting chat completion', {
      provider: this.provider.name,
      model: this.provider.model,
      messageCount: messages.length,
      options: this.sanitizeOptions(options),
    });

    try {
      const response = await this.provider.chat(messages, options);

      const duration = Date.now() - startTime;
      this.logger.info('Chat completion successful', {
        provider: this.provider.name,
        model: this.provider.model,
        finishReason: response.finishReason,
        tokensUsed: response.usage?.totalTokens,
        durationMs: duration,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Chat completion failed', error as Error, {
        provider: this.provider.name,
        model: this.provider.model,
        errorCode: error instanceof LLMProviderError ? error.code : undefined,
        durationMs: duration,
      });

      throw error;
    }
  }

  /**
   * Stream chat completion with message history
   */
  async *streamChat(
    messages: ChatMessage[],
    options?: LLMOptions
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const startTime = Date.now();
    this.logger.debug('Starting streaming chat completion', {
      provider: this.provider.name,
      model: this.provider.model,
      messageCount: messages.length,
      options: this.sanitizeOptions(options),
    });

    let chunkCount = 0;
    let finishReason: ChatStreamChunk['finishReason'] | undefined;

    try {
      for await (const chunk of this.provider.streamChat(messages, options)) {
        chunkCount++;
        if (chunk.finishReason) {
          finishReason = chunk.finishReason;
        }
        yield chunk;
      }

      const duration = Date.now() - startTime;
      this.logger.info('Streaming chat completion successful', {
        provider: this.provider.name,
        model: this.provider.model,
        chunkCount,
        finishReason,
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Streaming chat completion failed', error as Error, {
        provider: this.provider.name,
        model: this.provider.model,
        chunkCount,
        errorCode: error instanceof LLMProviderError ? error.code : undefined,
        durationMs: duration,
      });

      throw error;
    }
  }

  /**
   * Single-shot text completion
   */
  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    const startTime = Date.now();
    this.logger.debug('Starting text completion', {
      provider: this.provider.name,
      model: this.provider.model,
      promptLength: prompt.length,
      options: this.sanitizeOptions(options),
    });

    try {
      const response = await this.provider.complete(prompt, options);

      const duration = Date.now() - startTime;
      this.logger.info('Text completion successful', {
        provider: this.provider.name,
        model: this.provider.model,
        responseLength: response.length,
        durationMs: duration,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Text completion failed', error as Error, {
        provider: this.provider.name,
        model: this.provider.model,
        errorCode: error instanceof LLMProviderError ? error.code : undefined,
        durationMs: duration,
      });

      throw error;
    }
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number {
    return this.provider.estimateTokens(text);
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return this.provider.name;
  }

  /**
   * Get model name
   */
  getModelName(): string {
    return this.provider.model;
  }

  /**
   * Get max context tokens (if known)
   */
  getMaxContextTokens(): number | undefined {
    return this.provider.maxContextTokens;
  }

  /**
   * Sanitize options for logging (remove sensitive data)
   */
  private sanitizeOptions(options?: LLMOptions): Record<string, unknown> | undefined {
    if (!options) return undefined;

    return {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      stop: options.stop,
      stream: options.stream,
      tools: options.tools ? `[${String(options.tools.length)} tools]` : undefined,
    };
  }
}
