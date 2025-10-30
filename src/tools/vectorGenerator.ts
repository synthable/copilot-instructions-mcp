/**
 * @fileoverview Build-time vector generation tool.
 *
 * This tool pre-computes embeddings for all instruction modules during build process
 * and saves them in both JSON and MessagePack formats with MD5 checksums for cache
 * invalidation. Generates vectors from the module's semantic field only.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { Command } from 'commander';

import {
  createProductionContainer,
  type Container,
} from '../modules/core/container.js';
import type {
  InstructionModule,
  ModuleVector,
  VectorIndex,
  VectorIndexMetadata,
} from '../modules/core/types.js';
import type {
  EmbeddingProgressCallback,
  IEmbeddingService,
  ISemanticConfig,
  IInstructionModuleParser,
} from '../modules/core/interfaces.js';
import type { EmbeddingProviderConfig } from '../modules/plugins/embedding/embeddingProvider.interface.js';
import { configSchema, type ServerConfig } from '../config/config.schema.js';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Version of the vector generation tool for metadata tracking.
 */
const VECTOR_GENERATOR_VERSION = '1.0.0';

/**
 * Progress tracking for vector generation.
 */
interface VectorGenerationProgress {
  total: number;
  completed: number;
  current?: string;
  stage: 'initializing' | 'parsing' | 'embedding' | 'saving';
}

/**
 * Build-time vector generator that creates pre-computed embeddings.
 */
export class VectorGenerator {
  private outputDir: string;
  private progressCallback: ((progress: VectorGenerationProgress) => void) | undefined;
  private providerName: string | undefined;

  constructor(
    private embeddingService: IEmbeddingService,
    private config: ISemanticConfig,
    private parser: IInstructionModuleParser,
    private providerConfig: EmbeddingProviderConfig,
    outputDir = 'dist/vectors',
    progressCallback?: (progress: VectorGenerationProgress) => void,
    providerName?: string
  ) {
    this.outputDir = outputDir;
    this.progressCallback = progressCallback;
    this.providerName = providerName ?? undefined;
  }

  /**
   * Factory method to create VectorGenerator from a container.
   */
  static fromContainer(
    container: Container,
    providerConfig: EmbeddingProviderConfig,
    outputDir = 'dist/vectors',
    progressCallback?: (progress: VectorGenerationProgress) => void,
    providerName?: string
  ): VectorGenerator {
    return new VectorGenerator(
      container.getEmbeddingService(),
      container.getSemanticConfig(),
      container.getInstructionModuleParser(),
      providerConfig,
      outputDir,
      progressCallback,
      providerName
    );
  }

  /**
   * Generates vectors for all instruction modules and saves them to disk.
   */
  async generateVectors(): Promise<void> {
    const startTime = Date.now();

    try {
      this.reportProgress({
        total: 0,
        completed: 0,
        stage: 'initializing',
      });

      // Initialize embedding service with provider config
      await this.embeddingService.initialize(
        this.providerConfig,
        this.createEmbeddingProgressCallback(this.providerName)
      );

      // Parse all modules
      this.reportProgress({
        total: 0,
        completed: 0,
        stage: 'parsing',
      });

      const modules = await this.parser.parseInstructionModules();

      // Filter modules that have semantic field
      const modulesWithSemantic = modules.filter(module => module.semantic);

      if (modulesWithSemantic.length === 0) {
        throw new Error('No modules found with semantic field for vectorization');
      }

      console.log(
        `Found ${modulesWithSemantic.length.toString()} modules with semantic content`
      );

      // Generate vectors
      this.reportProgress({
        total: modulesWithSemantic.length,
        completed: 0,
        stage: 'embedding',
      });

      const vectors = await this.generateModuleVectors(modulesWithSemantic);

      // Create vector index
      const vectorIndex = this.createVectorIndex(vectors);

      // Save to disk
      this.reportProgress({
        total: modulesWithSemantic.length,
        completed: modulesWithSemantic.length,
        stage: 'saving',
      });

      await this.saveVectorIndex(vectorIndex);

      const duration = (Date.now() - startTime) / 1000;
      console.log(`Vector generation completed in ${duration.toFixed(2)}s`);
      console.log(`Generated ${vectors.length.toString()} vectors`);
      console.log(`Saved to: ${this.outputDir}`);
    } catch (error) {
      console.error('Vector generation failed:', error);
      throw error;
    } finally {
      // Clean up embedding service
      await this.embeddingService.dispose();
    }
  }

