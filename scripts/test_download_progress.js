#!/usr/bin/env node

/**
 * Test script to verify download progress functionality.
 * This script will trigger model download and show progress indicators.
 */

import { EmbeddingService } from './dist/modules/embeddingService.js';
import { SemanticConfig } from './dist/modules/semanticConfig.js';
import { Logger } from './dist/modules/logger.js';

async function testDownloadProgress() {
  console.log('🚀 Testing download progress functionality...\n');

  // Create services
  const config = new SemanticConfig();
  const logger = new Logger();
  const embeddingService = new EmbeddingService(config, logger);

  // Track progress callbacks
  let progressEvents = [];

  const progressCallback = (stage, progress, message) => {
    const timestamp = new Date().toISOString();
    const progressPercent = Math.round(progress * 100);
    const logEntry = `[${timestamp}] ${stage.toUpperCase()}: ${progressPercent}% - ${message}`;

    console.log(logEntry);
    progressEvents.push({ stage, progress, message, timestamp });
  };

  try {
    console.log('Initializing embedding service with progress tracking...\n');
    await embeddingService.initialize(progressCallback);

    console.log('\n✅ Initialization complete!');
    console.log('\n📊 Progress Summary:');
    console.log(`Total progress events: ${progressEvents.length}`);

    // Group by stage
    const stageGroups = progressEvents.reduce((acc, event) => {
      if (!acc[event.stage]) acc[event.stage] = [];
      acc[event.stage].push(event);
      return acc;
    }, {});

    Object.entries(stageGroups).forEach(([stage, events]) => {
      console.log(`\n${stage.toUpperCase()} stage: ${events.length} events`);
      events.forEach(event => {
        const percent = Math.round(event.progress * 100);
        console.log(`  ${percent}%: ${event.message}`);
      });
    });

    // Test embedding generation
    console.log('\n🧪 Testing embedding generation...');
    const testText = 'This is a test for semantic embedding generation';
    const embedding = await embeddingService.generateEmbedding(testText);
    console.log(`Generated embedding with ${embedding.length} dimensions`);

  } catch (error) {
    console.error('❌ Error during test:', error.message);
    process.exit(1);
  }
}

// Run the test
testDownloadProgress().catch(console.error);
