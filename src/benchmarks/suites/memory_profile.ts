/**
 * Memory Profiling Benchmark Suite
 *
 * Measures:
 * - Baseline memory usage (empty process)
 * - Memory usage after module loading
 * - Memory usage during index building
 * - Memory growth over repeated operations
 * - Memory leak detection
 * - GC behavior and heap statistics
 */

import { performance } from 'node:perf_hooks';
import type {
  IInstructionModuleParser,
  ISemanticSearchService,
} from '../../modules/core/index.js';
import { memorySnapshotMB, rssMB, type BenchmarkResult } from '../utils/metrics.js';

interface MemoryProfileConfig {
  operationIterations?: number;
  gcBetweenIterations?: boolean;
  snapshotInterval?: number;
}

interface MemoryTimeline {
  timestamp: number;
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
}

interface MemorySnapshot {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
}

interface MemoryDelta {
  rss: number;
  heapUsed: number;
}

interface MemoryDeltas {
  moduleLoad: MemoryDelta;
  indexBuild: MemoryDelta;
  operations: MemoryDelta;
}

interface GrowthAnalysis {
  insufficient_data?: boolean;
  rssGrowthMB?: number;
  rssGrowthPercent?: number;
  heapGrowthMB?: number;
  heapGrowthPercent?: number;
}

interface LeakDetection {
  insufficient_data?: boolean;
  slope?: number;
  r2?: number;
  suspectedLeak?: boolean;
  leakRate?: string | null;
  confidence?: string;
}

interface MemoryProfileMetrics {
  gcAvailable: boolean;
  iterations: number;
  snapshots: {
    baseline: MemorySnapshot;
    afterModuleLoad: MemorySnapshot;
    afterIndexBuild: MemorySnapshot;
    final: MemorySnapshot;
  };
  memoryDeltas: MemoryDeltas;
  peakRssMB: number;
  growth: GrowthAnalysis;
  leakDetection: LeakDetection;
  timeline: MemoryTimeline[];
}

export class MemoryProfileBenchmark {
  constructor(
    private parser: IInstructionModuleParser,
    private svc: ISemanticSearchService,
    private config: MemoryProfileConfig = {}
  ) {}

  async run(): Promise<BenchmarkResult<MemoryProfileMetrics>> {
    try {
      const iterations = this.config.operationIterations ?? 100;
      const timeline: MemoryTimeline[] = [];

      // Force GC if available (run with --expose-gc)
      // Type guard to safely check for gc function on global
      // Note: gc() actually accepts optional parameters for specific GC types,
      // but simplified signature is sufficient for basic GC triggering used here
      const hasGC = (obj: typeof global): obj is typeof global & { gc: () => void } => {
        return 'gc' in obj && typeof (obj as { gc?: unknown }).gc === 'function';
      };

      const gcAvailable = hasGC(global);
      const gc = gcAvailable ? global.gc : undefined;

      // Baseline measurement
      if (gcAvailable && this.config.gcBetweenIterations) {
        gc?.();
        await this.sleep(100);
      }

      const baseline = memorySnapshotMB();
      timeline.push({
        timestamp: performance.now(),
        ...baseline,
      });

      // Load modules
      await this.parser.parseInstructionModules();
      const afterModuleLoad = memorySnapshotMB();
      timeline.push({
        timestamp: performance.now(),
        ...afterModuleLoad,
      });

      // Build index
      await this.svc.buildIndex(true);
      const afterIndexBuild = memorySnapshotMB();
      timeline.push({
        timestamp: performance.now(),
        ...afterIndexBuild,
      });

      // Run repeated operations to detect memory growth
      const testQuery = 'semantic search performance';
      const snapshotEvery = Math.floor(iterations / 10) || 1;

      let peakRss = rssMB();
      const iterationSnapshots: MemoryTimeline[] = [];

      for (let i = 0; i < iterations; i++) {
        await this.svc.semanticSearch(testQuery, 5);

        const current = rssMB();
        if (current > peakRss) peakRss = current;

        if (i % snapshotEvery === 0) {
          const snapshot = memorySnapshotMB();
          iterationSnapshots.push({
            timestamp: performance.now(),
            ...snapshot,
          });
        }

        if (this.config.gcBetweenIterations && gcAvailable) {
          gc?.();
        }
      }

      // Final measurement
      if (gcAvailable) {
        gc?.();
        await this.sleep(100);
      }

      const final = memorySnapshotMB();
      timeline.push({
        timestamp: performance.now(),
        ...final,
      });

      // Analyze memory growth
      const growthAnalysis = this.analyzeGrowth(iterationSnapshots);
      const leakDetection = this.detectLeaks(iterationSnapshots);

      const metrics: MemoryProfileMetrics = {
        gcAvailable,
        iterations,
        snapshots: {
          baseline,
          afterModuleLoad,
          afterIndexBuild,
          final,
        },
        memoryDeltas: {
          moduleLoad: {
            rss: Number((afterModuleLoad.rss - baseline.rss).toFixed(2)),
            heapUsed: Number((afterModuleLoad.heapUsed - baseline.heapUsed).toFixed(2)),
          },
          indexBuild: {
            rss: Number((afterIndexBuild.rss - afterModuleLoad.rss).toFixed(2)),
            heapUsed: Number(
              (afterIndexBuild.heapUsed - afterModuleLoad.heapUsed).toFixed(2)
            ),
          },
          operations: {
            rss: Number((final.rss - afterIndexBuild.rss).toFixed(2)),
            heapUsed: Number((final.heapUsed - afterIndexBuild.heapUsed).toFixed(2)),
          },
        },
        peakRssMB: Number(peakRss.toFixed(2)),
        growth: growthAnalysis,
        leakDetection,
        timeline: iterationSnapshots,
      };

      return {
        name: 'Memory Profile',
        timestamp: new Date().toISOString(),
        success: true,
        metrics,
      };
    } catch (error) {
      return {
        name: 'Memory Profile',
        timestamp: new Date().toISOString(),
        success: false,
        metrics: {} as MemoryProfileMetrics,
        error: (error as Error).message,
      };
    }
  }

