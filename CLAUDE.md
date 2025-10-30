@.claude/AGENTS.md
@.claude/COMMANDS.md

# Vitest Implementation and Testing Strategy

## Overview

This project uses Vitest as the primary testing framework with v8 coverage reporting. The testing strategy emphasizes comprehensive coverage, proper mocking, and maintainable test patterns for a CLI tool built with TypeScript and Node.js ESM.

## Configuration

### Vitest Configuration (`vitest.config.ts`)
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  }
});
```

### Package.json Scripts
```json
{
  "scripts": {
    "test": "vitest run --run",
    "dev": "vitest", 
    "coverage": "vitest run --coverage",
    "pretest": "npm run typecheck"
  }
}
```

## Testing Patterns

### 1. CLI Command Testing Pattern

**Structure**: Each command has a corresponding `.test.ts` file alongside the implementation.

**Example**: `src/commands/validate.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { glob } from 'glob';

// Mock external dependencies
vi.mock('fs', () => ({ promises: { stat: vi.fn() } }));
vi.mock('glob', () => ({ glob: vi.fn() }));
vi.mock('../core/ums-module-loader', () => ({ loadModule: vi.fn() }));
vi.mock('../core/ums-persona-loader', () => ({ loadPersona: vi.fn() }));

describe('validate command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should handle different path types correctly', async () => {
    // Test implementation
  });
});
```

### 2. Mock Strategy

**File System Mocking**: 
- Mock `fs.promises.stat` for path type detection
- Mock `glob` for file discovery patterns
- Use typed mocks: `vi.mocked(glob).mockImplementation((pattern: string | string[]) => ...)`

**Module Loading Mocking**:
- Mock UMS loaders (`loadModule`, `loadPersona`) to return controlled test data
- Mock external utilities like `chalk` and console methods for output testing

**Pattern for Glob Mocking**:
```typescript
vi.mocked(glob).mockImplementation((pattern: string | string[]) => {
  const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;
  if (patternStr.includes('module.yml')) {
    return Promise.resolve(['module1.module.yml']);
  }
  // Handle other patterns
  return Promise.resolve([]);
});
```

### 3. Error Handling Testing

**Success Cases**: Test normal operation with valid inputs
**Error Cases**: Test file not found, invalid formats, validation failures
**Edge Cases**: Test empty directories, mixed file types, permission issues

Example pattern:
```typescript
it('should handle file not found errors', async () => {
  vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
  const result = await validatePath('nonexistent.yml');
  expect(result.success).toBe(false);
  expect(result.error).toContain('File not found');
});
```

### 4. Console Output Testing

Mock console methods and verify output formatting:
```typescript
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Test execution
await command();

// Verify output
expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Expected output'));
```

## UMS v1.0 Testing Specifics

### Module Validation Testing

**File Patterns**: Test discovery of `instructions-modules/**/*.module.yml`
**Schema Validation**: Test YAML parsing and schema compliance
**Error Reporting**: Test detailed validation messages with key paths

### Persona Validation Testing  

**File Patterns**: Test discovery of `personas/**/*.persona.yml`
**Configuration Validation**: Test required fields and structure
**Module Reference Validation**: Test that referenced modules exist

### Path Handling Testing

**No Path**: Should discover standard locations (`instructions-modules/`, `personas/`)
**File Path**: Should validate single file
**Directory Path**: Should recursively find and validate files within directory

## Coverage Strategy

### Target Metrics
- **80% minimum** for branches, functions, lines, and statements
- **Focus areas**: Core business logic, error handling, edge cases
- **Exclusions**: Type definitions, configuration files

### High-Value Test Cases
1. **Command argument parsing and validation**
2. **File discovery and pattern matching** 
3. **YAML parsing and type safety**
4. **Error aggregation and reporting**
5. **Exit code behavior**

## TypeScript Integration

### Type-Safe Mocking
```typescript
// Proper typing for mocked functions
vi.mocked(loadModule).mockResolvedValue({} as UMSModule);
vi.mocked(fs.stat).mockResolvedValue({ 
  isFile: () => true, 
  isDirectory: () => false 
} as any);
```

### ESLint Disable Patterns
Use targeted disables for unavoidable mock-related type issues:
```typescript
/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-empty-function, @typescript-eslint/no-unsafe-argument */
```

## Test Execution Patterns

### Development Workflow
```bash
# Watch mode during development
npm run dev

