#!/usr/bin/env node

/**
 * Script to generate known test embeddings and store them for use with test_semantic_features.js
 * This creates a baseline of test embeddings for consistent testing across different scenarios.
 */

import { createProductionContainer } from './dist/modules/index.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { cosine } from './dist/modules/semantic.js';

// Test texts organized by category for comprehensive testing
const testTexts = {
  // Short, simple texts
  basic: [
    'hello world',
    'test text',
    'simple example',
    'quick brown fox',
    'the cat sat on the mat'
  ],
  
  // Technical programming concepts
  programming: [
    'dependency injection container pattern',
    'semantic search algorithms',
    'machine learning embeddings',
    'TypeScript interface definitions',
    'unit testing with vitest framework'
  ],
  
  // Architecture and design patterns
  architecture: [
    'microservices architecture patterns',
    'event-driven architecture design',
    'domain-driven design principles',
    'clean architecture boundaries',
    'hexagonal architecture ports adapters'
  ],
  
  // Similar texts for similarity testing
  similar: [
    'artificial intelligence and machine learning',
    'AI and ML technologies',
    'machine learning and artificial intelligence',
    'AI ML systems and algorithms'
  ],
  
  // Dissimilar texts for contrast testing
  dissimilar: [
    'cooking recipes and kitchen techniques',
    'mathematical equations and formulas',
    'historical events and dates',
    'gardening tips and plant care'
  ],
  
  // Edge cases
  edge: [
    'a',  // single character
    'The quick brown fox jumps over the lazy dog'.repeat(30), // long text (will be truncated)
    '',   // empty string (will cause error - expected)
    '   ',  // whitespace only
    '🚀🎉✨💻🔥', // emojis only
    'Mixed content with 🚀 emojis and normal text',
    'UPPERCASE TEXT ONLY',
    'lowercase text only',
    'Numbers 123456789 and symbols @#$%^&*()'
  ]
};

async function generateTestEmbeddings() {
  console.log('🔧 Generating known test embeddings...\n');

  // Initialize the embedding service
  const container = createProductionContainer();
  const embeddingService = container.getEmbeddingService();
  
  console.log('Initializing embedding service...');
  await embeddingService.initialize();
  
  const results = {
    metadata: {
      generatedAt: new Date().toISOString(),
      modelName: 'Xenova/all-mpnet-base-v2',
      embeddingDimensions: 768,
      maxInputLength: 1536,
      description: 'Known test embeddings for consistent testing of semantic search features'
    },
    embeddings: {}
  };

  // Process each category
  for (const [category, texts] of Object.entries(testTexts)) {
    console.log(`\n📂 Processing category: ${category}`);
    results.embeddings[category] = [];
    
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      console.log(`  ${i + 1}/${texts.length}: "${text.length > 50 ? text.substring(0, 50) + '...' : text}"`);
      
      try {
        // Handle the empty string case specially
        if (text === '') {
          console.log('    ⚠️  Skipping empty string (expected to cause error)');
          results.embeddings[category].push({
            text: text,
            originalLength: text.length,
            embedding: null,
            error: 'Empty string not allowed'
          });
          continue;
        }
        
        const embedding = await embeddingService.embed(text);
        
        results.embeddings[category].push({
          text: text,
          originalLength: text.length,
          truncatedLength: Math.min(text.length, 1536),
          embedding: Array.from(embedding), // Convert Float32Array to regular array for JSON
          embeddingMagnitude: Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0)),
          wasTruncated: text.length > 1536
        });
        
        console.log(`    ✅ Generated embedding (${embedding.length} dims, magnitude: ${Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0)).toFixed(4)})`);
        
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
        results.embeddings[category].push({
          text: text,
          originalLength: text.length,
          embedding: null,
          error: error.message
        });
      }
    }
  }

  // Calculate similarity matrix for similar texts
  console.log('\n🔍 Computing similarity matrix for "similar" category...');
  const similarEmbeddings = results.embeddings.similar.filter(item => item.embedding !== null);
  if (similarEmbeddings.length >= 2) {
    results.similarityMatrix = [];
    
    for (let i = 0; i < similarEmbeddings.length; i++) {
      const row = [];
      for (let j = 0; j < similarEmbeddings.length; j++) {
        if (i === j) {
          row.push(1.0); // Self-similarity
        } else {
          const similarity = cosine(similarEmbeddings[i].embedding, similarEmbeddings[j].embedding);
          row.push(similarity);
        }
      }
      results.similarityMatrix.push(row);
      console.log(`  Row ${i}: ${row.map(val => val.toFixed(4)).join(', ')}`);
    }
  }

  // Generate summary statistics
  const allEmbeddings = Object.values(results.embeddings)
    .flat()
    .filter(item => item.embedding !== null);
    
  results.statistics = {
    totalTexts: Object.values(testTexts).flat().length,
    successfulEmbeddings: allEmbeddings.length,
    failedEmbeddings: Object.values(results.embeddings).flat().length - allEmbeddings.length,
    averageMagnitude: allEmbeddings.reduce((sum, item) => sum + item.embeddingMagnitude, 0) / allEmbeddings.length,
    truncatedTexts: allEmbeddings.filter(item => item.wasTruncated).length,
    categoryCounts: Object.fromEntries(
      Object.entries(results.embeddings).map(([category, items]) => [
        category, 
        items.filter(item => item.embedding !== null).length
      ])
    )
  };

  // Save to file
  const outputPath = join(process.cwd(), 'test-embeddings.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  console.log('\n📊 Summary Statistics:');
  console.log(`  Total texts: ${results.statistics.totalTexts}`);
  console.log(`  Successful embeddings: ${results.statistics.successfulEmbeddings}`);
  console.log(`  Failed embeddings: ${results.statistics.failedEmbeddings}`);
  console.log(`  Average magnitude: ${results.statistics.averageMagnitude.toFixed(4)}`);
  console.log(`  Truncated texts: ${results.statistics.truncatedTexts}`);
  console.log(`  Category counts:`, results.statistics.categoryCounts);
  
  console.log(`\n✅ Test embeddings saved to: ${outputPath}`);
  console.log('\n🎯 Usage examples:');
  console.log('  - Load embeddings: const testData = JSON.parse(fs.readFileSync("test-embeddings.json"))');
  console.log('  - Get basic embeddings: testData.embeddings.basic');
  console.log('  - Check similarity matrix: testData.similarityMatrix');
  console.log('  - Verify consistency: Compare newly generated embeddings with stored ones');
  
  process.exit(0);
}

// Run the script
generateTestEmbeddings().catch(error => {
  console.error('❌ Error generating test embeddings:', error);
  process.exit(1);
});
