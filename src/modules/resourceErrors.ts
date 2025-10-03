/**
 * @fileoverview Custom error classes for resource service operations.
 *
 * This module defines typed error classes for better error handling and
 * identification in the resource service without relying on string matching.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

/**
 * Base class for all resource-related errors.
 */
export class ResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceError';
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when a module cannot be found by ID.
 */
export class ModuleNotFoundError extends ResourceError {
  constructor(
    public readonly moduleId: string,
    public readonly uri: string
  ) {
    super(
      `Module not found: ${moduleId}. ` +
        `URI: ${uri}. ` +
        `Available modules can be discovered using list_instruction_modules or search_instruction_modules tools.`
    );
    this.name = 'ModuleNotFoundError';
  }
}

/**
 * Error thrown when a module file cannot be found on disk.
 */
export class ModuleFileNotFoundError extends ResourceError {
  constructor(
    public readonly moduleId: string,
    public readonly filePath: string
  ) {
    super(
      `File not found for module "${moduleId}": ${filePath}. ` +
        `This may indicate a corrupted module index or missing file.`
    );
    this.name = 'ModuleFileNotFoundError';
  }
}

/**
 * Error thrown when a URI format is invalid.
 */
export class InvalidUriError extends ResourceError {
  constructor(
    public readonly uri: string,
    public readonly reason: string
  ) {
    super(`Invalid URI: ${reason}. URI: ${uri}`);
    this.name = 'InvalidUriError';
  }
}

/**
 * Error thrown when a module file cannot be read.
 */
export class ModuleReadError extends ResourceError {
  public override readonly cause: Error;

  constructor(
    public readonly moduleId: string,
    cause: Error
  ) {
    super(`Error reading module "${moduleId}": ${cause.message}`);
    this.name = 'ModuleReadError';
    this.cause = cause;
  }
}

/**
 * Error thrown when an unsupported format is requested.
 */
export class UnsupportedFormatError extends ResourceError {
  constructor(public readonly format: string) {
    super(`Unsupported format: ${format}`);
    this.name = 'UnsupportedFormatError';
  }
}
