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
import {
  memorySnapshotMB,
  rssMB,
  type BenchmarkResult,
} from '../utils/metrics.js';

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

export class MemoryProfileBenchmark {
  constructor(
    private parser: IInstructionModuleParser,
    private svc: ISemanticSearchService,
    private config: MemoryProfileConfig = {}
  ) {}

  async run(): Promise<BenchmarkResult> {
    try {
      const iterations = this.config.operationIterations ?? 100;
      const timeline: MemoryTimeline[] = [];

      // Force GC if available (run with --expose-gc)
      const gc = (global as any).gc;
      const gcAvailable = typeof gc === 'function';

      // Baseline measurement
      if (gcAvailable && this.config.gcBetweenIterations) {
        gc();
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
          gc();
        }
      }

      // Final measurement
      if (gcAvailable) {
        gc();
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

      const metrics = {
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
            heapUsed: Number((afterIndexBuild.heapUsed - afterModuleLoad.heapUsed).toFixed(2)),
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
        metrics: {},
        error: (error as Error).message,
      };
    }
  }

  private analyzeGrowth(snapshots: MemoryTimeline[]): Record<string, unknown> {
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

  private detectLeaks(snapshots: MemoryTimeline[]): Record<string, unknown> {
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
      leakRate: suspectedLeak ? `${(slope * 100).toFixed(3)} MB per 100 operations` : null,
      confidence: suspectedLeak ? (r2 > 0.95 ? 'high' : 'medium') : 'low',
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printReport(result: BenchmarkResult): void {
    if (!result.success) {
      console.error(`❌ ${result.name} failed: ${result.error}`);
      return;
    }

    const m = result.metrics as any; // Type assertion for metrics access
    console.log('');
    console.log('━'.repeat(80));
    console.log(`📊 ${result.name} Benchmark Results`);
    console.log('━'.repeat(80));
    console.log(`GC available: ${m.gcAvailable ? 'Yes (--expose-gc)' : 'No'}`);
    console.log(`Operations: ${m.iterations}`);
    console.log('');
    console.log('Memory Snapshots:');
    console.log(`  Baseline:        RSS ${m.snapshots.baseline.rss.toFixed(2)} MB, Heap ${m.snapshots.baseline.heapUsed.toFixed(2)} MB`);
    console.log(`  After module load: RSS ${m.snapshots.afterModuleLoad.rss.toFixed(2)} MB, Heap ${m.snapshots.afterModuleLoad.heapUsed.toFixed(2)} MB`);
    console.log(`  After index build: RSS ${m.snapshots.afterIndexBuild.rss.toFixed(2)} MB, Heap ${m.snapshots.afterIndexBuild.heapUsed.toFixed(2)} MB`);
    console.log(`  Final:           RSS ${m.snapshots.final.rss.toFixed(2)} MB, Heap ${m.snapshots.final.heapUsed.toFixed(2)} MB`);
    console.log(`  Peak RSS:        ${m.peakRssMB} MB`);
    console.log('');
    console.log('Memory Deltas:');
    console.log(`  Module load:   RSS ${m.memoryDeltas.moduleLoad.rss >= 0 ? '+' : ''}${m.memoryDeltas.moduleLoad.rss} MB, Heap ${m.memoryDeltas.moduleLoad.heapUsed >= 0 ? '+' : ''}${m.memoryDeltas.moduleLoad.heapUsed} MB`);
    console.log(`  Index build:   RSS ${m.memoryDeltas.indexBuild.rss >= 0 ? '+' : ''}${m.memoryDeltas.indexBuild.rss} MB, Heap ${m.memoryDeltas.indexBuild.heapUsed >= 0 ? '+' : ''}${m.memoryDeltas.indexBuild.heapUsed} MB`);
    console.log(`  Operations:    RSS ${m.memoryDeltas.operations.rss >= 0 ? '+' : ''}${m.memoryDeltas.operations.rss} MB, Heap ${m.memoryDeltas.operations.heapUsed >= 0 ? '+' : ''}${m.memoryDeltas.operations.heapUsed} MB`);

    if (!m.growth.insufficient_data) {
      console.log('');
      console.log('Growth Analysis:');
      console.log(`  RSS growth:   ${m.growth.rssGrowthMB >= 0 ? '+' : ''}${m.growth.rssGrowthMB} MB (${m.growth.rssGrowthPercent >= 0 ? '+' : ''}${m.growth.rssGrowthPercent}%)`);
      console.log(`  Heap growth:  ${m.growth.heapGrowthMB >= 0 ? '+' : ''}${m.growth.heapGrowthMB} MB (${m.growth.heapGrowthPercent >= 0 ? '+' : ''}${m.growth.heapGrowthPercent}%)`);
    }

    if (!m.leakDetection.insufficient_data) {
      console.log('');
      console.log('Leak Detection:');
      console.log(`  Growth slope: ${m.leakDetection.slope} MB/iteration`);
      console.log(`  R²: ${m.leakDetection.r2} (consistency)`);
      console.log(`  Suspected leak: ${m.leakDetection.suspectedLeak ? '⚠️  YES' : '✓ NO'}`);
      if (m.leakDetection.suspectedLeak) {
        console.log(`  Leak rate: ${m.leakDetection.leakRate}`);
        console.log(`  Confidence: ${m.leakDetection.confidence}`);
      }
    }

    console.log('');
    console.log('ℹ️  Run with --expose-gc flag for more accurate GC measurements');
    console.log('━'.repeat(80));
    console.log('');
  }
}
