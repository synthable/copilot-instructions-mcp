# copilot-instructions-mcp

An MCP (Model Context Protocol) server that provides AI assistants with access to a comprehensive library of instruction modules for dynamic capability enhancement.

## Overview

This server exposes 100+ instruction modules organized in a four-tier hierarchy (Foundation, Principle, Technology, Execution) through three MCP tools and four bootstrap prompts. AI assistants can dynamically discover, search, and compile modules to enhance their capabilities for specific tasks.

## Features

### MCP Tools
- **`list_instruction_modules`** - List all available instruction modules with optional category filtering
- **`search`** - Unified search with three modes: fuzzy (lexical), semantic (embedding-based), and hybrid (combined)
- **`get_modules_content`** - Combine multiple modules into formatted markdown documents

### MCP Prompts
- **`bootstrap-prompt`** - Comprehensive system prompt generation with dynamic module discovery
- **`system-prompt-generator`** - Production AI assistant enhancement
- **`concise-integration`** - Minimal MCP integration for existing prompts
- **`persona-builder`** - Specialized persona development following four-tier philosophy

### Transport Support
- **stdio** (default) - For MCP Inspector and CLI clients
- **HTTP** - For web applications using Streamable HTTP
- **SSE** - Server-Sent Events (deprecated, use HTTP instead)

## Quick Start

### Installation
```bash
npm install
```

### Build
```bash
npm run build
```

### Run Server
```bash
# Default stdio transport (for MCP clients)
npm start

# HTTP transport on port 3000
npm run start:http

# HTTP transport on custom port
node dist/index.js http --port 8000
```

### Test
```bash
# Test unified search tool with all modes
npm run test:unified-search

# Run comprehensive test suite
npm run test:search

# Run unit tests
npm test
```

## Usage with MCP Inspector

1. Start the server:
```bash
npm run start:stdio
```

2. Connect MCP Inspector to `node dist/index.js stdio`

3. Explore available tools and prompts through the inspector interface

## Instruction Module Hierarchy

The server organizes instruction modules in a four-tier philosophy:

### Foundation (Layer 0-3)
Core reasoning capabilities that must be ordered by layer:
- **Layer 0-1**: Logic, reasoning, basic cognitive frameworks
- **Layer 2**: Problem-solving, decision-making
- **Layer 3**: Metacognition, communication, bias awareness

### Principle
Domain-specific best practices and methodologies:
- Architecture patterns (microservices, hexagonal, etc.)
- Quality practices (clean code, SOLID principles)
- Testing strategies (TDD, testing pyramid)
- Security principles (defense in depth, least privilege)

### Technology  
Concrete implementations for specific languages and frameworks:
- Languages: TypeScript, Python, JavaScript
- Frameworks: React, Next.js, Django, Angular
- Platforms: AWS, Firebase, Vercel
- Testing: Jest, Vitest, Cypress

### Execution
Step-by-step playbooks for common development tasks:
- Debugging workflows
- Code review processes
- Refactoring procedures
- Security audits

## API Examples

### Search for TypeScript modules
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": {
      "query": "typescript generics",
      "mode": "fuzzy",
      "limit": 5
    }
  }
}
```

### Compile modules for a TypeScript developer persona
```json
{
  "jsonrpc": "2.0", 
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_modules_content",
    "arguments": {
      "moduleIds": [
        "foundation.reasoning.systems-thinking",
        "principle.architecture.separation-of-concerns", 
        "technology.language.typescript.effective-generics",
        "execution.playbook.refactor-component"
      ]
    }
  }
}
```

### Get bootstrap prompt
```json
{
  "jsonrpc": "2.0",
  "id": 3, 
  "method": "prompts/get",
  "params": {
    "name": "bootstrap-prompt"
  }
}
```

## Vector Search System

The server includes an advanced semantic search system that combines keyword and embedding-based search for superior result quality.

### Features
- **Local embeddings**: Uses `@xenova/transformers` with all-mpnet-base-v2 model
- **Pre-computed vectors**: Build-time generation for fast startup
- **Hybrid search**: Combines keyword and semantic similarity
- **Intelligent caching**: Automatic model disposal and embedding cache

### Quick Start with Vector Search
```bash
# Generate pre-computed vectors
npm run build:vectors

# Test semantic search
npm run test:semantic

# Start server with vector support
npm start
```

### Search Modes
- **Fuzzy mode**: Fast lexical matching with weighted Levenshtein distance
- **Semantic mode**: Embedding-based conceptual search for meaning understanding
- **Hybrid mode**: Combined re-ranking with configurable alpha weighting

### Documentation
- [Architecture Overview](docs/ARCHITECTURE.md) - Comprehensive system design
- [Migration Guide](docs/MIGRATION.md) - Upgrade from keyword-only search
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) - Performance optimization and debugging

## Development

### Project Structure
```
src/
  index.ts              # Main MCP server implementation
  modules/
    embeddingService.ts # Local text embedding with transformers
    vectorStore.ts      # Pre-computed vector storage
    semanticSearch.ts   # Similarity-based search
    semantic.ts         # Hybrid search integration
  tools/
    vectorGenerator.ts  # Build-time vector generation
instructions-modules/   # Instruction module library
  README.md            # Module registry and metadata
  foundation/          # Core reasoning capabilities
  principle/           # Best practices and methodologies  
  technology/          # Language/framework specifics
  execution/           # Step-by-step playbooks
docs/                  # Documentation
  ARCHITECTURE.md      # Vector search system architecture
  MIGRATION.md         # Migration guide for vector search
  TROUBLESHOOTING.md   # Performance and debugging guide
prompts/               # Bootstrap prompts for AI enhancement
  bootstrap-prompt.md
  system-prompt-generator.md
  concise-mcp-prompt.md
  persona-builder-prompt.md
  bootloader-v1.1.md
dist/vectors/          # Pre-computed embeddings (generated)
  vectors.msgpack      # Binary vector storage
  vectors.json         # Human-readable fallback
  metadata.json        # Module metadata index
test_search.js         # Comprehensive test suite
```

### Key Implementation Details

- **Module Parsing**: Extracts metadata from `instructions-modules/README.md` using regex patterns
- **Fuzzy Search**: Weighted Levenshtein distance algorithm with field-specific scoring
- **Vector Search**: Cosine similarity with pre-computed embeddings for semantic understanding
- **Hybrid Search**: Weighted combination of keyword and semantic results
- **Transport Abstraction**: Shared handlers across stdio, HTTP, and SSE transports
- **Dynamic Prompt Loading**: Bootstrap prompts loaded from prompts/ with tool name mapping

### Adding New Modules

1. Create the module file in the appropriate category directory
2. Follow the three-section format: Context, Implementation, Validation
3. Add an entry to `instructions-modules/README.md` with semantic content
4. Regenerate vectors: `npm run build:vectors`
5. Use machine-centric, imperative language for AI comprehension

## License

ISC
