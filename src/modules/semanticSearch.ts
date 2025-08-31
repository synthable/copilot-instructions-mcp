/**
 * @fileoverview Semantic search service powered by @xenova/transformers.
 *
 * Provides embedding generation with all-mpnet-base-v2 (768 dims), builds an
 * in-memory index of instruction modules (title+description+content snippets),
 * and exposes semantic and hybrid search across the modules.
 */

import type { 
  IDependencies, 
  IInstructionModuleParser, 
  IEmbeddingService,
  ISemanticConfig,
  ILogger 
} from './interfaces.js';
import type { InstructionModule, SearchResult } from './types.js';
import { cosine } from './semantic.js';
import { MemoryMonitor, LazyContentLoader } from './memoryUtils.js';
import { PerformanceCollector } from './performanceMetrics.js';

export interface EmbeddingDoc {
  id: string; // module id
  filePath: string;
  text: string; // concatenated fields
  vector: number[]; // embedding dimensions
}

/**
 * Production semantic searcher with proper dependency injection and error handling.
 */
export class SemanticSearchService {
  private index: EmbeddingDoc[] = [];
  private building = false;
  private logger: ILogger;
  private memoryMonitor: MemoryMonitor;
  private contentLoader: LazyContentLoader<string>;
  private performanceCollector: PerformanceCollector;

  constructor(
    private dependencies: IDependencies,
    private parser: IInstructionModuleParser,
    private embeddingService: IEmbeddingService,
    private config: ISemanticConfig
  ) {
    this.logger = dependencies.logger;
    this.memoryMonitor = new MemoryMonitor(config.getMaxMemoryUsageMB(), this.logger);
    this.contentLoader = new LazyContentLoader(50, this.logger); // Cache up to 50 content items
    this.performanceCollector = new PerformanceCollector(this.logger);
  }

  /** Ensure the embedding service is initialized. */
  private async ensureEmbedder(): Promise<void> {
    if (!this.embeddingService.isInitialized()) {
      this.logger.debug('Initializing embedding service for semantic search');
      await this.embeddingService.initialize();
    }
  }

  /** Build or rebuild the in-memory embedding index from modules. */
  async buildIndex(force = false): Promise<void> {
    await this.performanceCollector.time(
      'semantic_index_build',
      () => this.buildIndexInternal(force),
      { force }
    );
  }

