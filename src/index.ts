#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { Command } from 'commander';
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let debugEnabled = false;

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
interface InstructionModule {
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
interface SearchResult extends InstructionModule {
  score: number;
  matchedFields: string[];
  contentMatches?: string[];
}

/**
 * Parses the instruction modules from the README file in the instructions-modules directory.
 *
 * Extracts hierarchical structure using regex patterns:
 * - Categories: `## Title` (e.g., "## Foundation")
 * - Subcategories: `- **Title**` (e.g., "- **Logic**")
 * - Modules: `- [Name](path) - Description` (e.g., "- [Deductive Reasoning](foundation/logic/deductive-reasoning.md) - Apply logical deduction")
 *
 * @returns {InstructionModule[]} Array of parsed instruction modules with metadata
 * @throws {Error} Logs error to console and returns empty array if README.md cannot be read
 *
 * @example
 * ```typescript
 * const modules = parseInstructionModules();
 * console.log(modules.length); // e.g., 150
 * console.log(modules[0].category); // "Foundation"
 * ```
 */
function parseInstructionModules(): InstructionModule[] {
  try {
    const readmePath = join(process.cwd(), 'instructions-modules', 'README.md');
    if (debugEnabled)
      console.error(`[DEBUG] Reading README from: ${readmePath}`);

    const content = readFileSync(readmePath, 'utf-8');
    if (debugEnabled)
      console.error(
        `[DEBUG] README content length: ${content.length.toString()}`
      );

    const modules: InstructionModule[] = [];

    const lines = content.split('\n');
    let currentCategory = '';
    let currentSubcategory = '';
    let categoryCount = 0;
    let subcategoryCount = 0;
    let moduleCount = 0;

    for (const line of lines) {
      // Match main categories (## Title)
      const categoryMatch = /^## (.+)$/.exec(line);
      if (categoryMatch) {
        currentCategory = categoryMatch[1].trim();
        currentSubcategory = '';
        categoryCount++;
        if (debugEnabled)
          console.error(
            `[DEBUG] Found category ${categoryCount.toString()}: ${currentCategory}`
          );
        continue;
      }

      // Match subcategories (- **Title**)
      const subcategoryMatch = /^- \*\*(.+)\*\*$/.exec(line);
      if (subcategoryMatch) {
        currentSubcategory = subcategoryMatch[1].trim();
        subcategoryCount++;
        if (debugEnabled)
          console.error(
            `[DEBUG] Found subcategory ${subcategoryCount.toString()}: ${currentSubcategory}`
          );
        continue;
      }

      // Match module entries with links and descriptions
      // Modules can be indented with either 2 or 4 spaces:
      // "  - [Name](path) - Description" (direct subcategory)
      // "    - [Name](path) - Description" (nested subcategory)
      const moduleMatch = /^(  |    )- \[([^\]]+)\]\(([^)]+)\) - (.+)$/.exec(
        line
      );
      if (moduleMatch) {
        const [, indent, name, filePath, description] = moduleMatch;

        // Skip if we don't have a valid category (before any ## section)
        if (!currentCategory) {
          continue;
        }

        // Generate ID from file path
        const id = filePath.replace(/\.md$/, '').replace(/\//g, '.');

        modules.push({
          id: id.trim(),
          name: name.trim(),
          description: description.trim(),
          category: currentCategory,
          ...(currentSubcategory && { subcategory: currentSubcategory }),
          filePath: filePath.trim(),
        });

        moduleCount++;
        if (debugEnabled && moduleCount <= 3) {
          console.error(
            `[DEBUG] Module ${moduleCount.toString()}: ${name.trim()} (indent: ${indent.length.toString()} spaces)`
          );
        }
      }
    }

    if (debugEnabled)
      console.error(
        `[DEBUG] Final counts - Categories: ${categoryCount.toString()}, Subcategories: ${subcategoryCount.toString()}, Modules: ${moduleCount.toString()}`
      );
    return modules;
  } catch (err) {
    console.error('Error parsing instruction modules:', err);
    return [];
  }
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
function searchInstructionModules(searchTerms: string[]): SearchResult[] {
  const modules = parseInstructionModules();
  const results: SearchResult[] = [];

  for (const module of modules) {
    let totalScore = 0;
    const matchedFields: string[] = [];
    const contentMatches: string[] = [];

    // Search in each field
    for (const term of searchTerms) {
      let fieldScore = 0;

      // Search in name (weighted higher)
      const nameScore = calculateFuzzyScore(term, module.name) * 2;
      if (nameScore > 0.3) {
        fieldScore += nameScore;
        if (!matchedFields.includes('name')) matchedFields.push('name');
      }

      // Search in description
      const descScore = calculateFuzzyScore(term, module.description) * 1.5;
      if (descScore > 0.3) {
        fieldScore += descScore;
        if (!matchedFields.includes('description'))
          matchedFields.push('description');
      }

      // Search in category
      const catScore = calculateFuzzyScore(term, module.category);
      if (catScore > 0.3) {
        fieldScore += catScore;
        if (!matchedFields.includes('category')) matchedFields.push('category');
      }

      // Search in subcategory if exists
      if (module.subcategory) {
        const subCatScore = calculateFuzzyScore(term, module.subcategory);
        if (subCatScore > 0.3) {
          fieldScore += subCatScore;
          if (!matchedFields.includes('subcategory'))
            matchedFields.push('subcategory');
        }
      }

      // Search in file content
      try {
        const contentPath = join(
          process.cwd(),
          'instructions-modules',
          module.filePath
        );
        if (existsSync(contentPath)) {
          const content = readFileSync(contentPath, 'utf-8');
          const contentScore = calculateFuzzyScore(term, content) * 0.8;

          if (contentScore > 0.2) {
            fieldScore += contentScore;
            if (!matchedFields.includes('content'))
              matchedFields.push('content');

            // Extract context around matches for content preview
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (calculateFuzzyScore(term, lines[i]) > 0.3) {
                const start = Math.max(0, i - 1);
                const end = Math.min(lines.length, i + 2);
                const context = lines.slice(start, end).join(' ').trim();
                if (context.length > 0 && !contentMatches.includes(context)) {
                  contentMatches.push(
                    context.substring(0, 200) +
                      (context.length > 200 ? '...' : '')
                  );
                }
              }
            }
          }
        }
      } catch {
        // Skip content search if file can't be read
      }

      totalScore += fieldScore;
    }

    // Only include results with meaningful matches
    if (totalScore > 0.5 && matchedFields.length > 0) {
      results.push({
        ...module,
        score: totalScore / searchTerms.length, // Average score across terms
        matchedFields,
        ...(contentMatches.length > 0 && { contentMatches }),
      });
    }
  }

