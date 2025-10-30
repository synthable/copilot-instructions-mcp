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
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createToolErrorResponse, getToolFallbackData } from './toolHandlers.js';
// Note: Avoid convenience wrappers that use require() (not available in ESM)
import type { Container } from '../core/container.js';
import { initializeServer } from './serverInitializer.js';

/**
 * Helper function to create JSON response format
 */
function createJsonResponse(data: unknown): {
  content: { type: string; text: string }[];
} {
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
        name: 'search',
        description:
          "Unified intelligent search across instruction modules with three powerful modes: fuzzy (lexical matching), semantic (embedding-based), and hybrid (combined re-ranking). **Fuzzy mode** uses weighted Levenshtein distance across names (2x), descriptions (1.5x), categories (1x), and content (0.8x) for fast, transparent matching. **Semantic mode** leverages all-mpnet-base-v2 embeddings via @xenova/transformers for conceptual understanding and meaning-based discovery. **Hybrid mode** combines both approaches with configurable alpha weighting for optimal precision and recall. All modes support tier filtering, similarity thresholds, and rich result metadata. Default mode is 'fuzzy' for speed. Examples: `{query: 'react hooks', mode: 'fuzzy'}` for quick lexical search, `{query: 'managing application state', mode: 'semantic'}` for conceptual discovery, `{query: 'typescript generics', mode: 'hybrid', alpha: 0.7}` for best-of-both-worlds ranking.",
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                "Search query string. For fuzzy mode: supports multiple terms for AND-style matching (e.g., 'react hooks'). For semantic/hybrid: natural language queries work best (e.g., 'how to manage complex state').",
            },
            mode: {
              type: 'string',
              enum: ['fuzzy', 'semantic', 'hybrid'],
              description:
                "Search mode: 'fuzzy' for fast lexical matching (default), 'semantic' for embedding-based conceptual search, 'hybrid' for combined re-ranking with configurable weighting.",
            },
            limit: {
              type: 'number',
              description:
                'Maximum number of results to return (1-50, default: 10). Higher limits provide more options but may include less relevant matches.',
            },
            tiers: {
              type: 'array',
              items: { type: 'string' },
              description:
                "Filter results by module tiers (semantic/hybrid modes only). Valid values: 'foundation', 'principle', 'technology', 'execution'. Example: ['foundation', 'principle'] returns only foundational and principle modules.",
            },
            similarityThreshold: {
              type: 'number',
              description:
                'Minimum similarity score threshold (0-1, semantic/hybrid modes only). Higher values return fewer but more relevant results. Example: 0.7 for high-precision results.',
            },
            includeRelevanceLevel: {
              type: 'boolean',
              description:
                "Include human-readable relevance level in results (semantic/hybrid modes only, default: true). Adds 'high', 'medium', or 'low' classification.",
            },
            alpha: {
              type: 'number',
              description:
                'Weight for lexical score in hybrid mode (0-1, default: 0.6). Higher values favor fuzzy matching, lower values favor semantic similarity. Example: 0.8 for mostly lexical, 0.3 for mostly semantic.',
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

        case 'get_modules_content': {
          const result = await toolHandlers.handleGetModulesContent(args);
          return createJsonResponse(result);
        }

        case 'search': {
          const result = await toolHandlers.handleSearch(args);
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

  // Resource handlers
  const resourceService = container.getResourceService();

  serverInstance.setRequestHandler(ReadResourceRequestSchema, async request => {
    const { uri } = request.params;

    try {
      const result = await resourceService.readResource(uri);
      // Return only the contents array as per MCP protocol
      return {
        contents: result.contents,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(
        `Failed to read resource ${uri}`,
        err instanceof Error ? err : undefined
      );
      throw new Error(`Failed to read resource: ${errorMessage}`);
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
        resources: {},
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