  /** Internal index building implementation with performance monitoring. */
  private async buildIndexInternal(force = false): Promise<void> {
    if (this.index.length > 0 && !force) {
      this.logger.debug('Semantic search index already built, skipping');
      return;
    }
    
    if (this.building) {
      this.logger.debug('Index building already in progress, waiting');
      return;
    }

    this.building = true;
    
    try {
      this.logger.info('Building semantic search index with memory optimization');
      this.memoryMonitor.logMemoryUsage('index build start');
      await this.ensureEmbedder();
      
      const modules = await this.parser.parseInstructionModules();
      this.logger.debug(`Processing ${modules.length.toString()} modules for semantic indexing`);
      this.memoryMonitor.logMemoryUsage('after module parsing');
      
      const docs = await this.prepareDocumentsForEmbedding(modules);
      const embeddedDocs = await this.embedDocuments(docs);
      
      this.index = embeddedDocs;
      this.memoryMonitor.logMemoryUsage('index build complete');
      this.logger.info(`Successfully built semantic search index with ${this.index.length.toString()} documents`);
    } catch (error) {
      this.logger.error('Failed to build semantic search index', error instanceof Error ? error : undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Semantic search index build failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.building = false;
    }
  }

  /**
   * Prepares documents for embedding by extracting and concatenating relevant text with memory-aware processing.
   */
  private async prepareDocumentsForEmbedding(modules: InstructionModule[]): Promise<{ mod: InstructionModule; text: string }[]> {
    const docs: { mod: InstructionModule; text: string }[] = [];

    for (const mod of modules) {
      try {
        let bodyText = '';
        
        // Prefer UMS semantic field when available
        if (mod.semantic && mod.semantic.trim().length > 0) {
          bodyText = mod.semantic.trim();
        } else {
          // Fallback: read file content if it's not a YAML module
          bodyText = await this.readModuleContent(mod);
        }

        const text = [
          mod.name,
          mod.description,
          mod.category,
          mod.subcategory ?? '',
          (mod.tags ?? []).join(', '),
          bodyText,
        ]
          .filter(Boolean)
          .join('\n\n');

        docs.push({ mod, text });
      } catch (error) {
        this.logger.warn(`Failed to prepare document for module ${mod.id}`, error instanceof Error ? error : undefined);
        // Continue processing other modules
      }
    }

    return docs;
  }

  /**
   * Reads module content from file system with lazy loading support.
   */
  private async readModuleContent(mod: InstructionModule): Promise<string> {
    if (!this.config.isLazyLoadingEnabled()) {
      // Fallback to synchronous reading when lazy loading is disabled
      return this.readModuleContentSync(mod);
    }

    return await this.contentLoader.getContent(
      mod.id,
      () => Promise.resolve(this.readModuleContentSync(mod))
    );
  }

  /**
   * Synchronously reads module content from file system with proper error handling.
   */
  private readModuleContentSync(mod: InstructionModule): string {
    try {
      const baseDir = this.dependencies.pathUtils.join(
        this.dependencies.processUtils.cwd(),
        'instructions-modules'
      );
      const abs = this.dependencies.pathUtils.join(baseDir, mod.filePath);
      
      if (
        this.dependencies.fileSystem.existsSync(abs) &&
        !mod.filePath.endsWith('.module.yml')
      ) {
        const raw = this.dependencies.fileSystem.readFileSync(abs, 'utf-8');
        return raw.slice(0, 3000); // Limit content size
      }
    } catch (error) {
      this.logger.warn(`Could not read content for module ${mod.id}`, error instanceof Error ? error : undefined);
    }
    
    return '';
  }

  /**
   * Embeds documents using the embedding service with parallel batch processing.
   */
  private async embedDocuments(docs: { mod: InstructionModule; text: string }[]): Promise<EmbeddingDoc[]> {
    const batchSize = this.config.getIndexingBatchSize();
    
    // Create all batches upfront
    const batches: { batch: { mod: InstructionModule; text: string }[]; index: number }[] = [];
    for (let i = 0; i < docs.length; i += batchSize) {
      batches.push({
        batch: docs.slice(i, i + batchSize),
        index: i,
      });
    }
    
    this.logger.info(`Processing ${batches.length.toString()} embedding batches in parallel`);
    
    // Process all batches in parallel
    const batchPromises = batches.map(async ({ batch, index }) => {
      try {
        const batchNumber = Math.floor(index / batchSize) + 1;
        this.logger.debug(`Processing embedding batch ${batchNumber.toString()}/${batches.length.toString()}`);
        
        const inputs = batch.map(b => b.text);
        const vectors = await this.embeddingService.embedBatch(inputs);
        
        const embeddingDocs: EmbeddingDoc[] = [];
        for (let j = 0; j < batch.length; j++) {
          if (vectors[j] && vectors[j].length > 0) {
            embeddingDocs.push({
              id: batch[j].mod.id,
              filePath: batch[j].mod.filePath,
              text: batch[j].text,
              vector: vectors[j],
            });
          } else {
            this.logger.warn(`Empty embedding vector for module ${batch[j].mod.id}`);
          }
        }
        
        return embeddingDocs;
      } catch (error) {
        this.logger.error(`Failed to process embedding batch starting at index ${index.toString()}`, error instanceof Error ? error : undefined);
        return []; // Return empty array for failed batches
      }
    });
    
    // Wait for all batches to complete
    const results = await Promise.allSettled(batchPromises);
    
    // Collect successful results and log failures
    const allEmbeddingDocs: EmbeddingDoc[] = [];
    let failedBatches = 0;
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allEmbeddingDocs.push(...result.value);
      } else {
        failedBatches++;
        this.logger.warn('Embedding batch failed', result.reason instanceof Error ? result.reason : undefined);
      }
    }
    
