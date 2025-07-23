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
      errorMessage: "Failed to search instruction modules: Search query must be a non-empty string",
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
      toolDescription: "Perform intelligent fuzzy search across all instruction modules",
      requiredParams: ["query"]
    }
  },
  {
    name: "Get modules content with valid IDs",
    query: {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "get_modules_content",
        arguments: {
          moduleIds: ["principle.testing.testing-pyramid", "technology.testing.jest.mocking"]
        }
      }
    },
    expectations: {
      successResponse: true,
      hasContent: true,
      requestedModules: 2,
      processedModules: 2,
      contentContains: ["# The Testing Pyramid", "# Jest Mocking", "**ID:** `principle.testing.testing-pyramid`"]
    }
  },
  {
    name: "Get modules content with invalid ID",
    query: {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "get_modules_content",
        arguments: {
          moduleIds: ["invalid.module.id", "principle.testing.testing-pyramid"]
        }
      }
    },
    expectations: {
      successResponse: true,
      hasContent: true,
      hasErrors: true,
      requestedModules: 2,
      processedModules: 1,
      errorContains: "Module with ID \"invalid.module.id\" not found"
    }
  },
  {
    name: "Get modules content with empty array",
    query: {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "get_modules_content",
        arguments: {
          moduleIds: []
        }
      }
    },
    expectations: {
      hasError: true,
      errorMessage: "Failed to get modules content: At least one module ID is required",
      failureResponse: true
    }
  },
  {
    name: "Tool listing includes get_modules_content tool",
    query: {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/list"
    },
    expectations: {
      toolExists: "get_modules_content",
      toolDescription: "Compile and combine multiple instruction modules into a cohesive markdown document",
      requiredParams: ["moduleIds"]
    }
  },
  {
    name: "Prompt listing includes bootstrap prompts",
    query: {
      jsonrpc: "2.0",
      id: 10,
      method: "prompts/list"
    },
    expectations: {
      promptExists: "bootstrap-prompt",
      promptDescription: "Comprehensive bootstrap prompt for dynamic system prompt generation",
      hasPrompts: ["system-prompt-generator", "concise-integration", "persona-builder"]
    }
  },
  {
    name: "Get concise integration prompt",
    query: {
      jsonrpc: "2.0",
      id: 11,
      method: "prompts/get",
      params: {
        name: "concise-integration"
      }
    },
    expectations: {
      hasPromptContent: true,
      promptDescription: "Minimal prompt for adding MCP capabilities",
      contentContains: ["list_instruction_modules", "search_instruction_modules", "get_modules_content"]
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

  // Handle prompt-specific validations
  if (expectations.promptExists) {
    const prompts = result.result?.prompts;
    if (!prompts) {
      errors.push("Expected prompts array in response");
      return errors;
    }
    
    const searchPrompt = prompts.find(prompt => prompt.name === expectations.promptExists);
    if (!searchPrompt) {
      errors.push(`Expected prompt "${expectations.promptExists}" not found`);
    } else {
      if (expectations.promptDescription && !searchPrompt.description.includes(expectations.promptDescription)) {
        errors.push(`Prompt description doesn't contain "${expectations.promptDescription}"`);
      }
    }

    if (expectations.hasPrompts) {
      for (const promptName of expectations.hasPrompts) {
        const prompt = prompts.find(p => p.name === promptName);
        if (!prompt) {
          errors.push(`Expected prompt "${promptName}" not found in prompts list`);
        }
      }
    }
    
    return errors;
  }

  if (expectations.hasPromptContent) {
    const messages = result.result?.messages;
    if (!messages || messages.length === 0) {
      errors.push("Expected messages array in prompt response");
      return errors;
    }

    const content = messages[0]?.content?.text;
    if (!content) {
      errors.push("Expected text content in prompt message");
      return errors;
    }

    if (expectations.promptDescription && !result.result.description.includes(expectations.promptDescription)) {
      errors.push(`Prompt description doesn't contain "${expectations.promptDescription}"`);
    }

    if (expectations.contentContains) {
      for (const expectedText of expectations.contentContains) {
        if (!content.includes(expectedText)) {
          errors.push(`Prompt content does not contain expected text: "${expectedText}"`);
        }
      }
    }

    return errors;
  }

  // Parse search results or modules content results  
  if (!result.result?.content?.[0]?.text) {
    errors.push("Expected search result content");
    return errors;
  }

  const searchData = JSON.parse(result.result.content[0].text);

  // Handle get_modules_content specific validations
  if (expectations.successResponse !== undefined) {
    if (expectations.successResponse && !searchData.success) {
      errors.push("Expected successful response but got failure");
    } else if (!expectations.successResponse && searchData.success) {
      errors.push("Expected failure response but got success");
    }
  }

  if (expectations.failureResponse !== undefined) {
    if (expectations.failureResponse && searchData.success) {
      errors.push("Expected failure response but got success");
    }
  }

  if (expectations.hasContent !== undefined) {
    if (expectations.hasContent && !searchData.content) {
      errors.push("Expected content field in response");
    } else if (!expectations.hasContent && searchData.content) {
      errors.push("Expected no content field in response");
    }
  }

  if (expectations.hasErrors !== undefined) {
    if (expectations.hasErrors && !searchData.errors) {
      errors.push("Expected errors field in response");
    } else if (!expectations.hasErrors && searchData.errors) {
      errors.push("Expected no errors field in response");
    }
  }

  if (expectations.requestedModules !== undefined) {
    if (searchData.requestedModules !== expectations.requestedModules) {
      errors.push(`Expected ${expectations.requestedModules} requested modules, got ${searchData.requestedModules}`);
    }
  }

  if (expectations.processedModules !== undefined) {
    if (searchData.processedModules !== expectations.processedModules) {
      errors.push(`Expected ${expectations.processedModules} processed modules, got ${searchData.processedModules}`);
    }
  }

  if (expectations.contentContains) {
    if (!searchData.content) {
      errors.push("Expected content field for contentContains check");
    } else {
      for (const expectedText of expectations.contentContains) {
        if (!searchData.content.includes(expectedText)) {
          errors.push(`Content does not contain expected text: "${expectedText}"`);
        }
      }
    }
  }

  if (expectations.errorContains) {
    if (!searchData.errors || searchData.errors.length === 0) {
      errors.push("Expected errors for errorContains check");
    } else {
      const found = searchData.errors.some(error => error.includes(expectations.errorContains));
      if (!found) {
        errors.push(`Errors do not contain expected text: "${expectations.errorContains}"`);
      }
    }
  }

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