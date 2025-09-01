/**
 * @fileoverview Input validation and security utilities for the MCP server.
 *
 * This module provides comprehensive validation functions for all user inputs
 * including path sanitization, query validation, and parameter checking.
 * Includes security measures to prevent path traversal attacks and malformed input.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { resolve, relative } from 'node:path';
import type { IPathUtils } from './interfaces.js';

/**
 * Configuration constants for validation limits and scoring weights.
 *
 * These constants define the boundaries and weights used throughout the
 * validation and search systems to ensure consistent behavior.
 *
 * @since 1.0.0
 */
export const CONFIG = {
  MAX_SEARCH_LIMIT: 50,
  MIN_SEARCH_LIMIT: 1,
  DEFAULT_SEARCH_LIMIT: 10,
  MAX_MODULE_IDS: 20,
  SCORING: {
    NAME_WEIGHT: 2.0,
    DESCRIPTION_WEIGHT: 1.5,
    CATEGORY_WEIGHT: 1.0,
    CONTENT_WEIGHT: 0.8,
    MIN_FIELD_SCORE: 0.3,
    MIN_CONTENT_SCORE: 0.2,
    MIN_TOTAL_SCORE: 0.5,
  },
} as const;

/**
 * Validates and sanitizes file paths to prevent path traversal attacks.
 *
 * This function ensures that the requested file path is within the allowed
 * base directory and prevents malicious path traversal attempts.
 *
 * @param filePath - The file path to validate (relative to baseDir)
 * @param baseDir - The base directory that contains allowed files
 * @returns The resolved absolute path if valid
 * @throws {Error} If the path is invalid or attempts path traversal
 *
 * @example
 * ```typescript
 * const safePath = validateFilePath('modules/example.md', '/safe/directory');
 * // Returns: '/safe/directory/modules/example.md'
 *
 * // This would throw an error:
 * validateFilePath('../../../etc/passwd', '/safe/directory');
 * ```
 *
 * @since 1.0.0
 */
export function validateFilePath(
  filePath: string,
  baseDir: string,
  pathUtils?: IPathUtils
): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  // Use injected path utils or fall back to Node.js path module
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const resolveFunc = pathUtils ? pathUtils.resolve : resolve;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const relativeFunc = pathUtils ? pathUtils.relative : relative;

  // Resolve the full path and check it's within baseDir
  const fullPath = resolveFunc(baseDir, filePath);
  const relativePath = relativeFunc(baseDir, fullPath);

  // Check for path traversal attempts
  if (
    relativePath.startsWith('..') ||
    resolveFunc(baseDir, relativePath) !== fullPath
  ) {
    throw new Error('Invalid file path: path traversal detected');
  }

  return fullPath;
}

/**
 * Validates and sanitizes search query parameters.
 *
 * Ensures the search query is a valid string within acceptable length limits.
 * Trims whitespace and validates the query is not empty after trimming.
 *
 * @param query - The search query to validate (unknown type from user input)
 * @returns The validated and trimmed search query string
 * @throws {Error} If the query is invalid, empty, or too long
 *
 * @example
 * ```typescript
 * const validQuery = validateSearchQuery('  typescript generics  ');
 * // Returns: 'typescript generics'
 *
 * // These would throw errors:
 * validateSearchQuery(''); // Empty query
 * validateSearchQuery('a'.repeat(501)); // Too long
 * ```
 *
 * @since 1.0.0
 */
export function validateSearchQuery(query: unknown): string {
  if (!query || typeof query !== 'string') {
    throw new Error('Search query must be a non-empty string');
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error('Search query cannot be empty');
  }

  if (trimmed.length > 500) {
    throw new Error('Search query too long (max 500 characters)');
  }

  return trimmed;
}

/**
 * Validates search result limit parameter.
 *
 * Ensures the limit is a valid integer within the acceptable range.
 * Returns the default limit if none is provided.
 *
 * @param limit - The search limit to validate (unknown type from user input)
 * @returns The validated limit as an integer
 * @throws {Error} If the limit is not an integer or outside valid range
 *
 * @example
 * ```typescript
 * const validLimit = validateSearchLimit(15);
 * // Returns: 15
 *
 * const defaultLimit = validateSearchLimit(undefined);
 * // Returns: 10 (default)
 * ```
 *
 * @since 1.0.0
 */