# Run specific test file  
npx vitest run src/commands/validate.test.ts

# Run with coverage
npm run coverage

# Full quality check
npm run quality-check  # includes typecheck + test + lint
```

### CI/CD Integration
```bash
# Pre-commit: Type checking before tests
npm run pretest  # runs typecheck first

# Main test suite
npm test  # runs all tests with proper exit codes
```

## Common Patterns and Solutions

### Async Command Testing
```typescript
it('should handle async operations', async () => {
  // Setup mocks
  vi.mocked(someAsyncFunction).mockResolvedValue(expectedResult);
  
  // Execute
  const result = await commandFunction();
  
  // Verify
  expect(result).toEqual(expectedResult);
});
```

### Error Boundary Testing
```typescript
it('should catch and format errors properly', async () => {
  vi.mocked(riskyFunction).mockRejectedValue(new Error('Test error'));
  
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  
  await expect(commandFunction()).resolves.not.toThrow();
  expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test error'));
});
```

### File System Abstraction Testing
Mock file system operations consistently across all tests to ensure reliable, fast test execution without actual file I/O.

## Plugin Architecture Patterns

### Embedding Provider Architecture

The system uses a plugin architecture for embedding providers enabling runtime provider selection:

**Interface-Based Design**:
- `IEmbeddingProvider` interface for all providers (embed, embedBatch, initialize, dispose)
- Factory pattern in DI container for provider instantiation
- Runtime provider selection via `config.json`
- Backward compatible with pre-computed embeddings (defaults to Transformers.js)

**Available Providers**:
- **TransformersEmbeddingProvider** - Wraps `@xenova/transformers` for local offline embeddings
- **OllamaEmbeddingProvider** - HTTP client for Ollama API with health checking
- **OpenAI/Cohere** - Planned for future cloud-based providers

**Configuration-Driven Behavior**:
```json
{
  "embeddingProvider": {
    "type": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434"
  }
}
```

**Key Design Principles**:
- Single interface for all providers ensures consistent behavior
- Factory pattern encapsulates provider creation logic
- Configuration validation at startup prevents runtime errors
- Sensible defaults (Transformers.js) ensure zero-config operation
- Optional interfaces (IEmbeddingProviderCache, IEmbeddingProviderInfo) for extended capabilities

**Provider Testing Strategy**:
- Mock external dependencies (`@xenova/transformers`, fetch API)
- Test provider factory in container for correct instantiation
- Test provider selection via config (type switching)
- Coverage target: 70-75% for essential paths (init, embed, error handling)
- Mock HTTP responses for Ollama provider testing
- Test automatic config migration from legacy format

## Key Learnings

1. **Mock Typing**: Always properly type mocks to catch TypeScript errors early
2. **Pattern Matching**: Use flexible pattern matching in glob mocks to handle string/array inputs
3. **Error Isolation**: Test error conditions in isolation with proper mock setup
4. **Console Mocking**: Mock console methods to verify CLI output formatting
5. **Async Patterns**: Use proper async/await patterns in tests for reliable execution
6. **Coverage Focus**: Prioritize testing business logic over infrastructure code
7. **Plugin Architecture**: Use interface-based design for swappable implementations with configuration-driven behavior

## Transfer Checklist

When implementing similar testing in a new context:

- [ ] Configure Vitest with v8 coverage and 80% thresholds
- [ ] Set up proper TypeScript integration with ESM
- [ ] Implement consistent mocking patterns for file system operations
- [ ] Create test files alongside implementation files
- [ ] Mock external dependencies (fs, glob, etc.) with proper typing
- [ ] Test both success and error paths for each command
- [ ] Verify console output and error reporting
- [ ] Include pre-commit hooks that run typecheck before tests
- [ ] Set up watch mode for development workflow
- [ ] Document common testing patterns for team consistency

This testing strategy provides comprehensive coverage while maintaining fast, reliable test execution suitable for both development and CI/CD environments.