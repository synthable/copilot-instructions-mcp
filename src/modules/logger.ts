/**
 * @fileoverview Centralized logging system for the MCP server.
 *
 * This module provides a structured logging framework with configurable levels,
 * module-specific loggers, and support for both development and production formats.
 * Designed to maintain clean JSON output for MCP protocol while enabling rich
 * debugging information when needed.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

/**
 * Enumeration of available log levels in order of severity.
 *
 * Used to control which messages are output based on the configured
 * minimum log level. Higher numeric values indicate higher severity.
 *
 * @enum {number}
 * @since 1.0.0
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Structure of a log entry containing all metadata and content.
 *
 * @interface LogEntry
 * @property {string} timestamp - ISO timestamp when the log entry was created
 * @property {string} level - Log level as string (DEBUG, INFO, WARN, ERROR)
 * @property {string} module - Name of the module that generated the log
 * @property {string} message - Primary log message
 * @property {unknown} [data] - Optional structured data associated with the log
 * @property {Error} [error] - Optional error object with stack trace
 *
 * @since 1.0.0
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  data?: unknown;
  error?: Error;
}

/**
 * Configuration options for the logging system.
 *
 * @interface LoggerConfig
 * @property {LogLevel} level - Minimum log level to output
 * @property {boolean} enableConsole - Whether to output to console
 * @property {boolean} enableStructured - Whether to use JSON format
 * @property {boolean} includeTimestamp - Whether to include timestamps
 * @property {boolean} includeModule - Whether to include module names
 *
 * @since 1.0.0
 */
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStructured: boolean;
  includeTimestamp: boolean;
  includeModule: boolean;
}

class Logger {
  private config: LoggerConfig = {
    level: LogLevel.WARN, // Default to WARN to keep stdio clean
    enableConsole: true,
    enableStructured: false,
    includeTimestamp: true,
    includeModule: true,
  };

  /**
   * Updates the logger configuration with provided settings.
   *
   * Allows partial configuration updates - only specified properties
   * will be changed, others remain at their current values.
   *
   * @param config - Partial configuration object with settings to update
   *
   * @example
   * ```typescript
   * logger.configure({ level: LogLevel.DEBUG, enableStructured: true });
   * ```
   *
   * @since 1.0.0
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Sets the minimum log level for output filtering.
   *
   * Messages below this level will be ignored. This provides a quick
   * way to adjust verbosity without changing the full configuration.
   *
   * @param level - The minimum LogLevel to output
   *
   * @example
   * ```typescript
   * logger.setLevel(LogLevel.WARN); // Only show warnings and errors
   * ```
   *
   * @since 1.0.0
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Convenience method to enable or disable debug-level logging.
   *
   * When enabled, sets level to DEBUG. When disabled, sets level to INFO.
   * This provides an easy way to toggle detailed logging.
   *
   * @param enabled - Whether to enable debug logging
   *
   * @example
   * ```typescript
   * logger.setDebugEnabled(true); // Show all messages including debug
   * ```
   *
   * @since 1.0.0
   */
  setDebugEnabled(enabled: boolean): void {
    this.config.level = enabled ? LogLevel.DEBUG : LogLevel.INFO;
  }

  /**
   * Creates a module-specific logger instance with pre-configured module name.
   *
   * Returns an object with convenience methods for each log level that
   * automatically include the module name in all log entries.
   *
   * @param moduleName - Name of the module for log identification
   * @returns Object with debug, info, warn, and error logging methods
   *
   * @example
   * ```typescript
   * const moduleLogger = logger.createModuleLogger('parsing');
   * moduleLogger.info('Module initialized');
   * moduleLogger.error('Parsing failed', error);
   * ```
   *
   * @since 1.0.0
   */
  createModuleLogger(moduleName: string) {
    return {
      debug: (message: string, data?: unknown) => {
        this.log(LogLevel.DEBUG, moduleName, message, data);
      },
      info: (message: string, data?: unknown) => {
        this.log(LogLevel.INFO, moduleName, message, data);
      },
      warn: (message: string, data?: unknown) => {
        this.log(LogLevel.WARN, moduleName, message, data);
      },
      error: (message: string, error?: Error, data?: unknown) => {
        this.log(LogLevel.ERROR, moduleName, message, data, error);
      },
    };
  }