  /**
   * Generates vectors for all modules with semantic content.
   */
  private async generateModuleVectors(
    modules: InstructionModule[]
  ): Promise<ModuleVector[]> {
    const vectors: ModuleVector[] = [];
    const batchSize = this.config.getIndexingBatchSize();

    // Process modules in batches
    for (let i = 0; i < modules.length; i += batchSize) {
      const batch = modules.slice(i, Math.min(i + batchSize, modules.length));

      // Extract semantic content from batch
      const semanticTexts = batch.map(module => module.semantic ?? '');

      this.reportProgress({
        total: modules.length,
        completed: i,
        stage: 'embedding',
        current: `Processing batch ${(Math.floor(i / batchSize) + 1).toString()}/${Math.ceil(modules.length / batchSize).toString()}`,
      });

      // Generate embeddings for batch
      const embeddings = await this.embeddingService.embedBatch(
        semanticTexts,
        this.createEmbeddingProgressCallback(this.providerName)
      );

      // Create ModuleVector objects
      for (let j = 0; j < batch.length; j++) {
        const module = batch[j];
        const embedding = embeddings[j];
        const contentHash = this.computeContentHash(module.semantic ?? '');
        const tier = this.extractTier(module.category);

        vectors.push({
          id: module.id,
          vector: embedding,
          contentHash,
          timestamp: Date.now(),
          tier,
        });
      }
    }

    return vectors;
  }

  /**
   * Creates a vector index with metadata.
   */
  private createVectorIndex(vectors: ModuleVector[]): VectorIndex {
    const metadata: VectorIndexMetadata = {
      count: vectors.length,
      model: this.config.getModelName(),
      dimensions: this.config.getEmbeddingDimensions(),
      timestamp: Date.now(),
      version: VECTOR_GENERATOR_VERSION,
      modules: vectors.map(v => ({
        id: v.id,
        tier: v.tier,
        contentHash: v.contentHash,
        timestamp: v.timestamp,
      })),
    };

    return {
      metadata,
      vectors,
    };
  }

  /**
   * Saves vector index to both JSON and MessagePack formats.
   */
  private async saveVectorIndex(vectorIndex: VectorIndex): Promise<void> {
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });

    // Save complete index as JSON (for development/debugging)
    const jsonPath = join(this.outputDir, 'vectors.json');
    await fs.writeFile(jsonPath, JSON.stringify(vectorIndex, null, 2), 'utf-8');
    console.log(`Saved JSON index: ${jsonPath}`);

    // Save complete index as MessagePack (for production)
    const msgpackPath = join(this.outputDir, 'vectors.msgpack');
    const msgpackData = msgpackEncode(vectorIndex);
    await fs.writeFile(msgpackPath, msgpackData);
    console.log(`Saved MessagePack index: ${msgpackPath}`);

    // Save metadata-only index (for fast loading)
    const metadataPath = join(this.outputDir, 'metadata.json');
    await fs.writeFile(
      metadataPath,
      JSON.stringify(vectorIndex.metadata, null, 2),
      'utf-8'
    );
    console.log(`Saved metadata index: ${metadataPath}`);

    // Generate MD5 checksums for cache invalidation
    await this.generateChecksums();
  }

  /**
   * Generates MD5 checksums for all generated files.
   */
  private async generateChecksums(): Promise<void> {
    const files = ['vectors.json', 'vectors.msgpack', 'metadata.json'];
    const checksums: Record<string, string> = {};

    for (const filename of files) {
      const filepath = join(this.outputDir, filename);
      const content = await fs.readFile(filepath);
      const hash = createHash('md5').update(content).digest('hex');
      checksums[filename] = hash;
    }

    // Save checksums
    const checksumsPath = join(this.outputDir, 'checksums.json');
    await fs.writeFile(checksumsPath, JSON.stringify(checksums, null, 2), 'utf-8');
    console.log(`Saved checksums: ${checksumsPath}`);
  }

  /**
   * Computes MD5 hash of semantic content for cache invalidation.
   */
  private computeContentHash(semanticContent: string): string {
    return createHash('md5').update(semanticContent, 'utf-8').digest('hex');
  }

  /**
   * Extracts tier from module category for filtering.
   */
  private extractTier(category: string): string {
    return category.toLowerCase();
  }

  /**
   * Creates embedding progress callback for batch operations.
   */
  private createEmbeddingProgressCallback(
    providerName?: string
  ): EmbeddingProgressCallback {
    return (stage, progress, message) => {
      // Optional: Log detailed embedding progress
      if (message) {
        const provider = providerName ? `[${providerName}] ` : '';
        console.log(
          `${provider}Embedding ${stage}: ${message} (${(progress * 100).toFixed(1)}%)`
        );
      }
    };
  }

  /**
   * Reports progress to callback if provided.
   */
  private reportProgress(progress: VectorGenerationProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}

