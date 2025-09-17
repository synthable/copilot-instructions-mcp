/**
 * @fileoverview MCP server configuration and request handling.
 *
 * This module sets up the Model Context Protocol server with all tools and prompts,
 * configures request handlers, and provides the main server creation functionality.
 * Handles both tool calls and prompt requests with comprehensive error handling.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createToolErrorResponse, getToolFallbackData } from './toolHandlers.js';
// Note: Avoid convenience wrappers that use require() (not available in ESM)
import type { Container } from './container.js';
import { initializeServer } from './serverInitializer.js';

/**
 * Helper function to create JSON response format
 */
function createJsonResponse(data: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Helper function to safely extract error message
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Sets up request handlers for tools and prompts on the provided server instance.
 *
 * Configures:
 * - **Tools**: list_instruction_modules, search_instruction_modules, get_modules_content
 * - **Prompts**: bootstrap-prompt, system-prompt-generator, concise-integration, persona-builder
 *
 * All handlers include comprehensive error handling and return JSON-formatted responses.
 * Prompt handlers dynamically load content from prompts/ and map tool names.
 *
 * @param {Server} serverInstance - The MCP Server instance to configure with handlers
 * @param {Container} container - Dependency injection container
 */
export function setupServerHandlers(
  serverInstance: Server,
  container: Container
): void {
  // Extract dependencies once at setup time, not per request
  const logger = container.getLogger();
  const toolHandlers = container.createToolHandlers();

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
      {
        name: 'semantic_search',
        description:
          'Embedding-based semantic search across instruction modules using all-mpnet-base-v2 embeddings via @xenova/transformers.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language query to embed and search.',
            },
            limit: {
              type: 'number',
              description: 'Max results to return (default 10).',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'hybrid_search',
        description:
          'Hybrid re-rank combining fuzzy lexical search with semantic similarity using all-mpnet-base-v2 embeddings.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query terms.' },
            limit: {
              type: 'number',
              description: 'Max results to return (default 10).',
            },
            alpha: {
              type: 'number',
              description: 'Weight for lexical score (0..1, default 0.6).',
            },
          },
          required: ['query'],
        },
      },
    ],
  }));

  serverInstance.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list_instruction_modules': {
          const result = await toolHandlers.handleListInstructionModules(args);
          return createJsonResponse(result);
        }

        case 'search_instruction_modules': {
          const result = await toolHandlers.handleSearchInstructionModules(args);
          return createJsonResponse(result);
        }

        case 'get_modules_content': {
          const result = await toolHandlers.handleGetModulesContent(args);
          return createJsonResponse(result);
        }

        case 'semantic_search': {
          const result = await toolHandlers.handleSemanticSearch(args);
          return createJsonResponse(result);
        }

        case 'hybrid_search': {
          const result = await toolHandlers.handleHybridSearch(args);
          return createJsonResponse(result);
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(getErrorMessage(err));
      const fallbackData = getToolFallbackData(name);
      const errorResponse = createToolErrorResponse(name, error, fallbackData, logger);
      return createJsonResponse(errorResponse);
    }
  });

  // Prompt implementations
  serverInstance.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: [
      {
        name: 'bootloader-v2-prompt',
        description:
          'A Module Integration Specialist that dynamically discovers, selects, and applies specialized instruction modules from an MCP library through a four-phase process (deconstruct, discover & select, synthesize & execute, constraints & communication) to solve user requests using foundation, principle, technology, and execution tier modules while treating user context as absolute source of truth.',
        arguments: [],
      },
      {
        name: 'bootloader-v1.2-prompt',
        description:
          'A Module Integration Specialist that dynamically discovers, selects, and applies specialized instruction modules from an MCP library through a four-phase process (deconstruct, discover & select, synthesize & execute, constraints & communication) to solve user requests using foundation, principle, technology, and execution tier modules while treating user context as absolute source of truth.',
        arguments: [],
      },
      {
        name: 'bootloader-v1.1-prompt',
        description:
          'A Module Integration Specialist that dynamically discovers, selects, and applies specialized instruction modules from an MCP library through a four-phase process (deconstruct, discover & select, synthesize & execute, constraints & communication) to solve user requests using foundation, principle, technology, and execution tier modules while treating user context as absolute source of truth.',
        arguments: [],
      },
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
        description: 'Minimal prompt for adding MCP capabilities to existing prompts',
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
        case 'bootloader-v2-prompt':
          promptPath = join(process.cwd(), 'prompts/v2', 'bootloader-v2-prompt.md');
          description =
            'A Module Integration Specialist that dynamically discovers, selects, and applies specialized instruction modules from an MCP library through a four-phase process (deconstruct, discover & select, synthesize & execute, constraints & communication) to solve user requests using foundation, principle, technology, and execution tier modules while treating user context as absolute source of truth.';
          break;

        case 'bootloader-v1.2-prompt':
          promptPath = join(process.cwd(), 'prompts', 'bootloader-v1.2.md');
          description =
            'A Module Integration Specialist that dynamically discovers, selects, and applies specialized instruction modules from an MCP library through a four-phase process (deconstruct, discover & select, synthesize & execute, constraints & communication) to solve user requests using foundation, principle, technology, and execution tier modules while treating user context as absolute source of truth.';
          break;

        case 'bootloader-v1.1-prompt':
          promptPath = join(process.cwd(), 'prompts', 'bootloader-v1.1.md');
          description =
            'A Module Integration Specialist that dynamically discovers, selects, and applies specialized instruction modules from an MCP library through a four-phase process (deconstruct, discover & select, synthesize & execute, constraints & communication) to solve user requests using foundation, principle, technology, and execution tier modules while treating user context as absolute source of truth.';
          break;

        case 'bootstrap-prompt':
          promptPath = join(process.cwd(), 'prompts', 'bootstrap-prompt.md');
          description =
            'Comprehensive bootstrap prompt for dynamic system prompt generation with MCP instruction modules';
          break;

        case 'system-prompt-generator':
          promptPath = join(process.cwd(), 'prompts', 'system-prompt-generator.md');
          description =
            'Focused prompt for production AI assistants with dynamic capability enhancement';
          break;

        case 'concise-integration':
          promptPath = join(process.cwd(), 'prompts', 'concise-mcp-prompt.md');
          description =
            'Minimal prompt for adding MCP capabilities to existing prompts';
          break;

        case 'persona-builder':
          promptPath = join(process.cwd(), 'prompts', 'persona-builder-prompt.md');
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
 * Creates a new MCP server instance with dependency injection
 */
export function createServer(container: Container): Server {
  const server = new Server(
    {
      name: 'copilot-instructions-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    }
  );

  setupServerHandlers(server, container);
  return server;
}

/**
 * Creates and initializes an MCP server with vector store initialization.
 */
export async function createInitializedServer(container: Container): Promise<Server> {
  // Initialize server components including vector store
  await initializeServer(
    container.getDependencies().logger,
    container.getVectorStore(),
    container.getSemanticSearchService()
  );

  // Create the server with initialized components
  return createServer(container);
}
