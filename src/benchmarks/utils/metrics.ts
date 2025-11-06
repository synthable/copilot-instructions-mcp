/**
 * Shared utilities for benchmark metrics collection and reporting.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
}

export interface MemorySnapshot {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface BenchmarkResult<T = Record<string, unknown>> {
  name: string;
  timestamp: string;
  success: boolean;
  metrics: T;
  error?: string;
}

/**
 * Get current RSS memory in MB
 */
export function rssMB(): number {
  return process.memoryUsage().rss / (1024 * 1024);
}

/**
 * Get detailed memory snapshot in MB
 */
export function memorySnapshotMB(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss / (1024 * 1024),
    heapTotal: mem.heapTotal / (1024 * 1024),
    heapUsed: mem.heapUsed / (1024 * 1024),
    external: mem.external / (1024 * 1024),
    arrayBuffers: mem.arrayBuffers / (1024 * 1024),
  };
}

/**
 * Calculate percentiles from an array of samples
 */
export function calcPercentiles(samplesMs: number[]): Percentiles {
  if (samplesMs.length === 0) {
    return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
  }

  const sorted = [...samplesMs].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.floor(q * (sorted.length - 1))] ?? sorted[sorted.length - 1];

  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / sorted.length;

  return {
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean,
  };
}

/**
 * Format milliseconds for display
 */
export function formatMs(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)} μs`;
  } else if (ms < 1000) {
    return `${ms.toFixed(2)} ms`;
  } else {
    return `${(ms / 1000).toFixed(2)} s`;
  }
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Monitor peak memory usage during an async operation
 */
export async function monitorPeakMemory<T>(
  fn: () => Promise<T>,
  sampleIntervalMs = 50
): Promise<{ result: T; peakRssMB: number }> {
  let peak = rssMB();
  const sampler = setInterval(() => {
    const current = rssMB();
    if (current > peak) peak = current;
  }, sampleIntervalMs);

  try {
    const result = await fn();
    clearInterval(sampler);
    peak = Math.max(peak, rssMB());
    return { result, peakRssMB: peak };
  } catch (error) {
    clearInterval(sampler);
    throw error;
  }
}

/**
 * Run a timed benchmark with multiple iterations
 */
export async function timedBenchmark<T>(
  fn: () => Promise<T>,
  iterations: number,
  warmupRuns = 1
): Promise<{ samples: number[]; results: T[] }> {
  const samples: number[] = [];
  const results: T[] = [];

  // Warmup runs
  for (let i = 0; i < warmupRuns; i++) {
    await fn();
  }

  // Actual benchmark runs
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    samples.push(end - start);
    results.push(result);
  }

  return { samples, results };
}

/**
 * Format benchmark results as a table
 */
export function formatResultsTable(results: BenchmarkResult<unknown>[]): string {
  const lines: string[] = [];
  lines.push('='.repeat(80));
  lines.push('BENCHMARK RESULTS');
  lines.push('='.repeat(80));
  lines.push('');

  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    lines.push(`${status} ${result.name}`);
    lines.push(`  Timestamp: ${result.timestamp}`);

    if (result.success && result.metrics && typeof result.metrics === 'object') {
      for (const [key, value] of Object.entries(
        result.metrics as Record<string, unknown>
      )) {
        lines.push(`  ${key}: ${JSON.stringify(value)}`);
      }
    } else if (!result.success) {
      lines.push(`  Error: ${result.error ?? 'Unknown error'}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(80));
  return lines.join('\n');
}

/**
 * Export results to JSON file
 */
export function exportResultsJSON(
  results: BenchmarkResult<unknown>[],
  filename: string
): void {
  const outputDir = join(process.cwd(), 'benchmark-results');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = join(outputDir, filename);
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Results exported to: ${outputPath}`);
}
