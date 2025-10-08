/**
 * Benchmark: Semantic search service performance and memory.
 *
 * Collects:
 * - Cold index build wall time and peak RSS (MB)
 * - Warm query latency p50/p95 for N queries
 * - Index size estimate in memory (num_items × dims × 4 bytes)
 * - Optional relevance evaluation from bench/relevance.json (hits@k, precision@k)
 *
 * Usage:
 *   npm run bench:semantic
 *   (optional) BENCH_N=50 npm run bench:semantic
 */

import { performance } from 'node:perf_hooks';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  IInstructionModuleParser,
  ISemanticSearchService,
} from '../modules/index.js';
import { createProductionContainer } from '../modules/index.js';

interface Percentiles {
  p50: number;
  p95: number;
}

function rssMB(): number {
  return process.memoryUsage().rss / (1024 * 1024);
}

function calcPercentiles(samplesMs: number[]): Percentiles {
  if (samplesMs.length === 0) return { p50: 0, p95: 0 };
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.floor(q * (sorted.length - 1))] ?? sorted[sorted.length - 1];
  return { p50: at(0.5), p95: at(0.95) };
}

function pretty(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

class SemanticBenchmark {
  constructor(
    private parser: IInstructionModuleParser,
    private svc: ISemanticSearchService
  ) {}

  async run() {
    const N = Number(process.env.BENCH_N ?? '30');

    // Measure cold index build time and peak RSS by sampling during build.
    let peak = rssMB();
    const sampler = setInterval(() => {
      const current = rssMB();
      if (current > peak) peak = current;
    }, 50);

    const t0 = performance.now();
    await this.svc.buildIndex(true);
    const t1 = performance.now();
    clearInterval(sampler);
    // Update peak once more after completion
    peak = Math.max(peak, rssMB());

    // Embedding dimension: fixed per current model (all-mpnet-base-v2 = 768)
    const dims = 768;

    // Estimate index size in memory (vectors only)
    const modules = await this.parser.parseInstructionModules();
    const numItems = modules.length;
    const indexBytes = numItems * dims * 4; // float32
    const indexMB = indexBytes / (1024 * 1024);

    // Prepare a small set of representative queries
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

    // Warm-up to avoid one-time overheads
    await this.svc.semanticSearch('warm up', 5);

    // Run warm queries and collect latencies
    const samples: number[] = [];
    for (let i = 0; i < N; i++) {
      const q = defaultQueries[i % defaultQueries.length];
      const s = performance.now();
      await this.svc.semanticSearch(q, 5);
      const e = performance.now();
      samples.push(e - s);
    }
    const { p50, p95 } = calcPercentiles(samples);

    // Optional: relevance evaluation from bench/relevance.json
    // Format:
    // {
    //   "k": 5,
    //   "queries": [ { "q": "...", "relevantIds": ["module-id-1", "module-id-2"] } ]
    // }
    const benchDir = join(process.cwd(), 'bench');
    const relevancePath = join(benchDir, 'relevance.json');
    let relevanceSummary: string | null = null;
    if (existsSync(relevancePath)) {
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
        relevanceSummary = [
          'relevance: hits@',
          String(k),
          '=',
          mHitsAtK.toFixed(2),
          ', precision@',
          String(k),
          '=',
          mPrecAtK.toFixed(2),
          ' (n=',
          String(spec.queries.length),
          ')',
        ].join('');
      } catch (err) {
        relevanceSummary = `relevance: error parsing ${relevancePath}: ${
          (err as Error).message
        }`;
      }
    }

    // Report
    const report = {
      model: 'Xenova/all-mpnet-base-v2',
      dims,
      itemsIndexed: numItems,
      indexSizeMB: Number(indexMB.toFixed(2)),
      coldBuild: {
        wallTimeMs: Number((t1 - t0).toFixed(1)),
        peakRssMB: Number(peak.toFixed(1)),
      },
      warmQueries: {
        N,
        p50ms: Number(p50.toFixed(1)),
        p95ms: Number(p95.toFixed(1)),
      },
      notes:
        relevanceSummary ??
        'relevance: bench/relevance.json not found; create to compute hits@k/precision@k',
    };

    // Pretty print
    console.log('--- Semantic Search Benchmark ---');
    console.log('Model:', report.model, '(dims=', report.dims, ')');
    console.log('Indexed items:', report.itemsIndexed);
    console.log('Index vector memory (est):', report.indexSizeMB, 'MB');
    console.log(
      'Cold build: wall=',
      pretty(report.coldBuild.wallTimeMs),
      'peakRSS=',
      report.coldBuild.peakRssMB.toFixed(1),
      'MB'
    );
    console.log(
      'Warm queries (N=',
      report.warmQueries.N,
      '): p50=',
      pretty(report.warmQueries.p50ms),
      'p95=',
      pretty(report.warmQueries.p95ms)
    );
    console.log(report.notes);
  }
}

async function main() {
  const container = createProductionContainer();
  const benchmark = new SemanticBenchmark(
    container.getInstructionModuleParser(),
    container.getSemanticSearchService()
  );
  await benchmark.run();
}

main().catch((err: unknown) => {
  console.error('Benchmark failed:', err);
  process.exitCode = 1;
});
