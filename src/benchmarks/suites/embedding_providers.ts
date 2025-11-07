/**
 * Embedding Provider Comparison Benchmark Suite
 *
 * Compares performance of different embedding providers:
 * - Transformers.js (local, offline)
 * - Ollama (local API)
 * - OpenAI (cloud API) - if configured
 *
 * Measures:
 * - Single embedding latency
 * - Batch embedding latency and throughput
 * - Memory usage per provider
 * - Initialization time
 * - Provider-specific metrics
 */

import { performance } from 'node:perf_hooks';
import type { IEmbeddingProvider } from '../../modules/plugins/embedding/embeddingProvider.interface.js';
import {
  calcPercentiles,
  formatMs,
  memorySnapshotMB,
  monitorPeakMemory,
  timedBenchmark,
  type BenchmarkResult,
} from '../utils/metrics.js';

interface ProviderBenchmarkConfig {
  singleEmbedIterations?: number;
  batchSizes?: number[];
  warmupRuns?: number;
}

interface ProviderMetrics {
  providerName: string;
  initialization: {
    durationMs: number;
    peakRssMB: number;
  };
  singleEmbed: {
    iterations: number;
    p50ms: number;
    p95ms: number;
    p99ms: number;
    meanMs: number;
  };
  batchEmbed: {
    batchSize: number;
    durationMs: number;
    throughput: number;
    msPerItem: number;
  }[];
  memoryFootprint: {
    rss: number;
    heapUsed: number;
  };
}

interface ComparisonFastest {
  initialization: string;
  singleEmbed: string;
  batchEmbed: string;
  memoryEfficient: string;
}

interface EmbeddingProvidersMetrics {
  providers: ProviderMetrics[];
  comparison: {
    fastest: ComparisonFastest;
    recommendedFor: Record<string, string>;
  };
}

export class EmbeddingProviderBenchmark {
  constructor(
    private providers: Map<string, IEmbeddingProvider>,
    private config: ProviderBenchmarkConfig = {}
  ) {}

  async run(): Promise<BenchmarkResult<EmbeddingProvidersMetrics>> {
    try {
      const singleIterations = this.config.singleEmbedIterations ?? 20;
      const batchSizes = this.config.batchSizes ?? [10, 50, 100];
      const warmupRuns = this.config.warmupRuns ?? 2;

      const testTexts = [
        'semantic search implementation',
        'vector database optimization',
        'embedding model performance',
        'neural network architecture',
        'machine learning pipeline',
      ];

      const providerResults: ProviderMetrics[] = [];

      for (const [providerName, provider] of this.providers) {
        console.log(`Benchmarking provider: ${providerName}...`);

        try {
          // Measure initialization
          // TODO: Pass proper provider config from benchmark setup
          const providerConfig = {
            type: 'transformers' as const,
            model: 'test-model',
            dimensions: 384,
          };
          const { result: initTime, peakRssMB: initPeakRss } = await monitorPeakMemory(
            async () => {
              const start = performance.now();
              await provider.initialize(providerConfig);
              const end = performance.now();
              return end - start;
            }
          );

          // Single embedding benchmark
          const { samples: singleSamples } = await timedBenchmark(
            async () => {
              const text = testTexts[Math.floor(Math.random() * testTexts.length)];
              return await provider.embed(text);
            },
            singleIterations,
            warmupRuns
          );

          const singleStats = calcPercentiles(singleSamples);

          // Batch embedding benchmark
          const batchResults = [];
          for (const batchSize of batchSizes) {
            const batch = Array(batchSize)
              .fill(0)
              .map((_, i) => testTexts[i % testTexts.length]);

            const start = performance.now();
            await provider.embedBatch(batch);
            const end = performance.now();

            const duration = end - start;
            const throughput = (batchSize / duration) * 1000;
            const msPerItem = duration / batchSize;

            batchResults.push({
              batchSize,
              durationMs: Number(duration.toFixed(2)),
              throughput: Number(throughput.toFixed(2)),
              msPerItem: Number(msPerItem.toFixed(3)),
            });
          }

          // Memory footprint
          const mem = memorySnapshotMB();

          // Dispose provider
          if (provider.dispose) {
            await provider.dispose();
          }

          providerResults.push({
            providerName,
            initialization: {
              durationMs: Number(initTime.toFixed(2)),
              peakRssMB: Number(initPeakRss.toFixed(2)),
            },
            singleEmbed: {
              iterations: singleIterations,
              p50ms: Number(singleStats.p50.toFixed(2)),
              p95ms: Number(singleStats.p95.toFixed(2)),
              p99ms: Number(singleStats.p99.toFixed(2)),
              meanMs: Number(singleStats.mean.toFixed(2)),
            },
            batchEmbed: batchResults,
            memoryFootprint: {
              rss: Number(mem.rss.toFixed(2)),
              heapUsed: Number(mem.heapUsed.toFixed(2)),
            },
          });
        } catch (error) {
          console.error(
            `  ❌ Failed to benchmark ${providerName}: ${(error as Error).message}`
          );
        }
      }

      return {
        name: 'Embedding Providers',
        timestamp: new Date().toISOString(),
        success: true,
        metrics: {
          providers: providerResults,
          comparison: this.generateComparison(providerResults),
        },
      };
    } catch (error) {
      return {
        name: 'Embedding Providers',
        timestamp: new Date().toISOString(),
        success: false,
        metrics: {} as EmbeddingProvidersMetrics,
        error: (error as Error).message,
      };
    }
  }

