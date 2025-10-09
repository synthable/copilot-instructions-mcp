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
export type * from './types.js';
export type * from './interfaces.js';

// Re-export validation utilities and configuration
export * from '../services/validation/validation.js';

// Re-export logging system
export * from '../utils/logger.js';

// Re-export dependency injection system (primary architecture)
export * from './container.js';

// Export service classes (primary architecture)
export { InstructionModuleParser } from '../services/parsing/parsing.js';
export { SearchService } from '../services/search/search.js';
export { ContentService } from '../services/content/content.js';
export { SemanticSearchService } from '../services/embedding/semanticSearch.js';
export { ToolHandlers } from '../server/toolHandlers.js';

// Note: Convenience functions removed to eliminate Service Locator anti-pattern
// Use the service classes directly with proper dependency injection instead
export { createToolErrorResponse, getToolFallbackData } from '../server/toolHandlers.js';

// Export server and transport functions
export { createServer, setupServerHandlers } from '../server/server.js';
export { runStdio, runHttp, runSSE } from '../server/transport.js';
