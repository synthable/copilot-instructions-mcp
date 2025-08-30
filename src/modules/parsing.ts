/**
 * @fileoverview Instruction module parsing functionality (UMS v1.0).
 *
 * Discovers and parses Unified Module System YAML files (*.module.yml) under
 * the instructions-modules directory to extract the hierarchical structure and
 * metadata of instruction modules. Provides caching for performance and
 * comprehensive error handling.
 *
 * Note: Legacy README.md parsing has been removed; this module operates in
 * UMS-only mode.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { parsingLogger } from './logger.js';
import type { InstructionModule } from './types.js';
import type { IDependencies, IInstructionModuleParser } from './interfaces.js';
import { parse as yamlParseFn } from 'yaml';

// Type guards and helpers for safe YAML parsing under strict mode
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// (no-op)

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === 'string' ? val : undefined;
}

function getStringArray(
  obj: Record<string, unknown>,
  key: string
): string[] | undefined {
  const val = obj[key];
  if (!Array.isArray(val)) return undefined;
  const out: string[] = [];
  for (const x of val) {
    if (typeof x === 'string') out.push(x);
  }
  return out.length > 0 ? out : undefined;
}

function getProp(obj: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

// README parsing removed in UMS-only mode

/**
 * Parses a UMS v1.0 YAML module file and returns an InstructionModule.
 * Gracefully handles missing optional fields; validates required `meta` fields when present.
 */
function deriveCategoryFromTier(tier: string): string {
  const t = tier.toLowerCase();
  if (t === 'foundation') return 'Foundation';
  if (t === 'principle') return 'Principle';
  if (t === 'technology') return 'Technology';
  if (t === 'execution') return 'Execution';
  return 'Uncategorized';
}

function parseYamlModule(
  relPath: string,
  absPath: string,
  dependencies: IDependencies
): InstructionModule | null {
  try {
    const raw = dependencies.fileSystem.readFileSync(absPath, 'utf-8');
    // Wrap YAML.parse to avoid unsafe-call rule by typing the function
    const parseYaml: (s: string) => unknown = yamlParseFn as unknown as (
      s: string
    ) => unknown;
    const parsedUnknown = parseYaml(raw);
    if (!isRecord(parsedUnknown)) return null;
    const parsedRec: Record<string, unknown> = parsedUnknown;

    let meta: Record<string, unknown> = {};
    const metaUnknown = getProp(parsedRec, 'meta');
    if (isRecord(metaUnknown)) meta = metaUnknown;
    const name = (getString(meta, 'name') ?? '').trim();
    const description = (getString(meta, 'description') ?? '').trim();
    const semanticRaw = getString(meta, 'semantic');
    const semantic = semanticRaw ? semanticRaw.trim() : undefined;
    const tags = getStringArray(meta, 'tags');

    const idUnknown = getProp(parsedRec, 'id');
    const idSource =
      typeof idUnknown === 'string' && idUnknown.trim().length > 0
        ? idUnknown
        : undefined;
    const id = (
      idSource ?? relPath.replace(/\.module\.yml$/, '').replace(/\//g, '/')
    ).trim();

    const parts = relPath.split('/');
    const tier = parts.length > 0 ? parts[0] : '';
    const category = deriveCategoryFromTier(tier);
    const subjectPath = parts.slice(1, Math.max(1, parts.length - 1)).join('/');
    const subcategory = subjectPath ? subjectPath.replace(/\//g, ' / ') : undefined;

    const fileStem =
      relPath
        .replace(/\.module\.yml$/, '')
        .split('/')
        .pop() ?? 'module';
    const prettyName =
      name || fileStem.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const desc = description || 'Module (parsed from YAML)';

    const mod: InstructionModule = {
      id,
      name: prettyName,
      description: desc,
      category,
      ...(subcategory ? { subcategory } : {}),
      filePath: relPath,
      ...(semantic ? { semantic } : {}),
      ...(tags ? { tags } : {}),
    };
    return mod;
  } catch (err) {
    parsingLogger.warn(`Failed to parse YAML module: ${relPath}`, err);
    return null;
  }
}

/**
 * Injectable instruction module parser implementation.
 * Handles parsing with dependency injection for better testability.
 */
export class InstructionModuleParser implements IInstructionModuleParser {
  private cachedInstructionModules: InstructionModule[] | null = null;

  constructor(private dependencies: IDependencies) {}

  /**
   * Parses instruction modules by recursively discovering all *.module.yml
   * files under the instructions-modules directory (UMS v1.0).
   *
   * Extracts key metadata from each YAML file: id, meta.name, meta.description,
   * optional meta.semantic and meta.tags, and derives category/subcategory
   * based on folder structure.
   *
   * @returns {InstructionModule[]} Array of parsed instruction modules with metadata
   * @throws {Error} Logs error and returns empty array if discovery/parsing fails
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
      // UMS-only: discover and parse all .module.yml files
      const baseDir = this.dependencies.pathUtils.join(
        this.dependencies.processUtils.cwd(),
        'instructions-modules'
      );
      const modules: InstructionModule[] = [];
      const walk = (dir: string) => {
        const entries = this.dependencies.fileSystem.readdirSync(dir);
        for (const name of entries) {
          const abs = this.dependencies.pathUtils.join(dir, name);
          const st = this.dependencies.fileSystem.statSync(abs);
          if (st.isDirectory()) {
            walk(abs);
          } else if (name.endsWith('.module.yml')) {
            const rel = this.dependencies.pathUtils
              .relative(baseDir, abs)
              .replace(/\\/g, '/');
            const mod = parseYamlModule(rel, abs, this.dependencies);
            if (mod) modules.push(mod);
          }
        }
      };
      walk(baseDir);

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
   * const freshModules = parser.parseInstructionModules(); // Will re-parse YAML files from disk
   * ```
   *
   * @since 1.0.0
   */
  clearModuleCache(): void {
    this.cachedInstructionModules = null;
  }
}

// Convenience functions that use the global container

/**
 * Convenience function to parse instruction modules using the global container.
 * @returns Array of parsed instruction modules
 */
export function parseInstructionModules(): InstructionModule[] {
  // Dynamic import to avoid circular dependency issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getContainer } = require('./container.js') as typeof import('./container.js');
  const container = getContainer();
  const parser = container.getInstructionModuleParser();
  return parser.parseInstructionModules();
}

/**
 * Convenience function to clear module cache using the global container.
 */
export function clearModuleCache(): void {
  // Dynamic import to avoid circular dependency issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getContainer } = require('./container.js') as typeof import('./container.js');
  const container = getContainer();
  const parser = container.getInstructionModuleParser();
  parser.clearModuleCache();
}
