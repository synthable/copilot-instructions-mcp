/**
 * @fileoverview MCP tool request handlers and business logic.
 *
 * This module implements the core business logic for all MCP tools:
 * - list_instruction_modules: Lists all available instruction modules
 * - search: Unified search with fuzzy, semantic, and hybrid modes
 * - get_modules_content: Retrieves and combines module content
 *
 * Provides input validation, error handling, and standardized response formatting.
 *
 * @author MCP Server Team
 * @version 2.0.0
 * @since 1.0.0
 */

import {
  validateCategoryFilter,
  validateSearchQuery,
  validateSearchLimit,
  validateModuleIds,
} from '../services/validation/validation.js';
import type { ToolArgs } from '../core/types.js';
import type { SemanticSearchOptions } from '../services/embedding/semanticSearch.js';
import type {
  IInstructionModuleParser,
  ISearchService,
  IContentService,
  ISemanticSearchService,
  ILogger,
} from '../core/interfaces.js';

/**
 * Helper function to split search query into terms
 */
function splitSearchQuery(query: string): string[] {
  return query.split(/\s+/).filter(term => term.length > 0);
}

/**
 * Creates a standardized error response for tool handlers
 */
export function createToolErrorResponse(
  toolName: string,
  error: Error,
  fallbackData: Record<string, unknown>,
  logger?: ILogger
) {
  const errorMessage = error.message;
  logger?.error(`Failed to handle ${toolName}`, error);
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
    case 'search':
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
  constructor(
    private parser: IInstructionModuleParser,
    private searchService: ISearchService,
    private contentService: IContentService,
    private semanticSearchService: ISemanticSearchService,
    private logger: ILogger
  ) {}

  /**
   * Handles the list_instruction_modules tool request
   */
  async handleListInstructionModules(args: ToolArgs | undefined) {
    const categoryFilter = validateCategoryFilter(args?.category);
    const modules = await this.parser.parseInstructionModules();

    this.logger.debug(`Parsed ${modules.length.toString()} modules`);

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
   * Handles the get_modules_content tool request
   */
  async handleGetModulesContent(args: ToolArgs | undefined) {
    if (!args) {
      throw new Error(
        "Missing arguments for get_modules_content. 'moduleIds' is required."
      );
    }

    const moduleIds = validateModuleIds(args.moduleIds);

    this.logger.debug(`Getting content for modules: ${moduleIds.join(', ')}`);

    // Get the combined content
    const result = await this.contentService.getModulesContent(moduleIds);

    return {
      ...result,
      requestedModules: moduleIds.length,
      processedModules: result.success
        ? moduleIds.length - (result.errors?.length ?? 0)
        : 0,
    };
  }

  /**
   * Handles the unified search tool request.
   * Supports three modes: fuzzy (lexical), semantic (embedding), hybrid (combined).
   */
  async handleSearch(args: ToolArgs | undefined) {
    if (!args) {
      throw new Error("Missing arguments for search. 'query' is required.");
    }

    const query = validateSearchQuery(args.query);
    const limit = validateSearchLimit(args.limit);
    const mode = this.validateSearchMode(args.mode);

    // Route to appropriate search implementation
    switch (mode) {
      case 'fuzzy':
        return this.performFuzzySearch(query, limit);
      case 'semantic':
        return this.performSemanticSearch(query, limit, args);
      case 'hybrid':
        return this.performHybridSearch(query, limit, args);
      default:
        throw new Error(`Invalid search mode: ${mode as string}`);
    }
  }

  /**
   * Validates and normalizes the search mode parameter
   */
  private validateSearchMode(mode: unknown): 'fuzzy' | 'semantic' | 'hybrid' {
    // Default to fuzzy if not specified
    if (mode === undefined || mode === null) {
      return 'fuzzy';
    }

    if (typeof mode !== 'string') {
      throw new Error('Search mode must be a string');
    }

    const normalized = mode.toLowerCase().trim();
    if (
      normalized === 'fuzzy' ||
      normalized === 'semantic' ||
      normalized === 'hybrid'
    ) {
      return normalized;
    }

    throw new Error(
      `Invalid search mode: '${mode}'. Must be one of: fuzzy, semantic, hybrid`
    );
  }

  /**
   * Performs fuzzy (lexical) search
   */
  private async performFuzzySearch(query: string, limit: number) {
    const searchTerms = splitSearchQuery(query);
    this.logger.debug(`Fuzzy search for terms: ${searchTerms.join(', ')}`);

    const searchResults =
      await this.searchService.searchInstructionModules(searchTerms);
    const limitedResults = searchResults.slice(0, limit);

    return {
      query,
      mode: 'fuzzy' as const,
      totalResults: searchResults.length,
      returnedResults: limitedResults.length,
      results: limitedResults,
    };
  }

  /**
   * Performs semantic (embedding-based) search
   */
  private async performSemanticSearch(query: string, limit: number, args: ToolArgs) {
    const options = this.parseSemanticOptions(args);

    const results = await this.semanticSearchService.semanticSearch(
      query,
      limit,
      options
    );

    return {
      query,
      mode: 'semantic' as const,
      totalResults: results.length,
      returnedResults: results.length,
      results,
      filters: options.tiers ? { tiers: options.tiers } : undefined,
    };
  }

  /**
   * Performs hybrid search (re-ranked fuzzy + semantic)
   */
  private async performHybridSearch(query: string, limit: number, args: ToolArgs) {
    const alpha =
      typeof args.alpha === 'number' && args.alpha >= 0 && args.alpha <= 1
        ? args.alpha
        : 0.6;
    const options = this.parseSemanticOptions(args);

    const terms = splitSearchQuery(query);
    const lexical = await this.searchService.searchInstructionModules(terms);
    const semantic = await this.semanticSearchService.hybridSearch(
      terms,
      lexical,
      alpha,
      limit,
      options
    );

    return {
      query,
      mode: 'hybrid' as const,
      alpha,
      totalResults: semantic.length,
      returnedResults: Math.min(limit, semantic.length),
      results: semantic.slice(0, limit),
      filters: options.tiers ? { tiers: options.tiers } : undefined,
    };
  }

  /**
   * Parses semantic search options from tool arguments (DRY helper)
   */
  private parseSemanticOptions(args: ToolArgs): SemanticSearchOptions {
    const options: SemanticSearchOptions = {};

    // Handle tier filtering
    if (args.tiers) {
      if (Array.isArray(args.tiers)) {
        options.tiers = args.tiers.filter((t): t is string => typeof t === 'string');
      } else if (typeof args.tiers === 'string') {
        options.tiers = [args.tiers];
      }
    }

    // Handle similarity threshold
    if (
      typeof args.similarityThreshold === 'number' &&
      args.similarityThreshold >= 0 &&
      args.similarityThreshold <= 1
    ) {
      options.similarityThreshold = args.similarityThreshold;
    }

    // Handle relevance level inclusion (default: true)
    if (args.includeRelevanceLevel === false) {
      options.includeRelevanceLevel = false;
    }

    return options;
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
    this.logger.error(`Failed to handle ${toolName}`, error);
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
