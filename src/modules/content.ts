/**
 * @fileoverview Module content retrieval and formatting functionality.
 *
 * This module handles retrieving and combining multiple instruction modules
 * into formatted markdown content. Provides error handling for missing files
 * and formats output with metadata headers for easy consumption by AI systems.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { validateFilePath } from './validation.js';
import { contentLogger } from './logger.js';
import type { GetModulesContentResult } from './types.js';
import type {
  IDependencies,
  IContentService,
  IInstructionModuleParser,
} from './interfaces.js';

/**
 * Injectable content service implementation.
 * Handles content retrieval with dependency injection for better testability.
 */
export class ContentService implements IContentService {
  constructor(
    private dependencies: IDependencies,
    private parser: IInstructionModuleParser
  ) {}

  /**
   * Retrieves and combines the content of multiple instruction modules by their IDs.
   *
   * For each valid module:
   * 1. Reads the markdown file from instructions-modules/
   * 2. Prepends metadata header with ID, category, and description
   * 3. Combines all content with horizontal rule separators
   *
   * @param {string[]} moduleIds - Array of module IDs to retrieve (e.g., ["foundation.logic.deductive-reasoning"])
   * @returns {GetModulesContentResult} Result object with success status, combined content, and error details
   *
   * @example
   * ```typescript
   * const result = contentService.getModulesContent(["foundation.logic.deductive-reasoning", "invalid.id"]);
   * // {
   * //   success: true,
   * //   content: "# Deductive Reasoning\n\n**ID:** `foundation.logic.deductive-reasoning`...",
   * //   errors: ['Module with ID "invalid.id" not found']
   * // }
   * ```
   */
  async getModulesContent(moduleIds: string[]): Promise<GetModulesContentResult> {
    const modules = await this.parser.parseInstructionModules();
    const moduleMap = new Map(modules.map(m => [m.id, m]));

    const errors: string[] = [];
    const contents: string[] = [];
    const baseDir = this.dependencies.pathUtils.join(
      this.dependencies.processUtils.cwd(),
      'instructions-modules'
    );

    for (const moduleId of moduleIds) {
      const module = moduleMap.get(moduleId);

      if (!module) {
        errors.push(`Module with ID "${moduleId}" not found`);
        continue;
      }

      try {
        const contentPath = validateFilePath(
          module.filePath,
          baseDir,
          this.dependencies.pathUtils
        );

        if (!this.dependencies.fileSystem.existsSync(contentPath)) {
          errors.push(`File not found for module "${moduleId}": ${module.filePath}`);
          continue;
        }

        const isYaml = module.filePath.endsWith('.module.yml');
        const fileContent = isYaml
          ? this.renderYamlModuleContent(module)
          : this.dependencies.fileSystem.readFileSync(contentPath, 'utf-8');

        // Format as markdown section with module info header
        const moduleHeader =
          `# ${module.name}\n\n` +
          `**ID:** ` +
          `${module.id}\n` +
          `**Category:** ${module.category}` + (module.subcategory ? ` > ${module.subcategory}` : '') + '  \n' +
          `**Description:** ${module.description}\n\n` +
          `---\n\n`;

        contents.push(moduleHeader + fileContent);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Error reading module "${moduleId}": ${errorMessage}`);
        contentLogger.warn(`Error reading module ${moduleId}`, err);
      }
    }

    if (contents.length === 0) {
      return { success: false, errors };
    }

    // Combine all contents with separators
    const combinedContent = contents.join('\n\n---\n\n');

    return {
      success: true,
      content: combinedContent,
      ...(errors.length > 0 && { errors }),
    };
  }

  /**
   * Renders a simple markdown view for a YAML module (UMS) using metadata only.
   * In v1.0, Markdown is a rendered artifact; we expose meta fields here.
   */
  private renderYamlModuleContent(module: {
    id: string;
    name: string;
    description: string;
    category: string;
    subcategory?: string;
    semantic?: string;
    tags?: string[];
  }): string {
    const lines: string[] = [];
    lines.push(`## Summary`);
    lines.push(module.description);
    lines.push('');
    if (module.tags && module.tags.length > 0) {
      lines.push(`Tags: ${module.tags.join(', ')}`);
    }
  if (module.semantic && module.semantic.trim().length > 0) {
      lines.push('');
      lines.push('### Semantic');
      lines.push(module.semantic.trim());
    }
    lines.push('');
    lines.push(
      '_Note: This module is defined as YAML (.module.yml). Body directives are not rendered here._'
    );
    return lines.join('\n');
  }
}

/**
 * Convenience function to get modules content using the global container.
 * @param moduleIds Array of module IDs to retrieve
 * @returns Result object with success status, combined content, and error details
 */
export async function getModulesContent(moduleIds: string[]): Promise<GetModulesContentResult> {
  // Dynamic import to avoid circular dependency issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getContainer } = require('./container.js') as typeof import('./container.js');
  const container = getContainer();
  const contentService = container.getContentService();
  return await contentService.getModulesContent(moduleIds);
}
