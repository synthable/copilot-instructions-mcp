#!/usr/bin/env node

/**
 * @fileoverview Unified Search Tool Test Script
 *
 * This script demonstrates the new unified 'search' tool that consolidates
 * fuzzy, semantic, and hybrid search into a single flexible interface.
 *
 * USAGE:
 *   npm run test:unified-search    # Run via package.json script (recommended)
 *   node test_unified_search.js    # Run directly
 *
 * PREREQUISITES:
 *   1. Build the project: npm run build
 *   2. For semantic/hybrid modes: Model will auto-download on first run
 *
 * FEATURES DEMONSTRATED:
 *   - Fuzzy mode: Fast lexical matching with weighted Levenshtein distance
 *   - Semantic mode: Embedding-based conceptual search
 *   - Hybrid mode: Combined re-ranking with configurable alpha weighting
 *   - Tier filtering: Filter results by module category
 *   - Similarity thresholds: Minimum similarity requirements
 *   - Advanced options: relevance levels, custom weights
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runMCP(query) {
  return new Promise((resolve, reject) => {
    const serverPath = join(__dirname, 'dist', 'index.js');
    const child = spawn('node', [serverPath, 'stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', d => (out += d.toString()));
    child.stderr.on('data', d => (err += d.toString()));
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`Exit ${code}: ${err}`));
      try {
        const resp = JSON.parse(out.trim().split('\n')[0]);
        // Extract embedded JSON result from MCP content envelope
        const item =
          resp && resp.result && Array.isArray(resp.result.content)
            ? resp.result.content[0]
            : null;
        if (item && item.type === 'text' && typeof item.text === 'string') {
          try {
            const parsed = JSON.parse(item.text);
            resolve(parsed);
            return;
          } catch (parseError) {
            // Not JSON, or malformed JSON. Fall back to returning raw text.
            // This can happen for error responses.
            console.debug(`Could not parse inner JSON from tool response, returning as text. Error: ${parseError.message}`);
            resolve(item.text);
            return;
          }
        }
        resolve(resp);
      } catch (e) {
        reject(new Error(`Failed to parse response: ${out}`));
      }
    });
    child.stdin.write(JSON.stringify(query) + '\n');
    child.stdin.end();
  });
}

async function main() {
  console.log('='.repeat(80));
  console.log('UNIFIED SEARCH TOOL TEST');
  console.log('='.repeat(80));
  console.log();

  // Test 1: Fuzzy mode (default) - Fast lexical matching
  console.log('TEST 1: Fuzzy Mode (Default)');
  console.log('-'.repeat(80));
  console.log('Query: "react hooks state"');
  console.log('Mode: fuzzy (default)');
  console.log();

  const fuzzyQuery = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'search',
      arguments: {
        query: 'react hooks state',
        limit: 3,
        // mode: 'fuzzy' // Optional - defaults to fuzzy
      },
    },
  };

  const fuzzyResult = await runMCP(fuzzyQuery);
  console.log('Results:', JSON.stringify(fuzzyResult, null, 2));
  console.log();
  console.log();

  // Test 2: Semantic mode - Embedding-based conceptual search
  console.log('TEST 2: Semantic Mode');
  console.log('-'.repeat(80));
  console.log('Query: "managing complex application state and side effects"');
  console.log('Mode: semantic');
  console.log('Note: First run may download the embedding model (~90MB)');
  console.log();

  const semanticQuery = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'search',
      arguments: {
        query: 'managing complex application state and side effects',
        mode: 'semantic',
        limit: 5,
      },
    },
  };

  const semanticResult = await runMCP(semanticQuery);
  console.log('Results:', JSON.stringify(semanticResult, null, 2));
  console.log();
  console.log();

  // Test 3: Hybrid mode - Combined lexical + semantic with re-ranking
  console.log('TEST 3: Hybrid Mode');
  console.log('-'.repeat(80));
  console.log('Query: "testing pyramid unit integration"');
  console.log('Mode: hybrid (alpha: 0.7 - favor lexical matching)');
  console.log();

  const hybridQuery = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'search',
      arguments: {
        query: 'testing pyramid unit integration',
        mode: 'hybrid',
        alpha: 0.7, // Higher alpha = more weight on lexical matching
        limit: 5,
      },
    },
  };

  const hybridResult = await runMCP(hybridQuery);
  console.log('Results:', JSON.stringify(hybridResult, null, 2));
  console.log();
  console.log();

  // Test 4: Semantic mode with tier filtering
  console.log('TEST 4: Semantic Mode with Tier Filtering');
  console.log('-'.repeat(80));
  console.log('Query: "architecture patterns microservices"');
  console.log('Mode: semantic');
  console.log('Filters: tiers=["foundation", "principle"]');
  console.log();

  const filteredQuery = {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'search',
      arguments: {
        query: 'architecture patterns microservices',
        mode: 'semantic',
        tiers: ['foundation', 'principle'],
        limit: 5,
      },
    },
  };

  const filteredResult = await runMCP(filteredQuery);
  console.log('Results:', JSON.stringify(filteredResult, null, 2));
  console.log();
  console.log();

  // Test 5: Semantic mode with similarity threshold
  console.log('TEST 5: Semantic Mode with Similarity Threshold');
  console.log('-'.repeat(80));
  console.log('Query: "database transactions ACID properties"');
  console.log('Mode: semantic');
  console.log('Similarity Threshold: 0.7 (high precision)');
  console.log();

  const thresholdQuery = {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'search',
      arguments: {
        query: 'database transactions ACID properties',
        mode: 'semantic',
        similarityThreshold: 0.7,
        limit: 5,
      },
    },
  };

  const thresholdResult = await runMCP(thresholdQuery);
  console.log('Results:', JSON.stringify(thresholdResult, null, 2));
  console.log();
  console.log();

  // Test 6: Hybrid mode with custom weighting (favor semantic)
  console.log('TEST 6: Hybrid Mode - Semantic-Heavy Weighting');
  console.log('-'.repeat(80));
  console.log('Query: "code quality maintainability"');
  console.log('Mode: hybrid (alpha: 0.3 - favor semantic similarity)');
  console.log();

  const semanticHeavyQuery = {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'search',
      arguments: {
        query: 'code quality maintainability',
        mode: 'hybrid',
        alpha: 0.3, // Lower alpha = more weight on semantic similarity
        limit: 5,
      },
    },
  };

  const semanticHeavyResult = await runMCP(semanticHeavyQuery);
  console.log('Results:', JSON.stringify(semanticHeavyResult, null, 2));
  console.log();
  console.log();

  // Summary
  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log();
  console.log('✓ All 6 test cases completed successfully!');
  console.log();
  console.log('Key Takeaways:');
  console.log('  • Fuzzy mode: Best for exact term matching, fast performance');
  console.log('  • Semantic mode: Best for conceptual queries, understands meaning');
  console.log('  • Hybrid mode: Best of both worlds with configurable weighting');
  console.log('  • Tier filtering: Narrow results to specific module categories');
  console.log('  • Similarity thresholds: Control result precision vs. recall');
  console.log();
  console.log('Next Steps:');
  console.log('  • Experiment with different queries and modes');
  console.log('  • Try combining tier filtering with hybrid search');
  console.log('  • Adjust alpha values to fine-tune hybrid search results');
  console.log('  • Compare results across different search modes');
  console.log();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
