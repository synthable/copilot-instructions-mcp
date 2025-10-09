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
import { createServer, createInitializedServer } from './modules/server/server.js';
import { runStdio, runHttp, runSSE } from './modules/server/transport.js';
import { setDebugLogging } from './modules/utils/logger.js';
import { createProductionContainer, type Container } from './modules/core/container.js';
import { configSchema, type ServerConfig } from './config/config.schema.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Default server configuration used when config.json is not found or invalid.
 *
 * @since 1.0.0
 */
const DEFAULT_CONFIG = {
  embeddingProvider: { name: 'transformers' as const },
  searchProvider: { name: 'fuzzy' as const },
};

/**
 * Loads and validates configuration from config.json if it exists.
 * Falls back to default configuration if file is not found.
 *
 * @returns Validated server configuration
 * @since 1.0.0
 */
function loadConfig(): ServerConfig {
  const configPath = join(process.cwd(), 'config.json');

  if (!existsSync(configPath)) {
    // Return default configuration
    return configSchema.parse(DEFAULT_CONFIG);
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const rawConfig: unknown = JSON.parse(configContent);
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Failed to load configuration from config.json:', error);
    console.error('Falling back to default configuration');
    return configSchema.parse(DEFAULT_CONFIG);
  }
}

/**
 * Initializes server components with config loading and logging.
 *
 * @returns Initialized container and logger
 * @since 1.0.0
 */
function initializeServerComponents(): {
  config: ServerConfig;
  container: Container;
  logger: ReturnType<Container['getLogger']>;
} {
  const config = loadConfig();
  const container = createProductionContainer(config.moduleDirectory);
  const logger = container.getLogger();

  logger.debug('Using dependency injection');
  if (config.moduleDirectory !== 'instructions-modules') {
    logger.info(`Using custom module directory: ${config.moduleDirectory}`);
  }

  return { config, container, logger };
}

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
 * Starts the stdio server with proper error handling and logging.
 *
 * @param message - Optional custom message to log on startup
 * @since 1.0.0
 */
function startStdioServer(message = 'Starting stdio server'): void {
  const { container, logger } = initializeServerComponents();

  logger.info(message);

  createInitializedServer(container)
    .then(server => runStdio(server, logger))
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
    // Debug logging message will be shown by each command
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
    const { container, logger } = initializeServerComponents();

    logger.info(`Starting HTTP server on port ${httpPort.toString()}`);

    createInitializedServer(container)
      .then(server => runHttp(server, logger, httpPort))
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
    const { config, logger } = initializeServerComponents();

    logger.warn('SSE transport is deprecated. Use "http" instead.');
    logger.info(`Starting SSE server on port ${ssePort.toString()}`);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    runSSE(
      () => createServer(createProductionContainer(config.moduleDirectory)),
      logger,
      ssePort
    );
  });

// Default action when no command is specified - defaults to stdio
program.action(() => {
  startStdioServer('No command specified, defaulting to stdio transport');
});

program.parse();
