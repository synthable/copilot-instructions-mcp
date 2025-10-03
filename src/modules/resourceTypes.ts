/**
 * @fileoverview Type definitions for MCP resource functionality.
 *
 * This module defines types for URI-based resource access to instruction modules,
 * implementing the MCP resources capability for direct module content retrieval.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

/**
 * Supported resource formats for module content.
 */
export type ResourceFormat = 'yaml' | 'markdown' | 'raw';

/**
 * Resource content structure returned by the MCP server.
 * Follows the MCP protocol specification for resource responses.
 *
 * @interface ResourceContent
 * @property {string} uri - The URI that was requested
 * @property {Array} contents - Array of content items (typically one per resource)
 * @property {object} [metadata] - Optional metadata about the module
 *
 * @example
 * ```typescript
 * const resource: ResourceContent = {
 *   uri: "module://foundation/reasoning/systems-thinking",
 *   contents: [{
 *     uri: "module://foundation/reasoning/systems-thinking",
 *     mimeType: "text/markdown",
 *     text: "# Systems Thinking\n\n..."
 *   }],
 *   metadata: {
 *     moduleId: "foundation.reasoning.systems-thinking",
 *     name: "Systems Thinking",
 *     category: "Foundation",
 *     format: "markdown"
 *   }
 * };
 * ```
 */
export interface ResourceContent {
  /** The URI that was requested */
  uri: string;
  /** Array of content items with their MIME types */
  contents: {
    /** The URI of this content item */
    uri: string;
    /** MIME type of the content */
    mimeType: string;
    /** The actual content text */
    text: string;
  }[];
  /** Optional metadata about the module */
  metadata?: {
    /** Module identifier (dot-separated for legacy, slash-separated for UMS) */
    moduleId: string;
    /** Human-readable module name */
    name: string;
    /** Main category (Foundation, Principle, Technology, Execution) */
    category: string;
    /** Optional subcategory */
    subcategory?: string;
    /** Brief description of the module */
    description?: string;
    /** Format of the returned content */
    format: ResourceFormat;
  };
}

/**
 * Parsed URI components for module resource access.
 *
 * @interface ParsedResourceUri
 * @property {string} moduleId - Dot-separated module identifier
 * @property {ResourceFormat} format - Requested content format
 * @property {string[]} pathSegments - Original URI path segments
 *
 * @example
 * ```typescript
 * // URI: module://technology/testing/jest/mocking/yaml
 * const parsed: ParsedResourceUri = {
 *   moduleId: "technology.testing.jest.mocking",
 *   format: "yaml",
 *   pathSegments: ["technology", "testing", "jest", "mocking"]
 * };
 * ```
 */
export interface ParsedResourceUri {
  /** Dot-separated module identifier */
  moduleId: string;
  /** Requested content format (defaults to markdown) */
  format: ResourceFormat;
  /** Original URI path segments (without format suffix) */
  pathSegments: string[];
}

/**
 * MIME type mapping for resource formats.
 */
export const MIME_TYPES: Record<ResourceFormat, string> = {
  yaml: 'application/x-yaml',
  markdown: 'text/markdown',
  raw: 'text/plain',
};

/**
 * Valid format suffixes for URI parsing.
 */
export const VALID_FORMATS: ResourceFormat[] = ['yaml', 'markdown', 'raw'];
