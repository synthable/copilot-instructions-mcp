/**
 * @fileoverview Semantic search service powered by @xenova/transformers.
 *
 * Provides embedding generation with all-mpnet-base-v2 (768 dims), builds an
 * in-memory index of instruction modules (title+description+content snippets),
 * and exposes semantic and hybrid search across the modules.
 */

import type { IDependencies, IInstructionModuleParser } from './interfaces.js';
import type { InstructionModule, SearchResult } from './types.js';
import { cosine } from './semantic.js';

// Minimal types for the embedder without relying on upstream types
interface EmbedOptions { pooling?: 'mean' | 'max'; normalize?: boolean }
type EmbeddingTensor = Float32Array | number[] | { data?: Float32Array | number[] };
type EmbedOutput = EmbeddingTensor | EmbeddingTensor[];
type EmbedderFunc = (input: string | string[], options?: EmbedOptions) => Promise<EmbedOutput>;

export interface EmbeddingDoc {
  id: string; // module id
  filePath: string;
  text: string; // concatenated fields
  vector: number[]; // 768 dims
}

/**
 * Simple semantic searcher with lazy model loading and small in-memory index.
 */
export class SemanticSearchService {
  private embedder: EmbedderFunc | undefined;
  private index: EmbeddingDoc[] = [];
  private building = false;

  constructor(
    private dependencies: IDependencies,
    private parser: IInstructionModuleParser
  ) {}

  /** Ensure the embedding pipeline is loaded. */
  private async ensureEmbedder() {
    if (this.embedder) return;
  const mod: unknown = await import('@xenova/transformers');
  const pipeline = (mod as { pipeline: (task: string, model?: string) => Promise<EmbedderFunc> }).pipeline;
  // sentence-transformers style model; Xenova auto-downloads on first use
  this.embedder = await pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2');
  }

  /** Build or rebuild the in-memory embedding index from modules. */
  async buildIndex(force = false) {
    if (this.index.length > 0 && !force) return;
    if (this.building) return; // avoid concurrent builds
    this.building = true;
    try {
      await this.ensureEmbedder();
      const modules = this.parser.parseInstructionModules();
      const docs: { mod: InstructionModule; text: string }[] = [];

      for (const mod of modules) {
        let contentSnippet = '';
        try {
          const baseDir = this.dependencies.pathUtils.join(
            this.dependencies.processUtils.cwd(),
            'instructions-modules'
          );
          const abs = this.dependencies.pathUtils.join(baseDir, mod.filePath);
          if (this.dependencies.fileSystem.existsSync(abs)) {
            const raw = this.dependencies.fileSystem.readFileSync(abs, 'utf-8');
            // trim to 2-3k chars to cap tokenization; keep headings
            contentSnippet = raw.slice(0, 3000);
          }
        } catch {
          // ignore content read errors
        }

        const text = [mod.name, mod.description, mod.category, mod.subcategory ?? '', contentSnippet]
          .filter(Boolean)
          .join('\n\n');
        docs.push({ mod, text });
      }

      // Batch embed to reduce overhead
      const batches: EmbeddingDoc[] = [];
      const batchSize = 8;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        const inputs = batch.map(b => b.text);
        if (!this.embedder) throw new Error('Embedder not initialized');
        const outputs = await this.embedder(inputs, { pooling: 'mean', normalize: true });
        const vectors: number[][] = normalizeEmbedOutput(outputs);
        for (let j = 0; j < batch.length; j++) {
          batches.push({
            id: batch[j].mod.id,
            filePath: batch[j].mod.filePath,
            text: batch[j].text,
            vector: vectors[j] ?? [],
          });
        }
      }

      this.index = batches.filter(d => d.vector.length > 0);
    } finally {
      this.building = false;
    }
  }

  /** Embed a query string. */
  async embedQuery(query: string): Promise<number[]> {
    await this.ensureEmbedder();
  if (!this.embedder) throw new Error('Embedder not initialized');
  const out = await this.embedder(query, { pooling: 'mean', normalize: true });
  const arrs = normalizeEmbedOutput(out);
  return arrs[0] ?? [];
  }

  /** Pure semantic search over embedding index. */
  async semanticSearch(query: string, limit = 10): Promise<SearchResult[]> {
    await this.buildIndex();
    const q = await this.embedQuery(query);
    const modules = this.parser.parseInstructionModules();
    const byId = new Map(modules.map(m => [m.id, m] as const));

    const sims = new Map<string, number>();
    for (const doc of this.index) {
      sims.set(doc.id, cosine(q, doc.vector));
    }
    const scored = this.index
      .map(doc => ({ doc, sim: sims.get(doc.id) ?? 0 }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, Math.max(1, limit));

    const out: SearchResult[] = [];
    for (const s of scored) {
      const m = byId.get(s.doc.id);
      if (!m) continue;
      out.push({ ...m, score: s.sim, matchedFields: ['semantic'], semanticScore: s.sim });
    }
    return out;
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

// Helpers
function hasData(x: unknown): x is { data: Float32Array | number[] } {
  return typeof x === 'object' && x !== null && 'data' in (x as Record<string, unknown>);
}

function toNumberArray(t: EmbeddingTensor): number[] {
  if (Array.isArray(t)) return t.map(n => Number(n));
  if (t instanceof Float32Array) return Array.from(t);
  if (hasData(t)) {
    const d = t.data;
    return d instanceof Float32Array ? Array.from(d) : Array.isArray(d) ? d.map(n => Number(n)) : [];
  }
  return [];
}

function normalizeEmbedOutput(out: EmbedOutput): number[][] {
  if (Array.isArray(out)) return out.map(toNumberArray);
  return [toNumberArray(out)];
}
