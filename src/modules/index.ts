/**
 * @fileoverview Module re-exports for the Simple MCP Server.
 *
 * This module provides a clean interface for importing all public functions,
 * types, and utilities from the modular MCP server implementation with
 * dependency injection as the primary architecture.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

// Re-export all public types and interfaces
export * from './types.js';
export * from './interfaces.js';

// Re-export validation utilities and configuration
export * from './validation.js';

// Re-export logging system
export * from './logger.js';

// Re-export dependency injection system (primary architecture)
export * from './container.js';

// Export service classes (primary architecture)
export { InstructionModuleParser } from './parsing.js';
export { SearchService } from './search.js';
export { ContentService } from './content.js';
export { SemanticSearchService } from './semanticSearch.js';
export { ToolHandlers } from './toolHandlers.js';

// Note: Convenience functions removed to eliminate Service Locator anti-pattern
// Use the service classes directly with proper dependency injection instead
export { createToolErrorResponse, getToolFallbackData } from './toolHandlers.js';

// Export server and transport functions
export { createServer, setupServerHandlers } from './server.js';
export { runStdio, runHttp, runSSE } from './transport.js';
