/**
 * @fileoverview Server initialization service for MCP server startup tasks.
 *
 * This module handles initialization tasks that need to be performed when the
 * MCP server starts up, including loading pre-computed vectors, validating
 * integrity, and initializing search services.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import type {
  ILogger,
  IVectorStore,
  ISemanticSearchService,
} from '../core/interfaces.js';

/**
 * Server initialization service that handles startup tasks.
 */
class ServerInitializer {
  constructor(
    private logger: ILogger,
    private vectorStore: IVectorStore,
    private semanticSearchService: ISemanticSearchService
  ) {}

  /**
   * Performs all server initialization tasks.
   */
  async initialize(): Promise<void> {
    this.logger.info('Starting MCP server initialization...');
    const startTime = Date.now();

    try {
      // Initialize vector storage
      await this.initializeVectorStore();

      // Pre-warm semantic search service
      await this.initializeSemanticSearch();

      const duration = (Date.now() - startTime) / 1000;
      this.logger.info(`Server initialization completed in ${duration.toFixed(2)}s`);
    } catch (error) {
      this.logger.error(
        'Server initialization failed',
        error instanceof Error ? error : undefined,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: ((Date.now() - startTime) / 1000).toFixed(2),
        }
      );
      throw error;
    }
  }

  /**
   * Initializes vector store and loads pre-computed vectors if available.
   */
  private async initializeVectorStore(): Promise<void> {
    this.logger.info('Initializing vector store...');

    try {
      // Check if pre-computed vectors are available
      if (this.vectorStore.isAvailable()) {
        this.logger.info('Pre-computed vectors found on disk');

        // Validate vector integrity
        const integrityValid = await this.vectorStore.validateIntegrity();
        if (!integrityValid) {
          this.logger.warn(
            'Vector integrity validation failed, but continuing with available vectors'
          );
        }

        // Load vectors
        const vectorIndex = await this.vectorStore.loadVectors();
        if (vectorIndex) {
          this.logger.info('Vector store initialized successfully', {
            vectorCount: vectorIndex.vectors.length,
            model: vectorIndex.metadata.model,
            dimensions: vectorIndex.metadata.dimensions,
            version: vectorIndex.metadata.version,
          });
        } else {
          this.logger.warn('Failed to load vectors despite availability check');
        }
      } else {
        this.logger.info('No pre-computed vectors available, will generate at runtime');
      }
    } catch (error) {
      this.logger.warn(
        'Vector store initialization encountered issues, will fallback to runtime generation',
        error instanceof Error ? error : undefined
      );
      // Don't throw - allow server to continue with runtime generation
    }
  }

  /**
   * Initializes semantic search service with pre-loaded vectors or runtime generation.
   */
  private async initializeSemanticSearch(): Promise<void> {
    this.logger.info('Initializing semantic search service...');

    try {
      // Build the search index (will use pre-computed vectors if available)
      await this.semanticSearchService.buildIndex();
      this.logger.info('Semantic search service initialized successfully');
    } catch (error) {
      this.logger.error(
        'Failed to initialize semantic search service',
        error instanceof Error ? error : undefined
      );
      // This is more critical - semantic search should work
      throw new Error(
        `Semantic search initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets initialization status information.
   */
  async getInitializationStatus(): Promise<{
    vectorStoreAvailable: boolean;
    vectorsLoaded: boolean;
    semanticSearchReady: boolean;
  }> {
    try {
      const vectorStoreAvailable = this.vectorStore.isAvailable();
      const vectorsLoaded =
        vectorStoreAvailable && (await this.vectorStore.loadVectors()) !== null;

      // Check if semantic search has been initialized by trying to get metadata
      const metadata = await this.vectorStore.getMetadata();
      const semanticSearchReady = metadata !== null;

      return {
        vectorStoreAvailable,
        vectorsLoaded,
        semanticSearchReady,
      };
    } catch (error) {
      this.logger.error(
        'Failed to get initialization status',
        error instanceof Error ? error : undefined
      );
      return {
        vectorStoreAvailable: false,
        vectorsLoaded: false,
        semanticSearchReady: false,
      };
    }
  }
}

/**
 * Creates and runs server initialization.
 */
export async function initializeServer(
  logger: ILogger,
  vectorStore: IVectorStore,
  semanticSearchService: ISemanticSearchService
): Promise<ServerInitializer> {
  const initializer = new ServerInitializer(logger, vectorStore, semanticSearchService);
  await initializer.initialize();
  return initializer;
}
