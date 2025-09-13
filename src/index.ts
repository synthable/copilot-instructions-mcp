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
import { createServer, createInitializedServer } from './modules/server.js';
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

/**
 * Starts the stdio server with proper error handling and logging.
 *
 * @param message - Optional custom message to log on startup
 * @since 1.0.0
 */
function startStdioServer(message = 'Starting stdio server'): void {
  logger.info(message);
  // Always use dependency injection now
  const container = createProductionContainer();
  logger.debug('Using dependency injection');

  createInitializedServer(container)
    .then(server => runStdio(server))
    .catch((error: unknown) => {
      logger.error(
        'Failed to start stdio server',
        error instanceof Error ? error : undefined
      );
      process.exit(1);
    });
}

program
  .name('simple-mcp-server')
  .description('MCP server with instruction modules for AI capability enhancement')
  .version('1.0.0');

// Debug flag
program.option('-d, --debug', 'enable debug logging').hook('preAction', thisCommand => {
  const opts = thisCommand.opts();
  if (opts.debug) {
    setDebugLogging(true);
    logger.debug('Debug logging enabled');
  }
});

// Transport commands
program
  .command('stdio')
  .description('Run server with stdio transport (default)')
  .action(() => {
    startStdioServer();
  });

program
  .command('http')
  .description('Run server with HTTP transport')
  .option('-p, --port <port>', 'port number', '3000')
  .action((options: { port: string }) => {
    const httpPort = parseInt(options.port, 10) || 3000;
    logger.info(`Starting HTTP server on port ${httpPort.toString()}`);
    // Always use dependency injection now
    const container = createProductionContainer();
    logger.debug('Using dependency injection');

    createInitializedServer(container)
      .then(server => runHttp(server, httpPort))
      .catch((error: unknown) => {
        logger.error(
          'Failed to start HTTP server',
          error instanceof Error ? error : undefined
        );
        process.exit(1);
      });
  });

program
  .command('sse')
  .description('Run server with SSE transport (deprecated)')
  .option('-p, --port <port>', 'port number', '3000')
  .action((options: { port: string }) => {
    const ssePort = parseInt(options.port, 10) || 3000;
    logger.warn('SSE transport is deprecated. Use "http" instead.');
    logger.info(`Starting SSE server on port ${ssePort.toString()}`);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    runSSE(() => createServer(createProductionContainer()), ssePort);
  });

// Default action when no command is specified - defaults to stdio
program.action(() => {
  startStdioServer('No command specified, defaulting to stdio transport');
});

program.parse();
