/**
 * @fileoverview Partial failure tests for TransformersEmbeddingProvider
 *
 * Tests for partial batch failure handling in the TransformersEmbeddingProvider.
 * When some items in a batch fail, the provider continues processing remaining items
 * and returns partial results with empty arrays for failed items.
 *
 * @author MCP Server Team
 * @version 2.0.0
 * @since 2.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransformersEmbeddingProvider } from './transformersProvider.js';
import type { EmbeddingProviderConfig } from './embeddingProvider.interface.js';
import { EmbeddingGenerationError } from './embeddingProvider.interface.js';

// Mock @xenova/transformers
const mockPipeline = vi.fn();
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(() => mockPipeline),
}));

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => mockLogger,
}));

describe('TransformersEmbeddingProvider - Partial Failures', () => {
  let provider: TransformersEmbeddingProvider;
  let mockConfig: EmbeddingProviderConfig;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockConfig = {
      type: 'transformers',
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 3,
    };

    provider = new TransformersEmbeddingProvider();

    // Setup for initialization
    mockPipeline.mockResolvedValue({ data: [0.1, 0.2, 0.3] });
    await provider.initialize(mockConfig);
    mockPipeline.mockClear();
  });

  it('should handle partial batch failures gracefully', async () => {
    // Setup: First item succeeds, second fails, third succeeds
    mockPipeline
      .mockResolvedValueOnce({ data: [0.1, 0.2, 0.3] })
      .mockRejectedValueOnce(new Error('Invalid input text'))
      .mockResolvedValueOnce({ data: [0.4, 0.5, 0.6] });

    const texts = ['valid-text-1', 'invalid-text', 'valid-text-2'];

    // Execute
    const results = await provider.embedBatch(texts);

    // Verify: Should return partial results with empty array for failed item
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual([0.1, 0.2, 0.3]); // First item succeeded
    expect(results[1]).toEqual([]); // Second item failed - empty array placeholder
    expect(results[2]).toEqual([0.4, 0.5, 0.6]); // Third item succeeded

    // Verify warning was logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Partial batch failure'),
      undefined,
      expect.objectContaining({ failedIndices: [1] })
    );

    // Verify error was logged for failed item
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to generate embedding for item 1'),
      expect.any(Error),
      expect.objectContaining({ index: 1 })
    );
  });

  it('should throw when ALL items in batch fail', async () => {
    // Setup: All items fail
    mockPipeline.mockRejectedValue(new Error('Processing failed'));

    const texts = ['text1', 'text2', 'text3'];

    // Execute & Verify: Should throw when all items fail
    await expect(provider.embedBatch(texts)).rejects.toThrow(EmbeddingGenerationError);
    await expect(provider.embedBatch(texts)).rejects.toThrow(
      /All 3 items in batch failed/
    );

    // Verify errors were logged for each item
    expect(mockLogger.error).toHaveBeenCalledTimes(6); // 3 items × 2 attempts
  });

  it('should maintain correct result ordering with partial failures', async () => {
    // Setup: Items 0, 2, 4 succeed; items 1, 3 fail
    mockPipeline
      .mockResolvedValueOnce({ data: [0.1, 0.2, 0.3] }) // Item 0
      .mockRejectedValueOnce(new Error('Fail 1')) // Item 1
      .mockResolvedValueOnce({ data: [0.4, 0.5, 0.6] }) // Item 2
      .mockRejectedValueOnce(new Error('Fail 2')) // Item 3
      .mockResolvedValueOnce({ data: [0.7, 0.8, 0.9] }); // Item 4

    const texts = ['text0', 'text1', 'text2', 'text3', 'text4'];

    // Execute
    const results = await provider.embedBatch(texts);

    // Verify: Results maintain order with empty arrays for failures
    expect(results).toHaveLength(5);
    expect(results[0]).toEqual([0.1, 0.2, 0.3]);
    expect(results[1]).toEqual([]);
    expect(results[2]).toEqual([0.4, 0.5, 0.6]);
    expect(results[3]).toEqual([]);
    expect(results[4]).toEqual([0.7, 0.8, 0.9]);

    // Verify warning includes both failed indices
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Partial batch failure: 2/5'),
      undefined,
      expect.objectContaining({ failedIndices: [1, 3] })
    );
  });

  it('should log detailed error information for each failed item', async () => {
    // Setup
    const error1 = new Error('Specific error for item 0');
    const error2 = new Error('Specific error for item 2');

    mockPipeline
      .mockRejectedValueOnce(error1)
      .mockResolvedValueOnce({ data: [0.1, 0.2, 0.3] })
      .mockRejectedValueOnce(error2);

    const texts = ['fail-text-1', 'valid-text', 'fail-text-2'];

    // Execute
    await provider.embedBatch(texts);

    // Verify: Each error logged with item details
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to generate embedding for item 0 in batch',
      error1,
      expect.objectContaining({
        index: 0,
        text: 'fail-text-1',
      })
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to generate embedding for item 2 in batch',
      error2,
      expect.objectContaining({
        index: 2,
        text: 'fail-text-2',
      })
    );
  });

  it('should not log warning when all items succeed', async () => {
    // Setup: All items succeed
    mockPipeline.mockResolvedValue({ data: [0.1, 0.2, 0.3] });

    const texts = ['text1', 'text2', 'text3'];

    // Execute
    const results = await provider.embedBatch(texts);

    // Verify: No warnings logged
    expect(results).toHaveLength(3);
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