export function validateSearchLimit(limit: unknown): number {
  if (limit === undefined || limit === null) {
    return CONFIG.DEFAULT_SEARCH_LIMIT;
  }

  if (typeof limit !== 'number' || !Number.isInteger(limit)) {
    throw new Error('Search limit must be an integer');
  }

  if (limit < CONFIG.MIN_SEARCH_LIMIT || limit > CONFIG.MAX_SEARCH_LIMIT) {
    throw new Error(
      `Search limit must be between ${CONFIG.MIN_SEARCH_LIMIT.toString()} and ${CONFIG.MAX_SEARCH_LIMIT.toString()}`
    );
  }

  return limit;
}

/**
 * Validates and normalizes category filter parameter.
 *
 * Accepts valid instruction module categories and normalizes their capitalization.
 * Returns null for undefined/empty values to indicate no filtering.
 *
 * @param category - The category filter to validate (unknown type from user input)
 * @returns The normalized category name or null if no filter
 * @throws {Error} If the category is not one of the valid options
 *
 * @example
 * ```typescript
 * const validCategory = validateCategoryFilter('foundation');
 * // Returns: 'Foundation'
 *
 * const noFilter = validateCategoryFilter(undefined);
 * // Returns: null
 * ```
 *
 * @since 1.0.0
 */
export function validateCategoryFilter(category: unknown): string | null {
  if (category === undefined || category === null) {
    return null;
  }

  if (typeof category !== 'string') {
    throw new Error('Category filter must be a string');
  }

  const trimmed = category.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const validCategories = ['Foundation', 'Principle', 'Technology', 'Execution'];
  const normalizedCategory =
    trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();

  if (!validCategories.includes(normalizedCategory)) {
    throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
  }

  return normalizedCategory;
}

/**
 * Validates an array of instruction module IDs.
 *
 * Ensures all module IDs are valid strings with proper formatting and
 * within acceptable quantity limits. Module IDs can be dot- or slash-separated
 * (legacy vs. UMS identifiers).
 *
 * @param moduleIds - The array of module IDs to validate (unknown type from user input)
 * @returns Array of validated and trimmed module ID strings
 * @throws {Error} If the array is invalid, empty, too large, or contains invalid IDs
 *
 * @example
 * ```typescript
 * const validIds = validateModuleIds([
 *   'foundation.logic.deductive-reasoning',
 *   'technology.language.typescript.generics'
 * ]);
 * // Returns: ['foundation.logic.deductive-reasoning', 'technology.language.typescript.generics']
 * ```
 *
 * @since 1.0.0
 */
export function validateModuleIds(moduleIds: unknown): string[] {
  if (!Array.isArray(moduleIds)) {
    throw new Error('moduleIds must be an array');
  }

  if (moduleIds.length === 0) {
    throw new Error('At least one module ID is required');
  }

  if (moduleIds.length > CONFIG.MAX_MODULE_IDS) {
    throw new Error(`Too many module IDs (max ${CONFIG.MAX_MODULE_IDS.toString()})`);
  }

  const validatedIds: string[] = [];
  for (const id of moduleIds) {
    if (typeof id !== 'string') {
      throw new Error('All module IDs must be strings');
    }

    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new Error('Module IDs cannot be empty');
    }

    if (!/^[a-zA-Z0-9._/\-]+$/.test(trimmed)) {
      throw new Error(`Invalid module ID format: ${trimmed}`);
    }

    validatedIds.push(trimmed);
  }

  return validatedIds;
}

/**
 * Validates UMS v1.1 layer field for foundation modules.
 * 
 * @param layer - The layer value to validate
 * @param tier - The module tier to check if layer is required
 * @returns The validated layer number or undefined
 * @throws {Error} If the layer is invalid for foundation modules
 * 
 * @since 1.1.0
 */
export function validateFoundationLayer(layer: unknown, tier: string): number | undefined {
  if (tier.toLowerCase() !== 'foundation') {
    // Non-foundation modules should not have layer
    if (layer !== undefined) {
      throw new Error('Layer field is only allowed for foundation tier modules');
    }
    return undefined;
  }

  // Foundation modules should have layer
  if (layer === undefined || layer === null) {
    throw new Error('Foundation tier modules must have a layer field');
  }

  if (typeof layer !== 'number' || !Number.isInteger(layer)) {
    throw new Error('Layer must be an integer');
  }

  if (layer < 0 || layer > 4) {
    throw new Error('Layer must be between 0 and 4 (inclusive)');
  }

  return layer;
}
