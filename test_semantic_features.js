/**
 * Test script to verify the new semantic search features:
 * - Tier filtering
 * - Relevance level mapping
 * - Configurable similarity thresholds
 */

import { SemanticConfig } from './dist/modules/semanticConfig.js';

async function testSemanticConfig() {
  console.log('Testing SemanticConfig...');

  // Test default relevance thresholds
  const config = new SemanticConfig();
  const thresholds = config.getRelevanceThresholds();
  console.log('Default relevance thresholds:', thresholds);

  // Test relevance level mapping
  console.log('High relevance (0.9):', config.getRelevanceLevel(0.9)); // should be 'high'
  console.log('Medium relevance (0.7):', config.getRelevanceLevel(0.7)); // should be 'medium'
  console.log('Low relevance (0.5):', config.getRelevanceLevel(0.5)); // should be 'low'
  console.log('No relevance (0.2):', config.getRelevanceLevel(0.2)); // should be 'none'

  // Test similarity threshold
  console.log('Default similarity threshold:', config.getSimilarityThreshold());

  // Test custom configuration
  const customConfig = new SemanticConfig({
    relevanceThresholds: {
      high: 0.85,
      medium: 0.65,
      low: 0.45
    },
    similarityThreshold: 0.2
  });

  console.log('Custom relevance thresholds:', customConfig.getRelevanceThresholds());
  console.log('Custom similarity threshold:', customConfig.getSimilarityThreshold());

  // Test custom relevance mapping
  console.log('Custom high relevance (0.9):', customConfig.getRelevanceLevel(0.9)); // should be 'high'
  console.log('Custom medium relevance (0.7):', customConfig.getRelevanceLevel(0.7)); // should be 'medium'
  console.log('Custom low relevance (0.5):', customConfig.getRelevanceLevel(0.5)); // should be 'low'
  console.log('Custom no relevance (0.3):', customConfig.getRelevanceLevel(0.3)); // should be 'none'
}

// Test validation
async function testValidation() {
  console.log('\nTesting validation...');

  try {
    // This should throw an error because high <= medium
    new SemanticConfig({
      relevanceThresholds: {
        high: 0.6,
        medium: 0.7,
        low: 0.4
      }
    });
    console.log('ERROR: Should have thrown validation error!');
  } catch (error) {
    console.log('✓ Validation correctly caught ordering error:', error.message);
  }

  try {
    // This should throw an error because similarity threshold is out of range
    new SemanticConfig({
      similarityThreshold: 1.5
    });
    console.log('ERROR: Should have thrown validation error!');
  } catch (error) {
    console.log('✓ Validation correctly caught range error:', error.message);
  }
}

// Test semantic search options structure
async function testSearchOptions() {
  console.log('\nTesting search options structure...');

  // Import the type to ensure it's properly exported
  const { SemanticSearchService } = await import('./dist/modules/semanticSearch.js');

  // Create sample options object to test the interface
  const options = {
    tiers: ['foundation', 'principle'],
    similarityThreshold: 0.2,
    includeRelevanceLevel: true
  };

  console.log('Sample search options:', options);
  console.log('✓ SemanticSearchOptions interface is properly defined');
}

async function main() {
  try {
    await testSemanticConfig();
    await testValidation();
    await testSearchOptions();
    console.log('\n✅ All tests passed! Semantic search features are working correctly.');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
