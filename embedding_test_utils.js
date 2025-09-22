#!/usr/bin/env node

/**
 * @fileoverview Embedding Test Utilities - Comprehensive CLI toolkit for semantic search testing and analysis
 *
 * OVERVIEW:
 * Professional-grade utility suite for testing, debugging, and analyzing semantic search functionality.
 * Works with pre-generated test embeddings to provide consistent, reproducible testing of embedding
 * services, similarity calculations, and semantic search performance.
 *
 * USE CASES:
 * 1. Embedding consistency testing - verify model produces consistent embeddings
 * 2. Similarity analysis - analyze semantic relationships between modules
 * 3. Performance benchmarking - measure embedding generation speed
 * 4. Semantic search debugging - test search functionality with known data
 * 5. Category analysis - understand clustering within module categories
 * 6. Quality assurance - validate semantic search before deployment
 *
 * PREREQUISITES:
 * 1. Build the project: npm run build
 * 2. Generate test embeddings: node generate_test_embeddings.js
 * 3. Ensure test-embeddings.json exists in project root
 *
 * USAGE:
 *   node embedding_test_utils.js <command> [args]
 *
 * AVAILABLE COMMANDS:
 *
 * summary                     - Show overview of test embeddings data
 * consistency [count]         - Test embedding consistency (default: 5 samples)
 * similar <text>              - Find most similar stored embeddings to text
 * analyze                     - Analyze similarities within categories
 * benchmark [count]           - Benchmark embedding generation speed (default: 10)
 * search <query>              - Test semantic search with query
 * help                        - Show detailed help
 *
 * EXAMPLES:
 *
 * # Show test data overview
 * node embedding_test_utils.js summary
 *
 * # Test if model produces consistent embeddings (critical for reliability)
 * node embedding_test_utils.js consistency 10
 *
 * # Find modules most similar to a concept
 * node embedding_test_utils.js similar "machine learning algorithms"
 * node embedding_test_utils.js similar "database design patterns"
 *
 * # Analyze how similar modules are within each category
 * node embedding_test_utils.js analyze
 *
 * # Benchmark embedding generation performance
 * node embedding_test_utils.js benchmark 20
 *
 * # Test semantic search functionality
 * node embedding_test_utils.js search "typescript unit testing frameworks"
 * node embedding_test_utils.js search "API authentication best practices"
 *
 * OUTPUT FORMATS:
 * - summary: Statistics about test embeddings and categories
 * - consistency: Similarity scores (>0.999 = consistent, <0.999 = inconsistent)
 * - similar: Top 5 most similar items with similarity scores
 * - analyze: Average, min, max similarities within each category
 * - benchmark: Average/min/max times, throughput (embeddings/second)
 * - search: Ranked search results with scores and descriptions
 *
 * PERFORMANCE METRICS:
 * - Consistency: >99.9% similarity for identical text (model stability)
 * - Similarity: 0.0-1.0 range (1.0 = identical, 0.0 = completely different)
 * - Benchmark: Typical range 50-200ms per embedding depending on hardware
 * - Search: Results ranked by semantic similarity, not keyword matching
 *
 * TROUBLESHOOTING:
 * - "Test embeddings not found": Run generate_test_embeddings.js first
 * - Service initialization errors: Ensure npm run build completed successfully
 * - Slow performance: Normal for first run (model download), faster afterwards
 * - Low consistency scores: May indicate model loading issues or hardware problems
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { readFileSync } from 'fs';
import { createProductionContainer } from './dist/modules/index.js';
import { cosine } from './dist/modules/semantic.js';

// Load test embeddings
const testEmbeddings = JSON.parse(readFileSync('./test-embeddings.json', 'utf8'));

class EmbeddingTestUtils {
  constructor() {
    this.testData = testEmbeddings;
    this.container = null;
    this.embeddingService = null;
    this.semanticSearchService = null;
  }

  async initialize() {
    console.log('🔧 Initializing services...');
    this.container = createProductionContainer();
    this.embeddingService = this.container.getEmbeddingService();
    this.semanticSearchService = this.container.getSemanticSearchService();
    
    await this.embeddingService.initialize();
    console.log('✅ Services initialized');
  }

  // Get embeddings by category
  getEmbeddingsByCategory(category) {
    return this.testData.embeddings[category] || [];
  }

  // Find most similar stored embedding to a given text
  async findMostSimilar(queryText, category = null) {
    console.log(`🔍 Finding most similar to: "${queryText}"`);
    
    // Generate embedding for query text
    const queryEmbedding = await this.embeddingService.embed(queryText);
    
    let allEmbeddings = [];
    if (category) {
      allEmbeddings = this.getEmbeddingsByCategory(category);
    } else {
      // Search all categories
      allEmbeddings = Object.values(this.testData.embeddings)
        .flat()
        .filter(item => item.embedding !== null);
    }

    // Calculate similarities
    const similarities = allEmbeddings.map(item => ({
      ...item,
      similarity: cosine(Array.from(queryEmbedding), item.embedding)
    }));

    // Sort by similarity (highest first)
    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities.slice(0, 5); // Top 5 most similar
  }

  // Test embedding consistency
  async testConsistency(sampleSize = 5) {
    console.log(`🧪 Testing embedding consistency (${sampleSize} samples)...`);
    
    const allEmbeddings = Object.values(this.testData.embeddings)
      .flat()
      .filter(item => item.embedding !== null)
      .slice(0, sampleSize);

    const results = [];
    
    for (const testCase of allEmbeddings) {
      const newEmbedding = await this.embeddingService.embed(testCase.text);
      const similarity = cosine(testCase.embedding, Array.from(newEmbedding));
      
      results.push({
        text: testCase.text,
        similarity: similarity,
        consistent: similarity > 0.999
      });
      
      console.log(`  "${testCase.text.substring(0, 40)}"... - ${similarity.toFixed(6)} ${similarity > 0.999 ? '✅' : '⚠️'}`);
    }

    const consistentCount = results.filter(r => r.consistent).length;
    console.log(`
Consistency: ${consistentCount}/${results.length} (${(consistentCount/results.length*100).toFixed(1)}%)`);
    
    return results;
  }

  // Analyze category similarities
  analyzeCategorySimilarities() {
    console.log('📊 Analyzing category similarities...');
    
    const categories = Object.keys(this.testData.embeddings);
    const results = {};

    for (const category of categories) {
      const embeddings = this.getEmbeddingsByCategory(category).filter(item => item.embedding !== null);
      if (embeddings.length < 2) continue;

      const similarities = [];
      for (let i = 0; i < embeddings.length - 1; i++) {
        for (let j = i + 1; j < embeddings.length; j++) {
          similarities.push(cosine(embeddings[i].embedding, embeddings[j].embedding));
        }
      }

      results[category] = {
        count: embeddings.length,
        avgSimilarity: similarities.reduce((a, b) => a + b, 0) / similarities.length,
        minSimilarity: Math.min(...similarities),
        maxSimilarity: Math.max(...similarities)
      };

      console.log(`  ${category}: avg=${results[category].avgSimilarity.toFixed(4)}, min=${results[category].minSimilarity.toFixed(4)}, max=${results[category].maxSimilarity.toFixed(4)} (${results[category].count} items)`);
    }

    return results;
  }

  // Test semantic search with known embeddings
  async testSemanticSearch(query, options = {}) {
    console.log(`🔍 Testing semantic search: "${query}"`);
    
    // Build the search index first
    await this.semanticSearchService.buildIndex();
    
    // Perform search
    const results = await this.semanticSearchService.search(query, 5, options);
    
    console.log(`Found ${results.length} results:`);
    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.id} (score: ${result.score.toFixed(4)})`);
      console.log(`     "${result.description.substring(0, 80)}"...`);
    });

    return results;
  }

  // Benchmark embedding generation speed
  async benchmarkSpeed(sampleSize = 10) {
    console.log(`⚡ Benchmarking embedding speed (${sampleSize} samples)...`);
    
    const samples = Object.values(this.testData.embeddings)
      .flat()
      .filter(item => item.embedding !== null)
      .slice(0, sampleSize);

    const times = [];
    
    for (const sample of samples) {
      const start = performance.now();
      await this.embeddingService.embed(sample.text);
      const end = performance.now();
      
      times.push(end - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    console.log(`  Average: ${avgTime.toFixed(2)}ms`);
    console.log(`  Min: ${minTime.toFixed(2)}ms`);
    console.log(`  Max: ${maxTime.toFixed(2)}ms`);
    console.log(`  Throughput: ${(1000 / avgTime).toFixed(1)} embeddings/second`);

    return { avgTime, minTime, maxTime, times };
  }

  // Display test data summary
  showSummary() {
    console.log('📋 Test Embeddings Summary:');
    console.log(`  Generated: ${this.testData.metadata.generatedAt}`);
    console.log(`  Model: ${this.testData.metadata.modelName}`);
    console.log(`  Dimensions: ${this.testData.metadata.embeddingDimensions}`);
    console.log(`  Total successful: ${this.testData.statistics.successfulEmbeddings}`);
    console.log(`  Total failed: ${this.testData.statistics.failedEmbeddings}`);
    console.log(`  Categories: ${Object.keys(this.testData.embeddings).join(', ')}`);
    
    console.log('
📊 Category breakdown:');
    Object.entries(this.testData.statistics.categoryCounts).forEach(([category, count]) => {
      console.log(`  ${category}: ${count} embeddings`);
    });
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  const utils = new EmbeddingTestUtils();
  
  try {
    switch (command) {
      case 'summary':
        utils.showSummary();
        break;
        
      case 'consistency':
        await utils.initialize();
        await utils.testConsistency(parseInt(args[1]) || 5);
        break;
        
      case 'similar':
        await utils.initialize();
        const query = args.slice(1).join(' ') || 'machine learning';
        const results = await utils.findMostSimilar(query);
        console.log(`
Top 5 most similar to "${query}":`);
        results.forEach((r, i) => {
          console.log(`  ${i+1}. "${r.text}" (${r.similarity.toFixed(4)})`);
        });
        break;
        
      case 'analyze':
        utils.analyzeCategorySimilarities();
        break;
        
      case 'benchmark':
        await utils.initialize();
        await utils.benchmarkSpeed(parseInt(args[1]) || 10);
        break;
        
      case 'search':
        await utils.initialize();
        const searchQuery = args.slice(1).join(' ') || 'typescript testing';
        await utils.testSemanticSearch(searchQuery);
        break;
        
      case 'help':
      default:
        console.log('🛠️  Embedding Test Utilities');
        console.log('
Usage: node embedding_test_utils.js <command> [args]');
        console.log('
Commands:');
        console.log('  summary                    - Show test embeddings summary');
        console.log('  consistency [count]        - Test embedding consistency (default: 5 samples)');
        console.log('  similar <text>             - Find most similar stored embeddings');
        console.log('  analyze                    - Analyze category similarities');
        console.log('  benchmark [count]          - Benchmark embedding speed (default: 10 samples)');
        console.log('  search <query>             - Test semantic search with query');
        console.log('  help                       - Show this help');
        console.log('
Examples:');
        console.log('  node embedding_test_utils.js summary');
        console.log('  node embedding_test_utils.js consistency 10');
        console.log('  node embedding_test_utils.js similar "artificial intelligence"');
        console.log('  node embedding_test_utils.js search "typescript unit testing"');
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
