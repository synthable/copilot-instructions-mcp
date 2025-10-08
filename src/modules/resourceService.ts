/**
 * @fileoverview Resource service for URI-based module access.
 *
 * This module implements the MCP resources capability, enabling direct access
 * to instruction modules via standardized URIs. Supports multiple content formats
 * (YAML, Markdown, Raw) and integrates with the existing module parser.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { validateFilePath } from './validation.js';
import type {
  ResourceContent,
  ResourceFormat,
  ParsedResourceUri,
} from './resourceTypes.js';
import { VALID_FORMATS, MIME_TYPES } from './resourceTypes.js';
import type {
  IDependencies,
  IResourceService,
  IInstructionModuleParser,
} from './interfaces.js';
import type { InstructionModule } from './types.js';
import {
  ModuleNotFoundError,
  ModuleFileNotFoundError,
  ModuleReadError,
  InvalidUriError,
  UnsupportedFormatError,
  SecurityError,
} from './resourceErrors.js';

// Valid module ID pattern: lowercase alphanumeric, dots, hyphens
const VALID_MODULE_ID_PATTERN = /^[a-z0-9.-]+$/;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Resource service implementation for URI-based module access.
 * Provides direct read access to instruction modules in various formats.
 */
export class ResourceService implements IResourceService {
  private readonly moduleDirectory: string;

  constructor(
    private readonly dependencies: IDependencies,
    private readonly parser: IInstructionModuleParser,
    moduleDirectory: string = 'instructions-modules'
  ) {
    this.moduleDirectory = moduleDirectory;
  }

  /**
   * Reads a resource by URI and returns its content in the requested format.
   *
   * URI Format: module://{tier}/{category}/{subcategory}/{module-name}[/{format}]
   *
   * Examples:
   * - module://foundation/reasoning/systems-thinking (default: markdown)
   * - module://technology/testing/jest/mocking/yaml (explicit YAML)
   * - module://principle/architecture/solid/raw (raw file content)
   *
   * @param uri - The module URI
   * @returns Promise resolving to ResourceContent with the module content and metadata
   * @throws Error if URI is malformed or module is not found
   */
  async readResource(uri: string): Promise<ResourceContent> {
    // Parse and validate URI
    const parsed = this.parseUri(uri);

    // Get module from cache
    const modules = await this.parser.parseInstructionModules();
    const module = modules.find(m => m.id === parsed.moduleId);

    if (!module) {
      throw new ModuleNotFoundError(parsed.moduleId, uri);
    }

    // Get file content in requested format
    const content = this.getModuleContent(module, parsed.format);
    const mimeType = MIME_TYPES[parsed.format];

    return {
      uri,
      contents: [
        {
          uri,
          mimeType,
          text: content,
        },
      ],
      metadata: {
        moduleId: module.id,
        name: module.name,
        category: module.category,
        ...(module.subcategory && { subcategory: module.subcategory }),
        description: module.description,
        format: parsed.format,
      },
    };
  }

  /**
   * Parses a module URI into its components.
   *
   * @param uri - The URI to parse
   * @returns Parsed URI components
   * @throws Error if URI format is invalid
   */
  private parseUri(uri: string): ParsedResourceUri {
    // Validate URI scheme
    if (!uri.startsWith('module://')) {
      throw new InvalidUriError(
        uri,
        `Invalid URI scheme. Expected "module://" but got "${uri.substring(0, Math.min(20, uri.length))}"`
      );
    }

    // Extract path from URI
    const path = uri.substring('module://'.length);
    if (!path) {
      throw new InvalidUriError(uri, 'Empty path after scheme');
    }

    // Split path into segments
    const segments = path.split('/').filter(s => s.length > 0);
    if (segments.length === 0) {
      throw new InvalidUriError(uri, 'No path segments found');
    }

    // Check if last segment is a format specifier
    const lastSegment = segments[segments.length - 1];
    let format: ResourceFormat = 'markdown'; // default
    let pathSegments = segments;

    if (VALID_FORMATS.includes(lastSegment as ResourceFormat)) {
      format = lastSegment as ResourceFormat;
      pathSegments = segments.slice(0, -1);

      if (pathSegments.length === 0) {
        throw new InvalidUriError(uri, 'Format specified but no module path provided');
      }
    }

    // Convert path segments to module ID (replace slashes with dots)
    const moduleId = pathSegments.join('.');

    // Check for path traversal patterns
    if (
      moduleId.includes('..') ||
      moduleId.includes('/') ||
      moduleId.includes('\\')
    ) {
      throw new InvalidUriError(uri, 'Module ID contains invalid path characters');
    }

    // Validate module ID format
    if (!VALID_MODULE_ID_PATTERN.test(moduleId)) {
      throw new InvalidUriError(
        uri,
        'Module ID contains invalid characters. Use lowercase alphanumeric, dots, and hyphens only.'
      );
    }

    return {
      moduleId,
      format,
      pathSegments,
    };
  }

