#!/usr/bin/env node
/**
 * Test script to list available modules
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function listModules() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');

    // List all modules
    const result = await client.callTool({
      name: 'list_instruction_modules',
      arguments: {},
    });

    const data = JSON.parse(result.content[0].text);
    console.log('Total modules:', data.modules.length);
    console.log('\nFirst 5 modules:');
    data.modules.slice(0, 5).forEach(mod => {
      console.log(`  - ID: ${mod.id}`);
      console.log(`    Name: ${mod.name}`);
      console.log(`    Category: ${mod.category}`);
      console.log(`    File: ${mod.filePath}\n`);
    });

    // Find foundation modules
    const foundationModules = data.modules.filter(m => m.category === 'Foundation');
    console.log('\nFoundation modules:', foundationModules.length);
    if (foundationModules.length > 0) {
      console.log('First foundation module:');
      console.log('  - ID:', foundationModules[0].id);
      console.log('  - Name:', foundationModules[0].name);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

listModules().catch(console.error);
