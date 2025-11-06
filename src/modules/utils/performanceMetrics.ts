/**
 * @fileoverview Performance metrics collection and benchmarking utilities.
 *
 * This module provides comprehensive performance monitoring, metrics collection,
 * and benchmarking capabilities for the MCP server operations.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import type { ILogger } from '../core/interfaces.js';

/**
 * Performance metrics data structure.
 */
export interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  memoryStart: number;
  memoryEnd: number;
  memoryPeak: number;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated performance statistics.
 */
export interface PerformanceStats {
  operation: string;
  count: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  averageMemoryUsage: number;
  peakMemoryUsage: number;
}

/**
 * Performance timer for measuring operation duration and memory usage.
 */
export class PerformanceTimer {
  private startTime: number;
  private startMemory: number;
  private peakMemory: number;
  private memoryInterval?: NodeJS.Timeout;

  constructor(
    private operation: string,
    private logger: ILogger,
    private metadata?: Record<string, unknown>
  ) {
    this.startTime = performance.now();
    this.startMemory = process.memoryUsage().rss;
    this.peakMemory = this.startMemory;

    // Monitor peak memory usage during operation
    this.memoryInterval = setInterval(() => {
      const currentMemory = process.memoryUsage().rss;
      if (currentMemory > this.peakMemory) {
        this.peakMemory = currentMemory;
      }
    }, 100);

    this.logger.debug(`Started performance timer for: ${operation}`);
  }

  /**
   * Stops the timer and returns performance metrics.
   */
  stop(): PerformanceMetrics {
    const endTime = performance.now();
    const endMemory = process.memoryUsage().rss;
    const duration = endTime - this.startTime;

    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
    }

    const metrics: PerformanceMetrics = {
      operation: this.operation,
      startTime: this.startTime,
      endTime,
      duration,
      memoryStart: this.startMemory,
      memoryEnd: endMemory,
      memoryPeak: this.peakMemory,
      ...(this.metadata && { metadata: this.metadata }),
    };

    this.logger.debug(`Performance timer completed for: ${this.operation}`, {
      duration: `${duration.toFixed(2)}ms`,
      memoryDelta: `${((endMemory - this.startMemory) / 1024 / 1024).toFixed(2)}MB`,
      peakMemory: `${(this.peakMemory / 1024 / 1024).toFixed(2)}MB`,
    });

    return metrics;
  }
}

/**
 * Performance metrics collector and analyzer.
 */
export class PerformanceCollector {
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 metrics

  constructor(private logger: ILogger) {}

  /**
   * Records a performance metric.
   */
  record(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Maintain size limit
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log slow operations
    if (metric.duration > 5000) {
      // 5 seconds
      this.logger.warn(
        `Slow operation detected: ${metric.operation} took ${metric.duration.toFixed(2)}ms`
      );
    }
  }

  /**
   * Starts a new performance timer.
   */
  startTimer(operation: string, metadata?: Record<string, unknown>): PerformanceTimer {
    return new PerformanceTimer(operation, this.logger, metadata);
  }

