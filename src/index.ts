#!/usr/bin/env node

import { Command } from 'commander';
import { createServer, setDebugEnabled } from './modules/server.js';
import { runStdio, runHttp, runSSE, setDebugEnabled as setTransportDebugEnabled } from './modules/transport.js';

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
    '-t, --transport <type>',
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
      setDebugEnabled(true);
      setTransportDebugEnabled(true);
    }

    switch (transport) {
      case 'http': {
        const httpPort = parseInt(port, 10) || 3000;
        const server = createServer();
        runHttp(server, httpPort).catch(console.error);
        break;
      }
      case 'sse': {
        const ssePort = parseInt(port, 10) || 3000;
        console.warn(
          'WARNING: SSE transport is deprecated. Use "http" instead.'
        );
        runSSE(createServer, ssePort);
        break;
      }
      case 'stdio':
      default: {
        const server = createServer();
        runStdio(server).catch(console.error);
        break;
      }
    }
  });

program.parse();