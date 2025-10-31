/**
 * @fileoverview File-based vector store implementation.
 *
 * Provides persistent storage and retrieval of pre-computed vectors using
 * MessagePack (production) and JSON (development) formats. Maintains backward
 * compatibility with existing vector file formats while implementing the new
 * plugin interface.
 *
 * @author MCP Server Team
 * @version 2.0.0
 * @since 2.0.0
 */

import { createHash } from 'node:crypto';
import { promises as fs, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decode as msgpackDecode } from '@msgpack/msgpack';

import type { ILogger } from '../../core/interfaces.js';
import type {
  VectorIndex,
  VectorIndexMetadata,
  ModuleVector,
} from '../../core/types.js';
import type {
  IVectorStorePlugin,
  VectorStoreConfig,
  VectorQuery,
  VectorSearchResult,
  VectorStoreStats,
  VectorEntry,
} from './vectorStore.interface.js';
import { cosineSimilarity } from './vectorStore.interface.js';

/**
 * File-based vector store implementation.
 *
 * Loads and manages pre-computed vectors from MessagePack or JSON files.
 * Provides efficient in-memory indexing for fast lookups and search operations.
 */
export class FileVectorStore implements IVectorStorePlugin {
  private vectorIndex: VectorIndex | null = null;
  private vectorsByIdIndex = new Map<string, ModuleVector>();
  private vectorsByTierIndex = new Map<string, ModuleVector[]>();
  private vectorsDir = '';
  private loaded = false;
  private initialized = false;

  constructor(private logger: ILogger) {}

  /**
   * Initialize the file vector store with configuration.
   */
  async initialize(config: VectorStoreConfig): Promise<void> {
    if (this.initialized) {
      this.logger.debug('FileVectorStore already initialized');
      return;
    }

    // Determine vectors directory
    this.vectorsDir = config.path ?? join(process.cwd(), 'dist/vectors');

    this.logger.info('Initializing FileVectorStore', {
      vectorsDir: this.vectorsDir,
      enableIntegrityCheck: config.enableIntegrityCheck,
    });

    // Validate configuration
    if (config.dimensions && typeof config.dimensions !== 'number') {
      throw new Error('Invalid dimensions configuration');
    }

    // Optionally validate integrity
    if (config.enableIntegrityCheck && this.isAvailable()) {
      const isValid = await this.validateIntegrity();
      if (!isValid) {
        this.logger.warn('Vector integrity validation failed during initialization');
      }
    }

    this.initialized = true;
    this.logger.info('FileVectorStore initialized successfully');
  }

  /**
   * Close the vector store and release resources.
   */
  close(): void {
    this.logger.debug('Closing FileVectorStore');
    this.vectorIndex = null;
    this.vectorsByIdIndex.clear();
    this.vectorsByTierIndex.clear();
    this.loaded = false;
    this.initialized = false;
  }

  /**
   * Check if the store has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if pre-computed vectors are available on disk.
   */
  isAvailable(): boolean {
    if (!this.vectorsDir) {
      return false;
    }

    const msgpackPath = join(this.vectorsDir, 'vectors.msgpack');
    const jsonPath = join(this.vectorsDir, 'vectors.json');

    try {
      return existsSync(msgpackPath) || existsSync(jsonPath);
    } catch {
      return false;
    }
  }

  // ========== Search Operations (New API) ==========

  /**
   * Search for similar vectors using cosine similarity.
   */
  async search(query: VectorQuery): Promise<VectorSearchResult[]> {
    await this.ensureInitializedAndLoaded();

    if (!this.vectorIndex) {
      return [];
    }

    // Apply ID filter if provided
    let candidateVectors = this.vectorIndex.vectors;

    if (query.filters?.ids !== undefined) {
      const ids = query.filters.ids;
      candidateVectors = candidateVectors.filter(v => ids.includes(v.id));
    }

    // Apply tier filter if provided
    if (query.filters?.tier !== undefined) {
      const tier = query.filters.tier.toLowerCase();
      candidateVectors = candidateVectors.filter(v => v.tier.toLowerCase() === tier);
    }

    // Calculate similarities
    const results: VectorSearchResult[] = [];

    for (const moduleVector of candidateVectors) {
      try {
        const similarity = cosineSimilarity(query.vector, moduleVector.vector);

        // Apply threshold filter
        if (query.threshold !== undefined && similarity < query.threshold) {
          continue;
        }

        results.push({
          vector: moduleVector,
          similarity,
        });
      } catch (error) {
        this.logger.warn(
          'Error calculating similarity',
          error instanceof Error ? error : undefined,
          {
            moduleId: moduleVector.id,
          }
        );
      }
    }

    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    // Apply limit
    const limit = query.limit ?? 10;
    const limitedResults = results.slice(0, limit);

    this.logger.debug('Vector search completed', {
      queryDimensions: query.vector.length,
      candidateCount: candidateVectors.length,
      resultsCount: limitedResults.length,
      limit,
    });

    return limitedResults;
  }

  // ========== Indexing Operations (Future Use) ==========

