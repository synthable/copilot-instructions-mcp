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
import { toolHandlersLogger } from './logger.js';
import type { ToolArgs } from './types.js';
import type { Container } from './container.js';

/**
 * Helper function to split search query into terms
 */
function splitSearchQuery(query: string): string[] {
  return query.split(/\s+/).filter(term => term.length > 0);
}

/**
 * Convenience function to handle list_instruction_modules using the global container.
 */
export function handleListInstructionModules(args: ToolArgs | undefined) {
  // Dynamic import to avoid circular dependency issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getContainer } = require('./container.js') as typeof import('./container.js');
  const container = getContainer();
  const toolHandlers = new ToolHandlers(container);
  return toolHandlers.handleListInstructionModules(args);
}

/**
 * Convenience function to handle search_instruction_modules using the global container.
 */
export function handleSearchInstructionModules(args: ToolArgs | undefined) {
  // Dynamic import to avoid circular dependency issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getContainer } = require('./container.js') as typeof import('./container.js');
  const container = getContainer();
  const toolHandlers = new ToolHandlers(container);
  return toolHandlers.handleSearchInstructionModules(args);
}

/**
 * Convenience function to handle get_modules_content using the global container.
 */
export function handleGetModulesContent(args: ToolArgs | undefined) {
  // Dynamic import to avoid circular dependency issues
  const { getContainer } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./container.js') as typeof import('./container.js');
  const container = getContainer();
  const toolHandlers = new ToolHandlers(container);
  return toolHandlers.handleGetModulesContent(args);
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

/**
 * Injectable tool handlers class.
 * Handles tool requests with dependency injection for better testability.
 */
export class ToolHandlers {
  constructor(private container: Container) {}

  /**
   * Handles the list_instruction_modules tool request
   */
  handleListInstructionModules(args: ToolArgs | undefined) {
    const categoryFilter = validateCategoryFilter(args?.category);
    const parser = this.container.getInstructionModuleParser();
    const modules = parser.parseInstructionModules();

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
  handleSearchInstructionModules(args: ToolArgs | undefined) {
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
    const searchService = this.container.getSearchService();
    const searchResults = searchService.searchInstructionModules(searchTerms);

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
  handleGetModulesContent(args: ToolArgs | undefined) {
    if (!args) {
      throw new Error(
        "Missing arguments for get_modules_content. 'moduleIds' is required."
      );
    }

    const moduleIds = validateModuleIds(args.moduleIds);

    toolHandlersLogger.debug(`Getting content for modules: ${moduleIds.join(', ')}`);

    // Get the combined content
    const contentService = this.container.getContentService();
    const result = contentService.getModulesContent(moduleIds);

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
  createToolErrorResponse(
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
  getToolFallbackData(toolName: string): Record<string, unknown> {
    return getToolFallbackData(toolName);
  }
}
