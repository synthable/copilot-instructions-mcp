#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import express from "express";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Interface for instruction module data
interface InstructionModule {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  filePath: string;
}

// Interface for search results
interface SearchResult extends InstructionModule {
  score: number;
  matchedFields: string[];
  contentMatches?: string[];
}

// Function to parse instruction modules from README
function parseInstructionModules(): InstructionModule[] {
  try {
    const readmePath = join(process.cwd(), 'instructions-modules', 'README.md');
    const content = readFileSync(readmePath, 'utf-8');
    const modules: InstructionModule[] = [];
    
    const lines = content.split('\n');
    let currentCategory = '';
    let currentSubcategory = '';
    
    for (const line of lines) {
      // Match main categories (## Title)
      const categoryMatch = line.match(/^## (.+)$/);
      if (categoryMatch) {
        currentCategory = categoryMatch[1];
        currentSubcategory = '';
        continue;
      }
      
      // Match subcategories (- **Title**)
      const subcategoryMatch = line.match(/^- \*\*(.+)\*\*$/);
      if (subcategoryMatch) {
        currentSubcategory = subcategoryMatch[1];
        continue;
      }
      
      // Match module entries with links and descriptions
      const moduleMatch = line.match(/^\s*- \[([^\]]+)\]\(([^)]+)\) - (.+)$/);
      if (moduleMatch) {
        const [, name, filePath, description] = moduleMatch;
        
        // Generate ID from file path
        const id = filePath.replace(/\.md$/, '').replace(/\//g, '.');
        
        modules.push({
          id,
          name,
          description,
          category: currentCategory,
          ...(currentSubcategory && { subcategory: currentSubcategory }),
          filePath
        });
      }
    }
    
    return modules;
  } catch (error) {
    console.error('Error parsing instruction modules:', error);
    return [];
  }
}

// Simple fuzzy search algorithm using Levenshtein distance
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
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  
  const distance = matrix[textLen][searchLen];
  const maxLen = Math.max(searchLen, textLen);
  
  // Convert distance to score (0-1, where 1 is perfect match)
  return Math.max(0, 1 - (distance / maxLen));
}

// Search instruction modules with fuzzy matching
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
        if (!matchedFields.includes('description')) matchedFields.push('description');
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
          if (!matchedFields.includes('subcategory')) matchedFields.push('subcategory');
        }
      }
      
      // Search in file content
      try {
        const contentPath = join(process.cwd(), 'instructions-modules', module.filePath);
        if (existsSync(contentPath)) {
          const content = readFileSync(contentPath, 'utf-8');
          const contentScore = calculateFuzzyScore(term, content) * 0.8;
          
          if (contentScore > 0.2) {
            fieldScore += contentScore;
            if (!matchedFields.includes('content')) matchedFields.push('content');
            
            // Extract context around matches for content preview
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (calculateFuzzyScore(term, lines[i]) > 0.3) {
                const start = Math.max(0, i - 1);
                const end = Math.min(lines.length, i + 2);
                const context = lines.slice(start, end).join(' ').trim();
                if (context.length > 0 && !contentMatches.includes(context)) {
                  contentMatches.push(context.substring(0, 200) + (context.length > 200 ? '...' : ''));
                }
              }
            }
          }
        }
      } catch (error) {
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
        ...(contentMatches.length > 0 && { contentMatches })
      });
    }
  }
  
  // Sort by score (highest first)
  return results.sort((a, b) => b.score - a.score);
}

// Get content of multiple modules by their IDs
function getModulesContent(moduleIds: string[]): { success: boolean; content?: string; errors?: string[] } {
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
      const contentPath = join(process.cwd(), 'instructions-modules', module.filePath);
      
      if (!existsSync(contentPath)) {
        errors.push(`File not found for module "${moduleId}": ${module.filePath}`);
        continue;
      }
      
      const fileContent = readFileSync(contentPath, 'utf-8');
      
      // Format as markdown section with module info header
      const moduleHeader = `# ${module.name}\n\n` +
                          `**ID:** \`${module.id}\`  \n` +
                          `**Category:** ${module.category}` +
                          (module.subcategory ? ` > ${module.subcategory}` : '') + '  \n' +
                          `**Description:** ${module.description}\n\n` +
                          `---\n\n`;
      
      contents.push(moduleHeader + fileContent);
      
    } catch (error) {
      errors.push(`Error reading module "${moduleId}": ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    ...(errors.length > 0 && { errors })
  };
}

const server = new Server(
  {
    name: "simple-mcp-server",
    version: "1.0.0",
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

async function runStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Simple MCP Server running on stdio");
}

async function runHttp(port: number = 3000) {
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
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
  
  app.listen(port, () => {
    console.error(`Simple MCP Server running on http://localhost:${port}`);
  });
}

