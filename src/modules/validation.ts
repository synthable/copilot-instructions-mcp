import { resolve, relative } from 'node:path';

// Configuration constants
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
 * Validates and sanitizes file paths to prevent path traversal attacks
 */
export function validateFilePath(filePath: string, baseDir: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  // Resolve the full path and check it's within baseDir
  const fullPath = resolve(baseDir, filePath);
  const relativePath = relative(baseDir, fullPath);

  // Check for path traversal attempts
  if (
    relativePath.startsWith('..') ||
    resolve(baseDir, relativePath) !== fullPath
  ) {
    throw new Error('Invalid file path: path traversal detected');
  }

  return fullPath;
}

/**
 * Validates search query parameters
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
 * Validates search limit parameter
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
 * Validates category filter parameter
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

  const validCategories = [
    'Foundation',
    'Principle',
    'Technology',
    'Execution',
  ];
  const normalizedCategory =
    trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();

  if (!validCategories.includes(normalizedCategory)) {
    throw new Error(
      `Invalid category. Must be one of: ${validCategories.join(', ')}`
    );
  }

  return normalizedCategory;
}

/**
 * Validates module IDs array parameter
 */
export function validateModuleIds(moduleIds: unknown): string[] {
  if (!Array.isArray(moduleIds)) {
    throw new Error('moduleIds must be an array');
  }

  if (moduleIds.length === 0) {
    throw new Error('At least one module ID is required');
  }

  if (moduleIds.length > CONFIG.MAX_MODULE_IDS) {
    throw new Error(
      `Too many module IDs (max ${CONFIG.MAX_MODULE_IDS.toString()})`
    );
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

    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
      throw new Error(`Invalid module ID format: ${trimmed}`);
    }

    validatedIds.push(trimmed);
  }

  return validatedIds;
}