  /**
   * Generates a standard markdown header for a module.
   *
   * @param module - The module metadata
   * @returns Formatted markdown header
   */
  private generateModuleHeader(module: {
    name: string;
    id: string;
    category: string;
    subcategory?: string;
    description: string;
  }): string {
    return (
      `# ${module.name}\n\n` +
      `**ID:** ${module.id}\n` +
      `**Category:** ${module.category}` +
      (module.subcategory ? ` > ${module.subcategory}` : '') +
      '\n' +
      `**Description:** ${module.description}\n\n` +
      '---\n\n'
    );
  }

  /**
   * Retrieves module content in the specified format.
   *
   * @param module - The module metadata
   * @param format - The requested format
   * @returns The formatted content
   * @throws Error if file cannot be read
   */
  private getModuleContent(module: InstructionModule, format: ResourceFormat): string {
    const baseDir = this.dependencies.pathUtils.join(
      this.dependencies.processUtils.cwd(),
      this.moduleDirectory
    );

    let contentPath: string;
    try {
      contentPath = validateFilePath(
        module.filePath,
        baseDir,
        this.dependencies.pathUtils
      );
    } catch (err) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new SecurityError(module.id, cause.message);
    }

    // Add canonical path check
    const canonicalBase = this.dependencies.pathUtils.resolve(baseDir);
    const canonicalPath = this.dependencies.pathUtils.resolve(contentPath);

    if (!canonicalPath.startsWith(canonicalBase)) {
      throw new SecurityError(
        module.id,
        `File path escapes module directory: ${module.filePath}`
      );
    }

    if (!this.dependencies.fileSystem.existsSync(contentPath)) {
      throw new ModuleFileNotFoundError(module.id, module.filePath);
    }

    // Symlink detection
    const lstat = this.dependencies.fileSystem.lstatSync(contentPath);
    if (lstat.isSymbolicLink()) {
      throw new SecurityError(
        module.id,
        'Symlinks are not allowed for security reasons'
      );
    }

    // File size limits
    const stats = this.dependencies.fileSystem.statSync(contentPath);
    if (stats.size > MAX_FILE_SIZE) {
      throw new ModuleReadError(
        module.id,
        new Error(
          `File size (${stats.size} bytes) exceeds maximum allowed (${MAX_FILE_SIZE} bytes)`
        )
      );
    }

    try {
      const rawContent = this.dependencies.fileSystem.readFileSync(
        contentPath,
        'utf-8'
      );

      switch (format) {
        case 'raw':
          // Return raw file content as-is
          return rawContent;

        case 'yaml':
          // For YAML format, return raw content for .module.yml files
          // For legacy markdown files, wrap in a note
          if (module.filePath.endsWith('.module.yml')) {
            return rawContent;
          } else {
            return (
              '# Note: Legacy Markdown Module\n\n' +
              'This module uses the legacy Markdown format and does not have a YAML representation.\n\n' +
              '---\n\n' +
              rawContent
            );
          }

        case 'markdown':
          // For markdown format, use the same rendering logic as getModulesContent
          // If it's a YAML module, we'd need to render it (reuse content service logic)
          // For now, return a simplified version
          if (module.filePath.endsWith('.module.yml')) {
            // For YAML modules, return a header + raw content
            // In a full implementation, this would call the same rendering logic
            // as content.ts renderYamlModuleContent
            return (
              this.generateModuleHeader(module) + '```yaml\n' + rawContent + '\n```'
            );
          } else {
            // For markdown modules, return with header
            return this.generateModuleHeader(module) + rawContent;
          }

        default:
          throw new UnsupportedFormatError(format as string);
      }
    } catch (err) {
      // Re-throw our own typed errors
      if (
        err instanceof ModuleFileNotFoundError ||
        err instanceof UnsupportedFormatError ||
        err instanceof SecurityError
      ) {
        throw err;
      }
      // Wrap other errors in ModuleReadError
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new ModuleReadError(module.id, cause);
    }
  }
}

/**
 * Creates a new ResourceService instance.
 *
 * @param dependencies - Dependency injection container
 * @param parser - Instruction module parser
 * @param moduleDirectory - Base directory for instruction modules (default: 'instructions-modules')
 * @returns New ResourceService instance
 */
export function createResourceService(
  dependencies: IDependencies,
  parser: IInstructionModuleParser,
  moduleDirectory?: string
): IResourceService {
  return new ResourceService(dependencies, parser, moduleDirectory);
}