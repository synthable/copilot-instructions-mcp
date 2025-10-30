# Comprehensive Benchmark Suite

A modular benchmarking framework for measuring performance, memory usage, and quality metrics across the MCP server codebase.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Benchmark Suites](#benchmark-suites)
  - [1. Semantic Search Benchmark](#1-semantic-search-benchmark)
  - [2. Module Parsing Benchmark](#2-module-parsing-benchmark)
  - [3. Embedding Provider Comparison](#3-embedding-provider-comparison)
  - [4. Memory Profiling Benchmark](#4-memory-profiling-benchmark)
- [Environment Variables](#environment-variables)
- [Utilities](#utilities)
  - [Functions](#functions)
  - [Types](#types)
- [Output](#output)
  - [Console Output](#console-output)
  - [JSON Export](#json-export)
- [Best Practices](#best-practices)
  - [1. Warmup Runs](#1-warmup-runs)
  - [2. GC Control](#2-gc-control)
  - [3. Consistent Environment](#3-consistent-environment)
  - [4. Iteration Count](#4-iteration-count)
  - [5. Export and Track](#5-export-and-track)
- [Adding New Benchmarks](#adding-new-benchmarks)
- [Troubleshooting](#troubleshooting)
  - [High Variance in Results](#high-variance-in-results)
  - [Memory Measurements Inaccurate](#memory-measurements-inaccurate)
  - [Benchmark Timeout](#benchmark-timeout)
  - [Provider Comparison Fails](#provider-comparison-fails)
- [Contributing](#contributing)
- [License](#license)

## Overview

This benchmark suite provides comprehensive performance testing across multiple dimensions:

- **Semantic Search**: Index build performance, query latency, relevance metrics
- **Module Parsing**: YAML parsing throughput, cold/warm performance
- **Embedding Providers**: Provider comparison, latency, throughput analysis
- **Memory Profiling**: Memory usage tracking, leak detection, growth analysis

## Quick Start

```bash
# Run all benchmarks
npm run bench

# Run specific benchmark suite
npm run bench:semantic
npm run bench:parsing
npm run bench:providers
npm run bench:memory

# Run with custom iterations
BENCH_N=100 npm run bench:semantic

# Export results to JSON
BENCH_EXPORT=results.json npm run bench
```

## Architecture

```
src/benchmarks/
├── benchmark.ts              # Main orchestrator/runner
├── semantic_benchmark.ts     # Legacy entry point (backward compatible)
├── suites/                   # Individual benchmark suites
│   ├── semantic_search.ts    # Semantic search benchmarks
│   ├── module_parsing.ts     # Module parsing benchmarks
│   ├── embedding_providers.ts # Provider comparison
│   └── memory_profile.ts     # Memory profiling
└── utils/
    └── metrics.ts            # Shared utilities and helpers
```

## Benchmark Suites

### 1. Semantic Search Benchmark

Measures semantic search service performance and quality.

**Metrics:**

- Cold index build time and peak memory
- Warm query latency (p50, p95, p99, min, max, mean)
- Index size estimation
- Optional relevance evaluation (hits@k, precision@k)

**Usage:**

```bash
npm run bench:semantic

# Custom iterations
BENCH_N=50 npm run bench:semantic

# With relevance evaluation
# Create bench/relevance.json first
npm run bench:semantic
```

**Relevance Evaluation:**

Create `bench/relevance.json` to enable relevance testing:

```json
{
  "k": 5,
  "queries": [
    {
      "q": "semantic search implementation",
      "relevantIds": ["module-id-1", "module-id-2"]
    }
  ]
}
```

### 2. Module Parsing Benchmark

Measures YAML module parsing performance.

**Metrics:**

- Cold parse duration and memory delta
- Warm parse latency (p50, p95, p99)
- Throughput (modules/sec, ms/module)
- Memory footprint

**Usage:**

```bash
npm run bench:parsing

# Custom iterations
BENCH_N=20 npm run bench:parsing
```

### 3. Embedding Provider Comparison

Compares different embedding providers side-by-side.

**Metrics:**

- Initialization time and memory
- Single embedding latency
- Batch embedding throughput
- Memory footprint per provider
- Recommendations for different use cases

**Usage:**

```bash
npm run bench:providers
```

**Supported Providers:**

- Transformers.js (local, offline)
- Ollama (local API)
- OpenAI (cloud API) - if configured
- Cohere (cloud API) - if configured

### 4. Memory Profiling Benchmark

Tracks memory usage and detects potential leaks.

**Metrics:**

- Baseline memory usage
- Memory deltas (module load, index build, operations)
- Peak RSS tracking
- Memory growth analysis
- Linear regression for leak detection
- Confidence scoring

**Usage:**

```bash
npm run bench:memory

# With GC exposure for accurate measurements
node --expose-gc dist/benchmarks/benchmark.js
BENCH_SUITE=memory npm run bench:memory
```

**Leak Detection:**

The memory profiling suite uses linear regression to detect consistent memory growth:

- **Slope**: Memory growth rate (MB/iteration)
- **R²**: Consistency of growth (0-1, higher = more consistent)
- **Suspected Leak**: Flagged when slope > 0.01 and R² > 0.8

## Environment Variables

| Variable        | Description            | Default | Example                     |
| --------------- | ---------------------- | ------- | --------------------------- |
| `BENCH_SUITE`   | Which suite to run     | `all`   | `BENCH_SUITE=semantic`      |
| `BENCH_N`       | Number of iterations   | `30`    | `BENCH_N=100`               |
| `BENCH_EXPORT`  | Export results to JSON | -       | `BENCH_EXPORT=results.json` |
| `BENCH_VERBOSE` | Verbose output         | `false` | `BENCH_VERBOSE=true`        |

## Utilities

The `utils/metrics.ts` module provides shared utilities:

### Functions

- `rssMB()`: Get current RSS memory in MB
- `memorySnapshotMB()`: Get detailed memory snapshot
- `calcPercentiles(samples)`: Calculate p50, p95, p99, min, max, mean
- `formatMs(ms)`: Format milliseconds for display
- `formatBytes(bytes)`: Format bytes for display
- `monitorPeakMemory(fn)`: Monitor peak memory during async operation
- `timedBenchmark(fn, iterations, warmup)`: Run timed benchmark with warmup
- `formatResultsTable(results)`: Format results as table
- `exportResultsJSON(results, filename)`: Export results to JSON

### Types

```typescript
interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
}

interface MemorySnapshot {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

interface BenchmarkResult {
  name: string;
  timestamp: string;
  success: boolean;
  metrics: Record<string, unknown>;
  error?: string;
}
```

## Output

### Console Output

Each benchmark suite provides formatted console output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Semantic Search Benchmark Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Model: Xenova/all-mpnet-base-v2 (dims=768)
Indexed items: 15
Index size (vectors): 0.04 MB

Cold Build:
  Peak RSS: 245.2 MB

Warm Queries (N=30):
  p50:  15.23 ms
  p95:  28.45 ms
  p99:  32.11 ms
  min:  12.34 ms
  max:  35.67 ms
  mean: 16.89 ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### JSON Export

Export results for historical tracking and analysis:

```bash
BENCH_EXPORT=results-$(date +%Y%m%d).json npm run bench
```

Results are saved to `benchmark-results/` directory:

```json
[
  {
    "name": "Semantic Search",
    "timestamp": "2025-10-30T12:34:56.789Z",
    "success": true,
    "metrics": {
      "model": "Xenova/all-mpnet-base-v2",
      "dimensions": 768,
      "itemsIndexed": 15,
      "warmQueries": {
        "p50ms": 15.23,
        "p95ms": 28.45
      }
    }
  }
]
```

## Best Practices

### 1. Warmup Runs

Always include warmup runs to avoid one-time initialization costs:

```typescript
const { samples } = await timedBenchmark(
  async () => await operation(),
  iterations,
  warmupRuns // Default: 1-2 runs
);
```

### 2. GC Control

For accurate memory measurements, run with `--expose-gc`:

```bash
node --expose-gc dist/benchmarks/benchmark.js
```

### 3. Consistent Environment

- Run benchmarks on idle systems
- Close unnecessary applications
- Use consistent Node.js versions
- Run multiple times and average results

### 4. Iteration Count

Choose appropriate iteration counts:

- **Quick validation**: 10-20 iterations
- **Standard benchmarks**: 30-50 iterations
- **Statistical significance**: 100+ iterations

### 5. Export and Track

Export results regularly to track performance over time:

```bash
# Daily benchmark
BENCH_EXPORT=results-$(date +%Y%m%d).json npm run bench

# Compare with historical data
node scripts/compare-benchmarks.js results-20251029.json results-20251030.json
```

## Adding New Benchmarks

To add a new benchmark suite:

1. Create a new file in `suites/` directory:

```typescript
// src/benchmarks/suites/my_benchmark.ts
import { BenchmarkResult } from '../utils/metrics.js';

export class MyBenchmark {
  async run(): Promise<BenchmarkResult> {
    // Implement benchmark logic
    return {
      name: 'My Benchmark',
      timestamp: new Date().toISOString(),
      success: true,
      metrics: {
        /* your metrics */
      },
    };
  }

  printReport(result: BenchmarkResult): void {
    // Format and print results
  }
}
```

2. Register in `benchmark.ts`:

```typescript
import { MyBenchmark } from './suites/my_benchmark.js';

// Add to SuiteName type
type SuiteName =
  | 'semantic'
  | 'parsing'
  | 'providers'
  | 'memory'
  | 'my-benchmark'
  | 'all';

// Add to runner
if (runAll || suites.includes('my-benchmark')) {
  await this.runSuite('My Benchmark', async () => {
    const benchmark = new MyBenchmark(/* dependencies */);
    const result = await benchmark.run();
    benchmark.printReport(result);
    return result;
  });
}
```

3. Add npm script to `package.json`:

```json
{
  "scripts": {
    "bench:my-benchmark": "npm run build && BENCH_SUITE=my-benchmark node dist/benchmarks/benchmark.js"
  }
}
```

## Troubleshooting

### High Variance in Results

- Increase warmup runs
- Increase iteration count
- Close background applications
- Run on dedicated hardware

### Memory Measurements Inaccurate

- Run with `--expose-gc` flag
- Increase sampling frequency
- Force GC between operations

### Benchmark Timeout

- Reduce iteration count
- Check for blocking operations
- Verify external dependencies (Ollama, etc.)

### Provider Comparison Fails

- Verify provider configurations in `config.json`
- Check external service availability (Ollama, OpenAI)
- Review provider initialization errors

## Contributing

When adding new benchmarks:

1. Follow existing patterns in `suites/` directory
2. Use shared utilities from `utils/metrics.ts`
3. Provide clear console output with `printReport()`
4. Include proper error handling
5. Document metrics and configuration options
6. Add tests for benchmark logic (not required for measurements)

## License

Same as parent project.