// Create a function to set up server handlers
function setupServerHandlers(serverInstance: Server) {
  // Tool implementations
  serverInstance.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "echo",
          description: "Echo back the provided text",
          inputSchema: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "Text to echo back",
              },
            },
            required: ["text"],
          },
        },
        {
          name: "add",
          description: "Add two numbers together",
          inputSchema: {
            type: "object",
            properties: {
              a: {
                type: "number",
                description: "First number",
              },
              b: {
                type: "number",
                description: "Second number",
              },
            },
            required: ["a", "b"],
          },
        },
        {
          name: "get_current_time",
          description: "Get the current time",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "list_instruction_modules",
          description: "List all instruction modules with their ID, name, description, and category in JSON format",
          inputSchema: {
            type: "object",
            properties: {
              category: {
                type: "string",
                description: "Optional filter by category (Foundation, Principle, Technology, Execution)",
              },
            },
          },
        },
        {
          name: "search_instruction_modules",
          description: "Search instruction modules using fuzzy matching on names, descriptions, and content",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query - can be multiple terms separated by spaces",
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "get_modules_content",
          description: "Get the combined content of multiple instruction modules by their IDs, formatted as markdown",
          inputSchema: {
            type: "object",
            properties: {
              moduleIds: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "Array of module IDs to retrieve content for",
              },
            },
            required: ["moduleIds"],
          },
        },
      ],
    };
  });

  serverInstance.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "echo":
        return {
          content: [
            {
              type: "text",
              text: `Echo: ${args?.text }`,
            },
          ],
        };

      case "add":
        const sum = (args?.a as number) + (args?.b as number);
        return {
          content: [
            {
              type: "text",
              text: `${args?.a} + ${args?.b} = ${sum}`,
            },
          ],
        };

      case "get_current_time":
        return {
          content: [
            {
              type: "text",
              text: `Current time: ${new Date().toISOString()}`,
            },
          ],
        };

      case "list_instruction_modules":
        try {
          const modules = parseInstructionModules();
          const categoryFilter = args?.['category'] as string;
          
          // Filter by category if specified
          const filteredModules = categoryFilter 
            ? modules.filter(m => m.category.toLowerCase() === categoryFilter.toLowerCase())
            : modules;
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(filteredModules, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  error: `Failed to parse instruction modules: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  modules: []
                }, null, 2),
              },
            ],
          };
        }

      case "search_instruction_modules":
        try {
          const query = args?.['query'] as string;
          const limit = (args?.['limit'] as number) || 10;
          
          if (!query || query.trim().length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ 
                    error: "Search query cannot be empty",
                    results: []
                  }, null, 2),
                  
                },
              ],
            };
          }
          
          // Split query into search terms
          const searchTerms = query.trim().split(/\s+/).filter(term => term.length > 0);
          
          // Perform fuzzy search
          const searchResults = searchInstructionModules(searchTerms);
          
          // Limit results
          const limitedResults = searchResults.slice(0, limit);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  query,
                  totalResults: searchResults.length,
                  returnedResults: limitedResults.length,
                  results: limitedResults
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  error: `Failed to search instruction modules: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  results: []
                }, null, 2),
              },
            ],
          };
        }

      case "get_modules_content":
        try {
          const moduleIds = args?.['moduleIds'] as string[];
          
          if (!moduleIds || !Array.isArray(moduleIds)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ 
                    error: "moduleIds must be provided as an array of strings",
                    success: false
                  }, null, 2),
                },
              ],
            };
          }
          
          if (moduleIds.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ 
                    error: "moduleIds array cannot be empty",
                    success: false
                  }, null, 2),
                },
              ],
            };
          }
          
          // Get the combined content
          const result = getModulesContent(moduleIds);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ...result,
                  requestedModules: moduleIds.length,
                  processedModules: result.success ? moduleIds.length - (result.errors?.length || 0) : 0
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  error: `Failed to get modules content: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  success: false
                }, null, 2),
              },
            ],
          };
        }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Prompt implementations
  serverInstance.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "greeting",
          description: "A friendly greeting prompt",
          arguments: [
            {
              name: "name",
              description: "Name of the person to greet",
              required: true,
            },
          ],
        },
        {
          name: "summarize",
          description: "Summarize the given text",
          arguments: [
            {
              name: "text",
              description: "Text to summarize",
              required: true,
            },
            {
              name: "max_length",
              description: "Maximum length of summary",
              required: false,
            },
          ],
        },
      ],
    };
  });

  serverInstance.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "greeting":
        return {
          description: "A friendly greeting",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Hello ${args?.['name'] || "there"}! How are you doing today?`,
              },
            },
          ],
        };

      case "summarize":
        const maxLength = args?.['max_length'] ? ` in no more than ${args['max_length']} words` : "";
        return {
          description: "Summarize the provided text",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please summarize the following text${maxLength}:\n\n${args?.['text']}`,
              },
            },
          ],
        };

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });
}

async function runSSE(port: number = 3000) {
  const sessions = new Map<string, { transport: SSEServerTransport; server: Server }>();
  
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
          name: "simple-mcp-server",
          version: "1.0.0",
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
        console.error(`SSE session closed: ${sessionId}`);
      };
      
      // Start the SSE stream
      await transport.start();
      
      
    } catch (error) {
      console.error('Error starting SSE session:', error);
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
    } catch (error) {
      console.error('Error handling SSE POST message:', error);
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
    console.error(`Simple MCP Server with SSE running on http://localhost:${port}`);
    console.error(`Connect to SSE stream at: http://localhost:${port}/sse`);
  });
}

// Configure command line interface
const program = new Command();

program
  .name('simple-mcp-server')
  .description('A simple MCP server with multiple transport options')
  .version('1.0.0');

program
  .command('stdio')
  .description('Run server with stdio transport (default)')
  .action(() => {
    runStdio().catch(console.error);
  });

program
  .command('http')
  .description('Run server with Streamable HTTP transport')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .action((options) => {
    const port = parseInt(options.port) || 3000;
    runHttp(port).catch(console.error);
  });

program
  .command('sse')
  .description('Run server with Server-Sent Events transport (DEPRECATED - use http instead)')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .action((options) => {
    const port = parseInt(options.port) || 3000;
    console.error('WARNING: SSE transport is deprecated. Use "http" command instead.');
    runSSE(port).catch(console.error);
  });

// Handle case where no command is provided (default to stdio)
if (process.argv.length <= 2) {
  runStdio().catch(console.error);
} else {
  program.parse();
}