/**
 * @fileoverview Instruction module parsing functionality.
 *
 * This module handles parsing the README.md file from the instructions-modules
 * directory to extract the hierarchical structure of instruction modules.
 * Provides caching for performance and comprehensive error handling.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { validateFilePath } from './validation.js';
import { parsingLogger } from './logger.js';
import type { InstructionModule, ParsingState } from './types.js';
import type { IDependencies, IInstructionModuleParser } from './interfaces.js';

/**
 * Parses a category line from the README and updates parsing state.
 *
 * Categories are identified by lines starting with `## ` followed by the category name.
 * When found, updates the current category and resets the subcategory.
 *
 * @param line - The line to parse for category information
 * @param state - Parsing state object to update
 * @returns True if the line contained a category, false otherwise
 *
 * @example
 * ```typescript
 * const line = "## Foundation";
 * const found = parseCategoryLine(line, state);
 * // Returns: true, state.currentCategory = "Foundation"
 * ```
 *
 * @since 1.0.0
 * @internal
 */
function parseCategoryLine(
  line: string,
  state: {
    currentCategory: string;
    currentSubcategory: string;
    categoryCount: number;
  }
): boolean {
  const categoryMatch = /^## (.+)$/.exec(line);
  if (categoryMatch) {
    state.currentCategory = categoryMatch[1].trim();
    state.currentSubcategory = '';
    state.categoryCount++;
    parsingLogger.debug(
      `Found category ${state.categoryCount.toString()}: ${state.currentCategory}`
    );
    return true;
  }
  return false;
}

/**
 * Parses a subcategory line from the README and updates parsing state.
 *
 * Subcategories are identified by lines matching the pattern `- **Title**`.
 * When found, updates the current subcategory for subsequent module entries.
 *
 * @param line - The line to parse for subcategory information
 * @param state - Parsing state object to update
 * @returns True if the line contained a subcategory, false otherwise
 *
 * @example
 * ```typescript
 * const line = "- **Logic**";
 * const found = parseSubcategoryLine(line, state);
 * // Returns: true, state.currentSubcategory = "Logic"
 * ```
 *
 * @since 1.0.0
 * @internal
 */
function parseSubcategoryLine(
  line: string,
  state: { currentSubcategory: string; subcategoryCount: number }
): boolean {
  const subcategoryMatch = /^- \*\*(.+)\*\*$/.exec(line);
  if (subcategoryMatch) {
    state.currentSubcategory = subcategoryMatch[1].trim();
    state.subcategoryCount++;
    parsingLogger.debug(
      `Found subcategory ${state.subcategoryCount.toString()}: ${state.currentSubcategory}`
    );
    return true;
  }
  return false;
}

/**
 * Parses a module entry line and creates an InstructionModule object.
 *
 * Module entries follow the pattern: `- [Name](path) - Description`
 * Uses the current category and subcategory from parsing state to build
 * the complete module metadata.
 *
 * @param line - The line to parse for module information
 * @param state - Current parsing state with category context
 * @returns InstructionModule object if parsed successfully, null otherwise
 *
 * @example
 * ```typescript
 * const line = "- [Deductive Reasoning](foundation/logic/deductive-reasoning.md) - Apply logical deduction";
 * const module = parseModuleLine(line, state);
 * // Returns: { id: "foundation.logic.deductive-reasoning", name: "Deductive Reasoning", ... }
 * ```
 *
 * @since 1.0.0
 * @internal
 */
function parseModuleLine(
  line: string,
  state: {
    currentCategory: string;
    currentSubcategory: string;
    moduleCount: number;
  }
): InstructionModule | null {
  // Match module entries with links and descriptions
  // Modules can be indented with either 2 or 4 spaces:
  // "  - [Name](path) - Description" (direct subcategory)
  // "    - [Name](path) - Description" (nested subcategory)
  const moduleMatch = /^(  |    )- \[([^\]]+)\]\(([^)]+)\) - (.+)$/.exec(line);

  if (!moduleMatch) {
    return null;
  }

  const [, indent, name, filePath, description] = moduleMatch;

  // Skip if we don't have a valid category (before any ## section)
  if (!state.currentCategory) {
    return null;
  }

  // Generate ID from file path
  const id = filePath.replace(/\.md$/, '').replace(/\//g, '.');

  const module: InstructionModule = {
    id: id.trim(),
    name: name.trim(),
    description: description.trim(),
    category: state.currentCategory,
    filePath: filePath.trim(),
  };

  if (state.currentSubcategory) {
    module.subcategory = state.currentSubcategory;
  }

  state.moduleCount++;
  if (state.moduleCount <= 3) {
    parsingLogger.debug(
      `Module ${state.moduleCount.toString()}: ${name.trim()} (indent: ${indent.length.toString()} spaces)`
    );
  }

  return module;
}

