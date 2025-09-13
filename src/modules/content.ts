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
import type {
  GetModulesContentResult,
  UMSv11Module,
  CompositeListDirective,
} from './types.js';
import type {
  IDependencies,
  IContentService,
  IInstructionModuleParser,
} from './interfaces.js';
import { parse as yamlParseFn } from 'yaml';

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
          ? this.renderYamlModuleContent(module, contentPath)
          : this.dependencies.fileSystem.readFileSync(contentPath, 'utf-8');

        // Format as markdown section with module info header
        const moduleHeader =
          `# ${module.name}\n\n` +
          `**ID:** ` +
          `${module.id}\n` +
          `**Category:** ${module.category}` +
          (module.subcategory ? ` > ${module.subcategory}` : '') +
          '  \n' +
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
   * Renders a comprehensive markdown view for a UMS v1.0/v1.1 YAML module.
   * Implements full UMS v1.1 rendering specification including new directives.
   */
  private renderYamlModuleContent(
    module: {
      id: string;
      name: string;
      description: string;
      category: string;
      subcategory?: string;
      semantic?: string;
      tags?: string[];
      layer?: number;
    },
    contentPath: string
  ): string {
    try {
      // Parse the full YAML module
      const raw = this.dependencies.fileSystem.readFileSync(contentPath, 'utf-8');
      const parsedUnknown: unknown = yamlParseFn(raw);

      if (!this.isRecord(parsedUnknown)) {
        return this.renderSimpleYamlContent(module);
      }

      const parsedModule = parsedUnknown as unknown as UMSv11Module;
      const body = parsedModule.body;
      const shape = parsedModule.shape;

      // Body might not have the expected structure in some modules
      if (typeof body !== 'object') {
        return this.renderSimpleYamlContent(module);
      }

      const lines: string[] = [];

      // Render purpose with shape-specific headings (UMS v1.1 spec)
      if (body.purpose) {
        const purposeHeading = this.getPurposeHeading(shape);
        lines.push(`## ${purposeHeading}`);
        lines.push(body.purpose);
        lines.push('');
      }

      // Render process
      if (body.process) {
        lines.push('## Process');
        this.renderCompositeDirective(body.process, lines, true); // ordered list
        lines.push('');
      }

      // Render constraints
      if (body.constraints) {
        lines.push('## Constraints');
        this.renderCompositeDirective(body.constraints, lines, false); // bullet list
        lines.push('');
      }

      // Render principles
      if (body.principles) {
        lines.push('## Principles');
        this.renderCompositeDirective(body.principles, lines, false); // bullet list
        lines.push('');
      }

      // Render new v1.1 directives
      if (body.recommended) {
        lines.push('## Best Practices');
        this.renderCompositeDirective(body.recommended, lines, false); // bullet list
        lines.push('');
      }

      if (body.discouraged) {
        lines.push('## Anti-Patterns');
        this.renderCompositeDirective(body.discouraged, lines, false); // bullet list
        lines.push('');
      }

      if (body.advantages) {
        lines.push('## Advantages / Use Cases');
        this.renderCompositeDirective(body.advantages, lines, false); // bullet list
        lines.push('');
      }

      if (body.disadvantages) {
        lines.push('## Disadvantages / Trade-Offs');
        this.renderCompositeDirective(body.disadvantages, lines, false); // bullet list
        lines.push('');
      }

      // Render criteria
      if (body.criteria) {
        lines.push('## Criteria');
        this.renderCompositeDirective(body.criteria, lines, false, true); // task list
        lines.push('');
      }

      // Render data
      if (body.data) {
        lines.push('## Data');
        if (body.purpose && shape === 'data') {
          // For data shape, purpose is rendered under Data heading
        }
        const language =
          body.data.language ?? this.inferLanguageFromMediaType(body.data.mediaType);
        lines.push(`\`\`\`${language}`);
        lines.push(body.data.value);
        lines.push('```');
        lines.push('');
      }

      // Render examples
      if (body.examples && body.examples.length > 0) {
        lines.push('## Examples');
        for (const example of body.examples) {
          lines.push(`### ${example.title}`);
          lines.push(example.rationale);
          lines.push('');
          const language = example.language ?? 'text';
          lines.push(`\`\`\`${language}`);
          lines.push(example.snippet);
          lines.push('```');
          lines.push('');
        }
      }

      // Render resources (UMS v1.1)
      if (body.resources && body.resources.length > 0) {
        lines.push('## Resources');
        for (const resource of body.resources) {
          lines.push(`### ${resource.name}`);
          const language =
            resource.language ?? this.inferLanguageFromMediaType(resource.mediaType);
          lines.push(`\`\`\`${language}`);
          lines.push(resource.value);
          lines.push('```');
          lines.push('');
        }
      }

      // Add metadata footer
      if (module.layer !== undefined) {
        lines.push(`_Foundation Layer: ${module.layer.toString()}_`);
        lines.push('');
      }

      if (module.tags && module.tags.length > 0) {
        lines.push(`_Tags: ${module.tags.join(', ')}_`);
        lines.push('');
      }

      return lines.join('\n');
    } catch (error) {
      contentLogger.warn(
        `Failed to render full YAML module content for ${module.id}`,
        error
      );
      return this.renderSimpleYamlContent(module);
    }
  }

  /**
   * Fallback simple rendering for YAML modules when full parsing fails
   */
  private renderSimpleYamlContent(module: {
    id: string;
    name: string;
    description: string;
    category: string;
    subcategory?: string;
    semantic?: string;
    tags?: string[];
    layer?: number;
  }): string {
    const lines: string[] = [];
    lines.push(`## Summary`);
    lines.push(module.description);
    lines.push('');

    if (module.layer !== undefined) {
      lines.push(`**Foundation Layer:** ${module.layer.toString()}`);
      lines.push('');
    }

    if (module.tags && module.tags.length > 0) {
      lines.push(`**Tags:** ${module.tags.join(', ')}`);
      lines.push('');
    }

    if (module.semantic && module.semantic.trim().length > 0) {
      lines.push('### Semantic');
      lines.push(module.semantic.trim());
      lines.push('');
    }

    lines.push(
      '_Note: This module is defined as YAML (.module.yml). Full body directives could not be rendered._'
    );
    return lines.join('\n');
  }

  /**
   * Helper method to check if value is a record
   */
  private isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
  }

  /**
   * Get shape-specific heading for purpose directive (UMS v1.1 spec)
   */
  private getPurposeHeading(shape: string): string {
    switch (shape) {
      case 'specification':
        return 'Core Definition';
      case 'pattern':
        return 'Abstract';
      case 'procedure':
      case 'playbook':
      case 'procedural-specification':
        return 'Primary Objective';
      case 'checklist':
        return 'Verification Criteria';
      case 'data':
        return 'Data'; // purpose rendered under Data heading for data shape
      default:
        return 'Purpose';
    }
  }

  /**
   * Render composite list directive (UMS v1.1)
   */
  private renderCompositeDirective(
    directive: CompositeListDirective,
    lines: string[],
    ordered = false,
    taskList = false
  ): void {
    if (Array.isArray(directive)) {
      // Simple array format
      this.renderList(directive, lines, ordered, taskList);
    } else {
      // Composite format with description
      if (directive.desc) {
        lines.push(directive.desc);
        lines.push('');
      }
      this.renderList(directive.list, lines, ordered, taskList);
    }
  }

  /**
   * Render list items with appropriate formatting
   */
  private renderList(
    items: string[],
    lines: string[],
    ordered: boolean,
    taskList: boolean
  ): void {
    items.forEach((item, index) => {
      if (taskList) {
        // Preserve existing "- [ ]" or add it if missing
        const checkboxItem = item.startsWith('- [ ]') ? item : `- [ ] ${item}`;
        lines.push(checkboxItem);
      } else if (ordered) {
        lines.push(`${(index + 1).toString()}. ${item}`);
      } else {
        lines.push(`- ${item}`);
      }
    });
  }

  /**
   * Infer language from media type for syntax highlighting
   */
  private inferLanguageFromMediaType(mediaType: string): string {
    const typeMap: Record<string, string> = {
      'text/javascript': 'javascript',
      'application/javascript': 'javascript',
      'text/typescript': 'typescript',
      'application/typescript': 'typescript',
      'text/python': 'python',
      'application/json': 'json',
      'text/yaml': 'yaml',
      'application/yaml': 'yaml',
      'text/markdown': 'markdown',
      'text/html': 'html',
      'text/css': 'css',
      'text/regex': 'regex',
      'application/sql': 'sql',
      'text/plain': 'text',
    };

    return typeMap[mediaType] || 'text';
  }
}

/**
 * Convenience function to get modules content using the global container.
 * @param moduleIds Array of module IDs to retrieve
 * @returns Result object with success status, combined content, and error details
 */
export async function getModulesContent(
  moduleIds: string[]
): Promise<GetModulesContentResult> {
  // Dynamic import to avoid circular dependency issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getContainer } = require('./container.js') as typeof import('./container.js');
  const container = getContainer();
  const contentService = container.getContentService();
  return await contentService.getModulesContent(moduleIds);
}
