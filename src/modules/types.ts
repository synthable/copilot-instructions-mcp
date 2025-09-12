/**
 * @fileoverview Type definitions for the Simple MCP Server.
 *
 * This module contains all TypeScript interfaces and types used throughout
 * the MCP server implementation, including data structures for instruction
 * modules, search results, and internal parsing state.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

/**
 * Represents an instruction module.
 *
 * Supports both legacy Markdown-listed modules (from README.md) and UMS v1.0/v1.1 YAML modules (*.module.yml).
 *
 * @interface InstructionModule
 * @property {string} id - Unique identifier (dot-separated for legacy, slash-separated for UMS, e.g., "foundation.logic.deductive-reasoning" or "foundation/reasoning/systems-thinking")
 * @property {string} name - Human-readable display name (e.g., "Deductive Reasoning")
 * @property {string} description - Brief description of the module's purpose and capabilities
 * @property {string} category - Main category: "Foundation", "Principle", "Technology", or "Execution"
 * @property {string} [subcategory] - Optional subcategory/context (derived from subject path when available)
 * @property {string} filePath - Relative path to the module file from instructions-modules/ (Markdown or .module.yml)
 * @property {string} [semantic] - Optional semantic-rich paragraph used for embeddings (UMS meta.semantic)
 * @property {string[]} [tags] - Optional tags for filtering/boosting (UMS meta.tags)
 * @property {number} [layer] - Optional layer field for foundation modules (0-4, UMS v1.1+)
 *
 * @example
 * ```typescript
 * const module: InstructionModule = {
 *   id: "foundation/reasoning/systems-thinking",
 *   name: "Systems Thinking",
 *   description: "Reason about systems, feedback loops, and emergent behavior",
 *   category: "Foundation",
 *   filePath: "foundation/reasoning/systems-thinking.module.yml",
 *   semantic: "Dense, keyword-rich semantic description used for embeddings.",
 *   tags: ["reasoning", "systems"],
 *   layer: 1
 * };
 * ```
 */
export interface InstructionModule {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  filePath: string;
  /** Optional semantic paragraph from UMS meta for vectorization */
  semantic?: string;
  /** Optional tags from UMS meta for filtering/boosting */
  tags?: string[];
  /** Optional layer field for foundation modules (UMS v1.1+) */
  layer?: number;
}

/**
 * Represents a fuzzy search result for an instruction module.
 * Extends InstructionModule with search-specific metadata for ranking and transparency.
 *
 * @interface SearchResult
 * @extends InstructionModule
 * @property {number} score - Weighted fuzzy match score (0-∞, higher is better). Combines scores from multiple fields.
 * @property {string[]} matchedFields - Fields that matched search terms: "name", "description", "category", "subcategory", "content"
 * @property {string[]} [contentMatches] - Truncated content snippets (≤200 chars) showing context around matches
 *
 * @example
 * ```typescript
 * const searchResult: SearchResult = {
 *   ...moduleData,
 *   score: 2.4,
 *   matchedFields: ["name", "description"],
 *   contentMatches: ["Apply logical reasoning to determine..."]
 * };
 * ```
 */
export interface SearchResult extends InstructionModule {
  score: number;
  matchedFields: string[];
  contentMatches?: string[];
  /** Optional semantic similarity score (0..1) when semantic search/rerank is used */
  semanticScore?: number;
  /** Optional relevance level based on similarity score */
  relevanceLevel?: 'high' | 'medium' | 'low' | 'none';
}

/**
 * Result interface for the get_modules_content MCP tool operation.
 *
 * Contains the combined content from multiple instruction modules along with
 * metadata about the operation's success status and any errors encountered.
 *
 * @interface GetModulesContentResult
 * @property {boolean} success - Whether the operation completed successfully
 * @property {string} [content] - Combined markdown content with module headers and separators
 * @property {string[]} [errors] - Array of error messages for modules that failed to load
 *
 * @example
 * ```typescript
 * const result: GetModulesContentResult = {
 *   success: true,
 *   content: "# Module: foundation.logic.deductive-reasoning\n\n## Summary\n...",
 *   errors: [] // Empty if all modules loaded successfully
 * };
 * ```
 *
 * @since 1.0.0
 */
export interface GetModulesContentResult {
  success: boolean;
  content?: string;
  errors?: string[];
}

