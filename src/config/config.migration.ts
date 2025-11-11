/**
 * @fileoverview Configuration migration helpers for transitioning from legacy
 * config format to the new provider-based format.
 *
 * This module provides utilities to:
 * - Detect legacy configuration formats
 * - Migrate old configs to new provider-based structure
 * - Validate provider-specific requirements
 * - Supply sensible defaults for each provider type
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { createLogger } from '../modules/utils/logger.js';
import type { ServerConfig } from './config.schema.js';

const logger = createLogger('config-migration');

/**
 * Type alias for embedding provider types supported by the system.
 */
type EmbeddingProviderType = 'transformers' | 'ollama' | 'cohere';

/**
 * Structure of the embedding provider configuration.
 */
interface EmbeddingProviderConfig {
  type: EmbeddingProviderType;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  dimensions?: number;
  cacheEnabled: boolean;
  maxCacheSize?: number;
}

/**
 * Legacy configuration format that used 'name' instead of 'type'.
 */
interface LegacyEmbeddingProviderConfig {
  name?: string;
  type?: never;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  dimensions?: number;
  cacheEnabled?: boolean;
  maxCacheSize?: number;
}

/**
 * Default configurations for each provider type.
 * These provide sensible defaults that work out-of-the-box.
 */
const PROVIDER_DEFAULTS: Record<
  EmbeddingProviderType,
  Partial<EmbeddingProviderConfig>
> = {
  transformers: {
    type: 'transformers',
    model: 'all-mpnet-base-v2',
    dimensions: 768,
    cacheEnabled: true,
  },
  ollama: {
    type: 'ollama',
    model: 'nomic-embed-text',
    baseUrl: 'http://localhost:11434',
    dimensions: 768,
    cacheEnabled: true,
  },
  cohere: {
    type: 'cohere',
    model: 'embed-english-v3.0',
    dimensions: 1024,
    cacheEnabled: true,
  },
};

/**
 * Maps legacy provider names to new provider types.
 * Handles common variations and aliases.
 */
const LEGACY_NAME_MAPPING: Record<string, EmbeddingProviderType> = {
  transformers: 'transformers',
  transformer: 'transformers',
  'huggingface-transformers': 'transformers',
  huggingface: 'transformers',
  ollama: 'ollama',
  cohere: 'cohere',
  'cohere-embed': 'cohere',
};

/**
 * Checks if a configuration object is in the legacy format.
 *
 * Legacy format is identified by:
 * - Presence of 'name' field instead of 'type'
 * - Missing 'type' field entirely
 *
 * @param config - Configuration object to check
 * @returns True if config is in legacy format
 *
 * @example
 * ```typescript
 * const oldConfig = { embeddingProvider: { name: 'transformers' } };
 * isLegacyConfig(oldConfig); // true
 *
 * const newConfig = { embeddingProvider: { type: 'transformers' } };
 * isLegacyConfig(newConfig); // false
 * ```
 *
 * @since 1.0.0
 */
export function isLegacyConfig(config: unknown): boolean {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const configObj = config as Record<string, unknown>;

  if (!configObj.embeddingProvider || typeof configObj.embeddingProvider !== 'object') {
    return false;
  }

  const embeddingProvider = configObj.embeddingProvider as Record<string, unknown>;

  // Legacy format has 'name' instead of 'type'
  return 'name' in embeddingProvider && !('type' in embeddingProvider);
}

/**
 * Returns sensible default configuration for a given provider type.
 *
 * These defaults are production-ready and work out-of-the-box for most use cases.
 *
 * @param type - Provider type (transformers, ollama, cohere)
 * @returns Partial configuration with defaults for the provider
 *
 * @example
 * ```typescript
 * const defaults = getProviderDefaults('ollama');
 * // { type: 'ollama', model: 'nomic-embed-text', baseUrl: 'http://localhost:11434', ... }
 * ```
 *
 * @since 1.0.0
 */
export function getProviderDefaults(type: string): Partial<EmbeddingProviderConfig> {
  const providerType = type as EmbeddingProviderType;

  if (providerType in PROVIDER_DEFAULTS) {
    return { ...PROVIDER_DEFAULTS[providerType] };
  }

  // Unknown provider - return minimal defaults
  logger.warn(`Unknown provider type: ${type}, using minimal defaults`);
  return {
    type: providerType,
    cacheEnabled: true,
  };
}

