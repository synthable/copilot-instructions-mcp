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

import type { InstructionModule } from '../../core/types.js';
import type {
  IDependencies,
  IInstructionModuleParser,
  ILogger,
} from '../../core/interfaces.js';
import { parse as yamlParseFn } from 'yaml';

/**
 * Security limits for YAML parsing to prevent DoS attacks.
 */
const SECURITY_LIMITS = {
  MAX_FILE_SIZE_BYTES: 100 * 1024, // 100KB max per YAML file
  MAX_YAML_DEPTH: 10, // Maximum nesting depth
  MAX_ARRAY_LENGTH: 1000, // Maximum array length
  MAX_STRING_LENGTH: 10000, // Maximum string length
  PARSE_TIMEOUT_MS: 5000, // 5 second timeout for parsing
} as const;

/**
 * Validates file size before processing to prevent DoS attacks.
 */
function validateFileSize(filePath: string, content: string, logger: ILogger): void {
  const sizeBytes = Buffer.byteLength(content, 'utf-8');

  if (sizeBytes > SECURITY_LIMITS.MAX_FILE_SIZE_BYTES) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    const limitMB = (SECURITY_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(2);

    logger.warn(`YAML file too large: ${filePath}`, undefined, {
      sizeBytes,
      sizeMB: `${sizeMB}MB`,
      limit: `${limitMB}MB`,
    });

    throw new Error(
      `YAML file size exceeds security limit: ${sizeMB}MB > ${limitMB}MB`
    );
  }
}

/**
 * Safely parses YAML with timeout and security validation.
 */
async function parseYamlSafely(
  content: string,
  filePath: string,
  logger: ILogger
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    // Set timeout to prevent hanging on malicious YAML
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `YAML parsing timeout exceeded (${SECURITY_LIMITS.PARSE_TIMEOUT_MS.toString()}ms)`
        )
      );
    }, SECURITY_LIMITS.PARSE_TIMEOUT_MS);

    try {
      // Validate content before parsing
      if (!content || typeof content !== 'string') {
        clearTimeout(timeoutId);
        reject(new Error('YAML content must be a non-empty string'));
        return;
      }

      // Parse YAML with security restrictions
      const parseYaml: (s: string) => unknown = yamlParseFn as unknown as (
        s: string
      ) => unknown;

      const parsedUnknown = parseYaml(content);

      if (!isRecord(parsedUnknown)) {
        clearTimeout(timeoutId);
        reject(new Error('YAML content must parse to an object'));
        return;
      }

      // Validate parsed structure for security
      validateYamlStructure(parsedUnknown, filePath);

      clearTimeout(timeoutId);
      resolve(parsedUnknown);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        logger.error(`YAML parsing failed for ${filePath}`, error, {
          errorType: error.constructor.name,
          message: error.message,
        });
      }

      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Validates YAML structure to prevent malicious content.
 */
function validateYamlStructure(
  obj: Record<string, unknown>,
  filePath: string,
  depth = 0
): void {
  if (depth > SECURITY_LIMITS.MAX_YAML_DEPTH) {
    throw new Error(
      `YAML structure too deeply nested (depth > ${SECURITY_LIMITS.MAX_YAML_DEPTH.toString()})`
    );
  }

  for (const [key, value] of Object.entries(obj)) {
    // Validate key
    if (typeof key !== 'string' || key.length > SECURITY_LIMITS.MAX_STRING_LENGTH) {
      throw new Error(`Invalid or oversized key in YAML: ${key.slice(0, 50)}...`);
    }

    // Validate value recursively
    if (typeof value === 'string') {
      if (value.length > SECURITY_LIMITS.MAX_STRING_LENGTH) {
        throw new Error(
          `String value too long for key "${key}" (${value.length.toString()} > ${SECURITY_LIMITS.MAX_STRING_LENGTH.toString()})`
        );
      }
    } else if (Array.isArray(value)) {
      if (value.length > SECURITY_LIMITS.MAX_ARRAY_LENGTH) {
        throw new Error(
          `Array too long for key "${key}" (${value.length.toString()} > ${SECURITY_LIMITS.MAX_ARRAY_LENGTH.toString()})`
        );
      }

      // Validate array elements
      value.forEach((item, index) => {
        if (
          typeof item === 'string' &&
          item.length > SECURITY_LIMITS.MAX_STRING_LENGTH
        ) {
          throw new Error(`Array element too long at ${key}[${index.toString()}]`);
        } else if (isRecord(item)) {
          validateYamlStructure(item, filePath, depth + 1);
        }
      });
    } else if (isRecord(value)) {
      validateYamlStructure(value, filePath, depth + 1);
    }
  }
}

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

function getNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const val = obj[key];
  return typeof val === 'number' ? val : undefined;
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

async function parseYamlModule(
  relPath: string,
  absPath: string,
  dependencies: IDependencies
): Promise<InstructionModule | null> {
  try {
    const raw = dependencies.fileSystem.readFileSync(absPath, 'utf-8');

    // Validate file size and parse safely with security controls
    validateFileSize(absPath, raw, dependencies.logger);
    const parsedRec = await parseYamlSafely(raw, absPath, dependencies.logger);

    const extractedMeta = extractMetaFromParsed(parsedRec);
    const moduleId = extractModuleId(parsedRec, relPath);
    const categoryInfo = deriveCategoryInfo(relPath);
    const layerValidation = validateLayerField(
      extractedMeta.layer,
      categoryInfo.category,
      moduleId,
      dependencies.logger
    );
    const moduleNames = deriveModuleNames(extractedMeta.name, relPath);

    const mod: InstructionModule = buildModuleObject(
      moduleId,
      moduleNames,
      extractedMeta,
      categoryInfo,
      layerValidation,
      relPath
    );

    return mod;
  } catch (err) {
    dependencies.logger.warn(
      `Failed to parse YAML module: ${relPath}`,
      err instanceof Error ? err : undefined
    );
    return null;
  }
}

function extractMetaFromParsed(parsedRec: Record<string, unknown>): {
  name: string;
  description: string;
  semantic: string | undefined;
  tags: string[] | undefined;
  layer: number | undefined;
} {
  let meta: Record<string, unknown> = {};
  const metaUnknown = getProp(parsedRec, 'meta');
  if (isRecord(metaUnknown)) meta = metaUnknown;

  const name = (getString(meta, 'name') ?? '').trim();
  const description = (getString(meta, 'description') ?? '').trim();
  const semanticRaw = getString(meta, 'semantic');
  const semantic = semanticRaw ? semanticRaw.trim() : undefined;
  const tags = getStringArray(meta, 'tags');
  const layer = getNumber(meta, 'layer');

  return { name, description, semantic, tags, layer };
}

function extractModuleId(parsedRec: Record<string, unknown>, relPath: string): string {
  const idUnknown = getProp(parsedRec, 'id');
  const idSource =
    typeof idUnknown === 'string' && idUnknown.trim().length > 0
      ? idUnknown
      : undefined;
  return (idSource ?? relPath.replace(/\.module\.yml$/, '')).trim();
}

