#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting debug test...');

function runMCP(query) {
  return new Promise((resolve, reject) => {
    const serverPath = join(__dirname, 'dist', 'index.js');
    console.log('Spawning MCP server at:', serverPath);
    
    const child = spawn('node', [serverPath, 'stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    
    child.stdout.on('data', d => {
      const data = d.toString();
      console.log('STDOUT:', data);
      out += data;
    });
    
    child.stderr.on('data', d => {
      const data = d.toString();
      console.log('STDERR:', data);
      err += data;
    });
    
    child.on('close', code => {
      console.log('Process closed with code:', code);
      if (code !== 0) return reject(new Error(`Exit ${code}: ${err}`));
      try {
        const resp = JSON.parse(out.trim().split('\n')[0]);
        resolve(resp);
      } catch (e) {
        reject(new Error(`Failed to parse response: ${out}`));
      }
    });

    console.log('Sending query:', JSON.stringify(query));
    child.stdin.write(JSON.stringify(query) + '\n');
    child.stdin.end();
    
    // Kill process after 30 seconds
    setTimeout(() => {
      console.log('Timeout reached, killing process...');
      child.kill('SIGTERM');
      reject(new Error('Process timeout'));
    }, 30000);
  });
}

async function main() {
  const semanticQuery = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'semantic_search',
      arguments: { query: 'testing', limit: 3 },
    },
  };

  console.log('Running semantic_search debug test...');
  try {
    const result = await runMCP(semanticQuery);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();