/**
 * Migrates a legacy configuration to the new provider-based format.
 *
 * Migration steps:
 * 1. Detect legacy format (name field instead of type)
 * 2. Map legacy name to new type using LEGACY_NAME_MAPPING
 * 3. Apply provider-specific defaults
 * 4. Preserve existing configuration values
 * 5. Log warnings for deprecated fields
 *
 * @param oldConfig - Configuration in legacy format
 * @returns Migrated configuration in new format
 *
 * @throws Error if config is invalid or migration fails
 *
 * @example
 * ```typescript
 * const oldConfig = {
 *   embeddingProvider: { name: 'transformers' },
 *   searchProvider: { name: 'fuzzy' }
 * };
 *
 * const newConfig = migrateConfig(oldConfig);
 * // Migration adds provider-specific defaults and missing fields:
 * // {
 * //   embeddingProvider: {
 * //     type: 'transformers',
 * //     model: 'all-mpnet-base-v2',
 * //     dimensions: 768,
 * //     cacheEnabled: true
 * //   },
 * //   searchProvider: { name: 'fuzzy' },
 * //   vectorStore: { type: 'file', enableIntegrityCheck: true }, // Added as default
 * //   moduleDirectory: 'instructions-modules' // Added as default
 * // }
 * ```
 *
 * @since 1.0.0
 */
export function migrateConfig(oldConfig: unknown): ServerConfig {
  if (!oldConfig || typeof oldConfig !== 'object') {
    throw new Error('Invalid config: must be an object');
  }

  const configObj = oldConfig as Record<string, unknown>;

  // Handle missing embeddingProvider
  if (!configObj.embeddingProvider) {
    logger.warn('Missing embeddingProvider in config, using transformers default');
    const searchProvider = configObj.searchProvider as { name: string } | undefined;
    const moduleDirectory = configObj.moduleDirectory as string | undefined;
    return {
      embeddingProvider: {
        ...PROVIDER_DEFAULTS.transformers,
      } as EmbeddingProviderConfig,
      vectorStore: {
        type: 'file' as const,
        enableIntegrityCheck: true,
      },
      searchProvider: searchProvider ?? {
        name: 'fuzzy',
      },
      moduleDirectory: moduleDirectory ?? 'instructions-modules',
    };
  }

  const embeddingProvider = configObj.embeddingProvider as
    | LegacyEmbeddingProviderConfig
    | EmbeddingProviderConfig;

  // If already in new format, return as-is with defaults filled
  if ('type' in embeddingProvider) {
    const providerType = embeddingProvider.type;
    const defaults = getProviderDefaults(providerType);
    const searchProvider = configObj.searchProvider as { name: string } | undefined;
    const moduleDirectory = configObj.moduleDirectory as string | undefined;

    return {
      embeddingProvider: {
        ...defaults,
        ...embeddingProvider,
        type: providerType,
      } as EmbeddingProviderConfig,
      vectorStore: {
        type: 'file' as const,
        enableIntegrityCheck: true,
      },
      searchProvider: searchProvider ?? {
        name: 'fuzzy',
      },
      moduleDirectory: moduleDirectory ?? 'instructions-modules',
    };
  }

  // Legacy format - migrate from 'name' to 'type'
  const legacyName = embeddingProvider.name ?? 'transformers';

  logger.warn(
    `Deprecated config format detected: embeddingProvider.name="${legacyName}"`,
    {
      hint: 'Use embeddingProvider.type instead',
    }
  );

  // Map legacy name to new type
  const providerType = LEGACY_NAME_MAPPING[legacyName.toLowerCase()] ?? 'transformers';

  if (!(legacyName.toLowerCase() in LEGACY_NAME_MAPPING)) {
    logger.warn(`Unknown provider name "${legacyName}", defaulting to "transformers"`, {
      supportedProviders: Object.keys(PROVIDER_DEFAULTS).join(', '),
    });
  }

  // Get defaults for the provider type
  const defaults = getProviderDefaults(providerType);

  // Build migrated config with defaults and existing values
  const migratedProvider: EmbeddingProviderConfig = {
    type: providerType,
    model: embeddingProvider.model ?? defaults.model ?? '',
    cacheEnabled: embeddingProvider.cacheEnabled ?? defaults.cacheEnabled ?? true,
  };

  // Add optional fields if present
  if (embeddingProvider.baseUrl) {
    migratedProvider.baseUrl = embeddingProvider.baseUrl;
  } else if (defaults.baseUrl) {
    migratedProvider.baseUrl = defaults.baseUrl;
  }

  if (embeddingProvider.apiKey) {
    migratedProvider.apiKey = embeddingProvider.apiKey;
  }

  if (embeddingProvider.dimensions) {
    migratedProvider.dimensions = embeddingProvider.dimensions;
  } else if (defaults.dimensions) {
    migratedProvider.dimensions = defaults.dimensions;
  }

  if (embeddingProvider.maxCacheSize) {
    migratedProvider.maxCacheSize = embeddingProvider.maxCacheSize;
  }

  logger.info(`Migrated config from legacy format to provider type: ${providerType}`);

  const searchProvider = configObj.searchProvider as { name: string } | undefined;
  const moduleDirectory = configObj.moduleDirectory as string | undefined;

  return {
    embeddingProvider: migratedProvider,
    vectorStore: {
      type: 'file' as const,
      enableIntegrityCheck: true,
    },
    searchProvider: searchProvider ?? { name: 'fuzzy' },
    moduleDirectory: moduleDirectory ?? 'instructions-modules',
  };
}

