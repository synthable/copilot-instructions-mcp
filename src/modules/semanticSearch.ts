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
  ILogger 
} from './interfaces.js';
import type { InstructionModule, SearchResult } from './types.js';
import { cosine } from './semantic.js';

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

  constructor(
    private dependencies: IDependencies,
    private parser: IInstructionModuleParser,
    private embeddingService: IEmbeddingService
  ) {
    this.logger = dependencies.logger;
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
      this.logger.info('Building semantic search index');
      await this.ensureEmbedder();
      
      const modules = await this.parser.parseInstructionModules();
      this.logger.debug(`Processing ${modules.length.toString()} modules for semantic indexing`);
      
      const docs = this.prepareDocumentsForEmbedding(modules);
      const embeddedDocs = await this.embedDocuments(docs);
      
      this.index = embeddedDocs;
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
   * Prepares documents for embedding by extracting and concatenating relevant text.
   */
  private prepareDocumentsForEmbedding(modules: InstructionModule[]): { mod: InstructionModule; text: string }[] {
    const docs: { mod: InstructionModule; text: string }[] = [];

    for (const mod of modules) {
      try {
        let bodyText = '';
        
        // Prefer UMS semantic field when available
        if (mod.semantic && mod.semantic.trim().length > 0) {
          bodyText = mod.semantic.trim();
        } else {
          // Fallback: read file content if it's not a YAML module
          bodyText = this.readModuleContent(mod);
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
   * Reads module content from file system with proper error handling.
   */
  private readModuleContent(mod: InstructionModule): string {
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
   * Embeds documents using the embedding service with proper batching.
   */
  private async embedDocuments(docs: { mod: InstructionModule; text: string }[]): Promise<EmbeddingDoc[]> {
    const batches: EmbeddingDoc[] = [];
    const batchSize = 8; // TODO: Get from config
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      
      try {
        this.logger.debug(`Processing embedding batch ${(Math.floor(i / batchSize) + 1).toString()}/${Math.ceil(docs.length / batchSize).toString()}`);
        
        const inputs = batch.map(b => b.text);
        const vectors = await this.embeddingService.embedBatch(inputs);
        
        for (let j = 0; j < batch.length; j++) {
          if (vectors[j] && vectors[j].length > 0) {
            batches.push({
              id: batch[j].mod.id,
              filePath: batch[j].mod.filePath,
              text: batch[j].text,
              vector: vectors[j],
            });
          } else {
            this.logger.warn(`Empty embedding vector for module ${batch[j].mod.id}`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to process embedding batch starting at index ${i.toString()}`, error instanceof Error ? error : undefined);
        // Continue with next batch rather than failing entire index build
      }
    }

    return batches;
  }

  /** Embed a query string. */
  async embedQuery(query: string): Promise<number[]> {
    await this.ensureEmbedder();
    
    try {
      return await this.embeddingService.embed(query);
    } catch (error) {
      this.logger.error('Failed to embed query string', error instanceof Error ? error : undefined, {
        queryLength: query.length,
      });
      throw new Error(`Query embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /** Pure semantic search over embedding index. */
  async semanticSearch(query: string, limit = 10): Promise<SearchResult[]> {
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
  }

  /** Hybrid search: combine existing lexical score with semantic similarity. */
  async hybridSearch(
    queryTerms: string[],
    lexicalResults: SearchResult[],
    alpha = 0.6,
    limit = 10
  ): Promise<SearchResult[]> {
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
  }
}

