/**
 * @fileoverview MCP tool request handlers and business logic.
 * 
 * This module implements the core business logic for all MCP tools:
 * - list_instruction_modules: Lists all available instruction modules
 * - search_instruction_modules: Performs fuzzy search across modules
 * - get_modules_content: Retrieves and combines module content
 * 
 * Provides input validation, error handling, and standardized response formatting.
 * 
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import {
  validateCategoryFilter,
  validateSearchQuery,
  validateSearchLimit,
  validateModuleIds,
} from './validation.js';
import { parseInstructionModules } from './parsing.js';
import { searchInstructionModules } from './search.js';
import { getModulesContent } from './content.js';
import { toolHandlersLogger } from './logger.js';
import type { ToolArgs } from './types.js';



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

  toolHandlersLogger.debug(`Parsed ${modules.length.toString()} modules`);

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

  toolHandlersLogger.debug(`Searching for terms: ${searchTerms.join(', ')}`);

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

  toolHandlersLogger.debug(
    `Getting content for modules: ${moduleIds.join(', ')}`
  );

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
  toolHandlersLogger.error(`Failed to handle ${toolName}`, error);
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
