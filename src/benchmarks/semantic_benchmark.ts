/**
 * Semantic Search Benchmark (Legacy Entry Point)
 *
 * This file maintains backward compatibility with the original benchmark script.
 * It now delegates to the comprehensive benchmark suite runner.
 *
 * Usage:
 *   npm run bench:semantic
 *   (or directly) node dist/benchmarks/semantic_benchmark.js
 *
 * For the full benchmark suite, use:
 *   npm run bench
 */

import { createProductionContainer } from '../modules/core/index.js';
import { SemanticSearchBenchmark } from './suites/semantic_search.js';

async function main() {
  const container = createProductionContainer();

  const benchmark = new SemanticSearchBenchmark(
    container.getInstructionModuleParser(),
    container.getSemanticSearchService()
  );

  const result = await benchmark.run();
  benchmark.printReport(result);

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error('Semantic search benchmark failed:', err);
  process.exitCode = 1;
});
