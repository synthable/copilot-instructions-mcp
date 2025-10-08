# MCP Copilot Instructions Server Specification

This document provides a comprehensive specification for the MCP (Model Context Protocol) Copilot Instructions Server, including its architecture, API endpoints, data models, and behavior.

## Table of Contents

- [MCP Copilot Instructions Server Specification](#mcp-copilot-instructions-server-specification)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
    - [Key Features](#key-features)
  - [Server Information](#server-information)
  - [Architecture](#architecture)
    - [Core Components](#core-components)
      - [1. **Dependency Injection Container** (`src/modules/container.ts`)](#1-dependency-injection-container-srcmodulescontainerts)
      - [2. **Server Setup** (`src/modules/server.ts`)](#2-server-setup-srcmodulesserverts)
      - [3. **Tool Handlers** (`src/modules/toolHandlers.ts`)](#3-tool-handlers-srcmodulestoolhandlersts)
      - [4. **Search Services**](#4-search-services)
      - [5. **Content Management**](#5-content-management)
      - [6. **Embedding System**](#6-embedding-system)
  - [Unified Module System (UMS)](#unified-module-system-ums)
    - [**UMS Architecture**](#ums-architecture)
      - [**Module Definition**](#module-definition)
      - [**Four-Tier Hierarchy**](#four-tier-hierarchy)
      - [**Module Discovery**](#module-discovery)
      - [**Semantic Integration**](#semantic-integration)
  - [MCP Tools](#mcp-tools)
    - [1. `list_instruction_modules`](#1-list_instruction_modules)
    - [2. `search_instruction_modules`](#2-search_instruction_modules)
    - [3. `get_modules_content`](#3-get_modules_content)
    - [4. `semantic_search`](#4-semantic_search)
    - [5. `hybrid_search`](#5-hybrid_search)
  - [MCP Prompts](#mcp-prompts)
    - [1. `bootloader-v1.1-prompt`](#1-bootloader-v11-prompt)
    - [2. `bootstrap-prompt`](#2-bootstrap-prompt)
    - [3. `system-prompt-generator`](#3-system-prompt-generator)
    - [4. `concise-integration`](#4-concise-integration)
    - [5. `persona-builder`](#5-persona-builder)
  - [Data Models](#data-models)
    - [InstructionModule](#instructionmodule)
    - [SearchResult](#searchresult)
    - [GetModulesContentResult](#getmodulescontentresult)
  - [Error Handling](#error-handling)
    - [Error Response Format](#error-response-format)
    - [Error Categories](#error-categories)
    - [Fallback Strategies](#fallback-strategies)
  - [Configuration](#configuration)
    - [Search Configuration](#search-configuration)
    - [Semantic Search Configuration](#semantic-search-configuration)
  - [File System Structure](#file-system-structure)
  - [Transport Support](#transport-support)
    - [1. **stdio** (Default)](#1-stdio-default)
    - [2. **HTTP**](#2-http)
    - [3. **SSE** (Deprecated)](#3-sse-deprecated)
  - [Dependencies](#dependencies)
    - [Core Dependencies](#core-dependencies)
    - [Development Dependencies](#development-dependencies)
  - [Performance Characteristics](#performance-characteristics)
    - [Startup Performance](#startup-performance)
    - [Search Performance](#search-performance)
    - [Storage Efficiency](#storage-efficiency)
  - [Validation Rules](#validation-rules)
    - [Input Validation](#input-validation)
    - [Content Validation](#content-validation)


## Overview

The MCP Copilot Instructions Server is a Model Context Protocol server that provides AI assistants with access to a comprehensive library of instruction modules for dynamic capability enhancement. It exposes 150+ instruction modules organized in a four-tier hierarchy through MCP tools and bootstrap prompts.

### Key Features

- **Instruction Module Library**: 150+ modules in Foundation, Principle, Technology, and Execution tiers
- **Intelligent Search**: Fuzzy search with weighted scoring and semantic search capabilities
- **Vector Search**: Local embedding-based semantic search using @xenova/transformers
- **Hybrid Search**: Combines keyword and semantic search for optimal results
- **Module Compilation**: Dynamic content assembly with metadata headers
- **Bootstrap Prompts**: Pre-built prompts for AI enhancement and persona building
- **Multiple Transports**: Support for stdio, HTTP, and SSE protocols

## Server Information

```json
{
  "name": "copilot-instructions-mcp",
  "version": "1.0.0",
  "capabilities": {
    "tools": {},
    "prompts": {}
  }
}
```

## Architecture

### Core Components

#### 1. **Dependency Injection Container** (`src/modules/container.ts`)
- Manages service lifecycle and dependencies
- Provides factory functions for production and test implementations
- Supports file system, path utilities, and process abstractions

#### 2. **Server Setup** (`src/modules/server.ts`)
- Configures MCP protocol handlers
- Sets up tool and prompt request routing
- Implements comprehensive error handling

#### 3. **Tool Handlers** (`src/modules/toolHandlers.ts`)
- Implements business logic for all MCP tools
- Provides input validation and response formatting
- Handles error scenarios with fallback data

#### 4. **Search Services**
- **Fuzzy Search** (`src/modules/search.ts`): Weighted Levenshtein distance algorithm
- **Semantic Search** (`src/modules/semanticSearch.ts`): Embedding-based similarity search
- **Vector Store** (`src/modules/vectorStore.ts`): Pre-computed vector storage and retrieval

#### 5. **Content Management**
- **Module Parsing** (`src/modules/parsing.ts`): YAML and Markdown module parsing
- **Content Service** (`src/modules/content.ts`): Module content retrieval and assembly

#### 6. **Embedding System**
- **Embedding Service** (`src/modules/embeddingService.ts`): Local text embedding using transformers
- **Vector Generation** (`src/tools/vectorGenerator.ts`): Build-time vector pre-computation

## Unified Module System (UMS)

The MCP server is built around the Unified Module System (UMS) v1.0 specification, which provides the structural foundation for instruction modules.

### **UMS Architecture**

#### **Module Definition**
All instruction modules are defined as structured YAML files with `.module.yml` extension:

```yaml
id: foundation/reasoning/systems-thinking
version: 1.0.0
schemaVersion: 1.0.0
shape: module
declaredDirectives:
  required: [context, implementation, validation]
meta:
  name: Systems Thinking
  description: Reason about systems, feedback loops, and emergent behavior
  category: Foundation
  semantic: Dense semantic description for embedding-based search
  tags: [reasoning, systems, complexity]
body:
  context: |
    Systems thinking directive content...
  implementation: |
    Implementation instructions...
  validation: |
    Validation criteria...
```

#### **Four-Tier Hierarchy**
- **Foundation** (`foundation/`): Core reasoning capabilities (layers 0-3)
- **Principle** (`principle/`): Best practices and methodologies
- **Technology** (`technology/`): Language/framework specifics
- **Execution** (`execution/`): Step-by-step playbooks

#### **Module Discovery**
The server automatically discovers all `.module.yml` files in the `instructions-modules/` directory and parses them according to UMS v1.0 specification.

#### **Semantic Integration**
- UMS modules include a `meta.semantic` field optimized for embedding generation
- This field provides dense, keyword-rich descriptions for vector search
- Semantic content is used exclusively for building the vector index

For complete UMS specification details, see [`docs/spec/unified_module_system_v1_spec.md`](./unified_module_system_v1_spec.md).

## MCP Tools

### 1. `list_instruction_modules`

**Description**: List all available instruction modules with comprehensive metadata.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "category": {
      "type": "string",
      "description": "Optional filter by category: 'Foundation', 'Principle', 'Technology', 'Execution'"
    }
  }
}
```

**Response**: Array of `InstructionModule` objects with metadata.

**Example**:
```json
{
  "success": true,
  "count": 29,
  "modules": [
    {
      "id": "foundation.reasoning.systems-thinking",
      "name": "Systems Thinking",
      "description": "Reason about systems, feedback loops, and emergent behavior",
      "category": "Foundation",
      "filePath": "foundation/reasoning/systems-thinking.module.yml"
    }
  ]
}
```

### 2. `search_instruction_modules`

**Description**: Perform intelligent fuzzy search across all instruction modules.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search query string - supports multiple terms"
    },
    "limit": {
      "type": "number",
      "description": "Maximum results to return (default: 10, range: 1-50)"
    }
  },
  "required": ["query"]
}
```

**Search Algorithm**:
- **Field Weights**: name (2.0x), description (1.5x), category/subcategory (1.0x), content (0.8x)
- **Scoring**: Weighted Levenshtein distance with normalization
- **Thresholds**: Min field score 0.3, min content score 0.2, min total 0.5

**Response**: Array of `SearchResult` objects with scores and matched fields.

**Example**:
```json
{
  "success": true,
  "count": 3,
  "results": [
    {
      "id": "technology.language.typescript.generics",
      "name": "TypeScript Generic Programming",
      "score": 2.4,
      "matchedFields": ["name", "description"],
      "contentMatches": ["Advanced generic programming techniques..."],
      "semanticScore": 0.85,
      "relevanceLevel": "high"
    }
  ]
}
```

### 3. `get_modules_content`

**Description**: Compile and combine multiple instruction modules into a cohesive markdown document.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "moduleIds": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Array of module IDs in dot notation format"
    }
  },
  "required": ["moduleIds"]
}
```

**Content Assembly**:
- Adds metadata headers (ID, category, description)
- Joins modules with separators for parsing
- Respects four-tier hierarchy ordering
- Handles missing modules gracefully

**Response**: Combined markdown content with metadata.

**Example**:
```json
{
  "success": true,
  "content": "# Module: foundation.reasoning.systems-thinking\n\n## Category: Foundation\n## Description: Reason about systems...\n\n---\n\n# Module Content\n...",
  "errors": []
}
```

### 4. `semantic_search`

**Description**: Embedding-based semantic search using all-mpnet-base-v2 model.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Natural language query to embed and search"
    },
    "limit": {
      "type": "number",
      "description": "Max results to return (default 10)"
    }
  },
  "required": ["query"]
}
```

**Implementation**:
- **Model**: `Xenova/all-mpnet-base-v2` (768 dimensions)
- **Similarity**: Cosine similarity computation
- **Vectors**: Pre-computed from module `semantic` fields
- **Caching**: Intelligent embedding cache with MD5 hashing

**Response**: Semantically ranked results with similarity scores.

For detailed semantic search implementation, see [`docs/spec/semantic-search-spec.md`](./semantic-search-spec.md).

### 5. `hybrid_search`

**Description**: Hybrid search combining fuzzy lexical search with semantic similarity.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "Search query terms" },
    "limit": { "type": "number", "description": "Max results (default 10)" },
    "alpha": { "type": "number", "description": "Lexical weight 0-1 (default 0.6)" }
  },
  "required": ["query"]
}
```

**Blending Formula**:
```
final_score = alpha × normalized_lexical + (1 - alpha) × semantic_score
```

**Response**: Re-ranked results optimizing both keyword and semantic relevance.

## MCP Prompts

### 1. `bootloader-v1.1-prompt`

**Description**: Module Integration Specialist using four-phase process (deconstruct, discover & select, synthesize & execute, constraints & communication).

**Arguments**: None

**Content**: Dynamic integration specialist persona for complex problem-solving.

### 2. `bootstrap-prompt`

**Description**: Comprehensive bootstrap prompt for dynamic system prompt generation.

**Arguments**: None

**Content**: Full-featured AI enhancement with module discovery capabilities.

### 3. `system-prompt-generator`

**Description**: Focused prompt for production AI assistants with capability enhancement.

**Arguments**: None

**Content**: Production-ready AI assistant enhancement framework.

### 4. `concise-integration`

**Description**: Minimal prompt for adding MCP capabilities to existing prompts.

**Arguments**: None

**Content**: Lightweight integration for existing AI systems.

### 5. `persona-builder`

**Description**: Specialized prompt for creating personas following four-tier philosophy.

**Arguments**: None

**Content**: Persona development framework with hierarchical module organization.

## Data Models

### InstructionModule

```typescript
interface InstructionModule {
  id: string;                    // Unique identifier (dot notation)
  name: string;                  // Human-readable display name
  description: string;           // Brief capability description
  category: string;              // Foundation, Principle, Technology, Execution
  subcategory?: string;          // Optional subcategory/context
  filePath: string;              // Relative path from instructions-modules/
  semantic?: string;             // Semantic-rich paragraph for embeddings
  tags?: string[];               // Optional tags for filtering
}
```

### SearchResult

```typescript
interface SearchResult extends InstructionModule {
  score: number;                 // Weighted fuzzy match score (0-∞)
  matchedFields: string[];       // Fields that matched: name, description, etc.
  contentMatches?: string[];     // Content snippets around matches (≤200 chars)
  semanticScore?: number;        // Semantic similarity score (0-1)
  relevanceLevel?: 'high' | 'medium' | 'low' | 'none';
}
```

### GetModulesContentResult

```typescript
interface GetModulesContentResult {
  success: boolean;              // Operation success status
  content?: string;              // Combined markdown with headers
  errors?: string[];             // Error messages for failed modules
}
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "Error message description",
  "fallbackData": {
    // Contextual fallback information
  }
}
```

### Error Categories

1. **Validation Errors**: Invalid input parameters
2. **Not Found Errors**: Missing modules or files
3. **Parsing Errors**: Malformed YAML or content
4. **System Errors**: File system or network issues
5. **Search Errors**: Search service failures with fallback

### Fallback Strategies

- **Search failures**: Return empty results with error context
- **Module loading failures**: Skip failed modules, continue with available
- **Embedding failures**: Fallback to keyword-only search
- **Prompt loading failures**: Return error with prompt information

## Configuration

### Search Configuration

```typescript
{
  // Field weights for fuzzy search
  fieldWeights: {
    name: 2.0,
    description: 1.5,
    category: 1.0,
    subcategory: 1.0,
    content: 0.8
  },

  // Score thresholds
  thresholds: {
    minFieldScore: 0.3,
    minContentScore: 0.2,
    minTotalScore: 0.5
  },

  // Result limits
  maxResults: 50,
  defaultLimit: 10
}
```

### Semantic Search Configuration

```typescript
{
  modelName: 'Xenova/all-mpnet-base-v2',
  embeddingDimensions: 768,
  maxContentLength: 5000,
  cacheSize: 1000,
  disposeTimeoutMs: 300000,  // 5 minutes

  relevanceThresholds: {
    high: 0.8,
    medium: 0.6,
    low: 0.4
  }
}
```

## File System Structure

```
src/
  index.ts                 # Main server entry point
  modules/
    server.ts             # MCP server setup and handlers
    toolHandlers.ts       # Tool business logic
    container.ts          # Dependency injection
    parsing.ts            # Module parsing (YAML/Markdown)
    search.ts             # Fuzzy search implementation
    semanticSearch.ts     # Semantic search service
    embeddingService.ts   # Local embedding computation
    vectorStore.ts        # Vector storage and retrieval
    content.ts            # Content assembly
    validation.ts         # Input validation
    types.ts              # TypeScript interfaces
    interfaces.ts         # Service interfaces
    logger.ts             # Structured logging
  tools/
    vectorGenerator.ts    # Build-time vector generation

instructions-modules/     # Instruction module library
  README.md              # Module registry
  foundation/            # Core reasoning capabilities
  principle/             # Best practices and methodologies
  technology/            # Language/framework specifics
  execution/             # Step-by-step playbooks

prompts/                 # Bootstrap prompts
  bootloader-v1.1.md
  bootstrap-prompt.md
  system-prompt-generator.md
  concise-mcp-prompt.md
  persona-builder-prompt.md

dist/vectors/            # Pre-computed embeddings
  vectors.msgpack        # Binary vector storage
  vectors.json           # JSON fallback
  metadata.json          # Module metadata
  checksums.json         # Integrity validation
```

## Transport Support

### 1. **stdio** (Default)
- Standard input/output communication
- Designed for MCP Inspector and CLI clients
- JSON-RPC protocol over stdin/stdout

### 2. **HTTP**
- RESTful HTTP endpoints
- Streamable HTTP responses
- Default port: 3000 (configurable)

### 3. **SSE** (Deprecated)
- Server-Sent Events protocol
- Replaced by HTTP transport
- Maintained for backward compatibility

## Dependencies

### Core Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.0.7",
  "@msgpack/msgpack": "^3.1.2",
  "@xenova/transformers": "^2.17.2",
  "commander": "^12.0.0",
  "express": "^5.1.0",
  "yaml": "^2.8.1"
}
```

### Development Dependencies

```json
{
  "@tsconfig/node-ts": "^23.6.1",
  "@tsconfig/node22": "^22.0.2",
  "@tsconfig/strictest": "^2.0.5",
  "@types/express": "^5.0.3",
  "@types/node": "^22.0.0",
  "@vitest/coverage-v8": "^3.2.4",
  "eslint": "^9.30.1",
  "prettier": "^3.6.2",
  "typescript": "^5.8.3",
  "vitest": "^2.1.8"
}
```

## Performance Characteristics

### Startup Performance
- **Cold start**: < 500ms with pre-computed vectors
- **Memory usage**: < 300MB peak during operation
- **Vector loading**: MessagePack provides 2-3x faster loading vs JSON

### Search Performance
- **Fuzzy search**: 20-50ms typical latency
- **Semantic search**: 50-100ms including embedding computation
- **Hybrid search**: 80-120ms for optimal quality

### Storage Efficiency
- **Vector file size**: < 2MB for complete module set
- **Compression ratio**: MessagePack ~40% smaller than JSON
- **Cache hit rate**: > 90% for repeated queries

## Validation Rules

### Input Validation

1. **Category Filter**: Must be one of Foundation, Principle, Technology, Execution
2. **Search Query**: Non-empty string, max 1000 characters
3. **Search Limit**: Integer between 1-50, default 10
4. **Module IDs**: Array of valid dot-notation identifiers
5. **Alpha Parameter**: Float between 0.0-1.0 for hybrid search

### Content Validation

1. **Module Files**: Must exist and be readable
2. **YAML Structure**: Valid YAML with required meta fields
3. **Embedding Dimensions**: Must match model output (768)
4. **Vector Checksums**: MD5 validation for integrity

This specification provides a complete reference for the MCP Copilot Instructions Server's capabilities, interfaces, and behavior patterns.
