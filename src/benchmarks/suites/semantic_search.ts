/**
 * Semantic Search Benchmark Suite
 *
 * Measures:
 * - Cold index build time and peak memory
 * - Warm query latency (p50, p95, p99)
 * - Index size estimation
 * - Optional relevance evaluation (hits@k, precision@k)
 */

import { performance } from 'node:perf_hooks';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  IInstructionModuleParser,
  ISemanticSearchService,
} from '../../modules/core/index.js';
import {
  calcPercentiles,
  formatMs,
  monitorPeakMemory,
  timedBenchmark,
  type BenchmarkResult,
} from '../utils/metrics.js';

interface SemanticBenchmarkConfig {
  numQueries?: number;
  warmupRuns?: number;
  embeddingDims?: number;
  modelName?: string;
  relevanceFile?: string;
}

interface RelevanceMetrics {
  k?: number;
  queries?: number;
  hitsAtK?: number;
  precisionAtK?: number;
  error?: string;
}

interface SemanticSearchMetrics {
  model: string;
  dimensions: number;
  itemsIndexed: number;
  indexSizeMB: number;
  coldBuild: {
    peakRssMB: number;
  };
  warmQueries: {
    iterations: number;
    p50ms: number;
    p95ms: number;
    p99ms: number;
    minMs: number;
    maxMs: number;
    meanMs: number;
  };
  relevance: RelevanceMetrics | null;
}

export class SemanticSearchBenchmark {
  constructor(
    private parser: IInstructionModuleParser,
    private svc: ISemanticSearchService,
    private config: SemanticBenchmarkConfig = {}
  ) {}

  async run(): Promise<BenchmarkResult<SemanticSearchMetrics>> {
    try {
      const N = this.config.numQueries ?? Number(process.env.BENCH_N ?? '30');
      const dims = this.config.embeddingDims ?? 768;
      const modelName = this.config.modelName ?? 'Xenova/all-mpnet-base-v2';

      // Measure cold index build with peak memory tracking
      const { peakRssMB: buildPeakRss } = await monitorPeakMemory(async () => {
        const start = performance.now();
        await this.svc.buildIndex(true);
        const end = performance.now();
        return end - start;
      });

      // Calculate index size
      const modules = await this.parser.parseInstructionModules();
      const numItems = modules.length;
      const indexBytes = numItems * dims * 4; // float32
      const indexMB = indexBytes / (1024 * 1024);

      // Prepare representative queries
      const defaultQueries = [
        'semantic search',
        'hybrid search',
        'embedding pipeline',
        'dependency injection container',
        'MCP tools and handlers',
        'server transports stdio http sse',
        'instruction modules parsing',
        'vector store plan and persistence',
      ];

      // Run warm queries
      const { samples } = await timedBenchmark(
        async () => {
          const q = defaultQueries[Math.floor(Math.random() * defaultQueries.length)];
          return await this.svc.semanticSearch(q, 5);
        },
        N,
        this.config.warmupRuns ?? 1
      );

      const latencyStats = calcPercentiles(samples);

      // Optional relevance evaluation
      const relevanceMetrics = await this.evaluateRelevance();

      const metrics = {
        model: modelName,
        dimensions: dims,
        itemsIndexed: numItems,
        indexSizeMB: Number(indexMB.toFixed(2)),
        coldBuild: {
          peakRssMB: Number(buildPeakRss.toFixed(1)),
        },
        warmQueries: {
          iterations: N,
          p50ms: Number(latencyStats.p50.toFixed(2)),
          p95ms: Number(latencyStats.p95.toFixed(2)),
          p99ms: Number(latencyStats.p99.toFixed(2)),
          minMs: Number(latencyStats.min.toFixed(2)),
          maxMs: Number(latencyStats.max.toFixed(2)),
          meanMs: Number(latencyStats.mean.toFixed(2)),
        },
        relevance: relevanceMetrics,
      };

      return {
        name: 'Semantic Search',
        timestamp: new Date().toISOString(),
        success: true,
        metrics,
      };
    } catch (error) {
      return {
        name: 'Semantic Search',
        timestamp: new Date().toISOString(),
        success: false,
        metrics: {} as SemanticSearchMetrics,
        error: (error as Error).message,
      };
    }
  }

