#!/usr/bin/env node

/**
 * @fileoverview UMS YAML Module Renderer - Parse, validate and render UMS v1.1 YAML modules to markdown
 *
 * OVERVIEW:
 * This CLI tool parses Unified Module System (UMS) v1.1 YAML files and renders them
 * as formatted markdown documents. It validates YAML structure, checks for required
 * UMS fields, and generates clean markdown output with proper section organization.
 *
 * USE CASES:
 * 1. Testing/debugging UMS v1.1 module parsing and rendering
 * 2. Converting YAML modules to markdown for documentation
 * 3. Validating YAML module structure during development
 * 4. Previewing how modules will be rendered by the MCP server
 * 5. Quality assurance for module content before deployment
 *
 * USAGE:
 *   node scripts/render-module.js <input.yml> [output.md]
 *
 * PARAMETERS:
 *   <input.yml>  - Path to UMS YAML module file (must end with .module.yml)
 *   [output.md]  - Optional output markdown file path (defaults to input name + .md)
 *
 * EXAMPLES:
 *   # Basic rendering - creates systems-thinking.md in current directory
 *   node scripts/render-module.js instructions-modules/foundation/reasoning/systems-thinking.module.yml
 *
 *   # Custom output location
 *   node scripts/render-module.js path/to/module.module.yml docs/rendered/module.md
 *
 *   # Test a local development module
 *   node scripts/render-module.js ./my-module.module.yml
 *
 * OUTPUT:
 * - Validates YAML structure and UMS v1.1 compliance
 * - Generates formatted markdown with proper headings
 * - Handles all UMS v1.1 directives (purpose, process, constraints, etc.)
 * - Provides detailed statistics and error reporting
 * - Supports shape-specific purpose headings (Core Definition, Abstract, etc.)
 *
 * ERROR HANDLING:
 * - Invalid YAML syntax: Reports parsing errors with line numbers
 * - Missing UMS fields: Lists required fields (id, shape, meta, body)
 * - File not found: Clear error messages with file paths
 * - Invalid extensions: Enforces .module.yml input and .md output
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { parse as yamlParse } from 'yaml';

// Import compiled TypeScript modules
import { createLogger } from '../dist/modules/logger.js';

/**
 * Media type to language mapping for syntax highlighting
 */
