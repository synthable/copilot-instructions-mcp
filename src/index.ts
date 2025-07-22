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
import { readFileSync } from "node:fs";
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