  // Sort by score (highest first)
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Retrieves and combines the content of multiple instruction modules by their IDs.
 *
 * For each valid module:
 * 1. Reads the markdown file from instructions-modules/
 * 2. Prepends metadata header with ID, category, and description
 * 3. Combines all content with horizontal rule separators
 *
 * @param {string[]} moduleIds - Array of module IDs to retrieve (e.g., ["foundation.logic.deductive-reasoning"])
 * @returns {Object} Result object with success status, combined content, and error details
 * @returns {boolean} returns.success - True if at least one module was successfully processed
 * @returns {string} [returns.content] - Combined markdown content with headers and separators
 * @returns {string[]} [returns.errors] - Array of error messages for failed modules
 *
 * @example
 * ```typescript
 * const result = getModulesContent(["foundation.logic.deductive-reasoning", "invalid.id"]);
 * // {
 * //   success: true,
 * //   content: "# Deductive Reasoning\n\n**ID:** `foundation.logic.deductive-reasoning`...",
 * //   errors: ['Module with ID "invalid.id" not found']
 * // }
 * ```
 */
function getModulesContent(moduleIds: string[]): {
  success: boolean;
  content?: string;
  errors?: string[];
} {
  const modules = parseInstructionModules();
  const moduleMap = new Map(modules.map(m => [m.id, m]));

  const errors: string[] = [];
  const contents: string[] = [];

  for (const moduleId of moduleIds) {
    const module = moduleMap.get(moduleId);

    if (!module) {
      errors.push(`Module with ID "${moduleId}" not found`);
      continue;
    }

    try {
      const contentPath = join(
        process.cwd(),
        'instructions-modules',
        module.filePath
      );

      if (!existsSync(contentPath)) {
        errors.push(
          `File not found for module "${moduleId}": ${module.filePath}`
        );
        continue;
      }

      const fileContent = readFileSync(contentPath, 'utf-8');

      // Format as markdown section with module info header
      const moduleHeader =
        `# ${module.name}\n\n` +
        `**ID:** \`${module.id}\`  \n` +
        `**Category:** ${module.category}` +
        (module.subcategory ? ` > ${module.subcategory}` : '') +
        '  \n' +
        `**Description:** ${module.description}\n\n` +
        `---\n\n`;

      contents.push(moduleHeader + fileContent);
    } catch (err) {
      errors.push(
        `Error reading module "${moduleId}": ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  if (contents.length === 0) {
    return { success: false, errors };
  }

  // Combine all contents with separators
  const combinedContent = contents.join('\n\n---\n\n');

  return {
    success: true,
    content: combinedContent,
    ...(errors.length > 0 && { errors }),
  };
}

/**
 * Main MCP server instance configured with instruction module capabilities.
 *
 * Provides three tools (list, search, get content) and four bootstrap prompts.
 * Configured with empty capabilities that are populated by setupServerHandlers().
 *
 * @constant {Server} server - MCP Server instance ready for transport connection
 */
const server = new Server(
  {
    name: 'simple-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// Set up handlers for the main server
setupServerHandlers(server);

/**
 * Sets up request handlers for tools and prompts on the provided server instance.
 *
 * Configures:
 * - **Tools**: list_instruction_modules, search_instruction_modules, get_modules_content
 * - **Prompts**: bootstrap-prompt, system-prompt-generator, concise-integration, persona-builder
 *
 * All handlers include comprehensive error handling and return JSON-formatted responses.
 * Prompt handlers dynamically load content from docs/ and map tool names.
 *
 * @param {Server} serverInstance - The MCP Server instance to configure with handlers
 *
 * @example
 * ```typescript
 * const server = new Server({...});
 * setupServerHandlers(server);
 * // Server now ready to handle MCP requests
 * ```
 */
function setupServerHandlers(serverInstance: Server) {
  // Tool implementations
  serverInstance.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: 'list_instruction_modules',
        description:
          "List all available instruction modules with comprehensive metadata in JSON format. Returns 150+ modules organized in a four-tier hierarchy: Foundation (core reasoning), Principle (best practices), Technology (implementation specifics), and Execution (step-by-step playbooks). Each module includes ID, name, description, category, optional subcategory, and file path. Example: Use this to discover all TypeScript modules with category='Technology', or get a complete inventory of available capabilities for dynamic AI enhancement.",
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description:
                "Optional filter by category. Valid values: 'Foundation' (reasoning, logic, problem-solving), 'Principle' (architecture, quality, security best practices), 'Technology' (languages, frameworks, platforms), 'Execution' (debugging, review, refactoring playbooks). Example: 'Technology' returns only tech-specific modules",
            },
          },
        },
      },
      {
        name: 'search_instruction_modules',
        description:
          "Perform intelligent fuzzy search across all instruction modules using weighted scoring algorithm. Searches module names (2x weight), descriptions (1.5x), categories/subcategories (1x), and file content (0.8x) with Levenshtein distance matching. Returns ranked results with transparency: match scores, matched fields, and content snippets. Supports multi-term queries for precise discovery. Example: Search 'typescript generics' to find TypeScript generic programming modules, or 'testing pyramid' to discover testing strategy guidance with contextual previews.",
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                "Search query string - supports multiple terms separated by spaces for AND-style matching. Examples: 'react hooks' finds React hook modules, 'security authentication' finds auth-related security guidance, 'debugging typescript' finds TS debugging help",
            },
            limit: {
              type: 'number',
              description:
                'Maximum number of results to return, sorted by relevance score (default: 10, useful range: 3-20). Higher limits provide more options but may include less relevant matches',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_modules_content',
        description:
          "Compile and combine multiple instruction modules into a cohesive markdown document for AI capability enhancement. Retrieves full content from specified modules, adds metadata headers (ID, category, description), and joins with separators for easy parsing. Respects four-tier hierarchy: Foundation modules should be ordered by layer (0→3), followed by Principle, Technology, and Execution modules. Returns success status, combined content, and detailed error reporting. Example: Combine ['foundation.reasoning.systems-thinking', 'technology.language.typescript.strict-type-checking', 'execution.playbook.debug-issue'] to create a TypeScript debugging specialist AI persona.",
        inputSchema: {
          type: 'object',
          properties: {
            moduleIds: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                "Array of module IDs to retrieve and combine. Use dot notation format like 'foundation.logic.deductive-reasoning' or 'technology.language.typescript.effective-generics'. For best results with personas, order Foundation modules by layer (0-3), then add Principle, Technology, and Execution modules. Example: ['foundation.reasoning.systems-thinking', 'principle.architecture.separation-of-concerns', 'technology.framework.react.component-best-practices']",
            },
          },
          required: ['moduleIds'],
        },
      },
    ],
  }));

  serverInstance.setRequestHandler(CallToolRequestSchema, request => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'list_instruction_modules':
        try {
          const modules = parseInstructionModules();

          // Add debug logging to see what's happening
          if (debugEnabled)
            console.error(
              `[DEBUG] Parsed ${modules.length.toString()} modules`
            );

          const categoryFilter = (args?.category as string) || '';

          // Filter by category if specified
          const filteredModules = categoryFilter
            ? modules.filter(
                m => m.category.toLowerCase() === categoryFilter.toLowerCase()
              )
            : modules;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    totalModules: modules.length,
                    filteredModules: filteredModules.length,
                    modules: filteredModules,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          if (debugEnabled)
            console.error('[ERROR] Failed to parse instruction modules:', err);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `Failed to parse instruction modules: ${
                      err instanceof Error ? err.message : 'Unknown error'
                    }`,
                    modules: [],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

      case 'search_instruction_modules':
        try {
          if (!args) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error:
                        "Missing arguments for search_instruction_modules. 'query' is required.",
                      results: [],
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          const query = args.query as string;
          const limit = typeof args.limit === 'number' ? args.limit : 10;

          if (!query || query.trim().length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error: 'Search query cannot be empty',
                      results: [],
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          // Split query into search terms
          const searchTerms = query
            .trim()
            .split(/\s+/)
            .filter(term => term.length > 0);

          // Perform fuzzy search
          const searchResults = searchInstructionModules(searchTerms);

          // Limit results
          const limitedResults = searchResults.slice(0, limit);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    query,
                    totalResults: searchResults.length,
                    returnedResults: limitedResults.length,
                    results: limitedResults,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `Failed to search instruction modules: ${
                      err instanceof Error ? err.message : 'Unknown error'
                    }`,
                    results: [],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

      case 'get_modules_content':
        try {
          if (!args) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error:
                        "Missing arguments for get_modules_content. 'moduleIds' is required.",
                      success: false,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          const moduleIds = args.moduleIds as string[];

          if (!Array.isArray(moduleIds)) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error:
                        'moduleIds must be provided as an array of strings',
                      success: false,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          // Get the combined content
          const result = getModulesContent(moduleIds);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    ...result,
                    requestedModules: moduleIds.length,
                    processedModules: result.success
                      ? moduleIds.length - (result.errors?.length ?? 0)
                      : 0,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `Failed to get modules content: ${
                      err instanceof Error ? err.message : 'Unknown error'
                    }`,
                    success: false,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Prompt implementations
  serverInstance.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: [
      {
        name: 'bootstrap-prompt',
        description:
          'Comprehensive bootstrap prompt for dynamic system prompt generation with MCP instruction modules',
        arguments: [],
      },
      {
        name: 'system-prompt-generator',
        description:
          'Focused prompt for production AI assistants with dynamic capability enhancement',
        arguments: [],
      },
      {
        name: 'concise-integration',
        description:
          'Minimal prompt for adding MCP capabilities to existing prompts',
        arguments: [],
      },
      {
        name: 'persona-builder',
        description:
          'Specialized prompt for creating well-structured personas following the four-tier philosophy',
        arguments: [],
      },
    ],
  }));

  serverInstance.setRequestHandler(GetPromptRequestSchema, request => {
    const { name } = request.params;

    try {
      let promptPath: string;
      let description: string;

      switch (name) {
        case 'bootstrap-prompt':
          promptPath = join(process.cwd(), 'docs', 'bootstrap-prompt.md');
          description =
            'Comprehensive bootstrap prompt for dynamic system prompt generation with MCP instruction modules';
          break;

        case 'system-prompt-generator':
          promptPath = join(
            process.cwd(),
            'docs',
            'system-prompt-generator.md'
          );
          description =
            'Focused prompt for production AI assistants with dynamic capability enhancement';
          break;

        case 'concise-integration':
          promptPath = join(process.cwd(), 'docs', 'concise-mcp-prompt.md');
          description =
            'Minimal prompt for adding MCP capabilities to existing prompts';
          break;

        case 'persona-builder':
          promptPath = join(process.cwd(), 'docs', 'persona-builder-prompt.md');
          description =
            'Specialized prompt for creating well-structured personas following the four-tier philosophy';
          break;

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }

      if (!existsSync(promptPath)) {
        throw new Error(`Prompt file not found: ${promptPath}`);
      }

      const promptContent = readFileSync(promptPath, 'utf-8');

      // Update tool names to match our actual MCP tools
      const updatedContent = promptContent
        .replace(/list_modules/g, 'list_instruction_modules')
        .replace(/module_discovery/g, 'search_instruction_modules')
        .replace(/module_compile/g, 'get_modules_content')
        .replace(/moduleIds/g, 'moduleIds');

      return {
        description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: updatedContent,
            },
          },
        ],
      };
    } catch (err) {
      throw new Error(
        `Failed to load prompt: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  });
}

/**
 * Runs the MCP server using stdio transport.
 *
 * Ideal for:
 * - MCP Inspector connections
 * - CLI-based MCP clients
 * - Automated testing with test_search.js
 * - Direct integration with AI systems
 *
 * @async
 * @function runStdio
 * @returns {Promise<void>} Promise that resolves when server is connected and listening
 *
 * @example
 * ```bash
 * npm start              # Uses stdio transport
 * node dist/index.js     # Also defaults to stdio
 * ```
 */
async function runStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (debugEnabled) console.error('Simple MCP Server running on stdio');
}

/**
 * Runs the MCP server using Streamable HTTP transport.
 *
 * Sets up Express.js server with JSON body parsing and error handling.
 * All HTTP requests are routed through the MCP transport layer.
 * Suitable for web applications and HTTP-based MCP clients.
 *
 * @async
 * @function runHttp
 * @param {number} [port=3000] - Port to listen on for HTTP connections
 * @returns {Promise<void>} Promise that resolves when server is listening
 *
 * @example
 * ```bash
 * npm run start:http                    # Port 3000
 * node dist/index.js http --port 8080   # Custom port
 * ```
 */
async function runHttp(port = 3000) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await server.connect(transport);

  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // Handle all requests through MCP transport
  app.use(async (req, res) => {
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('Error handling MCP request:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  app.listen(port, () => {
    if (debugEnabled) {
      console.error(
        `Simple MCP Server running on http://localhost:${String(port)}`
      );
    }
  });
}

/**
 * Runs the MCP server using Server-Sent Events (SSE) transport.
 *
 * **DEPRECATED**: Use runHttp() instead for better reliability and performance.
 *
 * Creates separate server instances per SSE session with session management.
 * Supports GET /sse for connection and POST /message/:sessionId for communication.
 *
 * @deprecated Use HTTP transport instead - SSE transport has known issues
 * @async
 * @function runSSE
 * @param {number} [port=3000] - Port to listen on for SSE connections
 * @returns {Promise<void>} Promise that resolves when server is listening
 *
 * @example
 * ```bash
 * node dist/index.js sse --port 3000    # Not recommended
 * ```
 */
function runSSE(port = 3000) {
  const sessions = new Map<
    string,
    { transport: SSEServerTransport; server: Server }
  >();

  const app = express();

  // Middleware to parse JSON bodies
  app.use(express.json());

  // GET endpoint for SSE connections
  app.get('/sse', async (_req, res) => {
    const sessionId = randomUUID();

    try {
      // Create a new server instance for this session
      const sessionServer = new Server(
        {
          name: 'simple-mcp-server',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
            prompts: {},
          },
        }
      );

      // Set up handlers for this server instance
      setupServerHandlers(sessionServer);

      // Start SSE connection with proper endpoint
      const transport = new SSEServerTransport(`/message/${sessionId}`, res);

      // Connect server to transport BEFORE starting
      await sessionServer.connect(transport);

      // Store session before starting transport
      sessions.set(sessionId, { transport, server: sessionServer });

      // Set up cleanup on close
      transport.onclose = () => {
        sessions.delete(sessionId);
        if (debugEnabled) console.error(`SSE session closed: ${sessionId}`);
      };

      // Start the SSE stream
      await transport.start();
    } catch (err) {
      console.error('Error starting SSE session:', err);
      sessions.delete(sessionId);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to start SSE session' });
      }
    }
  });

  // POST endpoint for incoming messages - use regex to handle dynamic paths
  app.post(/^\/message\/(.+)$/, async (req, res) => {
    const sessionId = req.params[0];
    const session = sessions.get(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      await session.transport.handlePostMessage(req, res, req.body);
    } catch (err) {
      console.error('Error handling SSE POST message:', err);
      if (!res.headersSent) {
        res.status(400).json({ error: 'Invalid request' });
      }
    }
  });

  // 404 handler for all other routes
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.listen(port, () => {
    if (debugEnabled) {
      console.error(
        `Simple MCP Server with SSE running on http://localhost:${String(port)}`
      );
      console.error(
        `Connect to SSE stream at: http://localhost:${String(port)}/sse`
      );
    }
  });
}

