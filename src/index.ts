#!/usr/bin/env node

/**
 * @fileoverview Entry point for the Simple MCP Server application.
 *
 * This file provides a command-line interface for starting an MCP (Model Context Protocol)
 * server with support for multiple transport modes. The server provides AI assistants with
 * access to instruction modules for dynamic capability enhancement.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { Command } from 'commander';
import { createServer } from './modules/server.js';
import { runStdio, runHttp, runSSE } from './modules/transport.js';
import { setDebugLogging, createLogger } from './modules/logger.js';
import { createProductionContainer } from './modules/container.js';

/**
 * Commander.js program instance for parsing command-line arguments.
 *
 * Configures the CLI interface with support for:
 * - Transport selection (stdio, http, sse)
 * - Port configuration for HTTP/SSE transports
 * - Debug logging enablement
 *
 * @since 1.0.0
 */
const program = new Command();

/**
 * Logger instance for CLI operations and startup messages.
 *
 * @since 1.0.0
 */
const logger = createLogger('cli');

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
      setDebugLogging(true);
      logger.debug('Debug logging enabled');
    }

    // Always use dependency injection now
    const container = createProductionContainer();
    logger.debug('Using dependency injection');

    switch (transport) {
      case 'http': {
        const httpPort = parseInt(port, 10) || 3000;
        logger.info(`Starting HTTP server on port ${httpPort}`);
        const server = createServer(container);
        runHttp(server, httpPort).catch(error => {
          logger.error('Failed to start HTTP server', error);
          process.exit(1);
        });
        break;
      }
      case 'sse': {
        const ssePort = parseInt(port, 10) || 3000;
        logger.warn('SSE transport is deprecated. Use "http" instead.');
        logger.info(`Starting SSE server on port ${ssePort}`);
        runSSE(() => createServer(createProductionContainer()), ssePort);
        break;
      }
      case 'stdio':
      default: {
        logger.info('Starting stdio server');
        const server = createServer(container);
        runStdio(server).catch(error => {
          logger.error('Failed to start stdio server', error);
          process.exit(1);
        });
        break;
      }
    }
  });

program.parse();