/**
 * Default configuration for vector generation if config.json is not found.
 */
const DEFAULT_CONFIG = {
  embeddingProvider: { type: 'transformers' as const },
  searchProvider: { name: 'fuzzy' as const },
};

/**
 * Loads and validates configuration from config.json.
 */
function loadConfig(): ServerConfig {
  const configPath = join(process.cwd(), 'config.json');

  if (!existsSync(configPath)) {
    console.log('No config.json found, using default configuration');
    return configSchema.parse(DEFAULT_CONFIG);
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const rawConfig: unknown = JSON.parse(configContent);
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Failed to load configuration from config.json:', error);
    console.error('Falling back to default configuration');
    return configSchema.parse(DEFAULT_CONFIG);
  }
}

/**
 * CLI entry point for vector generation.
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('vector-generator')
    .description('Build-time vector generation tool for instruction modules')
    .version('1.0.0')
    .option(
      '-o, --output <directory>',
      'Output directory for generated vectors',
      'dist/vectors'
    )
    .option(
      '-p, --provider <type>',
      'Embedding provider to use (transformers, ollama)',
      undefined
    )
    .option('-d, --debug', 'Enable debug logging', false)
    .parse(process.argv);

  const options = program.opts<{
    output: string;
    provider?: 'transformers' | 'ollama';
    debug: boolean;
  }>();

  console.log('Starting build-time vector generation...');
  console.log(`Output directory: ${options.output}`);

  // Load config from file
  const config = loadConfig();

  // Override provider if specified via CLI
  if (options.provider) {
    console.log(`Using provider override: ${options.provider}`);
    config.embeddingProvider.type = options.provider;
  }

  const providerType = config.embeddingProvider.type;
  console.log(`Embedding provider: ${providerType}`);
  console.log(`Model: ${config.embeddingProvider.model}`);

  const progressCallback = (progress: VectorGenerationProgress) => {
    const percentage =
      progress.total > 0
        ? ((progress.completed / progress.total) * 100).toFixed(1)
        : '0.0';
    const current = progress.current ? ` (${progress.current})` : '';
    console.log(`[${progress.stage.toUpperCase()}] ${percentage}%${current}`);
  };

  try {
    // Create container with config
    const container = createProductionContainer(config.moduleDirectory, config);

    // Create generator using factory method
    const generator = VectorGenerator.fromContainer(
      container,
      config.embeddingProvider as EmbeddingProviderConfig,
      options.output,
      progressCallback,
      providerType
    );

    await generator.generateVectors();
    console.log('Vector generation completed successfully!');

    // Clean up container resources
    await container.dispose();

    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('Vector generation failed:', errorMessage);
    if (options.debug && errorStack) {
      console.error('Stack trace:', errorStack);
    }

    // Provide helpful error messages for common issues
    if (errorMessage.includes('provider')) {
      console.error('\nProvider initialization failed. Check your configuration:');
      console.error('- For Ollama: ensure Ollama is running (ollama serve)');
      console.error('- For Transformers: ensure @xenova/transformers is installed');
    }

    process.exit(1);
  }
}

// Run if called directly
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(console.error);
}
