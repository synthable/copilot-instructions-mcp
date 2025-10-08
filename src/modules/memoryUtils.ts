/**
 * @fileoverview Memory management utilities for performance optimization.
 *
 * This module provides utilities for monitoring memory usage, implementing
 * streaming patterns, and managing memory-aware processing for large datasets.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import type { ILogger } from './interfaces.js';

/**
 * Memory usage information.
 */
export interface MemoryInfo {
  usedMB: number;
  totalMB: number;
  percentUsed: number;
}

/**
 * Memory monitor for tracking and managing memory usage.
 */
export class MemoryMonitor {
  constructor(
    private maxMemoryMB: number,
    private logger: ILogger
  ) {}

  /**
   * Gets current memory usage information.
   */
  getMemoryInfo(): MemoryInfo {
    const memUsage = process.memoryUsage();
    const usedMB = memUsage.rss / (1024 * 1024);
    const totalMB = this.maxMemoryMB;
    const percentUsed = (usedMB / totalMB) * 100;

    return {
      usedMB: Math.round(usedMB * 100) / 100,
      totalMB,
      percentUsed: Math.round(percentUsed * 100) / 100,
    };
  }

  /**
   * Checks if memory usage is approaching the limit.
   */
  isMemoryPressure(threshold = 80): boolean {
    const info = this.getMemoryInfo();
    return info.percentUsed >= threshold;
  }

  /**
   * Logs current memory usage.
   */
  logMemoryUsage(context: string): void {
    const info = this.getMemoryInfo();
    this.logger.debug(
      `Memory usage (${context}): ${info.usedMB.toString()}MB / ${info.totalMB.toString()}MB (${info.percentUsed.toString()}%)`
    );
  }

  /**
   * Forces garbage collection if available and memory pressure is high.
   */
  suggestGarbageCollection(): void {
    if (this.isMemoryPressure(70)) {
      this.logger.debug('Memory pressure detected, suggesting garbage collection');
      if (global.gc) {
        global.gc();
        this.logMemoryUsage('after GC');
      }
    }
  }

  /**
   * Calculates optimal batch size based on available memory.
   */
  calculateOptimalBatchSize(
    itemSizeBytes: number,
    maxBatchSize: number,
    minBatchSize = 1
  ): number {
    const info = this.getMemoryInfo();
    const availableMB = info.totalMB * 0.8 - info.usedMB; // Keep 20% buffer
    const availableBytes = availableMB * 1024 * 1024;

    const calculatedBatchSize = Math.floor(availableBytes / itemSizeBytes);
    const optimalBatchSize = Math.max(
      minBatchSize,
      Math.min(maxBatchSize, calculatedBatchSize)
    );

    this.logger.debug(
      `Calculated optimal batch size: ${optimalBatchSize.toString()} (available: ${availableMB.toFixed(1)}MB)`
    );
    return optimalBatchSize;
  }
}

/**
 * Streaming processor for handling large datasets in memory-efficient chunks.
 */
export class StreamingProcessor<T, R> {
  constructor(
    private memoryMonitor: MemoryMonitor,
    private logger: ILogger
  ) {}

  /**
   * Processes items in memory-aware batches with automatic batch size adjustment.
   */
  async processInBatches(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    options: {
      initialBatchSize: number;
      maxBatchSize: number;
      estimatedItemSizeBytes?: number;
      onProgress?: (processed: number, total: number) => void;
    }
  ): Promise<R[]> {
    const results: R[] = [];
    let currentBatchSize = options.initialBatchSize;
    let processed = 0;

    this.logger.info(
      `Starting streaming processing of ${items.length.toString()} items`
    );
    this.memoryMonitor.logMemoryUsage('before processing');

    for (let i = 0; i < items.length; i += currentBatchSize) {
      // Check memory pressure and adjust batch size
      if (this.memoryMonitor.isMemoryPressure(75)) {
        currentBatchSize = Math.max(1, Math.floor(currentBatchSize * 0.7));
        this.logger.warn(
          `Memory pressure detected, reducing batch size to ${currentBatchSize.toString()}`
        );
        this.memoryMonitor.suggestGarbageCollection();
      } else if (options.estimatedItemSizeBytes) {
        // Calculate optimal batch size based on available memory
        const optimalBatchSize = this.memoryMonitor.calculateOptimalBatchSize(
          options.estimatedItemSizeBytes,
          options.maxBatchSize
        );
        currentBatchSize = Math.min(options.maxBatchSize, optimalBatchSize);
      }

      const batch = items.slice(i, i + currentBatchSize);

      try {
        this.logger.debug(
          `Processing batch ${(Math.floor(i / currentBatchSize) + 1).toString()} (${batch.length.toString()} items)`
        );
        const batchResults = await processor(batch);
        results.push(...batchResults);

        processed += batch.length;
        options.onProgress?.(processed, items.length);

        // Log memory usage periodically
        if (processed % (currentBatchSize * 5) === 0 || processed === items.length) {
          this.memoryMonitor.logMemoryUsage(
            `processed ${processed.toString()}/${items.length.toString()}`
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to process batch starting at index ${i.toString()}`,
          error instanceof Error ? error : undefined
        );
        // Continue with next batch rather than failing entirely
      }
    }

    this.memoryMonitor.logMemoryUsage('after processing');
    this.logger.info(
      `Completed streaming processing: ${results.length.toString()} results from ${items.length.toString()} items`
    );

    return results;
  }
}

/**
 * Lazy loader for content that should only be loaded when needed.
 */
export class LazyContentLoader<T> {
  private cache = new Map<string, { content: T; timestamp: number }>();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(
    private maxCacheSize: number,
    private logger: ILogger
  ) {}

  /**
   * Gets content with lazy loading and caching.
   */
  async getContent(key: string, loader: () => Promise<T>): Promise<T> {
    // Check cache first
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.cacheTimeout) {
      this.logger.debug(`Cache hit for key: ${key}`);
      return cached.content;
    }

    // Load content
    this.logger.debug(`Loading content for key: ${key}`);
    const content = await loader();

    // Manage cache size
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = Array.from(this.cache.entries()).sort(
        ([, a], [, b]) => a.timestamp - b.timestamp
      )[0][0];
      this.cache.delete(oldestKey);
      this.logger.debug(`Evicted oldest cache entry: ${oldestKey}`);
    }

    // Cache the content
    this.cache.set(key, { content, timestamp: now });
    this.logger.debug(
      `Cached content for key: ${key} (cache size: ${this.cache.size.toString()})`
    );

    return content;
  }

  /**
   * Clears the cache.
   */
  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.debug(`Cleared cache of ${size.toString()} entries`);
  }

  /**
   * Gets cache statistics.
   */
  getCacheStats(): { size: number; maxSize: number; keys: string[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      keys: Array.from(this.cache.keys()),
    };
  }
}
