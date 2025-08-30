#!/usr/bin/env node

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Simple MCP Server Test');
console.log('==========================\n');

// Start the MCP server
const serverPath = join(__dirname, 'dist', 'index.js');
console.log('Starting server:', serverPath);

const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let serverOutput = '';
let serverError = '';

server.stdout.on('data', (data) => {
  serverOutput += data.toString();
});

server.stderr.on('data', (data) => {
  serverError += data.toString();
  console.log('Server stderr:', data.toString().trim());
});

// Wait for server to start
setTimeout(() => {
  console.log('📋 Testing list_instruction_modules tool\n');
  
  const listRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "list_instruction_modules",
      arguments: {}
    }
  };

  server.stdin.write(JSON.stringify(listRequest) + '\n');

  setTimeout(() => {
    console.log('Server output:');
    console.log(serverOutput);
    
    if (serverError) {
      console.log('\nServer errors:');
      console.log(serverError);
    }
    
    server.kill('SIGTERM');
  }, 2000);
}, 1000);

server.on('close', (code) => {
  console.log(`\nServer process exited with code ${code}`);
});
