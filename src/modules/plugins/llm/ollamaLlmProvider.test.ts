/**
 * Unit tests for OllamaLLMProvider
 *
 * Tests HTTP client, chat/completion, streaming, error handling, and retry logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaLLMProvider } from './ollamaLlmProvider.js';
import type { LLMProviderConfig } from './llmProvider.interface.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OllamaLLMProvider', () => {
  let provider: OllamaLLMProvider;
  const baseConfig: LLMProviderConfig = {
    type: 'ollama',
    model: 'llama3.1:8b',
    baseUrl: 'http://localhost:11434',
    timeout: 10000,
    maxRetries: 3,
  };

  beforeEach(() => {
    provider = new OllamaLLMProvider();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid config', async () => {
      // Mock initialization - needs TWO calls: listModels + health check
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        });

      await provider.initialize(baseConfig);

      expect(provider.isInitialized()).toBe(true);
      expect(provider.model).toBe('llama3.1:8b');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.any(Object)
      );
    });

    it('should fail initialization if model is missing', async () => {
      const invalidConfig = { ...baseConfig, model: '' };

      await expect(provider.initialize(invalidConfig)).rejects.toThrow(
        'Model name is required'
      );
    });

    it('should fail initialization if server is unreachable', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      await expect(provider.initialize(baseConfig)).rejects.toThrow(
        'Failed to connect to Ollama server'
      );
    });

    it('should fail initialization if model is not found', async () => {
      // Mock initialization - needs TWO calls
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'other-model' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'other-model' }] }),
        });

      await expect(provider.initialize(baseConfig)).rejects.toThrow(
        'Model "llama3.1:8b" not found'
      );
    });
  });

  describe('chat completion', () => {
    beforeEach(async () => {
      // Initialize provider - needs TWO mocks: one for listModels, one for health check
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        });
      await provider.initialize(baseConfig);
      vi.clearAllMocks();
    });

    it('should perform chat completion successfully', async () => {
      const mockResponse = {
        model: 'llama3.1:8b',
        created_at: '2024-01-01T00:00:00Z',
        message: { role: 'assistant', content: 'Hello! How can I help?' },
        done: true,
        prompt_eval_count: 10,
        eval_count: 8,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await provider.chat([{ role: 'user', content: 'Hello' }]);

      expect(result.content).toBe('Hello! How can I help?');
      expect(result.finishReason).toBe('stop');
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(8);
      expect(result.model).toBe('llama3.1:8b');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"stream":false'),
        })
      );
    });

    it('should handle chat with options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3.1:8b',
          message: { role: 'assistant', content: 'Response' },
          done: true,
        }),
      });

      await provider.chat([{ role: 'user', content: 'Test' }], {
        temperature: 0.7,
        maxTokens: 100,
        stop: ['END'],
      });

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.options.temperature).toBe(0.7);
      expect(body.options.num_predict).toBe(100);
      expect(body.options.stop).toEqual(['END']);
    });

    it('should throw error if provider not initialized', async () => {
      const uninitProvider = new OllamaLLMProvider();

      await expect(
        uninitProvider.chat([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('not initialized');
    });
  });

  describe('streaming chat', () => {
    beforeEach(async () => {
      // Initialize provider - needs TWO mocks
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        });
      await provider.initialize(baseConfig);
      vi.clearAllMocks();
    });

    it('should stream chat responses', async () => {
      const chunks = [
        { message: { content: 'Hello' }, done: false },
        { message: { content: ' there' }, done: false },
        { message: { content: '!' }, done: true },
      ];

      const mockBody = {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(JSON.stringify(chunks[0]) + '\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(JSON.stringify(chunks[1]) + '\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(JSON.stringify(chunks[2]) + '\n'),
            })
            .mockResolvedValueOnce({
              done: true,
              value: undefined,
            }),
        }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockBody,
      });

      const results: string[] = [];
      for await (const chunk of provider.streamChat([
        { role: 'user', content: 'Hello' },
      ])) {
        results.push(chunk.content);
        if (chunk.finishReason) {
          expect(chunk.finishReason).toBe('stop');
        }
      }

      expect(results).toEqual(['Hello', ' there', '!']);
    });

    it('should handle streaming errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
      });

      const generator = provider.streamChat([{ role: 'user', content: 'Test' }]);

      try {
        await generator.next();
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect((error as Error).name).toBe('LLMProviderError');
      }
    });
  });

  describe('text completion', () => {
    beforeEach(async () => {
      // Initialize provider - needs TWO mocks
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        });
      await provider.initialize(baseConfig);
      vi.clearAllMocks();
    });

    it('should perform text completion', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3.1:8b',
          response: 'Generated text response',
          done: true,
        }),
      });

      const result = await provider.complete('Complete this:');

      expect(result).toBe('Generated text response');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      // Initialize provider - needs TWO mocks
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        });
      await provider.initialize(baseConfig);
      vi.clearAllMocks();
    });

    it('should handle rate limiting (429)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([['Retry-After', '60']]),
        json: async () => ({ error: 'Rate limit exceeded' }),
      });

      try {
        await provider.chat([{ role: 'user', content: 'Test' }]);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect((error as Error).name).toBe('RateLimitError');
      }
    });

    it('should retry on transient failures', async () => {
      // Fail first 2 attempts, succeed on 3rd
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({ error: 'Temporary error' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({ error: 'Temporary error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            model: 'llama3.1:8b',
            message: { role: 'assistant', content: 'Success!' },
            done: true,
          }),
        });

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result.content).toBe('Success!');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors (4xx except 429)', async () => {
      // Client errors (4xx except 429) should not be retried
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'Invalid request' }),
      });

      try {
        await provider.chat([{ role: 'user', content: 'Test' }]);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect((error as Error).name).toBe('LLMProviderError');
      }

      // Should only be called once (no retries for 4xx errors)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('health check and model listing', () => {
    it('should perform health check', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const isHealthy = await provider.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.any(Object)
      );
    });

    it('should return false on health check failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const isHealthy = await provider.healthCheck();

      expect(isHealthy).toBe(false);
    });

    it('should list available models', async () => {
      // Initialize first - needs TWO mocks
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        });

      await provider.initialize(baseConfig);

      // Then mock the listModels call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama3.1:8b' },
            { name: 'mistral:latest' },
            { name: 'codellama:7b' },
          ],
        }),
      });

      const models = await provider.listModels();

      expect(models).toEqual(['llama3.1:8b', 'mistral:latest', 'codellama:7b']);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens using heuristic', () => {
      const text = 'This is a test sentence with multiple words.';
      const tokens = provider.estimateTokens(text);

      // ~1.3 tokens per word, 8 words = ~10 tokens
      expect(tokens).toBeGreaterThan(8);
      expect(tokens).toBeLessThan(15);
    });
  });

  describe('disposal', () => {
    it('should dispose and reset initialized state', async () => {
      // Initialize provider - needs TWO mocks
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
        });

      await provider.initialize(baseConfig);
      expect(provider.isInitialized()).toBe(true);

      await provider.dispose();
      expect(provider.isInitialized()).toBe(false);
    });
  });
});
