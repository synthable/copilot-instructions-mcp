# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Architecture

This is an **MCP (Model Context Protocol) server** that provides AI assistants with access to instruction modules for dynamic capability enhancement. The server parses a large collection of instruction modules from `instructions-modules/README.md` and provides three main tools plus bootstrap prompts.

### Key Components

- **`src/index.ts`**: Single-file MCP server implementation with three transport modes (stdio, HTTP, SSE)
- **`instructions-modules/`**: Large collection of AI instruction modules organized in four-tier hierarchy:
  - **Foundation**: Core reasoning, logic, problem-solving capabilities (layers 0-3)
  - **Principle**: Best practices, methodologies, design patterns
  - **Technology**: Language/framework-specific guidance 
  - **Execution**: Step-by-step playbooks for common tasks
- **`docs/`**: Bootstrap prompts for AI system prompt generation
- **`test_search.js`**: Comprehensive test suite with 11 test cases

### MCP Tools Provided

1. **`list_instruction_modules`**: Lists all modules with metadata and optional category filtering
2. **`search_instruction_modules`**: Fuzzy search across module names, descriptions, categories, and file content using Levenshtein distance
3. **`get_modules_content`**: Combines multiple modules into formatted markdown with headers and metadata

### MCP Prompts Provided

1. **`bootstrap-prompt`**: Comprehensive system prompt generation with dynamic module discovery
2. **`system-prompt-generator`**: Production AI assistant enhancement 
3. **`concise-integration`**: Minimal MCP integration for existing prompts
4. **`persona-builder`**: Specialized persona development following four-tier philosophy

## Development Commands

### Building and Running
```bash
# Build TypeScript to dist/
npm run build

# Run with stdio transport (default for MCP clients)
npm start
# or
npm run start:stdio

# Run with HTTP transport (for web clients)
npm run start:http

# Run with SSE transport (deprecated)
npm run start:sse

# Development mode with auto-rebuild
npm run dev
```

### Testing
```bash
# Run comprehensive test suite (builds first)
npm run test:search

# Run unit tests
npm test
```

## Core Implementation Details

### Module Parsing
The `parseInstructionModules()` function parses `instructions-modules/README.md` using regex patterns to extract:
- Categories (`## Title`)
- Subcategories (`- **Title**`) 
- Module entries (`- [Name](path) - Description`)

Module IDs are generated from file paths: `path/file.md` → `path.file`

### Fuzzy Search Algorithm
Uses weighted Levenshtein distance scoring:
- **Name matches**: 2x weight (highest priority)
- **Description matches**: 1.5x weight
- **Category/subcategory matches**: 1x weight
- **Content matches**: 0.8x weight (with context extraction)

Results include `score`, `matchedFields`, and optional `contentMatches` for transparency.

### Transport Architecture
The server uses a modular transport system:
- **stdio**: Default for MCP Inspector and CLI clients
- **HTTP**: Streamable HTTP for web applications
- **SSE**: Server-Sent Events (deprecated, use HTTP instead)

All transports share the same `setupServerHandlers()` function for consistent tool/prompt behavior.

### Dynamic Prompt Loading
Bootstrap prompts are loaded from `docs/` files with automatic tool name mapping:
- `list_modules` → `list_instruction_modules`
- `module_discovery` → `search_instruction_modules` 
- `module_compile` → `get_modules_content`

## Testing Strategy

The test suite validates:
- Tool listing and descriptions
- Search functionality with scoring validation
- Module content retrieval with error handling
- Prompt listing and content loading
- Edge cases (empty queries, invalid IDs, missing files)

Each test includes detailed expectations for response structure, required fields, and content validation.

## Four-Tier Module Philosophy

When working with instruction modules, always respect the hierarchical order:
1. **Foundation** modules must be ordered by layer (0→3) 
2. **Principle** modules provide domain methodology
3. **Technology** modules offer concrete implementations
4. **Execution** modules give step-by-step procedures

This hierarchy ensures AI assistants build capabilities systematically from core reasoning to specific execution patterns.