  private analyzeGrowth(snapshots: MemoryTimeline[]): GrowthAnalysis {
    if (snapshots.length < 2) {
      return { insufficient_data: true };
    }

    const firstRss = snapshots[0].rss;
    const lastRss = snapshots[snapshots.length - 1].rss;
    const rssGrowth = lastRss - firstRss;
    const rssGrowthPercent = (rssGrowth / firstRss) * 100;

    const firstHeap = snapshots[0].heapUsed;
    const lastHeap = snapshots[snapshots.length - 1].heapUsed;
    const heapGrowth = lastHeap - firstHeap;
    const heapGrowthPercent = (heapGrowth / firstHeap) * 100;

    return {
      rssGrowthMB: Number(rssGrowth.toFixed(2)),
      rssGrowthPercent: Number(rssGrowthPercent.toFixed(2)),
      heapGrowthMB: Number(heapGrowth.toFixed(2)),
      heapGrowthPercent: Number(heapGrowthPercent.toFixed(2)),
    };
  }

  private detectLeaks(snapshots: MemoryTimeline[]): LeakDetection {
    if (snapshots.length < 3) {
      return { insufficient_data: true };
    }

    // Calculate linear regression to detect consistent growth
    const heapValues = snapshots.map(s => s.heapUsed);
    const n = heapValues.length;
    const indices = Array.from({ length: n }, (_, i) => i);

    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = heapValues.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((acc, x, i) => acc + x * heapValues[i], 0);
    const sumX2 = indices.reduce((acc, x) => acc + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R² to measure consistency of growth
    const yMean = sumY / n;
    const ssTotal = heapValues.reduce((acc, y) => acc + Math.pow(y - yMean, 2), 0);
    const ssRes = heapValues.reduce(
      (acc, y, i) => acc + Math.pow(y - (slope * i + intercept), 2),
      0
    );
    const r2 = 1 - ssRes / ssTotal;

    const suspectedLeak = slope > 0.01 && r2 > 0.8; // Consistent growth

    return {
      slope: Number(slope.toFixed(4)),
      r2: Number(r2.toFixed(4)),
      suspectedLeak,
      leakRate: suspectedLeak
        ? `${(slope * 100).toFixed(3)} MB per 100 operations`
        : null,
      confidence: suspectedLeak ? (r2 > 0.95 ? 'high' : 'medium') : 'low',
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printReport(result: BenchmarkResult<MemoryProfileMetrics>): void {
    if (!result.success) {
      console.error(`❌ ${result.name} failed: ${String(result.error)}`);
      return;
    }

    const m = result.metrics;
    console.log('');
    console.log('━'.repeat(80));
    console.log(`📊 ${result.name} Benchmark Results`);
    console.log('━'.repeat(80));
    console.log(`GC available: ${m.gcAvailable ? 'Yes (--expose-gc)' : 'No'}`);
    console.log(`Operations: ${String(m.iterations)}`);
    console.log('');
    console.log('Memory Snapshots:');
    const baselineMsg = `  Baseline:        RSS ${m.snapshots.baseline.rss.toFixed(2)} MB, Heap ${m.snapshots.baseline.heapUsed.toFixed(2)} MB`;
    console.log(baselineMsg);
    const moduleMsg = `  After module load: RSS ${m.snapshots.afterModuleLoad.rss.toFixed(2)} MB, Heap ${m.snapshots.afterModuleLoad.heapUsed.toFixed(2)} MB`;
    console.log(moduleMsg);
    const indexMsg = `  After index build: RSS ${m.snapshots.afterIndexBuild.rss.toFixed(2)} MB, Heap ${m.snapshots.afterIndexBuild.heapUsed.toFixed(2)} MB`;
    console.log(indexMsg);
    const finalMsg = `  Final:           RSS ${m.snapshots.final.rss.toFixed(2)} MB, Heap ${m.snapshots.final.heapUsed.toFixed(2)} MB`;
    console.log(finalMsg);
    const peakMsg = `  Peak RSS:        ${String(m.peakRssMB)} MB`;
    console.log(peakMsg);
    console.log('');
    console.log('Memory Deltas:');
    const mlPrefix = m.memoryDeltas.moduleLoad.rss >= 0 ? '+' : '';
    const mlHeapPrefix = m.memoryDeltas.moduleLoad.heapUsed >= 0 ? '+' : '';
    const mlMsg = `  Module load:   RSS ${mlPrefix}${String(m.memoryDeltas.moduleLoad.rss)} MB, Heap ${mlHeapPrefix}${String(m.memoryDeltas.moduleLoad.heapUsed)} MB`;
    console.log(mlMsg);
    const ibPrefix = m.memoryDeltas.indexBuild.rss >= 0 ? '+' : '';
    const ibHeapPrefix = m.memoryDeltas.indexBuild.heapUsed >= 0 ? '+' : '';
    const ibMsg = `  Index build:   RSS ${ibPrefix}${String(m.memoryDeltas.indexBuild.rss)} MB, Heap ${ibHeapPrefix}${String(m.memoryDeltas.indexBuild.heapUsed)} MB`;
    console.log(ibMsg);
    const opPrefix = m.memoryDeltas.operations.rss >= 0 ? '+' : '';
    const opHeapPrefix = m.memoryDeltas.operations.heapUsed >= 0 ? '+' : '';
    const opMsg = `  Operations:    RSS ${opPrefix}${String(m.memoryDeltas.operations.rss)} MB, Heap ${opHeapPrefix}${String(m.memoryDeltas.operations.heapUsed)} MB`;
    console.log(opMsg);

    if (!m.growth.insufficient_data) {
      console.log('');
      console.log('Growth Analysis:');
      const rssGrowth = m.growth.rssGrowthMB;
      const rssPercent = m.growth.rssGrowthPercent;
      const heapGrowth = m.growth.heapGrowthMB;
      const heapPercent = m.growth.heapGrowthPercent;
      const rssPrefix = rssGrowth !== undefined && rssGrowth >= 0 ? '+' : '';
      const rssPercentPrefix = rssPercent !== undefined && rssPercent >= 0 ? '+' : '';
      const rssMsg = `  RSS growth:   ${rssPrefix}${String(rssGrowth)} MB (${rssPercentPrefix}${String(rssPercent)}%)`;
      console.log(rssMsg);
      const heapPrefix = heapGrowth !== undefined && heapGrowth >= 0 ? '+' : '';
      const heapPercentPrefix =
        heapPercent !== undefined && heapPercent >= 0 ? '+' : '';
      const heapMsg = `  Heap growth:  ${heapPrefix}${String(heapGrowth)} MB (${heapPercentPrefix}${String(heapPercent)}%)`;
      console.log(heapMsg);
    }

    if (!m.leakDetection.insufficient_data) {
      console.log('');
      console.log('Leak Detection:');
      const slopeMsg = `  Growth slope: ${String(m.leakDetection.slope)} MB/iteration`;
      console.log(slopeMsg);
      const r2Msg = `  R²: ${String(m.leakDetection.r2)} (consistency)`;
      console.log(r2Msg);
      console.log(
        `  Suspected leak: ${m.leakDetection.suspectedLeak ? '⚠️  YES' : '✓ NO'}`
      );
      if (m.leakDetection.suspectedLeak) {
        const leakRateMsg = `  Leak rate: ${String(m.leakDetection.leakRate)}`;
        console.log(leakRateMsg);
        const confMsg = `  Confidence: ${String(m.leakDetection.confidence)}`;
        console.log(confMsg);
      }
    }

    console.log('');
    console.log('ℹ️  Run with --expose-gc flag for more accurate GC measurements');
    console.log('━'.repeat(80));
    console.log('');
  }
}