/**
 * Generic type for MCP tool request arguments.
 *
 * Represents the flexible argument structure that can be passed to MCP tools.
 * Each tool validates and casts these arguments to their specific expected types.
 *
 * @example
 * ```typescript
 * const searchArgs: ToolArgs = {
 *   query: "typescript generics",
 *   limit: 10
 * };
 * ```
 *
 * @since 1.0.0
 */
export type ToolArgs = Record<string, unknown>;

/**
 * Pre-computed vector data for a module.
 * Contains the embedding vector and metadata for fast loading.
 */
export interface ModuleVector {
  /** Module ID (e.g., "foundation/reasoning/systems-thinking") */
  id: string;
  /** Pre-computed embedding vector (768 dimensions for all-mpnet-base-v2) */
  vector: number[];
  /** MD5 hash of the semantic content used to generate the vector */
  contentHash: string;
  /** Timestamp when the vector was generated */
  timestamp: number;
  /** Module tier/category for filtering */
  tier: string;
}

/**
 * Vector index metadata without the actual embeddings.
 * Used for fast loading and validation.
 */
export interface VectorIndexMetadata {
  /** Total number of vectors in the index */
  count: number;
  /** Model name used for embedding generation */
  model: string;
  /** Vector dimensions */
  dimensions: number;
  /** Timestamp when the index was generated */
  timestamp: number;
  /** Version of the vector generation tool */
  version: string;
  /** Array of module metadata without vectors */
  modules: {
    id: string;
    tier: string;
    contentHash: string;
    timestamp: number;
  }[];
}

/**
 * Complete vector index containing all vectors and metadata.
 */
export interface VectorIndex {
  /** Index metadata */
  metadata: VectorIndexMetadata;
  /** Array of all module vectors */
  vectors: ModuleVector[];
}

/**
 * Internal state tracking for the instruction module parsing process.
 *
 * Maintains context while parsing the README.md file to extract the hierarchical
 * structure of categories, subcategories, and individual modules.
 *
 * @interface ParsingState
 * @property {string} currentCategory - Currently active category being parsed
 * @property {string} currentSubcategory - Currently active subcategory being parsed
 * @property {number} categoryCount - Total number of categories found
 * @property {number} subcategoryCount - Total number of subcategories found
 * @property {number} moduleCount - Total number of modules found
 *
 * @example
 * ```typescript
 * const state: ParsingState = {
 *   currentCategory: "Foundation",
 *   currentSubcategory: "Logic",
 *   categoryCount: 2,
 *   subcategoryCount: 5,
 *   moduleCount: 23
 * };
 * ```
 *
 * @since 1.0.0
 * @internal
 */
export interface ParsingState {
  currentCategory: string;
  currentSubcategory: string;
  categoryCount: number;
  subcategoryCount: number;
  moduleCount: number;
}

/**
 * UMS v1.1 type definitions for full YAML module parsing and rendering
 */

/**
 * Composite list directive format (UMS v1.1)
 * Can be either a simple array or an object with description and list
 */
export type CompositeListDirective =
  | string[]
  | {
      desc?: string;
      list: string[];
    };

/**
 * UMS v1.1 body directive definitions
 */
export interface UMSv11Body {
  purpose?: string; // renamed from 'goal' in v1.0
  process?: CompositeListDirective;
  constraints?: CompositeListDirective;
  principles?: CompositeListDirective;
  recommended?: CompositeListDirective; // new in v1.1
  discouraged?: CompositeListDirective; // new in v1.1
  advantages?: CompositeListDirective; // new in v1.1
  disadvantages?: CompositeListDirective; // new in v1.1
  criteria?: CompositeListDirective;
  data?: {
    mediaType: string;
    value: string;
    language?: string;
  };
  examples?: {
    title: string;
    rationale: string;
    snippet: string;
    language?: string;
  }[];
  resources?: {
    name: string;
    mediaType: string;
    value: string;
    language?: string;
  }[];
}

/**
 * UMS v1.1 module metadata
 */
export interface UMSv11Meta {
  name: string;
  description: string;
  semantic?: string;
  tags?: string[];
  layer?: 0 | 1 | 2 | 3 | 4; // foundation modules only
}

/**
 * Complete UMS v1.1 module structure
 */
export interface UMSv11Module {
  id: string;
  version: string;
  schemaVersion: '1.0' | '1.1';
  shape: string;
  declaredDirectives: {
    required: string[];
    optional: string[];
  };
  meta: UMSv11Meta;
  body: UMSv11Body;
}