    this.logger.info(`Completed parallel embedding processing: ${allEmbeddingDocs.length.toString()} successful embeddings, ${failedBatches.toString()} failed batches`);
    return allEmbeddingDocs;
  }

  /** Embed a query string. */
  async embedQuery(query: string): Promise<number[]> {
    return await this.performanceCollector.time(
      'query_embedding',
      async () => {
        await this.ensureEmbedder();
        
        try {
          return await this.embeddingService.embed(query);
        } catch (error) {
          this.logger.error('Failed to embed query string', error instanceof Error ? error : undefined, {
            queryLength: query.length,
          });
          throw new Error(`Query embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
      { queryLength: query.length }
    );
  }

  /** Pure semantic search over embedding index. */
  async semanticSearch(query: string, limit = 10): Promise<SearchResult[]> {
    return await this.performanceCollector.time(
      'semantic_search',
      async () => {
        try {
          this.logger.debug('Performing semantic search', { query: query.slice(0, 100), limit });
          
          await this.buildIndex();
          const queryVector = await this.embedQuery(query);
          
          if (this.index.length === 0) {
            this.logger.warn('Semantic search index is empty');
            return [];
          }
          
          const modules = await this.parser.parseInstructionModules();
          const byId = new Map(modules.map(m => [m.id, m] as const));

          // Calculate similarities
          const similarities = new Map<string, number>();
          for (const doc of this.index) {
            try {
              const similarity = cosine(queryVector, doc.vector);
              similarities.set(doc.id, similarity);
            } catch (error) {
              this.logger.warn(`Failed to calculate similarity for document ${doc.id}`, error instanceof Error ? error : undefined);
            }
          }

          // Sort by similarity and limit results
          const scored = this.index
            .map(doc => ({
              doc,
              similarity: similarities.get(doc.id) ?? 0,
            }))
            .filter(item => item.similarity > 0) // Filter out failed calculations
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, Math.max(1, limit));

          // Build results
          const results: SearchResult[] = [];
          for (const item of scored) {
            const module = byId.get(item.doc.id);
            if (module) {
              results.push({
                ...module,
                score: item.similarity,
                matchedFields: ['semantic'],
                semanticScore: item.similarity,
              });
            } else {
              this.logger.warn(`Module not found for indexed document ${item.doc.id}`);
            }
          }

          this.logger.debug(`Semantic search completed`, {
            resultsCount: results.length,
            topScore: results[0]?.score || 0,
          });

          return results;
        } catch (error) {
          this.logger.error('Semantic search failed', error instanceof Error ? error : undefined, {
            query: query.slice(0, 100),
            limit,
          });
          throw new Error(`Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
      { query: query.slice(0, 100), limit }
    );
  }

  /** Hybrid search: combine existing lexical score with semantic similarity. */
  async hybridSearch(
    queryTerms: string[],
    lexicalResults: SearchResult[],
    alpha = 0.6,
    limit = 10
  ): Promise<SearchResult[]> {
    return await this.performanceCollector.time(
      'hybrid_search',
      async () => {
        await this.buildIndex();
        const q = await this.embedQuery(queryTerms.join(' '));
        const semByPath = new Map<string, number>();
        for (const d of this.index) {
          semByPath.set(d.filePath, cosine(q, d.vector));
        }

        // Normalize lexical scores 0..1
        const lex = lexicalResults.map(r => r.score);
        const min = Math.min(...lex);
        const max = Math.max(...lex);
        const norm = (x: number) => (max === min ? 0 : (x - min) / (max - min));

        const merged = lexicalResults
          .map(r => {
            const sem = semByPath.get(r.filePath) ?? 0;
            const final = alpha * norm(r.score) + (1 - alpha) * sem;
            return { ...r, score: final, semanticScore: sem } as SearchResult;
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, Math.max(1, limit));

        return merged;
      },
      { queryTerms, alpha, limit, lexicalResultsCount: lexicalResults.length }
    );
  }
}