  /**
   * Index a single vector entry.
   * For file-based storage, this is not yet implemented.
   */
  index(_entry: VectorEntry): Promise<void> {
    return Promise.reject(
      new Error('Real-time indexing not yet implemented for FileVectorStore')
    );
  }

  /**
   * Index multiple vector entries in batch.
   * For file-based storage, this is not yet implemented.
   */
  indexBatch(_entries: VectorEntry[]): Promise<void> {
    return Promise.reject(
      new Error('Real-time batch indexing not yet implemented for FileVectorStore')
    );
  }

  // ========== Legacy Methods (Backward Compatibility) ==========

  /**
   * Loads vectors from disk with MessagePack preferred, JSON fallback.
   */
  async loadVectors(): Promise<VectorIndex | null> {
    if (this.loaded && this.vectorIndex) {
      this.logger.debug('Returning cached vector index');
      return this.vectorIndex;
    }

    try {
      this.logger.info('Loading pre-computed vectors from disk', {
        vectorsDir: this.vectorsDir,
      });

      // Try MessagePack first (production)
      const msgpackPath = join(this.vectorsDir, 'vectors.msgpack');
      if (existsSync(msgpackPath)) {
        this.logger.debug('Loading vectors from MessagePack format');
        const msgpackData = await fs.readFile(msgpackPath);
        const decodedData = msgpackDecode(msgpackData);

        if (this.isValidVectorIndex(decodedData)) {
          this.vectorIndex = decodedData;
          this.buildIndices();
          this.loaded = true;
          this.logger.info(
            `Loaded ${this.vectorIndex.vectors.length.toString()} vectors from MessagePack`
          );
          return this.vectorIndex;
        }
      }

      // Fallback to JSON (development)
      const jsonPath = join(this.vectorsDir, 'vectors.json');
      if (existsSync(jsonPath)) {
        this.logger.debug('Loading vectors from JSON format (fallback)');
        const jsonContent = await fs.readFile(jsonPath, 'utf-8');
        const parsedData = JSON.parse(jsonContent) as unknown;

        if (this.isValidVectorIndex(parsedData)) {
          this.vectorIndex = parsedData;
          this.buildIndices();
          this.loaded = true;
          this.logger.info(
            `Loaded ${this.vectorIndex.vectors.length.toString()} vectors from JSON`
          );
          return this.vectorIndex;
        }
      }

      this.logger.warn('No valid vector files found', undefined, {
        msgpackPath,
        jsonPath,
        msgpackExists: existsSync(msgpackPath),
        jsonExists: existsSync(jsonPath),
      });

      return null;
    } catch (error) {
      this.logger.error(
        'Failed to load vectors from disk',
        error instanceof Error ? error : undefined,
        {
          vectorsDir: this.vectorsDir,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
      return null;
    }
  }

  /**
   * Gets vectors by module IDs with efficient index lookup.
   */
  async getVectorsByIds(moduleIds: string[]): Promise<ModuleVector[]> {
    await this.ensureInitializedAndLoaded();

    const results: ModuleVector[] = [];
    const notFound: string[] = [];

    for (const moduleId of moduleIds) {
      const vector = this.vectorsByIdIndex.get(moduleId);
      if (vector) {
        results.push(vector);
      } else {
        notFound.push(moduleId);
      }
    }

    if (notFound.length > 0) {
      this.logger.debug('Some module vectors not found', {
        requestedCount: moduleIds.length,
        foundCount: results.length,
        notFound: notFound.slice(0, 5), // Log first 5 missing IDs
      });
    }

    return results;
  }

  /**
   * Gets vectors by tier/category filter.
   */
  async getVectorsByTier(tier: string): Promise<ModuleVector[]> {
    await this.ensureInitializedAndLoaded();

    const normalizedTier = tier.toLowerCase();
    const vectors = this.vectorsByTierIndex.get(normalizedTier) ?? [];

    this.logger.debug('Retrieved vectors by tier', {
      tier: normalizedTier,
      count: vectors.length,
    });

    return [...vectors]; // Return copy to prevent mutation
  }

  /**
   * Get all vectors in the store.
   */
  async getAllVectors(): Promise<ModuleVector[]> {
    await this.ensureInitializedAndLoaded();

    if (!this.vectorIndex) {
      return [];
    }

    return [...this.vectorIndex.vectors]; // Return copy to prevent mutation
  }

  // ========== Management Operations ==========

  /**
   * Get storage statistics and metadata.
   */
  async getStats(): Promise<VectorStoreStats> {
    await this.ensureInitializedAndLoaded();

    const metadata = await this.getMetadata();

    return {
      count: metadata?.count ?? 0,
      type: 'file',
      model: metadata?.model ?? 'unknown',
      dimensions: metadata?.dimensions ?? 0,
      lastUpdated: metadata?.timestamp ?? undefined,
    };
  }

  /**
   * Gets vector store metadata without loading full vectors.
   */
  async getMetadata(): Promise<VectorIndexMetadata | null> {
    try {
      const metadataPath = join(this.vectorsDir, 'metadata.json');

      if (!existsSync(metadataPath)) {
        this.logger.debug('Metadata file not found', { metadataPath });
        return null;
      }

      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent) as unknown;

      if (this.isValidMetadata(metadata)) {
        return metadata;
      }

      this.logger.warn('Invalid metadata file format');
      return null;
    } catch (error) {
      this.logger.error(
        'Failed to load vector metadata',
        error instanceof Error ? error : undefined
      );
      return null;
    }
  }

  /**
   * Validates vector integrity using MD5 checksums.
   */
  async validateIntegrity(): Promise<boolean> {
    try {
      const checksumsPath = join(this.vectorsDir, 'checksums.json');

      if (!existsSync(checksumsPath)) {
        this.logger.warn('Checksums file not found', undefined, { checksumsPath });
        return false;
      }

      const checksumsContent = await fs.readFile(checksumsPath, 'utf-8');
      const checksums = JSON.parse(checksumsContent) as Record<string, string>;

      // Validate each file
      const filesToCheck = ['vectors.json', 'vectors.msgpack', 'metadata.json'];
      let validFiles = 0;

      for (const filename of filesToCheck) {
        const filepath = join(this.vectorsDir, filename);

        if (existsSync(filepath)) {
          const content = await fs.readFile(filepath);
          const actualHash = createHash('md5').update(content).digest('hex');
          const expectedHash = checksums[filename];

          if (actualHash === expectedHash) {
            validFiles++;
          } else {
            this.logger.warn('Checksum mismatch detected', undefined, {
              filename,
              expected: expectedHash,
              actual: actualHash,
            });
            return false;
          }
        }
      }

      this.logger.info('Vector integrity validation passed', {
        validatedFiles: validFiles,
        totalFiles: filesToCheck.length,
      });

      return validFiles > 0;
    } catch (error) {
      this.logger.error(
        'Vector integrity validation failed',
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Clear all vectors from the store.
   */
  clear(): void {
    this.logger.warn('Clearing all vectors from FileVectorStore');
    this.vectorIndex = null;
    this.vectorsByIdIndex.clear();
    this.vectorsByTierIndex.clear();
    this.loaded = false;
  }

  // ========== Private Helper Methods ==========

  /**
   * Ensures store is initialized and vectors are loaded.
   */
  private async ensureInitializedAndLoaded(): Promise<void> {
    if (!this.initialized) {
      throw new Error('FileVectorStore not initialized. Call initialize() first.');
    }

    if (!this.loaded || !this.vectorIndex) {
      await this.loadVectors();
    }
  }

  /**
   * Builds internal indices for fast lookups by ID and tier.
   */
  private buildIndices(): void {
    if (!this.vectorIndex) return;

    // Clear existing indices
    this.vectorsByIdIndex.clear();
    this.vectorsByTierIndex.clear();

    // Build ID index
    for (const vector of this.vectorIndex.vectors) {
      this.vectorsByIdIndex.set(vector.id, vector);
    }

    // Build tier index
    const tierGroups = new Map<string, ModuleVector[]>();
    for (const vector of this.vectorIndex.vectors) {
      const tier = vector.tier.toLowerCase();
      if (!tierGroups.has(tier)) {
        tierGroups.set(tier, []);
      }
      const tierVectors = tierGroups.get(tier);
      if (tierVectors) {
        tierVectors.push(vector);
      }
    }

    this.vectorsByTierIndex = tierGroups;

    this.logger.debug('Built vector indices', {
      totalVectors: this.vectorIndex.vectors.length,
      uniqueIds: this.vectorsByIdIndex.size,
      tiers: Array.from(this.vectorsByTierIndex.keys()),
    });
  }

  /**
   * Type guard for validating VectorIndex structure.
   */
  private isValidVectorIndex(data: unknown): data is VectorIndex {
    if (!data || typeof data !== 'object') return false;

    const obj = data as Record<string, unknown>;
    return (
      'metadata' in obj &&
      'vectors' in obj &&
      this.isValidMetadata(obj.metadata) &&
      Array.isArray(obj.vectors) &&
      obj.vectors.every(v => this.isValidModuleVector(v))
    );
  }

  /**
   * Type guard for validating VectorIndexMetadata structure.
   */
  private isValidMetadata(data: unknown): data is VectorIndexMetadata {
    if (!data || typeof data !== 'object') return false;

    const obj = data as Record<string, unknown>;
    return (
      typeof obj.count === 'number' &&
      typeof obj.model === 'string' &&
      typeof obj.dimensions === 'number' &&
      typeof obj.timestamp === 'number' &&
      typeof obj.version === 'string' &&
      Array.isArray(obj.modules)
    );
  }

  /**
   * Type guard for validating ModuleVector structure.
   */
  private isValidModuleVector(data: unknown): data is ModuleVector {
    if (!data || typeof data !== 'object') return false;

    const obj = data as Record<string, unknown>;
    return (
      typeof obj.id === 'string' &&
      Array.isArray(obj.vector) &&
      obj.vector.every(n => typeof n === 'number') &&
      typeof obj.contentHash === 'string' &&
      typeof obj.timestamp === 'number' &&
      typeof obj.tier === 'string'
    );
  }
}
