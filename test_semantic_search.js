#!/usr/bin/env node

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
  const semanticQuery = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'semantic_search',
      arguments: { query: 'microservices architecture patterns deployment', limit: 5 },
    },
  };

  const hybridQuery = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'hybrid_search',
      arguments: { query: 'testing pyramid unit integration', limit: 5, alpha: 0.6 },
    },
  };

  console.log('Running semantic_search... (first call may download model)');
  const s = await runMCP(semanticQuery);
  console.log(s);

  console.log('Running hybrid_search...');
  const h = await runMCP(hybridQuery);
  console.log(h);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
