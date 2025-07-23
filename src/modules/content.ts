import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateFilePath } from './validation.js';
import { parseInstructionModules } from './parsing.js';
import type { GetModulesContentResult } from './types.js';

let debugEnabled = false;

/**
 * Sets the debug flag for content operations
 */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

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
 * const result = getModulesContent(["foundation.logic.deductive-reasoning", "invalid.id"]);
 * // {
 * //   success: true,
 * //   content: "# Deductive Reasoning\n\n**ID:** `foundation.logic.deductive-reasoning`...",
 * //   errors: ['Module with ID "invalid.id" not found']
 * // }
 * ```
 */
export function getModulesContent(
  moduleIds: string[]
): GetModulesContentResult {
  const modules = parseInstructionModules();
  const moduleMap = new Map(modules.map(m => [m.id, m]));

  const errors: string[] = [];
  const contents: string[] = [];
  const baseDir = join(process.cwd(), 'instructions-modules');

  for (const moduleId of moduleIds) {
    const module = moduleMap.get(moduleId);

    if (!module) {
      errors.push(`Module with ID "${moduleId}" not found`);
      continue;
    }

    try {
      const contentPath = validateFilePath(module.filePath, baseDir);

      if (!existsSync(contentPath)) {
        errors.push(
          `File not found for module "${moduleId}": ${module.filePath}`
        );
        continue;
      }

      const fileContent = readFileSync(contentPath, 'utf-8');

      // Format as markdown section with module info header
      const moduleHeader =
        `# ${module.name}\n\n` +
        `**ID:** \`${module.id}\`  \n` +
        `**Category:** ${module.category}` +
        (module.subcategory ? ` > ${module.subcategory}` : '') +
        '  \n' +
        `**Description:** ${module.description}\n\n` +
        `---\n\n`;

      contents.push(moduleHeader + fileContent);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Error reading module "${moduleId}": ${errorMessage}`);
      if (debugEnabled) {
        console.error(`[DEBUG] Error reading module ${moduleId}:`, err);
      }
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
