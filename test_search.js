#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test cases with expected results
const testCases = [
  {
    name: "Search for testing and code quality",
    query: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "search_instruction_modules",
        arguments: {
          query: "testing code quality",
          limit: 3
        }
      }
    },
    expectations: {
      totalResults: (count) => count > 50, // Should find many results
      returnedResults: 3,
      topResultContains: ["Design for Testability", "Clean Code", "Code Review"],
      requiredFields: ["score", "matchedFields", "contentMatches"],
      minScore: 1.5 // Minimum score for top result
    }
  },
  {
    name: "Search for API and REST authentication",
    query: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "search_instruction_modules",
        arguments: {
          query: "API REST authentication",
          limit: 2
        }
      }
    },
    expectations: {
      totalResults: (count) => count > 30,
      returnedResults: 2,
      topResultContains: ["API Design", "API Gateway"],
      requiredFields: ["score", "matchedFields"],
      minScore: 1.0
    }
  },
  {
    name: "Empty query validation",
    query: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "search_instruction_modules",
        arguments: {
          query: ""
        }
      }
    },
    expectations: {
      hasError: true,
      errorMessage: "Search query cannot be empty",
      emptyResults: true
    }
  },
  {
    name: "Single term search",
    query: {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "search_instruction_modules",
        arguments: {
          query: "design",
          limit: 5
        }
      }
    },
    expectations: {
      totalResults: (count) => count > 5,
      returnedResults: 5,
      topResultContains: ["Design", "design"],
      requiredFields: ["score", "matchedFields"],
      minScore: 0.8
    }
  },
  {
    name: "Tool listing includes search tool",
    query: {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/list"
    },
    expectations: {
      toolExists: "search_instruction_modules",
      toolDescription: "Search instruction modules using fuzzy matching",
      requiredParams: ["query"]
    }
  }
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runMCPCommand(query) {
  return new Promise((resolve, reject) => {
    const serverPath = join(__dirname, 'dist', 'index.js');
    const child = spawn('node', [serverPath, 'stdio'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${errorOutput}`));
      } else {
        // Parse the JSON response (first line should be the response)
        const lines = output.trim().split('\n');
        try {
          const response = JSON.parse(lines[0]);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse JSON response: ${output}`));
        }
      }
    });

    child.on('error', (error) => {
      reject(error);
    });

    // Send the query
    child.stdin.write(JSON.stringify(query) + '\n');
    child.stdin.end();
  });
}

function validateSearchResult(result, expectations) {
  const errors = [];

  if (expectations.hasError) {
    if (!result.result?.content?.[0]?.text) {
      errors.push("Expected error response but got different format");
      return errors;
    }
    
    const responseData = JSON.parse(result.result.content[0].text);
    
    if (!responseData.error) {
      errors.push("Expected error field in response");
    } else if (!responseData.error.includes(expectations.errorMessage)) {
      errors.push(`Expected error message "${expectations.errorMessage}" but got "${responseData.error}"`);
    }
    
    if (expectations.emptyResults && (!responseData.results || responseData.results.length > 0)) {
      errors.push("Expected empty results array");
    }
    
    return errors;
  }

  if (expectations.toolExists) {
    const tools = result.result?.tools;
    if (!tools) {
      errors.push("Expected tools array in response");
      return errors;
    }
    
    const searchTool = tools.find(tool => tool.name === expectations.toolExists);
    if (!searchTool) {
      errors.push(`Expected tool "${expectations.toolExists}" not found`);
    } else {
      if (expectations.toolDescription && !searchTool.description.includes(expectations.toolDescription)) {
        errors.push(`Tool description doesn't contain "${expectations.toolDescription}"`);
      }
      
      if (expectations.requiredParams) {
        const requiredParams = searchTool.inputSchema?.required || [];
        for (const param of expectations.requiredParams) {
          if (!requiredParams.includes(param)) {
            errors.push(`Required parameter "${param}" not found in tool schema`);
          }
        }
      }
    }
    
    return errors;
  }

  // Parse search results
  if (!result.result?.content?.[0]?.text) {
    errors.push("Expected search result content");
    return errors;
  }

  const searchData = JSON.parse(result.result.content[0].text);

  // Validate total results
  if (expectations.totalResults) {
    if (typeof expectations.totalResults === 'function') {
      if (!expectations.totalResults(searchData.totalResults)) {
        errors.push(`Total results ${searchData.totalResults} doesn't meet expectation`);
      }
    } else if (searchData.totalResults !== expectations.totalResults) {
      errors.push(`Expected ${expectations.totalResults} total results, got ${searchData.totalResults}`);
    }
  }

  // Validate returned results count
  if (expectations.returnedResults !== undefined) {
    if (searchData.returnedResults !== expectations.returnedResults) {
      errors.push(`Expected ${expectations.returnedResults} returned results, got ${searchData.returnedResults}`);
    }
  }

  // Validate results structure
  if (searchData.results && searchData.results.length > 0) {
    const topResult = searchData.results[0];
    
    // Check required fields
    if (expectations.requiredFields) {
      for (const field of expectations.requiredFields) {
        if (!(field in topResult)) {
          errors.push(`Required field "${field}" missing from top result`);
        }
      }
    }
    
    // Check minimum score
    if (expectations.minScore !== undefined) {
      if (topResult.score < expectations.minScore) {
        errors.push(`Top result score ${topResult.score} below minimum ${expectations.minScore}`);
      }
    }
    
    // Check if top result contains expected terms
    if (expectations.topResultContains) {
      const found = expectations.topResultContains.some(term => 
        topResult.name.toLowerCase().includes(term.toLowerCase()) ||
        topResult.description.toLowerCase().includes(term.toLowerCase())
      );
      
      if (!found) {
        errors.push(`Top result doesn't contain any of: ${expectations.topResultContains.join(', ')}`);
      }
    }
  }

  return errors;
}

async function runTests() {
  log('cyan', '🧪 Running MCP Search Tool Tests');
  log('cyan', '=====================================\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    log('blue', `📋 Running: ${testCase.name}`);
    
    try {
      const result = await runMCPCommand(testCase.query);
      const errors = validateSearchResult(result, testCase.expectations);
      
      if (errors.length === 0) {
        log('green', '✅ PASSED\n');
        passed++;
      } else {
        log('red', '❌ FAILED');
        errors.forEach(error => log('red', `   • ${error}`));
        console.log('');
        failed++;
      }
    } catch (error) {
      log('red', '❌ ERROR');
      log('red', `   • ${error.message}\n`);
      failed++;
    }
  }

  // Summary
  log('cyan', '=====================================');
  log('cyan', '📊 Test Summary');
  log('green', `✅ Passed: ${passed}`);
  
  if (failed > 0) {
    log('red', `❌ Failed: ${failed}`);
    process.exit(1);
  } else {
    log('green', '🎉 All tests passed!');
  }
}

// Run the tests
runTests().catch(error => {
  log('red', `Fatal error: ${error.message}`);
  process.exit(1);
});