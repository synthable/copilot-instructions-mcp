/**
 * Unit tests for LLMService
 *
 * Tests the service wrapper around LLM providers, including logging, error handling, and metrics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMService } from './llmService.js';
import type {
  ILLMProvider,
  ChatMessage,
  ChatResponse,
  ChatStreamChunk,
  LLMOptions,
} from '../../plugins/llm/llmProvider.interface.js';
import { LLMProviderError } from '../../plugins/llm/llmProvider.interface.js';
import type { ILogger } from '../../core/interfaces.js';

describe('LLMService', () => {
  let service: LLMService;
  let mockProvider: ILLMProvider;
  let mockLogger: ILogger;

  beforeEach(() => {
    // Create mock provider
    mockProvider = {
      name: 'test-provider',
      model: 'test-model',
      maxContextTokens: 8000,
      initialize: vi.fn(),
      chat: vi.fn(),
      streamChat: vi.fn(),
      complete: vi.fn(),
      isInitialized: vi.fn(() => true),
      estimateTokens: vi.fn((text: string) => text.length / 4),
      dispose: vi.fn(),
    };

    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    service = new LLMService(mockProvider, mockLogger);
  });

  describe('chat', () => {
    const testMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

    it('should call provider.chat and log success', async () => {
      const mockResponse: ChatResponse = {
        content: 'Hello! How can I help?',
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: 15,
          totalTokens: 25,
        },
        model: 'test-model',
      };

      vi.mocked(mockProvider.chat).mockResolvedValueOnce(mockResponse);

      const result = await service.chat(testMessages);

      expect(result).toEqual(mockResponse);
      expect(mockProvider.chat).toHaveBeenCalledWith(testMessages, undefined);

      // Verify debug logging (start)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting chat completion',
        expect.objectContaining({
          provider: 'test-provider',
          model: 'test-model',
          messageCount: 1,
        })
      );

      // Verify info logging (success)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat completion successful',
        expect.objectContaining({
          provider: 'test-provider',
          model: 'test-model',
          finishReason: 'stop',
          tokensUsed: 25,
          durationMs: expect.any(Number),
        })
      );
    });

    it('should pass options to provider and log them', async () => {
      const mockResponse: ChatResponse = {
        content: 'Response',
        finishReason: 'stop',
        model: 'test-model',
      };

      vi.mocked(mockProvider.chat).mockResolvedValueOnce(mockResponse);

      const options: LLMOptions = {
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
      };

      await service.chat(testMessages, options);

      expect(mockProvider.chat).toHaveBeenCalledWith(testMessages, options);

      // Verify options are logged
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting chat completion',
        expect.objectContaining({
          options: expect.objectContaining({
            temperature: 0.7,
            maxTokens: 100,
            topP: 0.9,
          }),
        })
      );
    });

    it('should sanitize tools in logged options', async () => {
      const mockResponse: ChatResponse = {
        content: 'Response',
        finishReason: 'stop',
        model: 'test-model',
      };

      vi.mocked(mockProvider.chat).mockResolvedValueOnce(mockResponse);

      const options: LLMOptions = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'Search tool',
              parameters: { type: 'object' },
            },
          },
          {
            type: 'function',
            function: {
              name: 'calculate',
              description: 'Calculator',
              parameters: { type: 'object' },
            },
          },
        ],
      };

      await service.chat(testMessages, options);

      // Verify tools are sanitized to count in logs
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting chat completion',
        expect.objectContaining({
          options: expect.objectContaining({
            tools: '[2 tools]',
          }),
        })
      );
    });

    it('should log error and rethrow on provider failure', async () => {
      const testError = new LLMProviderError(
        'Rate limit exceeded',
        'test-provider',
        'RATE_LIMIT'
      );

      vi.mocked(mockProvider.chat).mockRejectedValueOnce(testError);

      await expect(service.chat(testMessages)).rejects.toThrow(testError);

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Chat completion failed',
        expect.any(Error),
        expect.objectContaining({
          provider: 'test-provider',
          model: 'test-model',
          errorCode: 'RATE_LIMIT',
          durationMs: expect.any(Number),
        })
      );
    });

    it('should handle non-LLMProviderError errors', async () => {
      const testError = new Error('Generic error');

      vi.mocked(mockProvider.chat).mockRejectedValueOnce(testError);

      await expect(service.chat(testMessages)).rejects.toThrow(testError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Chat completion failed',
        expect.any(Error),
        expect.objectContaining({
          provider: 'test-provider',
          model: 'test-model',
          errorCode: undefined,
        })
      );
    });
  });

  describe('streamChat', () => {
    const testMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

    it('should stream chunks and log success', async () => {
      const mockChunks: ChatStreamChunk[] = [
        { content: 'Hello' },
        { content: ' there' },
        { content: '!', finishReason: 'stop' },
      ];

      const asyncIterator = (async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      })();

      vi.mocked(mockProvider.streamChat).mockReturnValueOnce(asyncIterator);

      const results: ChatStreamChunk[] = [];
      for await (const chunk of service.streamChat(testMessages)) {
        results.push(chunk);
      }

      expect(results).toEqual(mockChunks);

      // Verify debug logging (start)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting streaming chat completion',
        expect.objectContaining({
          provider: 'test-provider',
          model: 'test-model',
          messageCount: 1,
        })
      );

      // Verify info logging (success)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Streaming chat completion successful',
        expect.objectContaining({
          provider: 'test-provider',
          model: 'test-model',
          chunkCount: 3,
          finishReason: 'stop',
          durationMs: expect.any(Number),
        })
      );
    });

    it('should pass options to provider', async () => {
      const mockChunks: ChatStreamChunk[] = [
        { content: 'Response', finishReason: 'stop' },
      ];

      const asyncIterator = (async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      })();

      vi.mocked(mockProvider.streamChat).mockReturnValueOnce(asyncIterator);

      const options: LLMOptions = {
        temperature: 0.5,
        maxTokens: 50,
      };

      const results: ChatStreamChunk[] = [];
      for await (const chunk of service.streamChat(testMessages, options)) {
        results.push(chunk);
      }

      expect(mockProvider.streamChat).toHaveBeenCalledWith(testMessages, options);
    });

    it('should log error and rethrow on stream failure', async () => {
      const testError = new LLMProviderError(
        'Stream error',
        'test-provider',
        'STREAM_ERROR'
      );

      const asyncIterator = (async function* () {
        yield { content: 'Start' };
        throw testError;
      })();

      vi.mocked(mockProvider.streamChat).mockReturnValueOnce(asyncIterator);

      const generator = service.streamChat(testMessages);

      // First chunk should work
      const firstChunk = await generator.next();
      expect(firstChunk.value).toEqual({ content: 'Start' });

      // Second chunk should throw
      await expect(generator.next()).rejects.toThrow(testError);

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Streaming chat completion failed',
        expect.any(Error),
        expect.objectContaining({
          provider: 'test-provider',
          model: 'test-model',
          chunkCount: 1,
          errorCode: 'STREAM_ERROR',
          durationMs: expect.any(Number),
        })
      );
    });
  });

  describe('complete', () => {
    it('should call provider.complete and log success', async () => {
      const mockCompletion = 'Completed text';

      vi.mocked(mockProvider.complete).mockResolvedValueOnce(mockCompletion);

      const result = await service.complete('Test prompt');

      expect(result).toBe(mockCompletion);
      expect(mockProvider.complete).toHaveBeenCalledWith('Test prompt', undefined);

      // Verify debug logging (start)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting text completion',
        expect.objectContaining({
          provider: 'test-provider',
          model: 'test-model',
          promptLength: 11,
        })
      );

      // Verify info logging (success)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Text completion successful',
        expect.objectContaining({
          provider: 'test-provider',
          model: 'test-model',
          responseLength: 14,
          durationMs: expect.any(Number),
        })
      );
    });

    it('should pass options to provider', async () => {
      vi.mocked(mockProvider.complete).mockResolvedValueOnce('Result');

      const options: LLMOptions = {
        temperature: 0.3,
        maxTokens: 200,
      };

      await service.complete('Prompt', options);

      expect(mockProvider.complete).toHaveBeenCalledWith('Prompt', options);
    });

    it('should log error and rethrow on provider failure', async () => {
      const testError = new Error('Completion failed');

      vi.mocked(mockProvider.complete).mockRejectedValueOnce(testError);

      await expect(service.complete('Test')).rejects.toThrow(testError);

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Text completion failed',
        expect.any(Error),
        expect.objectContaining({
          provider: 'test-provider',
          model: 'test-model',
          errorCode: undefined,
          durationMs: expect.any(Number),
        })
      );
    });
  });

  describe('estimateTokens', () => {
    it('should delegate to provider', () => {
      const text = 'This is a test';

      const result = service.estimateTokens(text);

      expect(mockProvider.estimateTokens).toHaveBeenCalledWith(text);
      expect(result).toBe(text.length / 4); // Mock implementation
    });
  });

  describe('getters', () => {
    it('should return provider name', () => {
      expect(service.getProviderName()).toBe('test-provider');
    });

    it('should return model name', () => {
      expect(service.getModelName()).toBe('test-model');
    });

    it('should return max context tokens', () => {
      expect(service.getMaxContextTokens()).toBe(8000);
    });

    it('should return undefined for max context tokens if not set', () => {
      Object.defineProperty(mockProvider, 'maxContextTokens', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(service.getMaxContextTokens()).toBeUndefined();
    });
  });

  describe('options sanitization', () => {
    it('should return undefined for undefined options', async () => {
      const mockResponse: ChatResponse = {
        content: 'Response',
        finishReason: 'stop',
        model: 'test-model',
      };

      vi.mocked(mockProvider.chat).mockResolvedValueOnce(mockResponse);

      await service.chat([{ role: 'user', content: 'Test' }]);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting chat completion',
        expect.objectContaining({
          options: undefined,
        })
      );
    });

    it('should preserve relevant option fields', async () => {
      const mockResponse: ChatResponse = {
        content: 'Response',
        finishReason: 'stop',
        model: 'test-model',
      };

      vi.mocked(mockProvider.chat).mockResolvedValueOnce(mockResponse);

      const options: LLMOptions = {
        temperature: 0.8,
        maxTokens: 150,
        topP: 0.95,
        frequencyPenalty: 0.5,
        presencePenalty: 0.3,
        stop: ['END', 'STOP'],
        stream: false,
      };

      await service.chat([{ role: 'user', content: 'Test' }], options);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting chat completion',
        expect.objectContaining({
          options: {
            temperature: 0.8,
            maxTokens: 150,
            topP: 0.95,
            frequencyPenalty: 0.5,
            presencePenalty: 0.3,
            stop: ['END', 'STOP'],
            stream: false,
            tools: undefined,
          },
        })
      );
    });
  });
});