  private generateComparison(results: ProviderMetrics[]): {
    fastest: ComparisonFastest;
    recommendedFor: Record<string, string>;
  } {
    if (results.length === 0) {
      return {
        fastest: {
          initialization: 'N/A',
          singleEmbed: 'N/A',
          batchEmbed: 'N/A',
          memoryEfficient: 'N/A',
        },
        recommendedFor: {},
      };
    }

    // Find fastest provider for various metrics
    const fastest = {
      initialization: results.reduce((min, r) =>
        r.initialization.durationMs < min.initialization.durationMs ? r : min
      ).providerName,
      singleEmbed: results.reduce((min, r) =>
        r.singleEmbed.p50ms < min.singleEmbed.p50ms ? r : min
      ).providerName,
      batchEmbed: results.reduce((min, r) => {
        const minBatchMs = Math.min(...r.batchEmbed.map(b => b.msPerItem));
        const currentMinMs = Math.min(...min.batchEmbed.map(b => b.msPerItem));
        return minBatchMs < currentMinMs ? r : min;
      }).providerName,
      memoryEfficient: results.reduce((min, r) =>
        r.memoryFootprint.rss < min.memoryFootprint.rss ? r : min
      ).providerName,
    };

    return {
      fastest,
      recommendedFor: this.getRecommendations(results),
    };
  }

  private getRecommendations(results: ProviderMetrics[]): Record<string, string> {
    const recommendations: Record<string, string> = {};

    // Recommend based on different use cases
    const fastestInit = results.reduce((min, r) =>
      r.initialization.durationMs < min.initialization.durationMs ? r : min
    );
    recommendations['Quick startup'] = fastestInit.providerName;

    const lowestLatency = results.reduce((min, r) =>
      r.singleEmbed.p50ms < min.singleEmbed.p50ms ? r : min
    );
    recommendations['Low latency'] = lowestLatency.providerName;

    const highestThroughput = results.reduce((max, r) => {
      const maxThroughput = Math.max(...r.batchEmbed.map(b => b.throughput));
      const currentMax = Math.max(...max.batchEmbed.map(b => b.throughput));
      return maxThroughput > currentMax ? r : max;
    });
    recommendations['High throughput'] = highestThroughput.providerName;

    const mostMemoryEfficient = results.reduce((min, r) =>
      r.memoryFootprint.rss < min.memoryFootprint.rss ? r : min
    );
    recommendations['Memory constrained'] = mostMemoryEfficient.providerName;

    return recommendations;
  }

  printReport(result: BenchmarkResult<EmbeddingProvidersMetrics>): void {
    if (!result.success) {
      console.error(`❌ ${result.name} failed: ${result.error ?? 'Unknown error'}`);
      return;
    }

    const m = result.metrics;
    console.log('');
    console.log('━'.repeat(80));
    console.log(`📊 ${result.name} Benchmark Results`);
    console.log('━'.repeat(80));

    for (const provider of m.providers) {
      console.log('');
      console.log(`Provider: ${provider.providerName}`);
      console.log('─'.repeat(80));
      console.log('Initialization:');
      console.log(`  Duration: ${formatMs(provider.initialization.durationMs)}`);
      console.log(`  Peak RSS: ${provider.initialization.peakRssMB.toString()} MB`);
      console.log('');
      console.log(`Single Embed (N=${provider.singleEmbed.iterations.toString()}):`);
      console.log(`  p50:  ${formatMs(provider.singleEmbed.p50ms)}`);
      console.log(`  p95:  ${formatMs(provider.singleEmbed.p95ms)}`);
      console.log(`  p99:  ${formatMs(provider.singleEmbed.p99ms)}`);
      console.log(`  mean: ${formatMs(provider.singleEmbed.meanMs)}`);
      console.log('');
      console.log('Batch Embed:');
      for (const batch of provider.batchEmbed) {
        console.log(
          `  Size ${batch.batchSize.toString()}: ${formatMs(batch.durationMs)} total, ${batch.throughput.toFixed(0)} items/sec, ${formatMs(batch.msPerItem)}/item`
        );
      }
      console.log('');
      console.log('Memory Footprint:');
      console.log(`  RSS: ${provider.memoryFootprint.rss.toString()} MB`);
      console.log(`  Heap: ${provider.memoryFootprint.heapUsed.toString()} MB`);
    }

    console.log('');
    console.log('🏆 Comparison:');
    console.log('─'.repeat(80));
    console.log(`Fastest initialization: ${m.comparison.fastest.initialization}`);
    console.log(`Fastest single embed: ${m.comparison.fastest.singleEmbed}`);
    console.log(`Fastest batch embed: ${m.comparison.fastest.batchEmbed}`);
    console.log(`Most memory efficient: ${m.comparison.fastest.memoryEfficient}`);

    console.log('');
    console.log('💡 Recommendations:');
    console.log('─'.repeat(80));
    for (const [useCase, provider] of Object.entries(m.comparison.recommendedFor)) {
      console.log(`  ${useCase}: ${provider}`);
    }

    console.log('━'.repeat(80));
    console.log('');
  }
}
