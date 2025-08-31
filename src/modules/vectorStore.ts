/**
 * @fileoverview Vector storage service implementation.
 *
 * This module provides persistent storage and retrieval of pre-computed vectors
 * with support for MessagePack (production) and JSON (development) formats.
 * Includes integrity validation, indexing by ID and tier, and fallback mechanisms.
 *
 * @author MCP Server Team  
 * @version 1.0.0
 * @since 1.0.0
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { decode as msgpackDecode } from '@msgpack/msgpack';

import type { 
  IVectorStore,
  IDependencies,
  ILogger
} from './interfaces.js';
import type {
  VectorIndex,
  VectorIndexMetadata, 
  ModuleVector
} from './types.js';

/**
 * Vector store implementation that handles loading and managing pre-computed vectors.
 */
export class VectorStore implements IVectorStore {
  private vectorIndex: VectorIndex | null = null;
  private vectorsByIdIndex = new Map<string, ModuleVector>();
  private vectorsByTierIndex = new Map<string, ModuleVector[]>();
  private vectorsDir: string;
  private loaded = false;
  
  constructor(
    private dependencies: IDependencies,
    private logger: ILogger,
    vectorsDir = 'dist/vectors'
  ) {
    this.vectorsDir = this.dependencies.pathUtils.resolve(
      this.dependencies.processUtils.cwd(),
      vectorsDir
    );
  }

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
        vectorsDir: this.vectorsDir
      });

      // Try MessagePack first (production)
      const msgpackPath = join(this.vectorsDir, 'vectors.msgpack');
      if (this.dependencies.fileSystem.existsSync(msgpackPath)) {
        this.logger.debug('Loading vectors from MessagePack format');
        const msgpackData = await fs.readFile(msgpackPath);
        const decodedData = msgpackDecode(msgpackData);
        
        if (this.isValidVectorIndex(decodedData)) {
          this.vectorIndex = decodedData;
          this.buildIndices();
          this.loaded = true;
          this.logger.info(`Loaded ${this.vectorIndex.vectors.length.toString()} vectors from MessagePack`);
          return this.vectorIndex;
        }
      }

      // Fallback to JSON (development)
      const jsonPath = join(this.vectorsDir, 'vectors.json');
      if (this.dependencies.fileSystem.existsSync(jsonPath)) {
        this.logger.debug('Loading vectors from JSON format (fallback)');
        const jsonContent = await fs.readFile(jsonPath, 'utf-8');
        const parsedData = JSON.parse(jsonContent) as unknown;
        
        if (this.isValidVectorIndex(parsedData)) {
          this.vectorIndex = parsedData;
          this.buildIndices();
          this.loaded = true;
          this.logger.info(`Loaded ${this.vectorIndex.vectors.length.toString()} vectors from JSON`);
          return this.vectorIndex;
        }
      }

      this.logger.warn('No valid vector files found', undefined, {
        msgpackPath,
        jsonPath,
        msgpackExists: this.dependencies.fileSystem.existsSync(msgpackPath),
        jsonExists: this.dependencies.fileSystem.existsSync(jsonPath)
      });
      
      return null;
    } catch (error) {
      this.logger.error(
        'Failed to load vectors from disk',
        error instanceof Error ? error : undefined,
        {
          vectorsDir: this.vectorsDir,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      return null;
    }
  }

  /**
   * Gets vectors by module IDs with efficient index lookup.
   */
  async getVectorsByIds(moduleIds: string[]): Promise<ModuleVector[]> {
    await this.ensureLoaded();
    
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
        notFound: notFound.slice(0, 5) // Log first 5 missing IDs
      });
    }
    
    return results;
  }

  /**
   * Gets vectors by tier/category filter.
   */
  async getVectorsByTier(tier: string): Promise<ModuleVector[]> {
    await this.ensureLoaded();
    
    const normalizedTier = tier.toLowerCase();
    const vectors = this.vectorsByTierIndex.get(normalizedTier) ?? [];
    
    this.logger.debug('Retrieved vectors by tier', {
      tier: normalizedTier,
      count: vectors.length
    });
    
    return [...vectors]; // Return copy to prevent mutation
  }

  /**
   * Validates vector integrity using MD5 checksums.
   */
  async validateIntegrity(): Promise<boolean> {
    try {
      const checksumsPath = join(this.vectorsDir, 'checksums.json');
      
      if (!this.dependencies.fileSystem.existsSync(checksumsPath)) {
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
        
        if (this.dependencies.fileSystem.existsSync(filepath)) {
          const content = await fs.readFile(filepath);
          const actualHash = createHash('md5').update(content).digest('hex');
          const expectedHash = checksums[filename];
          
          if (actualHash === expectedHash) {
            validFiles++;
          } else {
            this.logger.warn('Checksum mismatch detected', undefined, {
              filename,
              expected: expectedHash,
              actual: actualHash
            });
            return false;
          }
        }
      }
      
      this.logger.info('Vector integrity validation passed', {
        validatedFiles: validFiles,
        totalFiles: filesToCheck.length
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
   * Gets vector store metadata without loading full vectors.
   */
  async getMetadata(): Promise<VectorIndexMetadata | null> {
    try {
      const metadataPath = join(this.vectorsDir, 'metadata.json');
      
      if (!this.dependencies.fileSystem.existsSync(metadataPath)) {
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
   * Checks if pre-computed vectors are available on disk.
   */
  isAvailable(): boolean {
    const msgpackPath = join(this.vectorsDir, 'vectors.msgpack');
    const jsonPath = join(this.vectorsDir, 'vectors.json');
    
    const msgpackExists = this.dependencies.fileSystem.existsSync(msgpackPath);
    const jsonExists = this.dependencies.fileSystem.existsSync(jsonPath);
    
    return msgpackExists || jsonExists;
  }

  /**
   * Ensures vectors are loaded before operations.
   */
  private async ensureLoaded(): Promise<void> {
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
      tiers: Array.from(this.vectorsByTierIndex.keys())
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