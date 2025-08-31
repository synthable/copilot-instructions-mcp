import type { SearchResult } from './types.js';
import { createLogger } from './logger.js';

const semanticLogger = createLogger('semantic');

/**
 * Represents an entry in the embedding index.
 */
export interface EmbeddingIndexEntry {
  filePath: string;
  chunks: number[][]; // Content chunk embeddings
  fields?: Record<string, number[]>; // Optional: name/description/category embeddings
}

/**
 * Embedding index mapping file paths to their entries.
 */
export type EmbeddingIndex = Record<string, EmbeddingIndexEntry>;

/**
 * Loads the embedding index from a JSON file.
 * Returns null if the file does not exist or is invalid.
 */
export function loadEmbeddingIndex(
  fs: {
    readFileSync: (p: string, enc: BufferEncoding) => string;
    existsSync: (p: string) => boolean;
  },
  path: { join: (...p: string[]) => string },
  cwd: string,
  filename = 'data/embeddings.json'
): EmbeddingIndex | null {
  const p = path.join(cwd, filename);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const arr = JSON.parse(raw) as EmbeddingIndexEntry[];
    if (!Array.isArray(arr)) return null;
    const idx: EmbeddingIndex = {};
    for (const e of arr) {
      if (e.filePath && Array.isArray(e.chunks)) {
        idx[e.filePath] = e;
      }
    }
    return Object.keys(idx).length > 0 ? idx : null;
  } catch (err) {
    semanticLogger.error(
      'Failed to create inverted index',
      err instanceof Error ? err : undefined
    );
    return null;
  }
}

/**
 * Calculates the cosine similarity between two vectors.
 */
export function cosine(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0)
    return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i],
      y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Finds the maximum similarity between the query and entry's chunks/fields.
 */
function maxChunkSimilarity(query: number[], entry: EmbeddingIndexEntry): number {
  if (!Array.isArray(query)) return 0;
  let best = 0;
  if (entry.fields) {
    for (const v of Object.values(entry.fields)) {
      if (Array.isArray(v)) best = Math.max(best, cosine(query, v));
    }
  }
  for (const v of entry.chunks) {
    if (Array.isArray(v)) best = Math.max(best, cosine(query, v));
  }
  return best;
}

/**
 * Returns a normalization function for the given values.
 */
function minMaxNormalize(values: number[]): (x: number) => number {
  if (!Array.isArray(values) || values.length === 0) return () => 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return () => 0;
  const range = max - min;
  return (x: number) => (x - min) / range;
}

/**
 * Hybrid re-rank: combine lexical score with semantic cosine similarity.
 * alpha: weight for lexical score (0..1). Higher = prefer lexical.
 */
export function rerankWithEmbeddings(
  results: SearchResult[],
  queryEmbedding: number[],
  index: EmbeddingIndex | null,
  alpha = 0.6
): SearchResult[] {
  if (
    !index ||
    !Array.isArray(results) ||
    results.length === 0 ||
    !Array.isArray(queryEmbedding)
  )
    return results;

  const lex = results.map(r => r.score);
  const norm = minMaxNormalize(lex);

  return results
    .map(r => {
      const entry = index[r.filePath];
      const sem = maxChunkSimilarity(queryEmbedding, entry);
      const final = alpha * norm(r.score) + (1 - alpha) * sem;
      return { ...r, score: final, semanticScore: sem };
    })
    .sort((a, b) => b.score - a.score);
}
