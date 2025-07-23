import {
  validateCategoryFilter,
  validateSearchQuery,
  validateSearchLimit,
  validateModuleIds,
} from './validation.js';
import { parseInstructionModules } from './parsing.js';
import { searchInstructionModules } from './search.js';
import { getModulesContent } from './content.js';
import type { ToolArgs } from './types.js';

let debugEnabled = false;

/**
 * Sets the debug flag for tool handler operations
 */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}


/**
 * Helper function to log debug information about parsed modules
 */
function logModuleDebugInfo(modules: unknown[], operation: string): void {
  if (debugEnabled) {
    console.error(
      `[DEBUG] ${operation}: ${modules.length.toString()} modules`
    );
  }
}

/**
 * Helper function to split search query into terms
 */
function splitSearchQuery(query: string): string[] {
  return query.split(/\s+/).filter(term => term.length > 0);
}

/**
 * Handles the list_instruction_modules tool request
 */
export function handleListInstructionModules(args: ToolArgs | undefined) {
  const categoryFilter = validateCategoryFilter(args?.category);
  const modules = parseInstructionModules();

  logModuleDebugInfo(modules, 'Parsed');

  // Filter by category if specified
  const filteredModules = categoryFilter
    ? modules.filter(m => m.category === categoryFilter)
    : modules;

  return {
    totalModules: modules.length,
    filteredModules: filteredModules.length,
    modules: filteredModules,
  };
}

/**
 * Handles the search_instruction_modules tool request
 */
export function handleSearchInstructionModules(args: ToolArgs | undefined) {
  if (!args) {
    throw new Error(
      "Missing arguments for search_instruction_modules. 'query' is required."
    );
  }

  const query = validateSearchQuery(args.query);
  const limit = validateSearchLimit(args.limit);

  // Split query into search terms
  const searchTerms = splitSearchQuery(query);

  if (debugEnabled) {
    console.error(`[DEBUG] Searching for terms: ${searchTerms.join(', ')}`);
  }

  // Perform fuzzy search
  const searchResults = searchInstructionModules(searchTerms);

  // Limit results
  const limitedResults = searchResults.slice(0, limit);

  return {
    query,
    totalResults: searchResults.length,
    returnedResults: limitedResults.length,
    results: limitedResults,
  };
}

/**
 * Handles the get_modules_content tool request
 */
export function handleGetModulesContent(args: ToolArgs | undefined) {
  if (!args) {
    throw new Error(
      "Missing arguments for get_modules_content. 'moduleIds' is required."
    );
  }

  const moduleIds = validateModuleIds(args.moduleIds);

  if (debugEnabled) {
    console.error(
      `[DEBUG] Getting content for modules: ${moduleIds.join(', ')}`
    );
  }

  // Get the combined content
  const result = getModulesContent(moduleIds);

  return {
    ...result,
    requestedModules: moduleIds.length,
    processedModules: result.success
      ? moduleIds.length - (result.errors?.length ?? 0)
      : 0,
  };
}

/**
 * Creates a standardized error response for tool handlers
 */
export function createToolErrorResponse(
  toolName: string,
  error: Error,
  fallbackData: Record<string, unknown>
) {
  const errorMessage = error.message;
  if (debugEnabled) {
    console.error(`[ERROR] Failed to handle ${toolName}:`, error);
  }
  return {
    error: `Failed to ${toolName.replace(/_/g, ' ')}: ${errorMessage}`,
    ...fallbackData,
  };
}

/**
 * Gets appropriate fallback data for tool errors
 */
export function getToolFallbackData(toolName: string): Record<string, unknown> {
  switch (toolName) {
    case 'list_instruction_modules':
      return { modules: [] };
    case 'search_instruction_modules':
      return { results: [] };
    case 'get_modules_content':
      return { success: false };
    default:
      return {};
  }
}