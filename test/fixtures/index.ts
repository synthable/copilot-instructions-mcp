/**
 * @fileoverview Central export point for all test fixtures
 *
 * Provides a single import point for all test fixture factories,
 * making it easy to import commonly used test data structures.
 *
 * @author MCP Server Team
 * @version 2.0.0
 *
 * @example
 * ```typescript
 * import { VectorFixtures, EmbeddingFixtures, ConfigFixtures } from '../../../test/fixtures';
 *
 * const vectorIndex = VectorFixtures.createVectorIndex();
 * const config = EmbeddingFixtures.transformersConfig();
 * const serverConfig = ConfigFixtures.createServerConfig();
 * ```
 */

export * from './vectorStore.fixtures.js';
export * from './embedding.fixtures.js';
export * from './config.fixtures.js';
