/**
 * Comprehensive Benchmark Suite Runner
 *
 * Orchestrates multiple benchmark suites:
 * - Semantic Search: Index build, query latency, relevance
 * - Module Parsing: Parse performance, throughput
 * - Embedding Providers: Provider comparison, latency, throughput
 * - Memory Profile: Memory usage, leak detection, growth analysis
 *
 * Usage:
 *   npm run bench              # Run all benchmarks
 *   npm run bench:semantic     # Run semantic search only
 *   npm run bench:parsing      # Run module parsing only
 *   npm run bench:providers    # Run embedding providers only
 *   npm run bench:memory       # Run memory profiling only
 *
 * Environment variables:
 *   BENCH_N=50                 # Number of iterations
 *   BENCH_EXPORT=results.json  # Export results to JSON
 *   BENCH_SUITE=semantic       # Run specific suite
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionContainer } from '../modules/core/index.js';
import { SemanticSearchBenchmark } from './suites/semantic_search.js';
import { ModuleParsingBenchmark } from './suites/module_parsing.js';
// import { EmbeddingProviderBenchmark } from './suites/embedding_providers.js';
import { MemoryProfileBenchmark } from './suites/memory_profile.js';
import { exportResultsJSON, type BenchmarkResult } from './utils/metrics.js';
import { configSchema, type ServerConfig } from '../config/config.schema.js';

const DEFAULT_CONFIG = {
  embeddingProvider: { type: 'transformers' as const },
  searchProvider: { name: 'fuzzy' as const },
};

type SuiteName = 'semantic' | 'parsing' | 'providers' | 'memory' | 'all';

interface BenchmarkRunnerConfig {
  suites?: SuiteName[];
  exportFile?: string;
  verbose?: boolean;
}

/**
 * Load server configuration from config.json or use defaults.
 */
function loadConfig(): ServerConfig {
  const configPath = join(process.cwd(), 'config.json');

  if (!existsSync(configPath)) {
    console.log(
      'ℹ️  No config.json found, using default configuration (Transformers.js)'
    );
    return configSchema.parse(DEFAULT_CONFIG);
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const rawConfig: unknown = JSON.parse(configContent);
    const parsed = configSchema.parse(rawConfig);
    console.log(
      `ℹ️  Loaded config from config.json (provider: ${parsed.embeddingProvider.type})`
    );
    return parsed;
  } catch (error) {
    console.error('⚠️  Failed to load configuration from config.json:', error);
    console.error('   Falling back to default configuration (Transformers.js)');
    return configSchema.parse(DEFAULT_CONFIG);
  }
}

class BenchmarkRunner {
  private results: BenchmarkResult<unknown>[] = [];

  constructor(private config: BenchmarkRunnerConfig = {}) {}

  async run(): Promise<void> {
    const suites = this.config.suites ?? ['all'];
    const runAll = suites.includes('all');

    console.log('');
    console.log('🚀 Starting Comprehensive Benchmark Suite');
    console.log('═'.repeat(80));
    console.log('');

    // Load configuration and create container
    const serverConfig = loadConfig();
    const container = createProductionContainer(
      serverConfig.moduleDirectory,
      serverConfig
    );

    // Semantic Search Benchmark
    if (runAll || suites.includes('semantic')) {
      await this.runSuite('Semantic Search', async () => {
        const benchmark = new SemanticSearchBenchmark(
          container.getInstructionModuleParser(),
          container.getSemanticSearchService()
        );
        const result = await benchmark.run();
        benchmark.printReport(result);
        return result;
      });
    }

    // Module Parsing Benchmark
    if (runAll || suites.includes('parsing')) {
      await this.runSuite('Module Parsing', async () => {
        const benchmark = new ModuleParsingBenchmark(
          container.getInstructionModuleParser()
        );
        const result = await benchmark.run();
        benchmark.printReport(result);
        return result;
      });
    }

    // Embedding Provider Benchmark
    // Note: Disabled until IEmbeddingProvider interface is exposed
    // if (runAll || suites.includes('providers')) {
    //   await this.runSuite('Embedding Providers', async () => {
    //     const providers = new Map();
    //     const benchmark = new EmbeddingProviderBenchmark(providers);
    //     const result = await benchmark.run();
    //     benchmark.printReport(result);
    //     return result;
    //   });
    // }

    // Memory Profile Benchmark
    if (runAll || suites.includes('memory')) {
      await this.runSuite('Memory Profile', async () => {
        const benchmark = new MemoryProfileBenchmark(
          container.getInstructionModuleParser(),
          container.getSemanticSearchService()
        );
        const result = await benchmark.run();
        benchmark.printReport(result);
        return result;
      });
    }

    // Summary
    this.printSummary();

    // Export if requested
    if (this.config.exportFile) {
      exportResultsJSON(this.results, this.config.exportFile);
    }
  }

  private async runSuite<T = Record<string, unknown>>(
    name: string,
    fn: () => Promise<BenchmarkResult<T>>
  ): Promise<void> {
    console.log(`Running ${name} benchmark...`);
    console.log('');

    try {
      const result = await fn();
      this.results.push(result);
    } catch (error) {
      const errorResult: BenchmarkResult<T> = {
        name,
        timestamp: new Date().toISOString(),
        success: false,
        metrics: {} as T,
        error: (error as Error).message,
      };
      this.results.push(errorResult);
      console.error(`❌ ${name} benchmark failed: ${(error as Error).message}`);
      console.log('');
    }
  }

  private printSummary(): void {
    console.log('');
    console.log('═'.repeat(80));
    console.log('📊 BENCHMARK SUMMARY');
    console.log('═'.repeat(80));
    console.log('');

    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;

    console.log(`Total suites run: ${this.results.length.toString()}`);
    console.log(`Successful: ${successful.toString()} ✓`);
    console.log(`Failed: ${failed.toString()} ✗`);
    console.log('');

    if (failed > 0) {
      console.log('Failed suites:');
      for (const result of this.results.filter(r => !r.success)) {
        console.log(`  ✗ ${result.name}: ${result.error ?? 'Unknown error'}`);
      }
      console.log('');
    }

    console.log('Completed at:', new Date().toISOString());
    console.log('═'.repeat(80));
    console.log('');
  }
}

async function main(): Promise<void> {
  // Parse command line arguments and environment variables
  const suite = (process.env.BENCH_SUITE ?? 'all') as SuiteName;
  const exportFile = process.env.BENCH_EXPORT;
  const verbose = process.env.BENCH_VERBOSE === 'true';

  const suites: SuiteName[] = suite === 'all' ? ['all'] : [suite];

  const config: BenchmarkRunnerConfig = {
    suites,
    verbose,
  };
  if (exportFile) {
    config.exportFile = exportFile;
  }

  const runner = new BenchmarkRunner(config);

  await runner.run();
}

main().catch((err: unknown) => {
  console.error('Benchmark runner failed:', err);
  process.exitCode = 1;
});
