 
/* eslint-disable max-lines */
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

import { validateFilePath } from '../validation/validation.js';
import type {
  GetModulesContentResult,
  UMSv11Module,
  UMSv11Body,
  SectionConfig,
  ListType,
} from '../../core/types.js';
import type {
  IDependencies,
  IContentService,
  IInstructionModuleParser,
} from '../../core/interfaces.js';
import { parse as yamlParseFn } from 'yaml';

/**
 * Get shape-specific heading for purpose directive (UMS v1.1 spec)
 */
export function getPurposeHeading(shape?: string): string {
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
      return 'Data';
    default:
      return 'Purpose';
  }
}

/**
 * Media type to language mapping for syntax highlighting
 */
const MEDIA_TYPE_MAP: Record<string, string> = {
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

/**
 * Infer language from media type for syntax highlighting
 */
export function inferLanguageFromMediaType(mediaType: string): string {
  return MEDIA_TYPE_MAP[mediaType] ?? 'text';
}

/**
 * Configuration for all UMS v1.1 body sections
 */
const SECTION_CONFIGS: SectionConfig[] = [
  {
    key: 'purpose',
    getHeading: getPurposeHeading,
    renderer: 'purpose',
    priority: 1,
  },
  {
    key: 'process',
    getHeading: () => 'Process',
    renderer: 'list',
    listType: 'ordered',
    priority: 2,
  },
  {
    key: 'constraints',
    getHeading: () => 'Constraints',
    renderer: 'list',
    listType: 'unordered',
    priority: 3,
  },
  {
    key: 'principles',
    getHeading: () => 'Principles',
    renderer: 'list',
    listType: 'unordered',
    priority: 4,
  },
  {
    key: 'recommended',
    getHeading: () => 'Best Practices',
    renderer: 'list',
    listType: 'unordered',
    priority: 5,
  },
  {
    key: 'discouraged',
    getHeading: () => 'Anti-Patterns',
    renderer: 'list',
    listType: 'unordered',
    priority: 6,
  },
  {
    key: 'advantages',
    getHeading: () => 'Advantages / Use Cases',
    renderer: 'list',
    listType: 'unordered',
    priority: 7,
  },
  {
    key: 'disadvantages',
    getHeading: () => 'Disadvantages / Trade-Offs',
    renderer: 'list',
    listType: 'unordered',
    priority: 8,
  },
  {
    key: 'criteria',
    getHeading: () => 'Criteria',
    renderer: 'list',
    listType: 'task',
    priority: 9,
  },
  {
    key: 'data',
    getHeading: () => 'Data',
    renderer: 'data',
    priority: 10,
  },
  {
    key: 'examples',
    getHeading: () => 'Examples',
    renderer: 'examples',
    priority: 11,
  },
  {
    key: 'resources',
    getHeading: () => 'Resources',
    renderer: 'resources',
    priority: 12,
  },
];

/**
 * Base class for section renderers
 */
abstract class BaseSectionRenderer {
  abstract render(
    content: unknown,
    lines: string[],
    config: SectionConfig,
    shape?: string
  ): void;
}

/**
 * Renders purpose sections with shape-specific headings
 */
class PurposeRenderer extends BaseSectionRenderer {
  render(
    content: unknown,
    lines: string[],
    config: SectionConfig,
    shape?: string
  ): void {
    if (typeof content === 'string') {
      const heading = config.getHeading(shape);
      lines.push(`## ${heading}`);
      lines.push(content);
      lines.push('');
    }
  }
}

/**
 * Renders list-based directives (process, constraints, principles, etc.)
 */
class ListDirectiveRenderer extends BaseSectionRenderer {
  render(content: unknown, lines: string[], config: SectionConfig): void {
    const heading = config.getHeading();
    lines.push(`## ${heading}`);

    const validatedContent = this.validateListDirective(content);
    if (!validatedContent) {
      lines.push('_Invalid list directive format_');
      lines.push('');
      return;
    }

    if (validatedContent.type === 'array') {
      this.renderList(validatedContent.items, lines, config.listType ?? 'unordered');
    } else {
      if (validatedContent.desc) {
        lines.push(validatedContent.desc);
        lines.push('');
      }
      this.renderList(validatedContent.items, lines, config.listType ?? 'unordered');
    }
    lines.push('');
  }

  private validateListDirective(
    content: unknown
  ):
    | { type: 'array'; items: string[] }
    | { type: 'object'; desc?: string; items: string[] }
    | null {
    // Case 1: Direct array of strings
    if (Array.isArray(content) && content.every(item => typeof item === 'string')) {
      return { type: 'array', items: content };
    }

    // Case 2: Object with list property
    if (typeof content === 'object' && content !== null && 'list' in content) {
      const obj = content as Record<string, unknown>;
      if (
        Array.isArray(obj.list) &&
        obj.list.every((item: unknown) => typeof item === 'string')
      ) {
        const result: { type: 'object'; desc?: string; items: string[] } = {
          type: 'object',
          items: obj.list,
        };

        if (typeof obj.desc === 'string') {
          result.desc = obj.desc;
        }

        return result;
      }
    }

    return null;
  }

  private renderList(items: string[], lines: string[], listType: ListType): void {
    items.forEach((item, index) => {
      if (!item) return; // Skip undefined/null items

      if (listType === 'task') {
        const checkboxItem = item.startsWith('- [ ]') ? item : `- [ ] ${item}`;
        lines.push(checkboxItem);
      } else if (listType === 'ordered') {
        lines.push(`${(index + 1).toString()}. ${item}`);
      } else {
        lines.push(`- ${item}`);
      }
    });
  }
}

/**
 * Renders data sections with code blocks
 */
class DataRenderer extends BaseSectionRenderer {
  render(content: unknown, lines: string[], config: SectionConfig): void {
    const heading = config.getHeading();
    lines.push(`## ${heading}`);

    const validatedData = this.validateDataContent(content);
    if (!validatedData) {
      lines.push('_Invalid data format_');
      lines.push('');
      return;
    }

    const language =
      validatedData.language ?? inferLanguageFromMediaType(validatedData.mediaType);
    lines.push('```' + language);
    lines.push(validatedData.value);
    lines.push('```');
    lines.push('');
  }

  private validateDataContent(
    content: unknown
  ): { mediaType: string; value: string; language?: string } | null {
    if (
      typeof content === 'object' &&
      content !== null &&
      'mediaType' in content &&
      'value' in content
    ) {
      const obj = content as Record<string, unknown>;
      if (typeof obj.mediaType === 'string' && typeof obj.value === 'string') {
        return {
          mediaType: obj.mediaType,
          value: obj.value,
          ...(typeof obj.language === 'string' && { language: obj.language }),
        };
      }
    }
    return null;
  }
}

/**
 * Renders examples sections
 */
class ExamplesRenderer extends BaseSectionRenderer {
  render(content: unknown, lines: string[], config: SectionConfig): void {
    const heading = config.getHeading();
    lines.push(`## ${heading}`);

    const validatedExamples = this.validateExamplesContent(content);
    if (!validatedExamples) {
      lines.push('_Invalid examples format_');
      lines.push('');
      return;
    }

    for (const example of validatedExamples) {
      lines.push(`### ${example.title}`);
      lines.push(example.rationale);
      lines.push('');
      const language = example.language ?? 'text';
      lines.push('```' + language);
      lines.push(example.snippet);
      lines.push('```');
      lines.push('');
    }
  }

  private validateExamplesContent(content: unknown):
    | {
        title: string;
        rationale: string;
        snippet: string;
        language?: string;
      }[]
    | null {
    if (!Array.isArray(content)) {
      return null;
    }

    const validated = content.map(item => {
      if (
        typeof item === 'object' &&
        item !== null &&
        'title' in item &&
        'rationale' in item &&
        'snippet' in item
      ) {
        const obj = item as Record<string, unknown>;
        if (
          typeof obj.title === 'string' &&
          typeof obj.rationale === 'string' &&
          typeof obj.snippet === 'string'
        ) {
          return {
            title: obj.title,
            rationale: obj.rationale,
            snippet: obj.snippet,
            ...(typeof obj.language === 'string' && { language: obj.language }),
          };
        }
      }
      return null;
    });

    // Check if all items were validated successfully
    if (validated.some(item => item === null)) {
      return null;
    }

    return validated as {
      title: string;
      rationale: string;
      snippet: string;
      language?: string;
    }[];
  }
}

/**
 * Renders resources sections
 */
class ResourcesRenderer extends BaseSectionRenderer {
  render(content: unknown, lines: string[], config: SectionConfig): void {
    const heading = config.getHeading();
    lines.push(`## ${heading}`);

    const validatedResources = this.validateResourcesContent(content);
    if (!validatedResources) {
      lines.push('_Invalid resources format_');
      lines.push('');
      return;
    }

    for (const resource of validatedResources) {
      lines.push(`### ${resource.name}`);
      const language =
        resource.language ?? inferLanguageFromMediaType(resource.mediaType);
      lines.push('```' + language);
      lines.push(resource.value);
      lines.push('```');
      lines.push('');
    }
  }

  private validateResourcesContent(content: unknown):
    | {
        name: string;
        mediaType: string;
        value: string;
        language?: string;
      }[]
    | null {
    if (!Array.isArray(content)) {
      return null;
    }

    const validated = content.map(item => {
      if (
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        'mediaType' in item &&
        'value' in item
      ) {
        const obj = item as Record<string, unknown>;
        if (
          typeof obj.name === 'string' &&
          typeof obj.mediaType === 'string' &&
          typeof obj.value === 'string'
        ) {
          return {
            name: obj.name,
            mediaType: obj.mediaType,
            value: obj.value,
            ...(typeof obj.language === 'string' && { language: obj.language }),
          };
        }
      }
      return null;
    });

    // Check if all items were validated successfully
    if (validated.some(item => item === null)) {
      return null;
    }

    return validated as {
      name: string;
      mediaType: string;
      value: string;
      language?: string;
    }[];
  }
}

/**
 * Renders metadata footer information
 */
class MetadataRenderer extends BaseSectionRenderer {
  render(content: unknown, lines: string[]): void {
    const validatedMetadata = this.validateMetadataContent(content);
    if (!validatedMetadata) {
      return; // Skip rendering if invalid, no error message for metadata
    }

    if (validatedMetadata.layer !== undefined) {
      lines.push(`_Foundation Layer: ${validatedMetadata.layer.toString()}_`);
      lines.push('');
    }

    if (validatedMetadata.tags && validatedMetadata.tags.length > 0) {
      lines.push(`_Tags: ${validatedMetadata.tags.join(', ')}_`);
      lines.push('');
    }
  }

  private validateMetadataContent(
    content: unknown
  ): { layer?: number; tags?: string[] } | null {
    if (typeof content !== 'object' || content === null) {
      return null;
    }

    const obj = content as Record<string, unknown>;
    const result: { layer?: number; tags?: string[] } = {};

    // Validate layer if present
    if ('layer' in obj) {
      if (typeof obj.layer === 'number') {
        result.layer = obj.layer;
      } else {
        return null; // Invalid layer type
      }
    }

    // Validate tags if present
    if ('tags' in obj) {
      if (Array.isArray(obj.tags) && obj.tags.every(tag => typeof tag === 'string')) {
        result.tags = obj.tags;
      } else {
        return null; // Invalid tags format
      }
    }

    return result;
  }
}

/**
 * Registry of available section renderers
 */
const SECTION_RENDERERS = new Map<string, BaseSectionRenderer>([
  ['purpose', new PurposeRenderer()],
  ['list', new ListDirectiveRenderer()],
  ['data', new DataRenderer()],
  ['examples', new ExamplesRenderer()],
  ['resources', new ResourcesRenderer()],
  ['metadata', new MetadataRenderer()],
]);

/**
 * Get a section renderer by type
 */
function getSectionRenderer(type: string): BaseSectionRenderer | undefined {
  return SECTION_RENDERERS.get(type);
}

/**
 * Validates if a value is a record (non-null object)
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard to check if parsed object is a valid UMS module
 */
function isValidUMSModule(obj: unknown): obj is UMSv11Module {
  if (!isRecord(obj)) {
    return false;
  }

  return (
    typeof obj.id === 'string' &&
    typeof obj.version === 'string' &&
    (obj.schemaVersion === '1.0' || obj.schemaVersion === '1.1') &&
    typeof obj.shape === 'string' &&
    isRecord(obj.declaredDirectives) &&
    isRecord(obj.meta) &&
    isRecord(obj.body)
  );
}

/**
 * Parses and validates a YAML module with proper type safety
 */
function parseYamlModule(content: string): {
  success: boolean;
  module?: UMSv11Module;
  error?: string;
} {
  try {
    const parsed: unknown = yamlParseFn(content);

    if (!isValidUMSModule(parsed)) {
      return {
        success: false,
        error: 'YAML does not conform to UMS v1.1 module structure',
      };
    }

    return {
      success: true,
      module: parsed, // No casting needed! TypeScript knows it's UMSv11Module
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    };
  }
}

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
        this.dependencies.logger.warn(
          `Error reading module ${moduleId}`,
          err instanceof Error ? err : undefined
        );
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
   * Implements full UMS v1.1 rendering specification using configurable renderers.
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
      const parseResult = this.parseModuleFile(contentPath);

      if (!parseResult.success || !parseResult.module) {
        this.dependencies.logger.warn(
          `YAML parsing failed for ${module.id}: ${parseResult.error ?? 'Unknown error'}`
        );
        return this.renderSimpleYamlContent(module);
      }

      const lines: string[] = [];
      this.renderModuleSections(parseResult.module, lines);
      this.renderModuleMetadata(module, lines);

      return lines.join('\n');
    } catch (error) {
      this.dependencies.logger.warn(
        `Failed to render full YAML module content for ${module.id}`,
        error instanceof Error ? error : undefined
      );
      return this.renderSimpleYamlContent(module);
    }
  }

  /**
   * Parses a YAML module file and returns the parse result
   */
  private parseModuleFile(contentPath: string): {
    success: boolean;
    module?: UMSv11Module;
    error?: string;
  } {
    const raw = this.dependencies.fileSystem.readFileSync(contentPath, 'utf-8');
    return parseYamlModule(raw);
  }

  /**
   * Renders all sections of a parsed UMS module
   */
  private renderModuleSections(parsedModule: UMSv11Module, lines: string[]): void {
    const body = parsedModule.body;
    const shape = parsedModule.shape;

    // Render sections based on configuration, sorted by priority
    const sortedConfigs = [...SECTION_CONFIGS].sort((a, b) => a.priority - b.priority);

    for (const config of sortedConfigs) {
      const content = this.getContentForSection(config.key, body);

      if (!this.shouldRenderSection(content, config.key, shape)) {
        continue;
      }

      const renderer = getSectionRenderer(config.renderer);
      if (renderer) {
        renderer.render(content, lines, config, shape);
      }
    }
  }

  /**
   * Gets content for a specific section with backward compatibility handling
   */
  private getContentForSection(sectionKey: string, body: UMSv11Body): unknown {
    // Use a type assertion to safely access the body properties
    const bodyRecord = body as Record<string, unknown>;

    // Special handling for purpose/goal backward compatibility
    if (sectionKey === 'purpose') {
      return bodyRecord.purpose ?? bodyRecord.goal;
    }

    return bodyRecord[sectionKey];
  }

  /**
   * Determines if a section should be rendered based on content and context
   */
  private shouldRenderSection(
    content: unknown,
    sectionKey: string,
    shape: string
  ): boolean {
    if (!content) return false;

    // Skip purpose for data shape (rendered under Data heading)
    if (sectionKey === 'purpose' && shape === 'data') return false;

    // Skip empty arrays
    if (Array.isArray(content) && content.length === 0) return false;

    return true;
  }

  /**
   * Renders metadata footer for a module
   */
  private renderModuleMetadata(
    module: { layer?: number; tags?: string[] },
    lines: string[]
  ): void {
    const metadataRenderer = getSectionRenderer('metadata');
    if (metadataRenderer) {
      metadataRenderer.render(
        { layer: module.layer, tags: module.tags },
        lines,
        {} as SectionConfig
      );
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
}

/**
 * Convenience function to get modules content using the global container.
 * @param moduleIds Array of module IDs to retrieve
 * @returns Result object with success status, combined content, and error details
 */
