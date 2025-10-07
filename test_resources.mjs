#!/usr/bin/env node
/**
 * Test script for MCP resource reading functionality
 * Tests direct resource access via module:// URIs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function testResourceReading() {
  console.log('🧪 Testing MCP Resource Reading\n');

  // Start the MCP server process
  const serverProcess = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

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

    // Test 1: Read resource with default (markdown) format
    console.log('Test 1: Reading resource with default format');
    console.log('URI: module://technology/testing/jest/mocking\n');
    try {
      const result1 = await client.readResource({
        uri: 'module://technology/testing/jest/mocking',
      });
      console.log('✅ Success!');
      console.log('Contents:', result1.contents.length, 'item(s)');
      console.log('MIME Type:', result1.contents[0].mimeType);
      console.log('Text preview:', result1.contents[0].text.substring(0, 200) + '...\n');
    } catch (err) {
      console.error('❌ Failed:', err.message, '\n');
    }

    // Test 2: Read resource with explicit YAML format
    console.log('Test 2: Reading resource with YAML format');
    console.log('URI: module://technology/testing/jest/mocking/yaml\n');
    try {
      const result2 = await client.readResource({
        uri: 'module://technology/testing/jest/mocking/yaml',
      });
      console.log('✅ Success!');
      console.log('Contents:', result2.contents.length, 'item(s)');
      console.log('MIME Type:', result2.contents[0].mimeType);
      console.log('Text preview:', result2.contents[0].text.substring(0, 200) + '...\n');
    } catch (err) {
      console.error('❌ Failed:', err.message, '\n');
    }

    // Test 3: Read resource with RAW format
    console.log('Test 3: Reading resource with RAW format');
    console.log('URI: module://principle/testing/testing-pyramid/raw\n');
    try {
      const result3 = await client.readResource({
        uri: 'module://principle/testing/testing-pyramid/raw',
      });
      console.log('✅ Success!');
      console.log('Contents:', result3.contents.length, 'item(s)');
      console.log('MIME Type:', result3.contents[0].mimeType);
      console.log('Text preview:', result3.contents[0].text.substring(0, 200) + '...\n');
    } catch (err) {
      console.error('❌ Failed:', err.message, '\n');
    }

    // Test 4: Try invalid URI
    console.log('Test 4: Testing error handling with invalid URI');
    console.log('URI: module://invalid/module/does/not/exist\n');
    try {
      const result4 = await client.readResource({
        uri: 'module://invalid/module/does/not/exist',
      });
      console.log('❌ Should have failed but succeeded');
    } catch (err) {
      console.log('✅ Correctly returned error:', err.message, '\n');
    }

    // Test 5: Try malformed URI
    console.log('Test 5: Testing error handling with malformed URI');
    console.log('URI: file://foundation/reasoning/systems-thinking\n');
    try {
      const result5 = await client.readResource({
        uri: 'file://foundation/reasoning/systems-thinking',
      });
      console.log('❌ Should have failed but succeeded');
    } catch (err) {
      console.log('✅ Correctly returned error:', err.message, '\n');
    }

    console.log('✅ All tests completed!\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    serverProcess.kill();
  }
}

testResourceReading().catch(console.error);