  /**
   * Times an async operation and automatically records metrics.
   */
  async time<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const timer = this.startTimer(operation, metadata);
    try {
      const result = await fn();
      this.record(timer.stop());
      return result;
    } catch (error) {
      const metrics = timer.stop();
      metrics.metadata = {
        ...metrics.metadata,
        error: error instanceof Error ? error.message : 'Unknown error',
        failed: true,
      };
      this.record(metrics);
      throw error;
    }
  }

  /**
   * Gets performance statistics for a specific operation.
   */
  getStats(operation: string): PerformanceStats | null {
    const operationMetrics = this.metrics.filter(m => m.operation === operation);

    if (operationMetrics.length === 0) {
      return null;
    }

    const durations = operationMetrics.map(m => m.duration).sort((a, b) => a - b);
    const memoryUsages = operationMetrics.map(
      m => (m.memoryEnd - m.memoryStart) / 1024 / 1024
    );
    const peakMemories = operationMetrics.map(m => m.memoryPeak / 1024 / 1024);

    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const percentile = (p: number): number =>
      durations[Math.floor((durations.length - 1) * p)];

    return {
      operation,
      count: operationMetrics.length,
      totalDuration,
      averageDuration: totalDuration / operationMetrics.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50Duration: percentile(0.5),
      p95Duration: percentile(0.95),
      p99Duration: percentile(0.99),
      averageMemoryUsage:
        memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length,
      peakMemoryUsage: Math.max(...peakMemories),
    };
  }

  /**
   * Gets statistics for all recorded operations.
   */
  getAllStats(): PerformanceStats[] {
    const operations = [...new Set(this.metrics.map(m => m.operation))];
    return operations
      .map(op => this.getStats(op))
      .filter((stats): stats is PerformanceStats => stats !== null);
  }

  /**
   * Generates a performance report.
   */
  generateReport(): string {
    const stats = this.getAllStats().sort((a, b) => b.totalDuration - a.totalDuration);

    let report = 'Performance Report\n';
    report += '==================\n\n';

    for (const stat of stats) {
      report += `Operation: ${stat.operation}\n`;
      report += `  Count: ${stat.count.toString()}\n`;
      report += `  Total Duration: ${stat.totalDuration.toFixed(2)}ms\n`;
      report += `  Average Duration: ${stat.averageDuration.toFixed(2)}ms\n`;
      report += `  Min/Max Duration: ${stat.minDuration.toFixed(2)}ms / ${stat.maxDuration.toFixed(2)}ms\n`;
      report += `  Percentiles: P50=${stat.p50Duration.toFixed(2)}ms P95=${stat.p95Duration.toFixed(2)}ms P99=${stat.p99Duration.toFixed(2)}ms\n`;
      report += `  Average Memory: ${stat.averageMemoryUsage.toFixed(2)}MB\n`;
      report += `  Peak Memory: ${stat.peakMemoryUsage.toFixed(2)}MB\n`;
      report += '\n';
    }

    return report;
  }

  /**
   * Clears all recorded metrics.
   */
  clear(): void {
    const count = this.metrics.length;
    this.metrics = [];
    this.logger.debug(`Cleared ${count.toString()} performance metrics`);
  }

  /**
   * Gets raw metrics data.
   */
  getRawMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Exports metrics to JSON format.
   */
  exportMetrics(): string {
    return JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        totalMetrics: this.metrics.length,
        stats: this.getAllStats(),
        rawMetrics: this.metrics,
      },
      null,
      2
    );
  }
}

/**
 * Benchmarking utilities for performance testing.
 */
export class BenchmarkRunner {
  constructor(
    private collector: PerformanceCollector,
    private logger: ILogger
  ) {}

  /**
   * Runs a benchmark test multiple times and collects statistics.
   */
  async runBenchmark<T>(
    name: string,
    testFn: () => Promise<T>,
    options: {
      iterations?: number;
      warmupIterations?: number;
      timeout?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<{
    stats: PerformanceStats;
    results: T[];
    errors: Error[];
  }> {
    const {
      iterations = 10,
      warmupIterations = 2,
      timeout = 60000,
      metadata = {},
    } = options;

    this.logger.info(
      `Running benchmark: ${name} (${iterations.toString()} iterations, ${warmupIterations.toString()} warmup)`
    );

    const results: T[] = [];
    const errors: Error[] = [];

    // Warmup runs
    for (let i = 0; i < warmupIterations; i++) {
      try {
        this.logger.debug(
          `Warmup ${(i + 1).toString()}/${warmupIterations.toString()}`
        );
        await this.runWithTimeout(testFn, timeout);
      } catch (error) {
        this.logger.warn(
          `Warmup ${(i + 1).toString()} failed`,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Actual benchmark runs
    for (let i = 0; i < iterations; i++) {
      try {
        this.logger.debug(
          `Benchmark iteration ${(i + 1).toString()}/${iterations.toString()}`
        );
        const result = await this.collector.time(
          `benchmark_${name}`,
          () => this.runWithTimeout(testFn, timeout),
          { iteration: i + 1, ...metadata }
        );
        results.push(result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
        this.logger.warn(`Benchmark iteration ${(i + 1).toString()} failed`, err);
      }
    }

    const stats = this.collector.getStats(`benchmark_${name}`);
    if (!stats) {
      throw new Error(`No statistics available for benchmark: ${name}`);
    }

    this.logger.info(`Benchmark completed: ${name}`, {
      successfulRuns: results.length.toString(),
      errors: errors.length.toString(),
      averageDuration: `${stats.averageDuration.toFixed(2)}ms`,
      p95Duration: `${stats.p95Duration.toFixed(2)}ms`,
    });

    return { stats, results, errors };
  }

  /**
   * Runs a function with a timeout.
   */
  private async runWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout.toString()}ms`));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }
}