  /**
   * Internal logging method
   */
  private log(
    level: LogLevel,
    module: string,
    message: string,
    data?: unknown,
    error?: Error
  ): void {
    // Skip if below configured level
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      module,
      message,
      ...(data !== undefined && { data }),
      ...(error && { error }),
    };

    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // Future: Could add file logging, external services, etc.
  }

  /**
   * Format and output log entry to console
   */
  private logToConsole(entry: LogEntry): void {
    if (this.config.enableStructured) {
      // Structured JSON output for production
      console.error(JSON.stringify(entry));
      return;
    }

    // Human-readable format for development
    const parts: string[] = [];

    if (this.config.includeTimestamp) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      parts.push(`[${time}]`);
    }

    parts.push(`[${entry.level}]`);

    if (this.config.includeModule) {
      parts.push(`[${entry.module}]`);
    }

    parts.push(entry.message);

    const logMessage = parts.join(' ');

    // Use appropriate console method based on level
    switch (entry.level) {
      case 'DEBUG':
        console.debug(logMessage, entry.data ?? '');
        break;
      case 'INFO':
        console.info(logMessage, entry.data ?? '');
        break;
      case 'WARN':
        console.warn(logMessage, entry.data ?? '');
        break;
      case 'ERROR':
        console.error(logMessage, entry.data ?? '');
        if (entry.error) {
          console.error('Stack trace:', entry.error.stack);
        }
        break;
    }
  }
}

// Global logger instance
const globalLogger = new Logger();

/**
 * Configures the global logger instance with the provided settings.
 *
 * This function provides a convenient way to configure the singleton logger
 * instance used throughout the application.
 *
 * @param config - Partial configuration object with settings to update
 *
 * @example
 * ```typescript
 * configureLogger({
 *   level: LogLevel.DEBUG,
 *   enableStructured: true
 * });
 * ```
 *
 * @since 1.0.0
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalLogger.configure(config);
}

/**
 * Sets the minimum log level for the global logger instance.
 *
 * @param level - The minimum LogLevel to output globally
 *
 * @example
 * ```typescript
 * setLogLevel(LogLevel.WARN); // Only show warnings and errors globally
 * ```
 *
 * @since 1.0.0
 */
export function setLogLevel(level: LogLevel): void {
  globalLogger.setLevel(level);
}

/**
 * Enables or disables debug logging globally across all modules.
 *
 * This is a convenience function that adjusts the global log level
 * to either DEBUG (when enabled) or INFO (when disabled).
 *
 * @param enabled - Whether to enable debug logging globally
 *
 * @example
 * ```typescript
 * setDebugLogging(true); // Enable debug logs for all modules
 * ```
 *
 * @since 1.0.0
 */
export function setDebugLogging(enabled: boolean): void {
  globalLogger.setDebugEnabled(enabled);
}

/**
 * Creates a module-specific logger instance from the global logger.
 *
 * This is the primary way to create loggers for individual modules.
 * Each logger will automatically include the module name in all log entries.
 *
 * @param moduleName - Name of the module for log identification
 * @returns Module-specific logger with debug, info, warn, and error methods
 *
 * @example
 * ```typescript
 * const logger = createLogger('my-module');
 * logger.info('Module started'); // Output: [INFO] [my-module] Module started
 * ```
 *
 * @since 1.0.0
 */
export function createLogger(moduleName: string) {
  return globalLogger.createModuleLogger(moduleName);
}

/**
 * Pre-configured logger for server operations and MCP protocol handling.
 * @since 1.0.0
 */
export const serverLogger = createLogger('server');

/**
 * Pre-configured logger for transport layer operations (stdio, HTTP, SSE).
 * @since 1.0.0
 */
export const transportLogger = createLogger('transport');

/**
 * Pre-configured logger for instruction module parsing operations.
 * @since 1.0.0
 */
export const parsingLogger = createLogger('parsing');

/**
 * Pre-configured logger for fuzzy search operations and scoring.
 * @since 1.0.0
 */
export const searchLogger = createLogger('search');

/**
 * Pre-configured logger for module content retrieval and formatting.
 * @since 1.0.0
 */
export const contentLogger = createLogger('content');

/**
 * Pre-configured logger for input validation and security operations.
 * @since 1.0.0
 */
export const validationLogger = createLogger('validation');

/**
 * Pre-configured logger for MCP tool request handling.
 * @since 1.0.0
 */
export const toolHandlersLogger = createLogger('toolHandlers');
