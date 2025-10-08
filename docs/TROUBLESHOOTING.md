# Troubleshooting & Performance Guide

This guide provides comprehensive troubleshooting steps and performance optimization strategies for the vector search system.

- [Troubleshooting \& Performance Guide](#troubleshooting--performance-guide)
  - [Quick Diagnostics](#quick-diagnostics)
    - [Health Check Script](#health-check-script)
    - [Verify Installation](#verify-installation)
  - [Common Issues \& Solutions](#common-issues--solutions)
    - [1. Build \& Setup Issues](#1-build--setup-issues)
      - [Vector Generation Fails](#vector-generation-fails)
      - [Missing Vector Files](#missing-vector-files)
      - [Build Script Not Found](#build-script-not-found)
    - [2. Runtime Issues](#2-runtime-issues)
      - [Server Startup Failures](#server-startup-failures)
      - [High Memory Usage](#high-memory-usage)
      - [Embedding Model Not Loading](#embedding-model-not-loading)
    - [3. Search Quality Issues](#3-search-quality-issues)
      - [Poor Semantic Search Results](#poor-semantic-search-results)
      - [Inconsistent Search Results](#inconsistent-search-results)
      - [Keyword Search Degraded](#keyword-search-degraded)
    - [4. Performance Issues](#4-performance-issues)
      - [Slow Search Response](#slow-search-response)
      - [High Latency After Idle](#high-latency-after-idle)
      - [Memory Growth Over Time](#memory-growth-over-time)
  - [Performance Optimization](#performance-optimization)
    - [1. Startup Optimization](#1-startup-optimization)
      - [Faster Vector Loading](#faster-vector-loading)
      - [Pre-warm Model](#pre-warm-model)
    - [2. Query Optimization](#2-query-optimization)
      - [Batch Queries](#batch-queries)
      - [Smart Caching](#smart-caching)
    - [3. Memory Optimization](#3-memory-optimization)
      - [Optimize Vector Storage](#optimize-vector-storage)
      - [Implement Vector Quantization (Future)](#implement-vector-quantization-future)
    - [4. Monitoring \& Metrics](#4-monitoring--metrics)
      - [Performance Metrics Collection](#performance-metrics-collection)
      - [Health Monitoring](#health-monitoring)
  - [Advanced Debugging](#advanced-debugging)
    - [1. Vector Analysis](#1-vector-analysis)
    - [2. Similarity Analysis](#2-similarity-analysis)
    - [3. Cache Analysis](#3-cache-analysis)
  - [Best Practices](#best-practices)
    - [1. Production Deployment](#1-production-deployment)
    - [2. Development](#2-development)
    - [3. Maintenance](#3-maintenance)


## Quick Diagnostics

### Health Check Script
```bash
# Run comprehensive system check
npm run test:semantic

# Quick server test
node dist/index.js --help

# Vector file verification
ls -la dist/vectors/ && du -sh dist/vectors/*
```

### Verify Installation
```bash
# Check required dependencies
npm list @xenova/transformers msgpackr

# Verify vector generation
npm run build:vectors

# Test MCP tools
echo '{"method": "tools/list"}' | node dist/index.js stdio
```

## Common Issues & Solutions

### 1. Build & Setup Issues

#### Vector Generation Fails
```bash
# Symptom: npm run build:vectors fails
# Common causes and solutions:

# 1. Missing dependencies
npm install @xenova/transformers msgpackr

# 2. TypeScript compilation errors
npm run build
# Fix any TypeScript errors before generating vectors

# 3. Insufficient memory
# Increase Node.js memory limit
node --max-old-space-size=4096 dist/tools/vectorGenerator.js

# 4. Module parsing errors
# Check for invalid YAML in instruction modules
find instructions-modules -name "*.md" -exec grep -l "^---" {} \;
```

#### Missing Vector Files
```bash
# Symptom: Semantic search unavailable
# Check for vector files
ls -la dist/vectors/

# Expected files:
# vectors.msgpack, vectors.json, metadata.json, checksums.json

# Regenerate if missing
rm -rf dist/vectors/
npm run build:vectors
```

#### Build Script Not Found
```bash
# Symptom: npm run build:vectors command not found
# Check package.json scripts
grep -A 5 '"scripts"' package.json

# Add script if missing
npm pkg set scripts.build:vectors="node dist/tools/vectorGenerator.js"
```

### 2. Runtime Issues

#### Server Startup Failures
```bash
# Symptom: Server fails to start
# Enable debug logging
DEBUG=* node dist/index.js stdio

# Common issues:
# 1. Port already in use (HTTP mode)
# 2. Vector file corruption
# 3. Model loading failure
# 4. Memory limitations
```

#### High Memory Usage
```javascript
// Monitor memory usage
const memoryMonitor = container.get('memoryMonitor');
console.log(memoryMonitor.getCurrentUsage());

// Check for memory leaks
setInterval(() => {
  const usage = process.memoryUsage();
  console.log(`Memory: RSS=${Math.round(usage.rss/1024/1024)}MB, Heap=${Math.round(usage.heapUsed/1024/1024)}MB`);
}, 10000);

// Solutions:
// 1. Reduce embedding cache size
// 2. Force garbage collection
// 3. Restart server periodically
```

#### Embedding Model Not Loading
```bash
# Symptom: Semantic search returns "not initialized" error
# Check model download
ls ~/.cache/huggingface/transformers/

# Manual model test
node -e "
const { pipeline } = require('@xenova/transformers');
pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2')
  .then(() => console.log('Model loaded successfully'))
  .catch(console.error);
"

# Solutions:
# 1. Check internet connection (first download)
# 2. Clear model cache
# 3. Increase timeout settings
```

### 3. Search Quality Issues

#### Poor Semantic Search Results
```javascript
// Debug search quality
async function debugSearch(query) {
  const results = await mcp.callTool('semantic_search', {
    query,
    limit: 20,
    similarityThreshold: 0.1  // Lower threshold for debugging
  });

  console.log('Query:', query);
  console.log('Results:', results.map(r => ({
    id: r.id,
    score: r.semanticScore,
    relevance: r.relevanceLevel
  })));

  return results;
}

// Common solutions:
// 1. Adjust similarity threshold
// 2. Use more specific queries
// 3. Check if relevant modules exist
// 4. Verify semantic content quality
```

#### Inconsistent Search Results
```bash
# Symptom: Same query returns different results
# Check vector file integrity
node -e "
const fs = require('fs');
const crypto = require('crypto');
const checksums = JSON.parse(fs.readFileSync('dist/vectors/checksums.json'));
const vectorData = fs.readFileSync('dist/vectors/vectors.msgpack');
const actualHash = crypto.createHash('md5').update(vectorData).digest('hex');
console.log('Expected:', checksums.vectors);
console.log('Actual:', actualHash);
console.log('Valid:', checksums.vectors === actualHash);
"

# Regenerate vectors if corrupted
npm run build:vectors
```

#### Keyword Search Degraded
```javascript
// Ensure hybrid search doesn't negatively impact keyword results
const keywordOnly = await mcp.callTool('search_instruction_modules', {
  query: 'react hooks',
  useSemanticBoost: false  // If available
});

const hybrid = await mcp.callTool('search_instruction_modules', {
  query: 'react hooks'
});

// Compare result quality
console.log('Keyword-only top result:', keywordOnly[0]);
console.log('Hybrid top result:', hybrid[0]);
```

### 4. Performance Issues

#### Slow Search Response
```javascript
// Profile search performance
async function profileSearch(query) {
  const start = performance.now();

  const results = await mcp.callTool('semantic_search', { query });

  const end = performance.now();
  console.log(`Search took ${end - start}ms for query: "${query}"`);

  return results;
}

// Performance targets:
// - Keyword search: < 50ms
// - Semantic search: < 100ms
// - Hybrid search: < 150ms

// Solutions for slow performance:
// 1. Check vector file loading time
// 2. Monitor embedding computation
// 3. Reduce result limit
// 4. Use tier filtering
```

#### High Latency After Idle
```bash
# Symptom: First search after idle period is slow
# This is expected due to model disposal
# Monitor model lifecycle
DEBUG=embedding* node dist/index.js stdio

# Solutions:
# 1. Adjust disposal timeout
# 2. Implement model pre-warming
# 3. Use persistent mode for high-traffic scenarios
```

#### Memory Growth Over Time
```javascript
// Monitor for memory leaks
const initialMemory = process.memoryUsage();
console.log('Initial memory:', initialMemory);

// After processing many queries
setInterval(() => {
  const current = process.memoryUsage();
  const growth = {
    rss: current.rss - initialMemory.rss,
    heapUsed: current.heapUsed - initialMemory.heapUsed
  };

  if (growth.rss > 100 * 1024 * 1024) {  // 100MB growth
    console.warn('Significant memory growth detected:', growth);
  }
}, 60000);
```

## Performance Optimization

### 1. Startup Optimization

#### Faster Vector Loading
```javascript
// Use MessagePack for faster loading
// Ensure vectors.msgpack exists and is valid
const fs = require('fs');
const msgpack = require('msgpackr');

// Test MessagePack loading speed
console.time('MessagePack Load');
const vectors = msgpack.unpack(fs.readFileSync('dist/vectors/vectors.msgpack'));
console.timeEnd('MessagePack Load');

// Compare with JSON
console.time('JSON Load');
const jsonVectors = JSON.parse(fs.readFileSync('dist/vectors/vectors.json'));
console.timeEnd('JSON Load');
```

#### Pre-warm Model
```javascript
// Pre-warm embedding model during startup
async function preWarmModel() {
  const embeddingService = container.get('embeddingService');
  await embeddingService.initialize();

  // Run a dummy embedding to fully initialize
  await embeddingService.embed('test warmup query');
  console.log('Model pre-warmed and ready');
}

// Call during server initialization
preWarmModel().catch(console.error);
```

### 2. Query Optimization

#### Batch Queries
```javascript
// Process multiple queries efficiently
async function batchSearch(queries) {
  const embeddingService = container.get('embeddingService');

  // Batch embed all queries
  const queryEmbeddings = await embeddingService.embedBatch(queries);

  // Search with pre-computed embeddings
  const results = queryEmbeddings.map((embedding, index) => {
    return semanticSearch.searchWithEmbedding(embedding, queries[index]);
  });

  return results;
}
```

#### Smart Caching
```javascript
// Implement intelligent query caching
class SearchCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(query, options = {}) {
    const key = this.getCacheKey(query, options);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < 300000) {  // 5 minutes
      return cached.results;
    }

    return null;
  }

  set(query, options, results) {
    const key = this.getCacheKey(query, options);

    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      results,
      timestamp: Date.now()
    });
  }

  getCacheKey(query, options) {
    return JSON.stringify({ query, options });
  }
}
```

### 3. Memory Optimization

#### Optimize Vector Storage
```javascript
// Monitor vector memory usage
function analyzeVectorMemory() {
  const vectorStore = container.get('vectorStore');
  const vectors = vectorStore.getAllVectors();

  const memoryUsage = {
    vectorCount: vectors.length,
    averageDimensions: vectors[0]?.embedding.length || 0,
    totalElements: vectors.reduce((sum, v) => sum + v.embedding.length, 0),
    estimatedMemory: vectors.reduce((sum, v) => sum + v.embedding.length * 8, 0) // 8 bytes per float64
  };

  console.log('Vector memory analysis:', memoryUsage);
  return memoryUsage;
}
```

#### Implement Vector Quantization (Future)
```javascript
// Reduce memory usage with quantization
function quantizeVector(vector, bits = 8) {
  const max = Math.max(...vector);
  const min = Math.min(...vector);
  const range = max - min;
  const scale = (Math.pow(2, bits) - 1) / range;

  return vector.map(v => Math.round((v - min) * scale));
}
```

### 4. Monitoring & Metrics

#### Performance Metrics Collection
```javascript
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      searchLatency: [],
      memoryUsage: [],
      cacheHitRate: 0,
      errorRate: 0
    };
  }

  recordSearchLatency(latency) {
    this.metrics.searchLatency.push(latency);

    // Keep only last 100 measurements
    if (this.metrics.searchLatency.length > 100) {
      this.metrics.searchLatency.shift();
    }
  }

  getAverageLatency() {
    const latencies = this.metrics.searchLatency;
    return latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
  }

  getPercentile(percentile) {
    const sorted = [...this.metrics.searchLatency].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }
}
```

#### Health Monitoring
```javascript
// Continuous health monitoring
class HealthMonitor {
  constructor() {
    this.healthChecks = [];
    this.interval = setInterval(() => this.runHealthChecks(), 60000);
  }

  addHealthCheck(name, checkFn) {
    this.healthChecks.push({ name, checkFn });
  }

  async runHealthChecks() {
    const results = {};

    for (const check of this.healthChecks) {
      try {
        results[check.name] = await check.checkFn();
      } catch (error) {
        results[check.name] = { status: 'error', error: error.message };
      }
    }

    console.log('Health check results:', results);
    return results;
  }
}

// Example health checks
const healthMonitor = new HealthMonitor();

healthMonitor.addHealthCheck('memory', () => {
  const usage = process.memoryUsage();
  const rssGB = usage.rss / 1024 / 1024 / 1024;
  return { status: rssGB < 1 ? 'healthy' : 'warning', rssGB };
});

healthMonitor.addHealthCheck('vectorStore', async () => {
  const vectorStore = container.get('vectorStore');
  const vectorCount = vectorStore.getVectorCount();
  return { status: vectorCount > 0 ? 'healthy' : 'error', vectorCount };
});
```

## Advanced Debugging

### 1. Vector Analysis
```javascript
// Analyze vector quality and distribution
function analyzeVectors() {
  const vectorStore = container.get('vectorStore');
  const vectors = vectorStore.getAllVectors();

  const analysis = {
    count: vectors.length,
    dimensions: vectors[0]?.embedding.length,
    magnitude: {
      min: Math.min(...vectors.map(v => Math.sqrt(v.embedding.reduce((sum, x) => sum + x*x, 0)))),
      max: Math.max(...vectors.map(v => Math.sqrt(v.embedding.reduce((sum, x) => sum + x*x, 0)))),
      avg: vectors.reduce((sum, v) => sum + Math.sqrt(v.embedding.reduce((s, x) => s + x*x, 0)), 0) / vectors.length
    }
  };

  console.log('Vector analysis:', analysis);
  return analysis;
}
```

### 2. Similarity Analysis
```javascript
// Debug similarity calculations
function debugSimilarity(query, moduleId) {
  const vectorStore = container.get('vectorStore');
  const embeddingService = container.get('embeddingService');

  // Get query embedding
  const queryEmbedding = await embeddingService.embed(query);

  // Get module vector
  const moduleVector = vectorStore.getVector(moduleId);

  // Calculate similarity step by step
  const dotProduct = queryEmbedding.reduce((sum, a, i) => sum + a * moduleVector.embedding[i], 0);
  const queryMagnitude = Math.sqrt(queryEmbedding.reduce((sum, x) => sum + x*x, 0));
  const moduleMagnitude = Math.sqrt(moduleVector.embedding.reduce((sum, x) => sum + x*x, 0));
  const similarity = dotProduct / (queryMagnitude * moduleMagnitude);

  console.log({
    query,
    moduleId,
    dotProduct,
    queryMagnitude,
    moduleMagnitude,
    similarity
  });

  return similarity;
}
```

### 3. Cache Analysis
```javascript
// Analyze cache performance
function analyzeCachePerformance() {
  const embeddingService = container.get('embeddingService');
  const stats = embeddingService.getCacheStats();

  const analysis = {
    hitRate: stats.hits / (stats.hits + stats.misses),
    totalQueries: stats.hits + stats.misses,
    efficiency: stats.hits / stats.misses
  };

  console.log('Cache analysis:', analysis);

  if (analysis.hitRate < 0.5) {
    console.warn('Low cache hit rate, consider increasing cache size');
  }

  return analysis;
}
```

## Best Practices

### 1. Production Deployment
- Pre-generate vectors during build process
- Use MessagePack format for production
- Monitor memory usage and set limits
- Implement health checks and monitoring
- Use process managers (PM2, systemd) for auto-restart

### 2. Development
- Use JSON format for debugging
- Enable debug logging
- Monitor cache hit rates
- Profile search performance regularly
- Test with diverse query patterns

### 3. Maintenance
- Regenerate vectors after module updates
- Monitor for vector file corruption
- Clean up old cache files periodically
- Update embedding model versions carefully
- Keep performance metrics for trend analysis

This guide should help you diagnose and resolve most issues with the vector search system while optimizing its performance for your specific use case.