const MEDIA_TYPE_MAP = {
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
 * Configuration for all UMS v1.1 body sections
 */
const SECTION_CONFIGS = [
  {
    key: 'purpose',
    getHeading: (shape) => {
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
    },
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
 * Validates command line arguments
 */
function validateArgs(args) {
  if (args.length < 1) {
    console.error('Usage: node scripts/render-module.js <input.yml> [output.md]');
    console.error('  <input.yml>  - Path to the YAML module file to parse');
    console.error('  [output.md]  - Optional output markdown file path');
    console.error('                (defaults to input filename with .md extension in current directory)');
    process.exit(1);
  }

  const inputPath = args[0];

  // If output path is provided, use it as-is
  let outputPath;
  if (args[1]) {
    outputPath = args[1];
  } else {
    // Default: use input filename with .md extension in current working directory
    const inputFileName = basename(inputPath);
    const outputFileName = inputFileName.replace(/\.module\.yml$/, '.md');
    outputPath = join(process.cwd(), outputFileName);
  }

  // Validate input file extension
  if (!inputPath.endsWith('.module.yml')) {
    console.error('Error: Input file must have .module.yml extension');
    process.exit(1);
  }

  // Validate output file extension
  if (!outputPath.endsWith('.md')) {
    console.error('Error: Output file must have .md extension');
    process.exit(1);
  }

  return { inputPath, outputPath };
}

/**
 * Type guard to check if parsed object is a valid UMS module
 */
function isValidUMSModule(obj) {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.shape === 'string' &&
    typeof obj.meta === 'object' &&
    obj.meta !== null &&
    typeof obj.body === 'object' &&
    obj.body !== null
  );
}

/**
 * Parses and validates a YAML module with proper type safety
 */
function parseYamlModule(content) {
  try {
    const parsed = yamlParse(content);

    if (!isValidUMSModule(parsed)) {
      return {
        success: false,
        error: 'YAML does not conform to UMS module structure. Required fields: id, shape, meta, body',
      };
    }

    return {
      success: true,
      module: parsed,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    };
  }
}

/**
 * Renders purpose sections with shape-specific headings
 */
function renderPurpose(content, lines, config, shape) {
  if (typeof content === 'string') {
    const heading = config.getHeading(shape);
    lines.push(`## ${heading}`);
    lines.push(content);
    lines.push('');
  }
}

/**
 * Renders list-based directives
 */
function renderList(content, lines, config) {
  const heading = config.getHeading();
  lines.push(`## ${heading}`);

  if (Array.isArray(content)) {
    renderListItems(content, lines, config.listType || 'unordered');
  } else if (typeof content === 'object' && content !== null) {
    if (content.desc) {
      lines.push(content.desc);
      lines.push('');
    }
    if (Array.isArray(content.list)) {
      renderListItems(content.list, lines, config.listType || 'unordered');
    }
  }
  lines.push('');
}

function renderListItems(items, lines, listType) {
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

/**
 * Renders data sections with code blocks
 */
function renderData(content, lines, config) {
  const data = content;
  const heading = config.getHeading();
  lines.push(`## ${heading}`);

  const language = data.language || inferLanguageFromMediaType(data.mediaType);
  lines.push('```' + language);
  lines.push(data.value);
  lines.push('```');
  lines.push('');
}

function inferLanguageFromMediaType(mediaType) {
  return MEDIA_TYPE_MAP[mediaType] || 'text';
}

/**
 * Renders examples sections
 */
function renderExamples(content, lines, config) {
  const examples = content;
  const heading = config.getHeading();
  lines.push(`## ${heading}`);

  for (const example of examples) {
    lines.push(`### ${example.title}`);
    lines.push(example.rationale);
    lines.push('');
    const language = example.language || 'text';
    lines.push('```' + language);
    lines.push(example.snippet);
    lines.push('```');
    lines.push('');
  }
}

/**
 * Renders resources sections
 */
function renderResources(content, lines, config) {
  const resources = content;
  const heading = config.getHeading();
  lines.push(`## ${heading}`);

  for (const resource of resources) {
    lines.push(`### ${resource.name}`);
    const language = resource.language || inferLanguageFromMediaType(resource.mediaType);
    lines.push('```' + language);
    lines.push(resource.value);
    lines.push('```');
    lines.push('');
  }
}

/**
 * Renders metadata footer information
 */
function renderMetadata(metadata, lines) {
  if (metadata.layer !== undefined) {
    lines.push(`_Foundation Layer: ${metadata.layer.toString()}_`);
    lines.push('');
  }

  if (metadata.tags && metadata.tags.length > 0) {
    lines.push(`_Tags: ${metadata.tags.join(', ')}_`);
    lines.push('');
  }
}

/**
 * Main rendering function for YAML modules
 */
function renderYamlToMarkdown(module) {
  const lines = [];

  // Render sections based on configuration, sorted by priority
  const sortedConfigs = SECTION_CONFIGS.sort((a, b) => a.priority - b.priority);

  for (const config of sortedConfigs) {
    const content = module.body[config.key];

    if (!content) continue;

    // Skip purpose for data shape (rendered under Data heading)
    if (config.key === 'purpose' && module.shape === 'data') continue;

    // Skip empty arrays
    if (Array.isArray(content) && content.length === 0) continue;

    // Render based on type
    switch (config.renderer) {
      case 'purpose':
        renderPurpose(content, lines, config, module.shape);
        break;
      case 'list':
        renderList(content, lines, config);
        break;
      case 'data':
        renderData(content, lines, config);
        break;
      case 'examples':
        renderExamples(content, lines, config);
        break;
      case 'resources':
        renderResources(content, lines, config);
        break;
    }
  }

  // Render metadata footer
  renderMetadata(module.meta, lines);

  return lines.join('\n');
}

/**
 * Main function to parse and render a YAML module
 */
async function main() {
  const { inputPath, outputPath } = validateArgs(process.argv.slice(2));

  console.log('🔍 Parsing and validating YAML module...');
  console.log(`   Input:  ${inputPath}`);
  console.log(`   Output: ${outputPath}`);

  try {
    // Check if input file exists
    if (!existsSync(inputPath)) {
      console.error(`❌ Error: Input file does not exist: ${inputPath}`);
      process.exit(1);
    }

    // Read and parse the YAML file
    const yamlContent = readFileSync(inputPath, 'utf-8');
    console.log(`📄 Read ${yamlContent.length} characters from input file`);

    // Parse and validate the YAML
    const parseResult = parseYamlModule(yamlContent);

    if (!parseResult.success) {
      console.error(`❌ YAML validation failed: ${parseResult.error}`);
      process.exit(1);
    }

    const module = parseResult.module;
    console.log(`✅ YAML validation successful`);
    console.log(`   Module ID: ${module.id}`);
    console.log(`   Shape: ${module.shape}`);
    console.log(`   Name: ${module.meta.name || 'Unnamed'}`);

    // Render the YAML content to markdown
    console.log('🎨 Rendering YAML to markdown...');
    const renderedContent = renderYamlToMarkdown(module);

    // Write the output file
    writeFileSync(outputPath, renderedContent, 'utf-8');
    console.log(`✅ Successfully rendered ${renderedContent.length} characters to: ${outputPath}`);

    // Print some statistics
    const lines = renderedContent.split('\n').length;
    console.log(`📊 Output statistics:`);
    console.log(`   - Lines: ${lines}`);
    console.log(`   - Module ID: ${module.id}`);
    console.log(`   - Module Name: ${module.meta.name || 'Unnamed'}`);
    console.log(`   - Shape: ${module.shape}`);

  } catch (error) {
    console.error('❌ Error processing YAML module:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
});