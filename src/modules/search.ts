import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, validateFilePath } from './validation.js';
import { parseInstructionModules } from './parsing.js';
import type { InstructionModule, SearchResult } from './types.js';

let debugEnabled = false;

/**
 * Sets the debug flag for search operations
 */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

/**
 * Calculates a fuzzy match score between a search term and a target string using Levenshtein distance.
 *
 * Algorithm:
 * 1. Exact substring match returns 1.0 (highest score)
 * 2. Otherwise, calculates normalized Levenshtein distance: 1 - (distance / maxLength)
 * 3. Case-insensitive matching for broader results
 *
 * @param {string} searchTerm - The term to search for (will be lowercased)
 * @param {string} target - The string to search within (will be lowercased)
 * @returns {number} Fuzzy match score between 0 and 1, where 1.0 is perfect match, 0 is no similarity
 *
 * @example
 * ```typescript
 * calculateFuzzyScore("test", "testing");     // 1.0 (substring match)
 * calculateFuzzyScore("test", "best");       // 0.75 (75% similarity)
 * calculateFuzzyScore("abc", "xyz");        // 0.0 (no similarity)
 * ```
 */
function calculateFuzzyScore(searchTerm: string, target: string): number {
  const search = searchTerm.toLowerCase();
  const text = target.toLowerCase();

  // Exact match gets highest score
  if (text.includes(search)) {
    return 1.0;
  }

  // Calculate Levenshtein distance for fuzzy matching
  const matrix: number[][] = [];
  const searchLen = search.length;
  const textLen = text.length;

  // Initialize matrix
  for (let i = 0; i <= textLen; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= searchLen; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= textLen; i++) {
    for (let j = 1; j <= searchLen; j++) {
      if (text[i - 1] === search[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  const distance = matrix[textLen][searchLen];
  const maxLen = Math.max(searchLen, textLen);

  // Convert distance to score (0-1, where 1 is perfect match)
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Searches a specific field in a module and updates scoring data
 */
function searchModuleField(
  term: string,
  fieldValue: string,
  fieldName: string,
  weight: number,
  threshold: number,
  matchedFields: string[]
): number {
  const score = calculateFuzzyScore(term, fieldValue) * weight;
  if (score > threshold) {
    if (!matchedFields.includes(fieldName)) {
      matchedFields.push(fieldName);
    }
    return score;
  }
  return 0;
}

/**
 * Extracts contextual content matches from file content
 */
function extractContentMatches(term: string, content: string): string[] {
  const matches: string[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (calculateFuzzyScore(term, lines[i]) > CONFIG.SCORING.MIN_FIELD_SCORE) {
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length, i + 2);
      const context = lines.slice(start, end).join(' ').trim();

      if (context.length > 0 && !matches.includes(context)) {
        matches.push(
          context.substring(0, 200) + (context.length > 200 ? '...' : '')
        );
      }
    }
  }

  return matches;
}

/**
 * Searches file content for a term and returns score with context matches
 */
function searchModuleContent(
  term: string,
  module: InstructionModule,
  matchedFields: string[]
): { score: number; matches: string[] } {
  try {
    const baseDir = join(process.cwd(), 'instructions-modules');
    const contentPath = validateFilePath(module.filePath, baseDir);

    if (!existsSync(contentPath)) {
      return { score: 0, matches: [] };
    }

    const content = readFileSync(contentPath, 'utf-8');
    const contentScore =
      calculateFuzzyScore(term, content) * CONFIG.SCORING.CONTENT_WEIGHT;

    if (contentScore > CONFIG.SCORING.MIN_CONTENT_SCORE) {
      if (!matchedFields.includes('content')) {
        matchedFields.push('content');
      }

      const matches = extractContentMatches(term, content);
      return { score: contentScore, matches };
    }
  } catch (err) {
    if (debugEnabled) {
      console.error(
        `[DEBUG] Failed to read content for ${module.filePath}:`,
        err
      );
    }
  }

  return { score: 0, matches: [] };
}

/**
 * Calculates search score for a single module against all search terms
 */
function calculateModuleScore(
  module: InstructionModule,
  searchTerms: string[]
): { score: number; matchedFields: string[]; contentMatches: string[] } {
  let totalScore = 0;
  const matchedFields: string[] = [];
  const allContentMatches: string[] = [];

  for (const term of searchTerms) {
    let fieldScore = 0;

    // Search in name (weighted higher)
    fieldScore += searchModuleField(
      term,
      module.name,
      'name',
      CONFIG.SCORING.NAME_WEIGHT,
      CONFIG.SCORING.MIN_FIELD_SCORE,
      matchedFields
    );

    // Search in description
    fieldScore += searchModuleField(
      term,
      module.description,
      'description',
      CONFIG.SCORING.DESCRIPTION_WEIGHT,
      CONFIG.SCORING.MIN_FIELD_SCORE,
      matchedFields
    );

    // Search in category
    fieldScore += searchModuleField(
      term,
      module.category,
      'category',
      CONFIG.SCORING.CATEGORY_WEIGHT,
      CONFIG.SCORING.MIN_FIELD_SCORE,
      matchedFields
    );

    // Search in subcategory if exists
    if (module.subcategory) {
      fieldScore += searchModuleField(
        term,
        module.subcategory,
        'subcategory',
        CONFIG.SCORING.CATEGORY_WEIGHT,
        CONFIG.SCORING.MIN_FIELD_SCORE,
        matchedFields
      );
    }

    // Search in file content
    const contentResult = searchModuleContent(term, module, matchedFields);
    fieldScore += contentResult.score;
    allContentMatches.push(...contentResult.matches);

    totalScore += fieldScore;
  }

  return {
    score: totalScore / searchTerms.length, // Average score across terms
    matchedFields,
    contentMatches: [...new Set(allContentMatches)], // Remove duplicates
  };
}

/**
 * Performs a fuzzy search over all instruction modules using the provided search terms.
 *
 * Search algorithm:
 * - Matches against name (2x weight), description (1.5x), category/subcategory (1x), content (0.8x)
 * - Requires minimum score thresholds: name/desc/cat (0.3), content (0.2)
 * - Only returns results with total score > 0.5 and at least one matched field
 * - Extracts content context (≤200 chars) around matches for preview
 *
 * @param {string[]} searchTerms - Array of search terms to match against (typically from splitting user query)
 * @returns {SearchResult[]} Array of matching modules sorted by score descending, with search metadata
 *
 * @example
 * ```typescript
 * const results = searchInstructionModules(["typescript", "generics"]);
 * console.log(results[0].score);           // e.g., 3.2
 * console.log(results[0].matchedFields);   // ["name", "description"]
 * console.log(results[0].contentMatches);  // ["TypeScript generics allow..."]
 * ```
 */
export function searchInstructionModules(
  searchTerms: string[]
): SearchResult[] {
  const modules = parseInstructionModules();
  const results: SearchResult[] = [];

  for (const module of modules) {
    const scoreData = calculateModuleScore(module, searchTerms);

    // Only include results with meaningful matches
    if (
      scoreData.score > CONFIG.SCORING.MIN_TOTAL_SCORE &&
      scoreData.matchedFields.length > 0
    ) {
      results.push({
        ...module,
        score: scoreData.score,
        matchedFields: scoreData.matchedFields,
        ...(scoreData.contentMatches.length > 0 && {
          contentMatches: scoreData.contentMatches,
        }),
      });
    }
  }

  // Sort by score (highest first)
  return results.sort((a, b) => b.score - a.score);
}