/**
 * Validates provider-specific configuration requirements.
 *
 * Each provider has different requirements:
 * - **transformers**: No external dependencies, works out-of-the-box
 * - **ollama**: Requires baseUrl to be set
 * - **cohere**: Requires apiKey to be set
 *
 * This function performs non-fatal validation and returns warning messages.
 * It does not throw errors, allowing the application to continue with warnings.
 *
 * @param config - Server configuration to validate
 * @returns Array of warning messages (empty if no issues)
 *
 * @example
 * ```typescript
 * const config = {
 *   embeddingProvider: { type: 'ollama', model: 'nomic-embed-text' },
 *   searchProvider: { name: 'fuzzy' }
 * };
 *
 * const warnings = validateProviderConfig(config);
 * // ['Ollama provider requires baseUrl to be set. Default: http://localhost:11434']
 *
 * warnings.forEach(warning => console.warn(warning));
 * ```
 *
 * @since 1.0.0
 */
export function validateProviderConfig(config: ServerConfig): string[] {
  const warnings: string[] = [];
  const provider = config.embeddingProvider;

  // Validate provider-specific requirements
  switch (provider.type) {
    case 'transformers':
      // No external dependencies required
      logger.debug('Using transformers provider (local embeddings)');
      break;

    case 'ollama':
      if (!provider.baseUrl) {
        warnings.push(
          'Ollama provider requires baseUrl to be set. Default: http://localhost:11434'
        );
        logger.warn('Ollama baseUrl not configured, using default', {
          defaultUrl: PROVIDER_DEFAULTS.ollama.baseUrl,
        });
      } else {
        logger.debug(`Using Ollama provider at ${provider.baseUrl}`);
      }
      break;

    case 'cohere':
      if (!provider.apiKey) {
        warnings.push(
          'Cohere provider requires apiKey to be set. Set COHERE_API_KEY environment variable or include in config.'
        );
        logger.warn('Cohere apiKey not configured', {
          hint: 'Set COHERE_API_KEY environment variable',
        });
      } else {
        logger.debug('Using Cohere provider with configured API key');
      }
      break;

    default:
      warnings.push(`Unknown provider type: ${provider.type as string}`);
      logger.warn(`Unknown provider type: ${provider.type as string}`, {
        supportedProviders: Object.keys(PROVIDER_DEFAULTS).join(', '),
      });
  }

  // Validate model is specified
  if (!provider.model || provider.model.trim().length === 0) {
    warnings.push('Embedding model not specified, using provider default');
    const providerType = provider.type as EmbeddingProviderType;
    const providerDefaults =
      providerType in PROVIDER_DEFAULTS ? PROVIDER_DEFAULTS[providerType] : undefined;
    logger.warn('Embedding model not specified', {
      providerType: provider.type,
      defaultModel: providerDefaults?.model ?? 'unknown',
    });
  }

  // Validate dimensions if specified
  if (provider.dimensions !== undefined && provider.dimensions <= 0) {
    warnings.push(
      `Invalid embedding dimensions: ${provider.dimensions.toString()}. Must be positive.`
    );
    logger.warn('Invalid embedding dimensions configured', {
      dimensions: provider.dimensions,
    });
  }

  // Validate cache settings
  if (
    provider.maxCacheSize !== undefined &&
    (!Number.isInteger(provider.maxCacheSize) || provider.maxCacheSize <= 0)
  ) {
    warnings.push(
      `Invalid maxCacheSize: ${provider.maxCacheSize.toString()}. Must be a positive integer.`
    );
    logger.warn('Invalid maxCacheSize configured', {
      maxCacheSize: provider.maxCacheSize,
    });
  }

  return warnings;
}
