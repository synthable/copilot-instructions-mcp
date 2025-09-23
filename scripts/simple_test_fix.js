#!/usr/bin/env node

/**
 * Simple test to verify embedding service without MCP protocol
 */

import { createProductionContainer } from './dist/modules/index.js';

async function simpleTest() {
  console.log('Creating container...');
  const container = createProductionContainer();
  
  console.log('Getting embedding service...');
  const embeddingService = container.getEmbeddingService();
  
  console.log('Initializing embedding service...');
  await embeddingService.initialize();
  
  console.log('Testing embedding generation...');
  const embedding = await embeddingService.embed('test text');
  
  console.log(`Success! Generated embedding with ${embedding.length} dimensions`);
  process.exit(0);
}

simpleTest().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
