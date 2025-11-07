/**
 * @fileoverview Test fixtures for vector store testing
 *
 * Provides factory functions for creating consistent test data for vector
 * operations, ensuring deterministic behavior and reducing test boilerplate.
 *
 * @author MCP Server Team
 * @version 2.0.0
 */

import type {
  VectorIndex,
  ModuleVector,
  VectorIndexMetadata,
} from '../../src/modules/core/types.js';

/**
 * Fixed timestamp for deterministic tests
 * 2024-01-01T00:00:00.000Z
 */
export const FIXED_TEST_TIMESTAMP = 1704067200000;

/**
 * Vector fixture factory functions
 */
export const VectorFixtures = {
  /**
   * Creates a sample vector index with configurable size
   */
  createVectorIndex(overrides?: Partial<VectorIndex>): VectorIndex {
    return {
      metadata: this.createMetadata({ count: 2 }),
      vectors: [
        this.createVector('module1', [0.1, 0.2, 0.3], 'foundation'),
        this.createVector('module2', [0.4, 0.5, 0.6], 'advanced'),
      ],
      ...overrides,
    };
  },

  /**
   * Creates metadata with defaults
   */
  createMetadata(overrides?: Partial<VectorIndexMetadata>): VectorIndexMetadata {
    return {
      count: 2,
      model: 'test-model',
      dimensions: 3,
      timestamp: FIXED_TEST_TIMESTAMP,
      version: '1.0.0',
      modules: [
        {
          id: 'module1',
          tier: 'foundation',
          contentHash: 'hash1',
          timestamp: FIXED_TEST_TIMESTAMP,
        },
        {
          id: 'module2',
          tier: 'advanced',
          contentHash: 'hash2',
          timestamp: FIXED_TEST_TIMESTAMP,
        },
      ],
      ...overrides,
    };
  },

  /**
   * Creates a single vector
   */
  createVector(
    id: string,
    vector: number[],
    tier: 'foundation' | 'advanced' | 'expert' = 'foundation'
  ): ModuleVector {
    return {
      id,
      vector,
      contentHash: `hash-${id}`,
      timestamp: FIXED_TEST_TIMESTAMP,
      tier,
    };
  },

  /**
   * Creates vector index with specific number of vectors
   */
  createLargeVectorIndex(size: number): VectorIndex {
    const vectors: ModuleVector[] = [];
    const modules: VectorIndexMetadata['modules'] = [];

    for (let i = 0; i < size; i++) {
      const id = `module${i}`;
      const tier = i % 3 === 0 ? 'foundation' : i % 3 === 1 ? 'advanced' : 'expert';

      vectors.push(this.createVector(id, [0.1 * i, 0.2 * i, 0.3 * i], tier));
      modules.push({
        id,
        tier,
        contentHash: `hash-${id}`,
        timestamp: FIXED_TEST_TIMESTAMP,
      });
    }

    return {
      metadata: this.createMetadata({ count: size, modules }),
      vectors,
    };
  },

  /**
   * Creates empty vector index
   */
  emptyVectorIndex(): VectorIndex {
    return {
      metadata: this.createMetadata({ count: 0, modules: [] }),
      vectors: [],
    };
  },

  /**
   * Creates vector index with NaN values for testing
   */
  createMalformedVectorIndex(): VectorIndex {
    return {
      metadata: this.createMetadata({
        count: 3,
        modules: [
          {
            id: 'valid1',
            tier: 'foundation',
            contentHash: 'hash-valid1',
            timestamp: FIXED_TEST_TIMESTAMP,
          },
          {
            id: 'malformed',
            tier: 'advanced',
            contentHash: 'hash-malformed',
            timestamp: FIXED_TEST_TIMESTAMP,
          },
          {
            id: 'valid2',
            tier: 'foundation',
            contentHash: 'hash-valid2',
            timestamp: FIXED_TEST_TIMESTAMP,
          },
        ],
      }),
      vectors: [
        this.createVector('valid1', [0.1, 0.2, 0.3]),
        {
          id: 'malformed',
          vector: [NaN, 0.2, 0.3],
          contentHash: 'hash-malformed',
          timestamp: FIXED_TEST_TIMESTAMP,
          tier: 'advanced',
        },
        this.createVector('valid2', [0.7, 0.8, 0.9]),
      ],
    };
  },

  /**
   * Creates vector index with specific tiers
   */
  createVectorIndexWithTiers(
    foundationCount: number,
    advancedCount: number,
    expertCount: number
  ): VectorIndex {
    const vectors: ModuleVector[] = [];
    const modules: VectorIndexMetadata['modules'] = [];

    let idx = 0;
    for (let i = 0; i < foundationCount; i++) {
      const id = `foundation-${i}`;
      vectors.push(this.createVector(id, [0.1 * idx, 0.2 * idx, 0.3 * idx], 'foundation'));
      modules.push({
        id,
        tier: 'foundation',
        contentHash: `hash-${id}`,
        timestamp: FIXED_TEST_TIMESTAMP,
      });
      idx++;
    }

    for (let i = 0; i < advancedCount; i++) {
      const id = `advanced-${i}`;
      vectors.push(this.createVector(id, [0.1 * idx, 0.2 * idx, 0.3 * idx], 'advanced'));
      modules.push({
        id,
        tier: 'advanced',
        contentHash: `hash-${id}`,
        timestamp: FIXED_TEST_TIMESTAMP,
      });
      idx++;
    }

    for (let i = 0; i < expertCount; i++) {
      const id = `expert-${i}`;
      vectors.push(this.createVector(id, [0.1 * idx, 0.2 * idx, 0.3 * idx], 'expert'));
      modules.push({
        id,
        tier: 'expert',
        contentHash: `hash-${id}`,
        timestamp: FIXED_TEST_TIMESTAMP,
      });
      idx++;
    }

    return {
      metadata: this.createMetadata({ count: idx, modules }),
      vectors,
    };
  },
};