/**
 * Command-line interface configuration for the MCP server.
 *
 * Provides three transport commands:
 * - `stdio` (default): For MCP Inspector and CLI clients
 * - `http`: For web applications with optional --port
 * - `sse`: Deprecated SSE transport with optional --port
 *
 * Defaults to stdio transport when no command is specified.
 *
 * @constant {Command} program - Commander.js CLI configuration
 *
 * @example
 * ```bash
 * node dist/index.js stdio              # Explicit stdio
 * node dist/index.js http --port 8080   # HTTP on port 8080
 * node dist/index.js                    # Defaults to stdio
 * ```
 */
const program = new Command();

program
  .name('simple-mcp-server')
  .description('A simple MCP server with multiple transport options')
  .version('1.0.0')
  .option(
    '--transport <type>',
    'Specify the transport type: stdio, http, or sse',
    'stdio'
  )
  .option('-p, --port <port>', 'Port to listen on for http or sse', '3000')
  .option('--debug', 'Enable debug logging', false)
  .action(options => {
    const { transport, port, debug } = options as {
      transport: string;
      port: string;
      debug: boolean;
    };

    if (debug) {
      debugEnabled = true;
    }

    switch (transport) {
      case 'http':
        const httpPort = parseInt(port, 10) || 3000;
        runHttp(httpPort).catch(console.error);
        break;
      case 'sse':
        const ssePort = parseInt(port, 10) || 3000;
        console.warn(
          'WARNING: SSE transport is deprecated. Use "http" instead.'
        );
        runSSE(ssePort);
        break;
      case 'stdio':
      default:
        runStdio().catch(console.error);
        break;
    }
  });

program.parse();
