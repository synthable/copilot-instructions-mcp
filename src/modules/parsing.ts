import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateFilePath } from './validation.js';
import type { InstructionModule, ParsingState } from './types.js';

let debugEnabled = false;
let _cachedInstructionModules: InstructionModule[] | null = null;

/**
 * Sets the debug flag for parsing operations
 */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

/**
 * Parses a category line and updates parsing state
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
    if (debugEnabled) {
      console.error(
        `[DEBUG] Found category ${state.categoryCount.toString()}: ${state.currentCategory}`
      );
    }
    return true;
  }
  return false;
}

/**
 * Parses a subcategory line and updates parsing state
 */
function parseSubcategoryLine(
  line: string,
  state: { currentSubcategory: string; subcategoryCount: number }
): boolean {
  const subcategoryMatch = /^- \*\*(.+)\*\*$/.exec(line);
  if (subcategoryMatch) {
    state.currentSubcategory = subcategoryMatch[1].trim();
    state.subcategoryCount++;
    if (debugEnabled) {
      console.error(
        `[DEBUG] Found subcategory ${state.subcategoryCount.toString()}: ${state.currentSubcategory}`
      );
    }
    return true;
  }
  return false;
}

/**
 * Parses a module entry line and creates an InstructionModule
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
  if (debugEnabled && state.moduleCount <= 3) {
    console.error(
      `[DEBUG] Module ${state.moduleCount.toString()}: ${name.trim()} (indent: ${indent.length.toString()} spaces)`
    );
  }

  return module;
}

/**
 * Parses the README content and extracts instruction modules
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

  if (debugEnabled) {
    console.error(
      `[DEBUG] Final counts - Categories: ${state.categoryCount.toString()}, Subcategories: ${state.subcategoryCount.toString()}, Modules: ${state.moduleCount.toString()}`
    );
  }

  return modules;
}

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
 * const modules = parseInstructionModules();
 * console.log(modules.length); // e.g., 150
 * console.log(modules[0].category); // "Foundation"
 * ```
 */
export function parseInstructionModules(): InstructionModule[] {
  if (_cachedInstructionModules) {
    if (debugEnabled) {
      console.error('[DEBUG] Returning cached instruction modules.');
    }
    return _cachedInstructionModules;
  }

  try {
    const baseDir = join(process.cwd(), 'instructions-modules');
    const readmePath = validateFilePath('README.md', baseDir);

    if (debugEnabled) {
      console.error(`[DEBUG] Reading README from: ${readmePath}`);
    }

    const content = readFileSync(readmePath, 'utf-8');

    if (debugEnabled) {
      console.error(
        `[DEBUG] README content length: ${content.length.toString()}`
      );
    }

    const modules = parseReadmeContent(content);
    _cachedInstructionModules = modules; // Cache the modules
    return modules;
  } catch (err) {
    console.error('Error parsing instruction modules:', err);
    return [];
  }
}

/**
 * Clears the cached instruction modules (useful for testing)
 */
export function clearModuleCache(): void {
  _cachedInstructionModules = null;
}
