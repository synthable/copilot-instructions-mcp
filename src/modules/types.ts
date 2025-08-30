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
 * Supports both legacy Markdown-listed modules (from README.md) and UMS v1.0 YAML modules (*.module.yml).
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
 *   tags: ["reasoning", "systems"]
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