  private async evaluateRelevance(): Promise<Record<string, unknown> | null> {
    const relevancePath =
      this.config.relevanceFile ?? join(process.cwd(), 'bench', 'relevance.json');

    if (!existsSync(relevancePath)) {
      return null;
    }

    try {
      const spec = JSON.parse(readFileSync(relevancePath, 'utf-8')) as {
        k?: number;
        queries: { q: string; relevantIds: string[] }[];
      };

      const k = Math.max(1, Math.min(20, spec.k ?? 5));
      let hits = 0;
      let totalPrec = 0;

      for (const item of spec.queries) {
        const res = await this.svc.semanticSearch(item.q, k);
        const ids = new Set(res.map(r => r.id));
        const rel = new Set(item.relevantIds);
        const intersection = [...ids].filter(x => rel.has(x));
        const hit = intersection.length > 0 ? 1 : 0;
        const prec = intersection.length / k;
        hits += hit;
        totalPrec += prec;
      }

      const mHitsAtK = hits / spec.queries.length;
      const mPrecAtK = totalPrec / spec.queries.length;

      return {
        k,
        queries: spec.queries.length,
        hitsAtK: Number(mHitsAtK.toFixed(3)),
        precisionAtK: Number(mPrecAtK.toFixed(3)),
      };
    } catch (err) {
      return {
        error: `Failed to evaluate relevance: ${(err as Error).message}`,
      };
    }
  }

  printReport(result: BenchmarkResult<SemanticSearchMetrics>): void {
    if (!result.success) {
      console.error(`❌ ${result.name} failed: ${result.error ?? 'Unknown error'}`);
      return;
    }

    const m = result.metrics;
    console.log('');
    console.log('━'.repeat(80));
    console.log(`📊 ${result.name} Benchmark Results`);
    console.log('━'.repeat(80));
    console.log(`Model: ${m.model} (dims=${String(m.dimensions)})`);
    console.log(`Indexed items: ${String(m.itemsIndexed)}`);
    console.log(`Index size (vectors): ${String(m.indexSizeMB)} MB`);
    console.log('');
    console.log('Cold Build:');
    console.log(`  Peak RSS: ${String(m.coldBuild.peakRssMB)} MB`);
    console.log('');
    console.log(`Warm Queries (N=${String(m.warmQueries.iterations)}):`);
    console.log(`  p50:  ${formatMs(m.warmQueries.p50ms)}`);
    console.log(`  p95:  ${formatMs(m.warmQueries.p95ms)}`);
    console.log(`  p99:  ${formatMs(m.warmQueries.p99ms)}`);
    console.log(`  min:  ${formatMs(m.warmQueries.minMs)}`);
    console.log(`  max:  ${formatMs(m.warmQueries.maxMs)}`);
    console.log(`  mean: ${formatMs(m.warmQueries.meanMs)}`);

    if (m.relevance) {
      console.log('');
      console.log('Relevance Evaluation:');
      if (m.relevance.error) {
        console.log(`  ${m.relevance.error}`);
      } else {
        console.log(`  Queries: ${String(m.relevance.queries)}`);
        console.log(`  Hits@${String(m.relevance.k)}: ${String(m.relevance.hitsAtK)}`);
        console.log(
          `  Precision@${String(m.relevance.k)}: ${String(m.relevance.precisionAtK)}`
        );
      }
    } else {
      console.log('');
      console.log('ℹ️  Create bench/relevance.json to evaluate hits@k and precision@k');
    }

    console.log('━'.repeat(80));
    console.log('');
  }
}
