/**
 * Represents an instruction module parsed from the README.
 *
 * @interface InstructionModule
 * @property {string} id - Unique identifier derived from file path (e.g., "foundation.logic.deductive-reasoning")
 * @property {string} name - Human-readable display name (e.g., "Deductive Reasoning")
 * @property {string} description - Brief description of the module's purpose and capabilities
 * @property {string} category - Main category: "Foundation", "Principle", "Technology", or "Execution"
 * @property {string} [subcategory] - Optional subcategory for finer classification (e.g., "Logic", "Problem Solving")
 * @property {string} filePath - Relative path to the module's markdown file from instructions-modules/
 *
 * @example
 * ```typescript
 * const module: InstructionModule = {
 *   id: "foundation.logic.deductive-reasoning",
 *   name: "Deductive Reasoning",
 *   description: "Apply logical deduction to draw valid conclusions",
 *   category: "Foundation",
 *   subcategory: "Logic",
 *   filePath: "foundation/logic/deductive-reasoning.md"
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
}

/**
 * Result interface for getting modules content
 */
export interface GetModulesContentResult {
  success: boolean;
  content?: string;
  errors?: string[];
}

/**
 * Type for tool request arguments
 */
export type ToolArgs = Record<string, unknown>;

/**
 * Parsing state for module parsing functions
 */
export interface ParsingState {
  currentCategory: string;
  currentSubcategory: string;
  categoryCount: number;
  subcategoryCount: number;
  moduleCount: number;
}