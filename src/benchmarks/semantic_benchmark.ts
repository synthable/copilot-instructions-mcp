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

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionContainer } from '../modules/core/index.js';
import { SemanticSearchBenchmark } from './suites/semantic_search.js';
import { configSchema, type ServerConfig } from '../config/config.schema.js';

const DEFAULT_CONFIG = {
  embeddingProvider: { type: 'transformers' as const },
  searchProvider: { name: 'fuzzy' as const },
};

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

async function main(): Promise<void> {
  // Load configuration and create container
  const serverConfig = loadConfig();
  const container = createProductionContainer(
    serverConfig.moduleDirectory,
    serverConfig
  );

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