/**
 * Parses the complete README content and extracts all instruction modules.
 *
 * Processes the markdown content line by line, maintaining state to track
 * the current category and subcategory context for each module entry.
 *
 * @param content - The complete README.md file content as a string
 * @returns Array of parsed InstructionModule objects
 *
 * @example
 * ```typescript
 * const content = readFileSync('README.md', 'utf-8');
 * const modules = parseReadmeContent(content);
 * console.log(`Parsed ${modules.length} modules`);
 * ```
 *
 * @since 1.0.0
 * @internal
 */
function parseReadmeContent(content: string): InstructionModule[] {
  const modules: InstructionModule[] = [];
  const lines = content.split('\n');

  const state: ParsingState = {
    currentCategory: '',
    currentSubcategory: '',
    categoryCount: 0,
    subcategoryCount: 0,
    moduleCount: 0,
  };

  for (const line of lines) {
    // Try to parse as category first
    if (parseCategoryLine(line, state)) {
      continue;
    }

    // Try to parse as subcategory
    if (parseSubcategoryLine(line, state)) {
      continue;
    }

    // Try to parse as module
    const module = parseModuleLine(line, state);
    if (module) {
      modules.push(module);
    }
  }

  parsingLogger.debug(
    `Final counts - Categories: ${state.categoryCount.toString()}, Subcategories: ${state.subcategoryCount.toString()}, Modules: ${state.moduleCount.toString()}`
  );

  return modules;
}

/**
 * Injectable instruction module parser implementation.
 * Handles parsing with dependency injection for better testability.
 */
export class InstructionModuleParser implements IInstructionModuleParser {
  private cachedInstructionModules: InstructionModule[] | null = null;

  constructor(private dependencies: IDependencies) {}

  /**
   * Parses the instruction modules from the README file in the instructions-modules directory.
   *
   * Extracts hierarchical structure using regex patterns:
   * - Categories: `## Title` (e.g., "## Foundation")
   * - Subcategories: `- **Title**` (e.g., "- **Logic**")
   * - Modules: `- [Name](path) - Description` (e.g., "- [Deductive Reasoning](foundation/logic/deductive-reasoning.md) - Apply logical deduction")
   *
   * @returns {InstructionModule[]} Array of parsed instruction modules with metadata
   * @throws {Error} Logs error to console and returns empty array if README.md cannot be read
   *
   * @example
   * ```typescript
   * const modules = parser.parseInstructionModules();
   * console.log(modules.length); // e.g., 150
   * console.log(modules[0].category); // "Foundation"
   * ```
   */
  parseInstructionModules(): InstructionModule[] {
    if (this.cachedInstructionModules) {
      parsingLogger.debug('Returning cached instruction modules');
      return this.cachedInstructionModules;
    }

    try {
      const baseDir = this.dependencies.pathUtils.join(
        this.dependencies.processUtils.cwd(),
        'instructions-modules'
      );
      const readmePath = validateFilePath(
        'README.md',
        baseDir,
        this.dependencies.pathUtils
      );

      parsingLogger.debug(`Reading README from: ${readmePath}`);

      const content = this.dependencies.fileSystem.readFileSync(
        readmePath,
        'utf-8'
      );

      parsingLogger.debug(
        `README content length: ${content.length.toString()}`
      );

      const modules = parseReadmeContent(content);
      parsingLogger.info(
        `Successfully parsed ${modules.length.toString()} instruction modules`
      );
      this.cachedInstructionModules = modules; // Cache the modules
      return modules;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      parsingLogger.error('Error parsing instruction modules', error);
      return [];
    }
  }

  /**
   * Clears the cached instruction modules to force re-parsing on next request.
   *
   * This function is primarily useful for testing scenarios where the
   * instruction modules may have changed and the cache needs to be invalidated.
   *
   * @example
   * ```typescript
   * parser.clearModuleCache();
   * const freshModules = parser.parseInstructionModules(); // Will re-parse from disk
   * ```
   *
   * @since 1.0.0
   */
  clearModuleCache(): void {
    this.cachedInstructionModules = null;
  }
}

// Convenience functions that use the global container
import { getContainer } from './container.js';

/**
 * Convenience function to parse instruction modules using the global container.
 * @returns Array of parsed instruction modules
 */
export function parseInstructionModules(): InstructionModule[] {
  const container = getContainer();
  const parser = container.getInstructionModuleParser();
  return parser.parseInstructionModules();
}

/**
 * Convenience function to clear module cache using the global container.
 */
export function clearModuleCache(): void {
  const container = getContainer();
  const parser = container.getInstructionModuleParser();
  parser.clearModuleCache();
}
