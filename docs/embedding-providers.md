# Embedding Providers Documentation

## Table of Contents

1. [Overview](#overview)
2. [Provider Comparison](#provider-comparison)
3. [Configuration Guide](#configuration-guide)
4. [Transformers.js Provider](#transformersjs-provider)
5. [Ollama Provider](#ollama-provider)
6. [OpenAI Provider](#openai-provider-future)
7. [Cohere Provider](#cohere-provider-future)
8. [Migration Guide](#migration-guide)
9. [Advanced Topics](#advanced-topics)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### What are Embedding Providers?

Embedding providers are pluggable modules that generate vector embeddings from text. Embeddings are dense numerical representations of text that capture semantic meaning, enabling:

- **Semantic search**: Find relevant content based on meaning, not just keywords
- **Similarity detection**: Identify conceptually similar documents
- **Content clustering**: Group related instructions and modules
- **Recommendation systems**: Suggest relevant modules based on context

### Why Pluggable Architecture?

The MCP server uses a **plugin-based embedding architecture** that allows you to:

- **Switch providers** without changing application code
- **Choose the best provider** for your use case (cost, performance, privacy)
- **Mix local and cloud** providers as needed
- **Implement custom providers** for specialized requirements
- **Maintain backward compatibility** with pre-computed embeddings

All providers implement the `IEmbeddingProvider` interface, ensuring consistent behavior and seamless swapping.

### Supported Providers

| Provider | Status | Type | Description |
|----------|--------|------|-------------|
| **Transformers.js** | ✅ Stable | Local | Browser-compatible local embeddings using HuggingFace models |
| **Ollama** | ✅ Stable | Local | High-performance local inference with custom model support |
| **OpenAI** | 🚧 Planned | Cloud | Enterprise-grade embeddings with best quality |
| **Cohere** | 🚧 Planned | Cloud | Multilingual embeddings with flexible dimensions |

---

## Provider Comparison

### Feature Matrix

| Provider | Type | Models | Dimensions | Latency | Cost | Best For |
|----------|------|---------|-----------|----------|------|----------|
| **Transformers.js** | Local | `all-mpnet-base-v2`, `all-MiniLM-L6-v2` | 384-768 | ~100ms | Free | Development, offline, privacy |
| **Ollama** | Local | `nomic-embed-text`, `mxbai-embed-large`, custom | 384-1024 | ~50ms | Free | Production, custom models, performance |
| **OpenAI** | Cloud | `text-embedding-3-small`, `text-embedding-3-large` | 1536-3072 | ~200ms | $$ | Production, best quality, scale |
| **Cohere** | Cloud | `embed-english-v3.0`, `embed-multilingual-v3.0` | 1024 | ~150ms | $ | Multilingual, cost-effective |

### Performance Characteristics

#### Transformers.js
- **Pros**: No setup, offline support, no API costs, privacy-friendly
- **Cons**: Slower initialization (model download), higher memory usage, moderate accuracy
- **Use when**: Developing locally, need offline capability, prioritize privacy

#### Ollama
- **Pros**: Fast inference, custom models, no API costs, local control
- **Cons**: Requires Ollama installation, initial model download
- **Use when**: Production deployments, need performance, want model flexibility

#### OpenAI (Future)
- **Pros**: Best accuracy, no local resources, handles any scale
- **Cons**: API costs, requires internet, rate limits, data leaves premises
- **Use when**: Need highest quality, willing to pay, have internet connectivity

#### Cohere (Future)
- **Pros**: Multilingual support, competitive pricing, good performance
- **Cons**: API costs, requires internet, vendor lock-in
- **Use when**: Need multilingual embeddings, cost-conscious, cloud-based

---

## Configuration Guide

### Configuration Schema

Embedding providers are configured through the `config.json` file:

```json
{
  "embeddingProvider": {
    "type": "transformers",
    "model": "all-mpnet-base-v2",
    "baseUrl": "",
    "apiKey": "",
    "dimensions": 768,
    "cacheEnabled": true,
    "maxCacheSize": 10000
  },
  "searchProvider": {
    "name": "semantic"
  },
  "moduleDirectory": "instructions-modules"
}
```

### Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | ✅ Yes | Provider type: `transformers`, `ollama`, `openai`, `cohere` |
| `model` | `string` | ✅ Yes | Model identifier (provider-specific) |
| `baseUrl` | `string` | ⚠️ Provider-specific | API endpoint or Ollama server URL |
| `apiKey` | `string` | ⚠️ Cloud only | API key for cloud providers |
| `dimensions` | `number` | ❌ Optional | Expected embedding dimensions (auto-detected if omitted) |
| `cacheEnabled` | `boolean` | ❌ Optional | Enable embedding caching (default: `true`) |
| `maxCacheSize` | `number` | ❌ Optional | Maximum cache entries (provider-specific) |

### Environment Variables

Cloud providers support environment variable configuration for API keys:

```bash
# OpenAI (future)
export OPENAI_API_KEY="sk-..."

# Cohere (future)
export COHERE_API_KEY="..."

# Start server
npm start
```

Environment variables take precedence over config file values for security.

---

## Transformers.js Provider

### Overview

The Transformers.js provider uses [@xenova/transformers](https://www.npmjs.com/package/@xenova/transformers) to generate embeddings locally using HuggingFace models. It's the default provider and requires no external services.

### Installation

The provider is included by default:

```bash
npm install @xenova/transformers
```

### Configuration

#### Basic Configuration

```json
{
  "embeddingProvider": {
    "type": "transformers",
    "model": "all-mpnet-base-v2",
    "dimensions": 768,
    "cacheEnabled": true
  }
}
```

#### Advanced Configuration

```json
{
  "embeddingProvider": {
    "type": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2",
    "dimensions": 384,
    "cacheEnabled": true,
    "maxCacheSize": 5000,
    "providerOptions": {
      "pooling": "mean",
      "normalize": true
    }
  }
}
```

### Supported Models

| Model | Dimensions | Size | Speed | Accuracy |
|-------|-----------|------|-------|----------|
| `all-mpnet-base-v2` | 768 | ~420MB | Medium | High |
| `all-MiniLM-L6-v2` | 384 | ~80MB | Fast | Good |
| `all-distilroberta-v1` | 768 | ~290MB | Medium | High |

**Recommendation**: Use `all-mpnet-base-v2` for best quality, `all-MiniLM-L6-v2` for faster performance.

### Model Selection

You can use any HuggingFace model compatible with feature extraction:

```json
{
  "model": "Xenova/all-MiniLM-L6-v2"
}
```

Prefix with `Xenova/` to use models from the [Xenova HuggingFace organization](https://huggingface.co/Xenova).

### Performance Tuning

#### Cache Configuration

The provider includes MD5-based caching for repeated embeddings:

```json
{
  "cacheEnabled": true,
  "maxCacheSize": 10000
}
```

**Cache benefits**:
- Avoid redundant computations for duplicate content
- Faster response times for frequently-accessed modules
- Lower CPU and memory usage

**Cache statistics**:
```typescript
const stats = service.getCacheStats();
console.log(stats);
// { hits: 150, misses: 50, size: 200, hitRate: 0.75 }
```

#### Batch Size

Batch processing is handled automatically. The provider processes multiple texts efficiently:

```typescript
// Automatic batching
const embeddings = await service.embedBatch([
  "First instruction",
  "Second instruction",
  "Third instruction"
]);
```

Default batch size: **32 texts**

#### Memory Optimization

Models are cached in `~/.cache/transformers/` by default. To change the cache directory:

```json
{
  "baseUrl": "/path/to/custom/cache"
}
```

**Warning**: First run downloads models from HuggingFace (100-500MB depending on model). Ensure sufficient disk space and internet connectivity.

### Offline Usage

After initial model download, the provider works completely offline:

1. **First run** (requires internet):
   ```bash
   npm start
   # Downloads model to ~/.cache/transformers/
   ```

2. **Subsequent runs** (offline):
   ```bash
   # Works without internet connection
   npm start
   ```

Models remain cached until manually deleted.

### Troubleshooting

#### Model Download Failures

**Error**: `Failed to download model`

**Solutions**:
- Check internet connectivity
- Verify firewall allows HuggingFace access
- Try a different model (some models may be large)
- Check disk space in cache directory

**Manual download**:
```bash
# Download model manually using Python
pip install transformers
python -c "from transformers import AutoModel; AutoModel.from_pretrained('sentence-transformers/all-mpnet-base-v2')"
```

#### Out of Memory

**Error**: `JavaScript heap out of memory`

**Solutions**:
- Use smaller model: `all-MiniLM-L6-v2` (384 dims)
- Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096" npm start`
- Reduce batch size in processing code
- Clear embedding cache: `service.clearCache()`

#### Dimension Mismatch

**Error**: `Dimension mismatch: expected 768, got 384`

**Solution**: Ensure `dimensions` in config matches model output:
```json
{
  "model": "all-MiniLM-L6-v2",
  "dimensions": 384  // Must match model
}
```

---

## Ollama Provider

### Overview

The Ollama provider interfaces with [Ollama](https://ollama.ai/) for high-performance local embedding generation. Ollama supports custom models and provides faster inference than Transformers.js.

### Prerequisites

1. **Install Ollama**:
   ```bash
   # macOS
   brew install ollama

   # Linux
   curl -fsSL https://ollama.ai/install.sh | sh

   # Windows
   # Download from https://ollama.ai/download
   ```

2. **Start Ollama server**:
   ```bash
   ollama serve
   # Server runs on http://localhost:11434
   ```

3. **Pull embedding model**:
   ```bash
   ollama pull nomic-embed-text
   ```

### Configuration

#### Basic Configuration

```json
{
  "embeddingProvider": {
    "type": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434",
    "dimensions": 768
  }
}
```

#### Custom Server

```json
{
  "embeddingProvider": {
    "type": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://192.168.1.100:11434",
    "timeout": 60000
  }
}
```

### Supported Models

| Model | Dimensions | Size | Speed | Accuracy | Command |
|-------|-----------|------|-------|----------|---------|
| `nomic-embed-text` | 768 | 274MB | Fast | High | `ollama pull nomic-embed-text` |
| `mxbai-embed-large` | 1024 | 669MB | Medium | High | `ollama pull mxbai-embed-large` |
| `all-minilm` | 384 | 45MB | Very Fast | Good | `ollama pull all-minilm` |
| `snowflake-arctic-embed` | 1024 | 669MB | Medium | High | `ollama pull snowflake-arctic-embed` |

**Recommendation**: Use `nomic-embed-text` for best balance of speed and quality.

### Model Management

#### Pulling Models

```bash
# Pull specific model
ollama pull nomic-embed-text

# List available models
ollama list

# Remove model
ollama rm nomic-embed-text
```

#### Model Updates

```bash
# Update to latest version
ollama pull nomic-embed-text
```

### Custom Models

Ollama supports custom models via Modelfile:

```dockerfile
# Modelfile
FROM nomic-embed-text
PARAMETER temperature 0
```

```bash
# Create custom model
ollama create my-embed -f Modelfile

# Use in config
{
  "model": "my-embed"
}
```

### Performance Tuning

#### Timeout Configuration

For large batches or slow hardware:

```json
{
  "timeout": 60000  // 60 seconds
}
```

#### Concurrent Requests

Ollama handles concurrent requests efficiently. The provider processes texts sequentially by default (Ollama has no native batch API).

**Optimization**: For large batches, consider running multiple Ollama instances.

#### GPU Acceleration

Ollama automatically uses GPU if available (CUDA/Metal):

```bash
# Check GPU usage
nvidia-smi  # NVIDIA
# or
Activity Monitor > GPU History  # macOS

# Force CPU
OLLAMA_CPU_ONLY=1 ollama serve
```

### Health Checking

The provider automatically verifies Ollama availability during initialization:

```typescript
await service.initialize(config);
// Throws error if Ollama is not running or model not found
```

### Troubleshooting

#### Ollama Not Available

**Error**: `Ollama not available at http://localhost:11434`

**Solutions**:
- Start Ollama server: `ollama serve`
- Check server is running: `curl http://localhost:11434/api/tags`
- Verify correct baseUrl in config
- Check firewall settings

#### Model Not Found

**Error**: `Model 'nomic-embed-text' not found in Ollama`

**Solutions**:
- Pull model: `ollama pull nomic-embed-text`
- List available models: `ollama list`
- Check model name spelling in config

**The error message includes a list of available models and the pull command**.

#### Connection Timeout

**Error**: `Ollama request timeout after 30000ms`

**Solutions**:
- Increase timeout in config: `"timeout": 60000`
- Check Ollama server load: `ollama ps`
- Verify network connectivity
- Consider using smaller model

#### Dimension Mismatch

**Error**: `Dimension mismatch: expected 768, got 1024`

**Solution**: Set correct dimensions for your model:
```json
{
  "model": "mxbai-embed-large",
  "dimensions": 1024  // Not 768
}
```

---

## OpenAI Provider (Future)

### Status

🚧 **Planned**: OpenAI provider is not yet implemented. This section describes the planned functionality.

### Overview

The OpenAI provider will use [OpenAI's Embeddings API](https://platform.openai.com/docs/api-reference/embeddings) for cloud-based embedding generation.

### Planned Configuration

```json
{
  "embeddingProvider": {
    "type": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}",
    "dimensions": 1536
  }
}
```

### Planned Models

| Model | Dimensions | Cost (per 1M tokens) | Accuracy |
|-------|-----------|---------------------|----------|
| `text-embedding-3-small` | 1536 | $0.020 | Good |
| `text-embedding-3-large` | 3072 | $0.130 | Best |
| `text-embedding-ada-002` | 1536 | $0.100 | Legacy |

### API Key Setup

```bash
# Set environment variable
export OPENAI_API_KEY="sk-..."

# Or in config.json
{
  "apiKey": "sk-..."
}
```

**Security note**: Never commit API keys to version control. Use environment variables or secure vaults.

### Rate Limits

OpenAI enforces rate limits:
- **Tier 1**: 3,000 RPM (requests per minute)
- **Tier 2**: 3,500 RPM
- **Tier 3+**: Higher limits

**Mitigation**: Provider will implement automatic retry with exponential backoff.

### Cost Optimization

**Tips for reducing costs**:
- Enable caching to avoid re-embedding duplicate content
- Use `text-embedding-3-small` for development
- Batch requests when possible
- Pre-compute embeddings for static content

---

## Cohere Provider (Future)

### Status

🚧 **Planned**: Cohere provider is not yet implemented. This section describes the planned functionality.

### Overview

The Cohere provider will use [Cohere's Embed API](https://docs.cohere.ai/reference/embed) for cloud-based multilingual embeddings.

### Planned Configuration

```json
{
  "embeddingProvider": {
    "type": "cohere",
    "model": "embed-english-v3.0",
    "apiKey": "${COHERE_API_KEY}",
    "dimensions": 1024
  }
}
```

### Planned Models

| Model | Languages | Dimensions | Cost (per 1M tokens) |
|-------|-----------|-----------|---------------------|
| `embed-english-v3.0` | English | 1024 | $0.100 |
| `embed-multilingual-v3.0` | 100+ | 1024 | $0.100 |
| `embed-english-light-v3.0` | English | 384 | $0.100 |

### Multilingual Support

Cohere excels at multilingual embeddings:

```json
{
  "model": "embed-multilingual-v3.0"
}
```

**Supported languages**: 100+ languages including Chinese, Japanese, Korean, Arabic, Russian, and more.

### API Key Setup

```bash
# Set environment variable
export COHERE_API_KEY="..."

# Or in config.json
{
  "apiKey": "..."
}
```

---

## Migration Guide

### Migrating from Hardcoded Transformers

If you're upgrading from an older version with hardcoded Transformers.js:

#### Before (Legacy)

```json
{
  "embeddingProvider": {
    "name": "transformers"
  }
}
```

#### After (Current)

```json
{
  "embeddingProvider": {
    "type": "transformers",
    "model": "all-mpnet-base-v2",
    "dimensions": 768
  }
}
```

### Automatic Migration

The server automatically migrates legacy configurations on startup:

```
[WARN] Deprecated config format detected: embeddingProvider.name="transformers"
[INFO] Migrated config from legacy format to provider type: transformers
```

**The migration is transparent and requires no action.**

### Configuration Changes

| Legacy Field | New Field | Notes |
|-------------|-----------|-------|
| `name` | `type` | Use provider type instead |
| N/A | `model` | Now required |
| N/A | `dimensions` | Auto-detected if omitted |

### Backward Compatibility

**Pre-computed embeddings remain valid**. The provider architecture does not affect existing embeddings in module YAML files:

```yaml
embedding_vector:
  - 0.123
  - -0.456
  - 0.789
  # ... (still works)
```

### Switching Providers

Switching providers requires **re-computing embeddings** for semantic search:

1. **Update config.json**:
   ```json
   {
     "embeddingProvider": {
       "type": "ollama",  // Changed from "transformers"
       "model": "nomic-embed-text"
     }
   }
   ```

2. **Regenerate embeddings**:
   ```bash
   npm run generate-embeddings
   ```

3. **Restart server**:
   ```bash
   npm start
   ```

**Warning**: Embeddings from different providers are **not interchangeable**. Mixing providers will result in poor semantic search quality.

### Migration Checklist

- [ ] Update `config.json` with new provider configuration
- [ ] Set environment variables for API keys (cloud providers)
- [ ] Install provider prerequisites (e.g., Ollama)
- [ ] Regenerate embeddings if switching providers
- [ ] Test semantic search functionality
- [ ] Update documentation and team guides

---

## Advanced Topics

### Implementing Custom Providers

All providers implement the `IEmbeddingProvider` interface:

```typescript
import type { IEmbeddingProvider, EmbeddingProviderConfig } from './embeddingProvider.interface.js';

class MyCustomProvider implements IEmbeddingProvider {
  readonly name = 'MyProvider';
  private _model = '';
  private _dimensions = 0;
  private _initialized = false;

  get model(): string {
    return this._model;
  }

  get dimensions(): number {
    return this._dimensions;
  }

  async initialize(config: EmbeddingProviderConfig): Promise<void> {
    // Initialize provider
    this._model = config.model;
    this._dimensions = config.dimensions || 512;
    this._initialized = true;
  }

  async embed(text: string): Promise<number[]> {
    if (!this._initialized) {
      throw new Error('Provider not initialized');
    }
    // Generate embedding
    return new Array(this._dimensions).fill(0);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  async dispose(): Promise<void> {
    this._initialized = false;
  }
}
```

### IEmbeddingProvider Interface

The interface defines the contract all providers must implement:

```typescript
interface IEmbeddingProvider {
  // Provider metadata
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;

  // Lifecycle methods
  initialize(config: EmbeddingProviderConfig, progressCallback?: EmbeddingProgressCallback): Promise<void>;
  dispose(): Promise<void>;
  isInitialized(): boolean;

  // Embedding generation
  embed(text: string, progressCallback?: EmbeddingProgressCallback): Promise<number[]>;
  embedBatch(texts: string[], progressCallback?: EmbeddingProgressCallback): Promise<number[][]>;
}
```

### Optional Interfaces

#### IEmbeddingProviderCache

Implement for caching support:

```typescript
interface IEmbeddingProviderCache {
  clearCache(): number;
  getCacheStats(): {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  };
  isCacheEnabled(): boolean;
  setCacheEnabled(enabled: boolean): void;
}
```

#### IEmbeddingProviderInfo

Implement for model introspection:

```typescript
interface IEmbeddingProviderInfo {
  getModelInfo(): {
    name: string;
    dimensions: number;
    maxSequenceLength?: number;
    tokenizer?: string;
    architecture?: string;
    parameters?: number;
  };

  getCapabilities(): {
    supportsBatching: boolean;
    supportsStreaming: boolean;
    supportsProgressCallbacks: boolean;
    maxBatchSize?: number;
  };
}
```

### Provider Registration

Register custom providers in the container:

```typescript
// src/modules/core/container.ts
import { MyCustomProvider } from './myCustomProvider.js';

const provider = new MyCustomProvider();
const service = new EmbeddingService(provider, logger);

container.register('embeddingService', service);
```

### Cache Management

Providers can implement custom caching strategies:

```typescript
class CachedProvider implements IEmbeddingProvider, IEmbeddingProviderCache {
  private cache = new Map<string, number[]>();
  private stats = { hits: 0, misses: 0 };

  async embed(text: string): Promise<number[]> {
    const key = this.computeHash(text);

    if (this.cache.has(key)) {
      this.stats.hits++;
      return this.cache.get(key)!;
    }

    this.stats.misses++;
    const embedding = await this.generateEmbedding(text);
    this.cache.set(key, embedding);
    return embedding;
  }

  clearCache(): number {
    const size = this.cache.size;
    this.cache.clear();
    return size;
  }

  getCacheStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses)
    };
  }
}
```

### Performance Benchmarks

Comparative benchmarks on M1 Mac (16GB RAM):

| Provider | Model | Init Time | Single Embed | Batch (32) | Memory |
|----------|-------|-----------|--------------|-----------|--------|
| Transformers.js | all-mpnet-base-v2 | ~5s | 100ms | 800ms | 450MB |
| Transformers.js | all-MiniLM-L6-v2 | ~3s | 50ms | 400ms | 150MB |
| Ollama | nomic-embed-text | <1s | 30ms | 300ms | 100MB |
| Ollama | mxbai-embed-large | <1s | 50ms | 500ms | 200MB |

**Notes**:
- Init time includes model loading (after download)
- Single embed is for ~100 token text
- Batch timing for 32 texts of ~100 tokens each
- Memory is provider overhead (excluding Node.js baseline)

### Error Handling

Providers use standardized error classes:

```typescript
import {
  EmbeddingProviderInitError,
  EmbeddingGenerationError,
  EmbeddingProviderNotInitializedError,
  EmbeddingConfigError
} from './embeddingProvider.interface.js';

// Initialization errors
throw new EmbeddingProviderInitError(
  'MyProvider',
  'Failed to load model',
  originalError
);

// Generation errors
throw new EmbeddingGenerationError(
  'MyProvider',
  'Text too long',
  originalError
);

// State errors
throw new EmbeddingProviderNotInitializedError('MyProvider');

// Config errors
throw new EmbeddingConfigError('MyProvider', 'API key missing');
```

---

## Troubleshooting

### General Issues

#### Provider Not Initialized

**Error**: `Provider not initialized. Call initialize() first.`

**Cause**: Attempting to generate embeddings before initialization.

**Solution**:
```typescript
await service.initialize(config);
// Now safe to use
const embedding = await service.embed(text);
```

#### Invalid Configuration

**Error**: `Invalid configuration: model name is required`

**Solution**: Ensure all required fields are present:
```json
{
  "type": "transformers",
  "model": "all-mpnet-base-v2"  // Required
}
```

#### Dimension Mismatch

**Error**: `Invalid embedding dimensions: expected 768, got 384`

**Cause**: Config dimensions don't match model output.

**Solutions**:
1. **Omit dimensions** (auto-detect):
   ```json
   {
     "type": "transformers",
     "model": "all-MiniLM-L6-v2"
     // dimensions auto-detected as 384
   }
   ```

2. **Set correct dimensions**:
   ```json
   {
     "model": "all-MiniLM-L6-v2",
     "dimensions": 384  // Match model
   }
   ```

### Provider-Specific Issues

#### Transformers.js

**Model download hangs**:
- Check internet connection
- Try different model
- Clear cache: `rm -rf ~/.cache/transformers/`

**Out of memory**:
- Use smaller model: `all-MiniLM-L6-v2`
- Increase Node.js heap: `NODE_OPTIONS="--max-old-space-size=4096"`
- Reduce batch size

**Slow performance**:
- Switch to Ollama for better performance
- Enable caching: `"cacheEnabled": true`
- Use smaller model

#### Ollama

**Server not available**:
- Start server: `ollama serve`
- Check port: `curl http://localhost:11434/api/tags`
- Verify baseUrl in config

**Model not found**:
- Pull model: `ollama pull nomic-embed-text`
- List models: `ollama list`
- Check spelling in config

**Slow inference**:
- Check GPU acceleration: `nvidia-smi` or Activity Monitor
- Reduce batch size
- Use smaller model: `all-minilm`

### Debug Mode

Enable debug logging for detailed diagnostics:

```bash
# Set log level
export LOG_LEVEL=debug

# Start server
npm start
```

**Debug output includes**:
- Provider initialization steps
- Model loading progress
- Cache hit/miss statistics
- Embedding generation timing
- Error stack traces

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Ollama not running | Start Ollama: `ollama serve` |
| `ENOTFOUND` | Invalid baseUrl | Check URL in config |
| `Timeout` | Request too slow | Increase timeout in config |
| `Invalid tensor` | Model incompatibility | Use supported model |
| `Out of memory` | Insufficient RAM | Use smaller model or increase heap |

### Getting Help

If you encounter issues not covered here:

1. **Check logs**: Set `LOG_LEVEL=debug` for detailed output
2. **Verify config**: Use `config.schema.ts` for validation
3. **Test providers**: Try different providers to isolate issues
4. **Check prerequisites**: Ensure external services are running
5. **Report issues**: Open GitHub issue with logs and config

**Include in bug reports**:
- Provider type and model
- Configuration (redact API keys)
- Error messages and stack traces
- Node.js and npm versions
- Operating system

---

## Summary

### Quick Start

**For development** (offline, free):
```json
{
  "embeddingProvider": {
    "type": "transformers",
    "model": "all-MiniLM-L6-v2"
  }
}
```

**For production** (performance, local):
```bash
ollama pull nomic-embed-text
```
```json
{
  "embeddingProvider": {
    "type": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434"
  }
}
```

### Key Takeaways

- **Pluggable architecture**: Easy to switch providers
- **Local by default**: Transformers.js and Ollama work offline
- **Cloud options planned**: OpenAI and Cohere for best quality
- **Backward compatible**: Pre-computed embeddings still work
- **Automatic migration**: Legacy configs migrate seamlessly
- **Comprehensive caching**: Avoid redundant computations
- **Type-safe**: Full TypeScript support with strict typing

### Next Steps

1. Choose provider based on [comparison table](#provider-comparison)
2. Configure provider in `config.json`
3. Initialize and test: `npm start`
4. Generate embeddings: `npm run generate-embeddings`
5. Enable semantic search in client applications

For implementation details, see:
- [IEmbeddingProvider interface](/src/modules/plugins/embedding/embeddingProvider.interface.ts)
- [Transformers provider](/src/modules/plugins/embedding/transformersProvider.ts)
- [Ollama provider](/src/modules/plugins/embedding/ollamaProvider.ts)
- [Configuration schema](/src/config/config.schema.ts)
- [Migration utilities](/src/config/config.migration.ts)
