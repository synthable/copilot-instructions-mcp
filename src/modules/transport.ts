import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { randomUUID } from 'node:crypto';
import express from 'express';

let debugEnabled = false;

/**
 * Sets the debug flag for transport operations
 */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
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
 * @param {Server} server - The configured MCP server instance
 * @returns {Promise<void>} Promise that resolves when server is connected and listening
 */
export async function runStdio(server: Server): Promise<void> {
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
 * @param {Server} server - The configured MCP server instance
 * @param {number} [port=3000] - Port to listen on for HTTP connections
 * @returns {Promise<void>} Promise that resolves when server is listening
 */
export async function runHttp(server: Server, port = 3000): Promise<void> {
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
 * @param {Server} serverFactory - Function that creates a new configured server instance
 * @param {number} [port=3000] - Port to listen on for SSE connections
 * @returns {void}
 */
export function runSSE(serverFactory: () => Server, port = 3000): void {
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
      const sessionServer = serverFactory();

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
