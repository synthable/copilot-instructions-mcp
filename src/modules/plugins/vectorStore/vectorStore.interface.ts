/**
 * @fileoverview Vector store plugin interface and types.
 *
 * Defines the plugin architecture for vector storage backends, enabling
 * runtime switching between file-based, SQLite, and future storage implementations.
 * Provides both legacy methods for backward compatibility and new search-oriented APIs.
 *
 * @author MCP Server Team
 * @version 2.0.0
 * @since 2.0.0
 */

import type {
  VectorIndex,
  VectorIndexMetadata,
  ModuleVector,
} from '../../core/types.js';

/**
 * Configuration for vector store initialization.
 */
export interface VectorStoreConfig {
  /** Storage backend type */
  type: 'file' | 'sqlite';
  /** Path to vector storage (file path or database path) */
  path?: string | undefined;
  /** Expected vector dimensions (for validation) */
  dimensions?: number | undefined;
  /** Enable integrity checking (checksums) */
  enableIntegrityCheck?: boolean | undefined;
  /** Additional provider-specific options */
  [key: string]: unknown;
}

/**
 * Query parameters for vector search operations.
 */
export interface VectorQuery {
  /** Query embedding vector */
  vector: number[];
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  /** Optional metadata filters */
  filters?: {
    /** Filter by module IDs */
    ids?: string[];
    /** Filter by tier/category */
    tier?: string;
    /** Custom metadata filters */
    [key: string]: unknown;
  };
}

/**
 * Search result with similarity score.
 */
export interface VectorSearchResult {
  /** Module vector data */
  vector: ModuleVector;
  /** Cosine similarity score (0-1) */
  similarity: number;
}

/**
 * Statistics about the vector store.
 */
export interface VectorStoreStats {
  /** Total number of vectors stored */
  count: number;
  /** Storage backend type */
  type: string;
  /** Model used for embeddings */
  model: string;
  /** Vector dimensions */
  dimensions: number;
  /** Storage size in bytes (if applicable) */
  sizeBytes?: number | undefined;
  /** Last updated timestamp */
  lastUpdated?: number | undefined;
  /** Additional backend-specific stats */
  [key: string]: unknown;
}

/**
 * Vector entry for indexing operations.
 */
export interface VectorEntry {
  /** Module ID */
  id: string;
  /** Embedding vector */
  vector: number[];
  /** Content hash for cache validation */
  contentHash: string;
  /** Module tier/category */
  tier: string;
  /** Generation timestamp */
  timestamp: number;
}

/**
 * Vector store plugin interface.
 *
 * Provides a unified interface for different vector storage backends.
 * Implementations must support both search operations and legacy methods
 * for backward compatibility.
 */
export interface IVectorStorePlugin {
  /**
   * Initialize the vector store with configuration.
   * Must be called before any other operations.
   */
  initialize(config: VectorStoreConfig): Promise<void>;

  /**
   * Close the vector store and release resources.
   */
  close(): void | Promise<void>;

  /**
   * Check if the store has been initialized.
   */
  isInitialized(): boolean;

  /**
   * Check if pre-computed vectors are available.
   */
  isAvailable(): boolean;

  // ========== Search Operations (New API) ==========

  /**
   * Search for similar vectors using cosine similarity.
   *
   * @param query - Query parameters including vector and filters
   * @returns Array of search results sorted by similarity (descending)
   */
  search(query: VectorQuery): Promise<VectorSearchResult[]>;

  // ========== Indexing Operations (Future Use) ==========

  /**
   * Index a single vector entry.
   * For future real-time indexing support.
   *
   * @param entry - Vector entry to index
   */
  index(entry: VectorEntry): Promise<void>;

  /**
   * Index multiple vector entries in batch.
   * More efficient than calling index() multiple times.
   *
   * @param entries - Array of vector entries to index
   */
  indexBatch(entries: VectorEntry[]): Promise<void>;

  // ========== Legacy Methods (Backward Compatibility) ==========

  /**
   * Load vectors from storage.
   * Returns the full vector index structure.
   *
   * @returns Vector index or null if not available
   */
  loadVectors(): Promise<VectorIndex | null>;

  /**
   * Get vectors by module IDs.
   * Efficient O(1) lookup using in-memory index.
   *
   * @param moduleIds - Array of module IDs to retrieve
   * @returns Array of matching module vectors
   */
  getVectorsByIds(moduleIds: string[]): Promise<ModuleVector[]>;

  /**
   * Get vectors by tier/category filter.
   *
   * @param tier - Tier name (e.g., "foundation", "domain")
   * @returns Array of vectors in the specified tier
   */
  getVectorsByTier(tier: string): Promise<ModuleVector[]>;

  /**
   * Get all vectors in the store.
   *
   * @returns Array of all module vectors
   */
  getAllVectors(): Promise<ModuleVector[]>;

  // ========== Management Operations ==========

  /**
   * Get storage statistics and metadata.
   */
  getStats(): Promise<VectorStoreStats>;

  /**
   * Get vector store metadata without loading full vectors.
   * Useful for fast validation and info display.
   */
  getMetadata(): Promise<VectorIndexMetadata | null>;

  /**
   * Validate vector integrity using checksums.
   * Only applicable to storage backends that support checksums.
   *
   * @returns True if validation passed, false otherwise
   */
  validateIntegrity(): Promise<boolean>;

  /**
   * Clear all vectors from the store.
   * Use with caution - this is destructive.
   */
  clear(): void | Promise<void>;
}

/**
 * Type guard to check if an object implements IVectorStorePlugin.
 */
export function isVectorStorePlugin(obj: unknown): obj is IVectorStorePlugin {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const plugin = obj as Partial<IVectorStorePlugin>;

  return (
    typeof plugin.initialize === 'function' &&
    typeof plugin.close === 'function' &&
    typeof plugin.isInitialized === 'function' &&
    typeof plugin.search === 'function' &&
    typeof plugin.loadVectors === 'function' &&
    typeof plugin.getVectorsByIds === 'function'
  );
}

/**
 * Helper to calculate cosine similarity between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score (0-1)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length.toString()} !== ${b.length.toString()}`
    );
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}