function deriveCategoryInfo(relPath: string): {
  category: string;
  subcategory: string | undefined;
} {
  const parts = relPath.split('/');
  const tier = parts.length > 0 ? parts[0] : '';
  const category = deriveCategoryFromTier(tier);
  const subjectPath = parts.slice(1, Math.max(1, parts.length - 1)).join('/');
  const subcategory = subjectPath ? subjectPath.replace(/\//g, ' / ') : undefined;

  return { category, subcategory };
}

function validateLayerField(
  layer: number | undefined,
  category: string,
  moduleId: string,
  logger: ILogger
): { isValid: boolean; shouldInclude: boolean } {
  if (category === 'Foundation') {
    if (layer !== undefined) {
      const isValid = Number.isInteger(layer) && layer >= 0 && layer <= 4;
      if (!isValid) {
        logger.warn(
          `Invalid layer value for foundation module ${moduleId}: ${layer.toString()}. Must be 0-4.`
        );
      }
      return { isValid, shouldInclude: isValid };
    }
    return { isValid: true, shouldInclude: false };
  } else {
    if (layer !== undefined) {
      logger.warn(
        `Layer field present in non-foundation module ${moduleId}. Ignoring.`
      );
    }
    return { isValid: true, shouldInclude: false };
  }
}

function deriveModuleNames(
  metaName: string,
  relPath: string
): {
  prettyName: string;
  description: string;
} {
  const fileStem =
    relPath
      .replace(/\.module\.yml$/, '')
      .split('/')
      .pop() ?? 'module';
  const prettyName =
    metaName || fileStem.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const description = metaName ? metaName : 'Module (parsed from YAML)';

  return { prettyName, description };
}

function buildModuleObject(
  moduleId: string,
  moduleNames: { prettyName: string; description: string },
  extractedMeta: {
    description: string;
    semantic: string | undefined;
    tags: string[] | undefined;
    layer: number | undefined;
  },
  categoryInfo: { category: string; subcategory: string | undefined },
  layerValidation: { shouldInclude: boolean },
  relPath: string
): InstructionModule {
  const finalDescription = extractedMeta.description || moduleNames.description;

  return {
    id: moduleId,
    name: moduleNames.prettyName,
    description: finalDescription,
    category: categoryInfo.category,
    ...(categoryInfo.subcategory ? { subcategory: categoryInfo.subcategory } : {}),
    filePath: relPath,
    ...(extractedMeta.semantic ? { semantic: extractedMeta.semantic } : {}),
    ...(extractedMeta.tags ? { tags: extractedMeta.tags } : {}),
    ...(layerValidation.shouldInclude && extractedMeta.layer !== undefined
      ? { layer: extractedMeta.layer }
      : {}),
  };
}

/**
 * Injectable instruction module parser implementation.
 * Handles parsing with dependency injection for better testability.
 */
export class InstructionModuleParser implements IInstructionModuleParser {
  private cachedInstructionModules: InstructionModule[] | null = null;
  private logger: ILogger;
  private moduleDirectory: string;

  constructor(
    private dependencies: IDependencies,
    moduleDirectory: string = 'instructions-modules'
  ) {
    this.logger = dependencies.logger;
    this.moduleDirectory = moduleDirectory;
  }

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
  async parseInstructionModules(): Promise<InstructionModule[]> {
    if (this.cachedInstructionModules) {
      this.logger.debug('Returning cached instruction modules');
      return this.cachedInstructionModules;
    }

    try {
      // UMS-only: discover and parse all .module.yml files
      const baseDir = this.dependencies.pathUtils.join(
        this.dependencies.processUtils.cwd(),
        this.moduleDirectory
      );
      // First pass: collect all YAML file paths
      const yamlFiles: { rel: string; abs: string }[] = [];
      const walkForPaths = (dir: string) => {
        const entries = this.dependencies.fileSystem.readdirSync(dir);
        for (const name of entries) {
          const abs = this.dependencies.pathUtils.join(dir, name);
          const st = this.dependencies.fileSystem.statSync(abs);
          if (st.isDirectory()) {
            walkForPaths(abs);
          } else if (name.endsWith('.module.yml')) {
            const rel = this.dependencies.pathUtils
              .relative(baseDir, abs)
              .replace(/\\/g, '/');
            yamlFiles.push({ rel, abs });
          }
        }
      };
      walkForPaths(baseDir);

      this.logger.info(`Found ${yamlFiles.length.toString()} YAML modules to parse`);

      // Second pass: parse all YAML files concurrently
      const parsePromises = yamlFiles.map(async ({ rel, abs }) => {
        try {
          const mod = await parseYamlModule(rel, abs, this.dependencies);
          return mod;
        } catch (moduleError) {
          this.dependencies.logger.warn(
            `Failed to parse YAML module: ${rel}`,
            moduleError instanceof Error ? moduleError : undefined
          );
          return null; // Return null for failed modules
        }
      });

      // Wait for all parsing to complete
      this.logger.info(
        `Parsing ${yamlFiles.length.toString()} YAML modules concurrently`
      );
      const parsedResults = await Promise.allSettled(parsePromises);

      // Collect successful results
      const modules: InstructionModule[] = [];
      let failedModules = 0;

      for (const result of parsedResults) {
        if (result.status === 'fulfilled' && result.value !== null) {
          modules.push(result.value);
        } else if (result.status === 'rejected') {
          failedModules++;
          this.logger.warn(
            'YAML module parsing promise rejected',
            result.reason instanceof Error ? result.reason : undefined
          );
        }
      }

      this.logger.info(
        `Concurrent parsing completed: ${modules.length.toString()} successful modules, ${failedModules.toString()} failed modules`
      );
      this.cachedInstructionModules = modules; // Cache the modules
      return modules;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Error parsing instruction modules', error);
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
