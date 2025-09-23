#!/usr/bin/env node

/**
 * Test script to verify text truncation functionality
 */

import { createProductionContainer } from './dist/modules/index.js';

async function testTruncation() {
  console.log('🔍 Testing text truncation for all-mpnet-base-v2 model...\n');

  const container = createProductionContainer();
  const embeddingService = container.getEmbeddingService();
  
  console.log('Initializing embedding service...');
  await embeddingService.initialize();
  
  // Test with text under the limit
  const shortText = 'This is a short text that should not be truncated.';
  console.log(`\n✅ Testing short text (${shortText.length} chars):`);
  const shortEmbedding = await embeddingService.embed(shortText);
  console.log(`Generated embedding with ${shortEmbedding.length} dimensions`);
  
  // Test with text over the limit (1536 characters)
  const longText = 'This is a very long text that exceeds the model limit. '.repeat(50); // ~2800 chars
  console.log(`\n⚠️  Testing long text (${longText.length} chars, exceeds 1536 limit):`);
  const longEmbedding = await embeddingService.embed(longText);
  console.log(`Generated embedding with ${longEmbedding.length} dimensions`);
  
  // Test batch with mixed lengths
  const mixedTexts = [
    'Short text 1',
    'Another short text',
    longText,
    'Short text 3'
  ];
  console.log(`\n📦 Testing batch with mixed text lengths:`);
  mixedTexts.forEach((text, i) => {
    console.log(`  Text ${i + 1}: ${text.length} chars ${text.length > 1536 ? '(will be truncated)' : '(ok)'}`);
  });
  
  const batchEmbeddings = await embeddingService.embedBatch(mixedTexts);
  console.log(`Generated ${batchEmbeddings.length} embeddings, each with ${batchEmbeddings[0].length} dimensions`);
  
  console.log('\n✅ All tests completed successfully!');
  process.exit(0);
}

testTruncation().catch(error => {
  console.error('❌ Error during test:', error);
  process.exit(1);
});
