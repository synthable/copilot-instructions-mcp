/**
 * Module Parsing Benchmark Suite
 *
 * Measures:
 * - Cold module parsing time (first parse with file I/O)
 * - Warm parsing time (cached or repeated parses)
 * - Memory usage during parsing
 * - Parsing throughput (modules/sec)
 * - Individual module parsing times
 */

import { performance } from 'node:perf_hooks';
import type { IInstructionModuleParser } from '../../modules/core/index.js';
import {
  calcPercentiles,
  formatMs,
  memorySnapshotMB,
  monitorPeakMemory,
  timedBenchmark,
  type BenchmarkResult,
} from '../utils/metrics.js';

interface ModuleParsingConfig {
  iterations?: number;
  warmupRuns?: number;
}

interface ModuleParsingMetrics {
  moduleCount: number;
  coldParse: {
    durationMs: number;
    peakRssMB: number;
    memoryDelta: {
      rss: number;
      heapUsed: number;
    };
  };
  warmParse: {
    iterations: number;
    p50ms: number;
    p95ms: number;
    p99ms: number;
    minMs: number;
    maxMs: number;
    meanMs: number;
  };
  throughput: {
    modulesPerSecond: number;
    avgMsPerModule: number;
  };
}

export class ModuleParsingBenchmark {
  constructor(
    private parser: IInstructionModuleParser,
    private config: ModuleParsingConfig = {}
  ) {}

  async run(): Promise<BenchmarkResult<ModuleParsingMetrics>> {
    try {
      const iterations = this.config.iterations ?? 10;
      const warmupRuns = this.config.warmupRuns ?? 2;

      // Cold parse with memory tracking
      const memBefore = memorySnapshotMB();
      const { result: coldParseTime, peakRssMB } = await monitorPeakMemory(async () => {
        const start = performance.now();
        const modules = await this.parser.parseInstructionModules();
        const end = performance.now();
        return { duration: end - start, count: modules.length };
      });
      const memAfter = memorySnapshotMB();

      const moduleCount = coldParseTime.count;

      // Warm parsing benchmark
      const { samples } = await timedBenchmark(
        async () => {
          return await this.parser.parseInstructionModules();
        },
        iterations,
        warmupRuns
      );

      const warmStats = calcPercentiles(samples);

      // Calculate throughput
      const avgParseTime = warmStats.mean;
      const throughput = (moduleCount / avgParseTime) * 1000; // modules per second

      const metrics = {
        moduleCount,
        coldParse: {
          durationMs: Number(coldParseTime.duration.toFixed(2)),
          peakRssMB: Number(peakRssMB.toFixed(2)),
          memoryDelta: {
            rss: Number((memAfter.rss - memBefore.rss).toFixed(2)),
            heapUsed: Number((memAfter.heapUsed - memBefore.heapUsed).toFixed(2)),
          },
        },
        warmParse: {
          iterations,
          p50ms: Number(warmStats.p50.toFixed(2)),
          p95ms: Number(warmStats.p95.toFixed(2)),
          p99ms: Number(warmStats.p99.toFixed(2)),
          minMs: Number(warmStats.min.toFixed(2)),
          maxMs: Number(warmStats.max.toFixed(2)),
          meanMs: Number(warmStats.mean.toFixed(2)),
        },
        throughput: {
          modulesPerSecond: Number(throughput.toFixed(2)),
          avgMsPerModule: Number((avgParseTime / moduleCount).toFixed(3)),
        },
      };

      return {
        name: 'Module Parsing',
        timestamp: new Date().toISOString(),
        success: true,
        metrics,
      };
    } catch (error) {
      return {
        name: 'Module Parsing',
        timestamp: new Date().toISOString(),
        success: false,
        metrics: {} as ModuleParsingMetrics,
        error: (error as Error).message,
      };
    }
  }

  printReport(result: BenchmarkResult<ModuleParsingMetrics>): void {
    if (!result.success) {
      console.error(`❌ ${result.name} failed: ${result.error ?? 'Unknown error'}`);
      return;
    }

    const m = result.metrics;
    console.log('');
    console.log('━'.repeat(80));
    console.log(`📊 ${result.name} Benchmark Results`);
    console.log('━'.repeat(80));
    console.log(`Total modules: ${m.moduleCount.toString()}`);
    console.log('');
    console.log('Cold Parse (first load):');
    console.log(`  Duration: ${formatMs(m.coldParse.durationMs)}`);
    console.log(`  Peak RSS: ${m.coldParse.peakRssMB.toString()} MB`);
    console.log(`  Memory delta:`);
    console.log(
      `    RSS: ${m.coldParse.memoryDelta.rss >= 0 ? '+' : ''}${m.coldParse.memoryDelta.rss.toString()} MB`
    );
    console.log(
      `    Heap: ${m.coldParse.memoryDelta.heapUsed >= 0 ? '+' : ''}${m.coldParse.memoryDelta.heapUsed.toString()} MB`
    );
    console.log('');
    console.log(`Warm Parse (N=${m.warmParse.iterations.toString()}):`);
    console.log(`  p50:  ${formatMs(m.warmParse.p50ms)}`);
    console.log(`  p95:  ${formatMs(m.warmParse.p95ms)}`);
    console.log(`  p99:  ${formatMs(m.warmParse.p99ms)}`);
    console.log(`  min:  ${formatMs(m.warmParse.minMs)}`);
    console.log(`  max:  ${formatMs(m.warmParse.maxMs)}`);
    console.log(`  mean: ${formatMs(m.warmParse.meanMs)}`);
    console.log('');
    console.log('Throughput:');
    console.log(`  ${m.throughput.modulesPerSecond.toString()} modules/sec`);
    console.log(`  ${formatMs(m.throughput.avgMsPerModule)} per module (avg)`);
    console.log('━'.repeat(80));
    console.log('');
  }
}
