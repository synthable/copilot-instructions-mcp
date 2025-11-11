# LLM Services Implementation Plan

**Project**: Advanced LLM-Powered Features for MCP Copilot Instructions Server
**Status**: Phase 2 Complete (2/6 phases - 33%)
**Last Updated**: 2025-11-10

---

## 🎯 Project Overview

Transform the existing MCP instruction module server into an intelligent document library with:
1. Query Enhancement - Rewrite queries for better search
2. Contextual Retrieval - Context-aware search with re-ranking
3. Autonomous Agent - Terminal chat interface with tool use
4. Document Processing - Auto-generate metadata and embeddings
5. Advanced Search Intelligence - RAG with answer synthesis

---

## ✅ Phase 1: LLM Provider Infrastructure (COMPLETE)

**Status**: ✅ **COMPLETE**
**Duration**: Sprint 1 (Week 1-2)
**Completion Date**: 2025-11-10

### Objectives
Add LLM inference capabilities to the existing embedding-only system.

### Deliverables

#### ✅ 1.1 Create LLM Provider Plugin System
- ✅ `src/modules/plugins/llm/llmProvider.interface.ts` - Provider contract
  - `ILLMProvider` interface (chat, complete, streamChat)
  - `ChatMessage`, `ChatResponse`, `ChatStreamChunk` types
  - Tool calling support (`ToolCall`, `ToolDefinition`)
  - Error classes (`LLMProviderError`, `RateLimitError`, `AuthenticationError`, `ContextLengthError`)
  - Optional interfaces (`ILLMProviderHealthCheck`, `ILLMProviderModelList`)

- ✅ `src/modules/plugins/llm/ollamaLlmProvider.ts` - Ollama chat/completion client
  - HTTP client for Ollama API (`http://localhost:11434`)
  - Chat and completion endpoints
  - Streaming support with NDJSON parsing
  - Health checking and model listing
  - Automatic retry with exponential backoff (max 3 retries)
  - Error handling and normalization

- ✅ `src/modules/services/llm/llmService.ts` - Service wrapper
  - Unified `ILLMService` interface
  - Logging for all operations (debug, info, error)
  - Error handling with structured logging
  - Token usage tracking
  - Provider name and model introspection

#### ✅ 1.2 Configuration & Integration
- ✅ Update `src/config/config.schema.ts` with LLM provider section
  - Zod schema with validation
  - Provider type: `ollama` (only)
  - Required: `type`, `model`
  - Optional: `baseUrl`, `timeout`, `maxRetries`, `defaultOptions`
  - Entire section is optional (backward compatible)

- ✅ Register in DI Container (`src/modules/core/container.ts`)
  - `createLLMProvider()` factory method
  - `getLLMProvider()` private getter
  - `getLLMService()` public getter with lazy initialization
  - Provider initialization with config
  - Proper disposal in container lifecycle
  - Setter methods for testing

- ✅ Add to interfaces (`src/modules/core/interfaces.ts`)
  - Export `ILLMService` type

#### ✅ 1.3 Dependencies
- ✅ Install NPM packages:
  ```bash
  npm install @anthropic-ai/sdk openai readline cli-progress
  ```

### Testing Status
- ⏳ Unit tests pending (75% coverage target)
- ⏳ Integration tests pending
- ⏳ Manual QA with real LLMs pending

### Configuration Example
```json
{
  "llmProvider": {
    "type": "ollama",
    "model": "llama3.1:8b",
    "baseUrl": "http://localhost:11434",
    "timeout": 120000,
    "maxRetries": 3,
    "defaultOptions": {
      "temperature": 0.3,
      "maxTokens": 2000
    }
  }
}
```

---

## ✅ Phase 2: Query Enhancement Service (COMPLETE)

**Status**: ✅ **COMPLETE**
**Duration**: Sprint 2 (Week 3-4)
**Completion Date**: 2025-11-10

### Objectives
Rewrite and expand user queries using LLM for better search performance.

### Deliverables

#### ✅ 2.1 Query Enhancement Implementation
- ✅ `src/modules/services/query/types.ts` - Type definitions
  - `EnhancedQuery` - Complete enhanced query structure
  - `QueryIntent` - 6 intent types (search, question, comparison, troubleshooting, exploration, clarification)
  - `UserContext` - Context for personalization (recent modules, conversation history, expertise level)
  - `QueryEnhancementOptions` - Configuration options
  - `QueryEnhancementResult` - Result with metadata (processing time, from cache, provider info)
  - `QueryCacheEntry` - Cache entry with TTL

- ✅ `prompts/query-enhancement.md` - System prompt (2500+ words)
  - Task instructions (rewrite, variations, synonyms, intent, context)
  - Intent classification guidelines with 6 types
  - JSON output format specification
  - 4 detailed examples covering different query types
  - Guidelines for rewriting, variations, synonyms, contextual terms
  - Confidence scoring guidelines
  - Domain context (Foundation, Principles, Technology, Execution)

- ✅ `src/modules/services/query/queryEnhancer.ts` - Core service
  - `IQueryEnhancer` interface
  - LLM-based query enhancement via `llmService.chat()`
  - **15-minute cache** with TTL and LRU eviction (max 1000 entries)
  - MD5-based cache keys (query + context hash)
  - **Fallback handling** when LLM unavailable (returns original query)
  - JSON parsing with markdown code block support
  - User context integration (recent modules, conversation history, expertise)
  - Variation and synonym limiting based on options
  - Cache statistics (`getCacheStats()`)
  - System prompt loading from file with fallback prompt

#### ✅ 2.2 Integration
- ✅ Add to DI Container
  - `getQueryEnhancer()` method with LLM service dependency
  - Returns `null` if LLM service unavailable (optional feature)
  - Lazy initialization
  - Setter method for testing (`setQueryEnhancer()`)
  - Disposal cleanup (cache cleared)

- ✅ Update MCP `search` tool (`src/modules/server/toolHandlers.ts`)
  - Add `IQueryEnhancer` parameter to ToolHandlers constructor (optional)
  - New parameter: `enhanceQuery: boolean` (default: `false`)
  - Query enhancement before search execution
  - Enhancement metadata in response:
    - `enhanced.rewritten` - Rewritten query used for search
    - `enhanced.intent` - Detected intent
    - `enhanced.variationCount` - Number of variations generated
    - `enhanced.processingTimeMs` - Enhancement processing time
  - **Graceful fallback** on enhancement failure (uses original query)
  - Logging for enhancement operations

- ✅ Container passes query enhancer to ToolHandlers
  - Updated `createToolHandlers()` to include `getQueryEnhancer()`

### Features
- ✅ **Rewrite Query**: Reformulate for better search performance
- ✅ **Generate Variations**: 3-5 alternative phrasings
- ✅ **Identify Synonyms**: Key terms with 2-3 synonyms each
- ✅ **Classify Intent**: 6 intent types with confidence scoring
- ✅ **Add Context**: Infer related contextual terms
- ✅ **Cache Results**: 15-minute TTL with LRU eviction
- ✅ **Context-Aware**: Use recent modules, conversation history, expertise level

### Testing Status
- ⏳ Unit tests pending (75% coverage target)
- ⏳ Integration tests pending (end-to-end with real LLM)
- ⏳ Manual QA pending (test enhancement quality)

### Usage Example
```typescript
// MCP search with enhancement
{
  "query": "how to fix bugs",
  "mode": "semantic",
  "limit": 10,
  "enhanceQuery": true  // 🆕 New parameter
}

// Response includes enhancement info
{
  "query": "debugging and error resolution techniques",
  "mode": "semantic",
  "totalResults": 15,
  "returnedResults": 10,
  "results": [...],
  "enhanced": {
    "rewritten": "debugging and error resolution techniques",
    "intent": "troubleshooting",
    "variationCount": 4,
    "processingTimeMs": 523
  }
}
```

---

## ⏳ Phase 3: Contextual Retrieval with Re-Ranking (PENDING)

**Status**: ⏳ **NOT STARTED**
**Duration**: Sprint 2 (Week 3-4)

### Objectives
Multi-stage retrieval with cross-encoder re-ranking and contextual scoring.

### Deliverables

#### 3.1 Cross-Encoder Re-Ranker
- ⏳ `src/modules/plugins/rerank/rerankProvider.interface.ts` - Provider interface
  - `IRerankProvider` interface (rerank method)
  - `RerankResult` type with score
  - Configuration types

- ⏳ `src/modules/plugins/rerank/transformersReranker.ts` - Local cross-encoder
  - Use `@xenova/transformers` for local re-ranking
  - Model: `cross-encoder/ms-marco-MiniLM-L-6-v2`
  - Batch processing support
  - Query-document pair scoring

- ⏳ `src/modules/plugins/rerank/cohereReranker.ts` - Cohere Rerank API (optional)
  - HTTP client for Cohere Rerank API
  - Higher quality, requires API key
  - Batch processing support

- ⏳ `src/modules/services/rerank/reranker.ts` - Re-ranking service
  - Two-stage retrieval pipeline:
    1. **Stage 1**: Retrieve top-100 candidates using bi-encoder (fast)
    2. **Stage 2**: Re-rank with cross-encoder (slower, more accurate)
    3. Return top-K final results (default K=10)

#### 3.2 Contextual Scoring
- ⏳ Implement contextual boost scoring
  - User's recent module access history
  - Current conversation context
  - Module dependencies (related modules boosted)
  - Temporal recency (newer modules slightly preferred)

- ⏳ Scoring formula:
  ```
  final_score = semantic_score * 0.4
              + cross_encoder_score * 0.4
              + context_boost * 0.2
  ```

#### 3.3 Integration
- ⏳ Update `SemanticSearchService` to support re-ranking pipeline
- ⏳ Add `contextualSearch(query, userContext, topK)` method
- ⏳ Update MCP `search` tool with:
  - `rerank: boolean` parameter
  - `context: UserContext` parameter

### Testing
- ⏳ Unit tests for re-rankers (70-75% coverage)
- ⏳ Integration tests for two-stage pipeline
- ⏳ Benchmark re-ranking performance (NDCG@10 improvement target: +15%)

---

## ⏳ Phase 4: Autonomous Chat Agent (PENDING)

**Status**: ⏳ **NOT STARTED**
**Duration**: Sprint 3 (Week 5-6)

### Objectives
Interactive terminal chat interface using MCP tools.

### Deliverables

#### 4.1 Chat Client Implementation
- ⏳ `src/cli/chat.ts` - Chat command entry point
- ⏳ `src/modules/agents/autonomousAgent.ts` - Agent orchestration
- ⏳ `src/modules/agents/mcpToolExecutor.ts` - MCP tool invocation
- ⏳ `src/modules/agents/conversationManager.ts` - Chat history management

#### 4.2 Agent Prompting
- ⏳ `prompts/autonomous-agent-system.md` - System prompt
  - Tool usage guidelines
  - Response format (cite module IDs, markdown)
  - When to search, retrieve, enhance queries

#### 4.3 CLI Integration
- ⏳ Add `chat` command to `src/index.ts`
  ```bash
  copilot-instructions chat
  copilot-instructions chat --model ollama:llama3.1
  copilot-instructions chat --history conversation.json
  ```

#### 4.4 Features
- ⏳ Multi-turn conversations with context retention
- ⏳ Autonomous tool use (agent decides when to use tools)
- ⏳ Streaming responses for better UX
- ⏳ Conversation save/load (JSON export)
- ⏳ `/help`, `/clear`, `/save`, `/load` commands
- ⏳ Color-coded output (user: cyan, assistant: green, tool calls: yellow)

### Testing
- ⏳ Mock MCP tool responses
- ⏳ Test conversation flow (multi-turn, tool chaining)
- ⏳ Test streaming output
- ⏳ Integration test with real Ollama server

---

## ⏳ Phase 5: Document Processing Pipeline (PENDING)

**Status**: ⏳ **NOT STARTED**
**Duration**: Sprint 3 (Week 5-6)

### Objectives
Auto-generate metadata, tags, embeddings, and relationships for uploaded documents.

### Deliverables

#### 5.1 Metadata Generation Service
- ⏳ `src/modules/services/processing/types.ts` - Processing types
- ⏳ `src/modules/services/processing/documentProcessor.ts` - Main pipeline
- ⏳ `src/modules/services/processing/metadataExtractor.ts` - LLM-based extraction
- ⏳ `src/modules/services/processing/relationshipMapper.ts` - Find related modules

#### 5.2 LLM Prompts
- ⏳ `prompts/extract-metadata.md` - Metadata extraction prompt
- ⏳ `prompts/generate-semantic-paragraph.md` - Dense paragraph generation

#### 5.3 CLI Integration
- ⏳ Add `process` command:
  ```bash
  copilot-instructions process document.md
  copilot-instructions process --input-dir ./docs --output-dir ./instructions-modules
  copilot-instructions process --dry-run document.md
  ```

#### 5.4 Pipeline Stages
- ⏳ Parse Document (extract text from MD, TXT, YAML)
- ⏳ Extract Metadata (title, description, category, tags, domain, layer)
- ⏳ Generate Semantic Paragraph (dense `meta.semantic` for embeddings)
- ⏳ Embed Content (generate vector representation)
- ⏳ Map Relationships (find top-5 related modules via cosine similarity)
- ⏳ Create YAML (write UMS v1.1 compliant `*.module.yml` file)

#### 5.5 Batch Processing
- ⏳ Process directories recursively
- ⏳ Progress bar with `cli-progress`
- ⏳ Parallel processing (5 concurrent LLM calls)
- ⏳ Error handling (skip failed docs, log errors, continue)

### Testing
- ⏳ Unit tests for metadata extraction (75% coverage)
- ⏳ Integration test for full pipeline
- ⏳ Manual QA for metadata accuracy (85%+ target)

---

## ⏳ Phase 6: Advanced Search Intelligence (PENDING)

**Status**: ⏳ **NOT STARTED**
**Duration**: Sprint 4 (Week 7-8)

### Objectives
End-to-end RAG with answer synthesis and source attribution.

### Deliverables

#### 6.1 Search Result Synthesis
- ⏳ `src/modules/services/synthesis/types.ts` - Synthesis types
- ⏳ `src/modules/services/synthesis/answerSynthesizer.ts` - RAG answer generation

#### 6.2 RAG Pipeline
1. ⏳ **Retrieve**: Enhanced query + contextual retrieval + re-ranking
2. ⏳ **Augment**: Fetch full content for top-K results
3. ⏳ **Generate**: LLM synthesizes answer from context
4. ⏳ **Cite**: Include module IDs and relevance scores

#### 6.3 Answer Quality Features
- ⏳ Source attribution (always cite module IDs)
- ⏳ Confidence scoring (based on retrieval scores)
- ⏳ Fallback handling ("Not enough information" if low confidence)
- ⏳ Multi-document synthesis (combine info from multiple modules)

#### 6.4 Integration
- ⏳ Agent can call `synthesize_answer` tool
- ⏳ Cache synthesized answers (query + context hash → answer)
- ⏳ New MCP tool: `synthesize_answer`
  - Parameters: `{query: string, context?: UserContext, maxSources: number}`
  - Returns: `{answer: string, sources: ModuleReference[], confidence: number}`

### Testing
- ⏳ Unit tests for synthesizer (75% coverage)
- ⏳ Integration test for end-to-end RAG
- ⏳ Manual QA for answer quality (90%+ accuracy target)

---

## 🧪 Testing Strategy

### Unit Tests (Per Phase)
- Each new service has `.test.ts` file co-located
- Mock LLM providers for deterministic tests
- Mock external APIs (Ollama, OpenAI, Cohere)
- Coverage target: **75-80%** for core logic

### Integration Tests
- ⏳ End-to-end RAG pipeline test
- ⏳ Agent multi-turn conversation test
- ⏳ Document processing pipeline test
- Create `test/integration/` directory

### Manual Testing
- ⏳ Test with real Ollama/OpenAI/Anthropic models
- ⏳ Validate query enhancement quality
- ⏳ Test chat agent UX in terminal
- ⏳ Verify metadata generation accuracy
- ⏳ Test RAG answer quality and citations

### Performance Benchmarks
- ⏳ Extend `src/benchmarks/` with new tests:
  - Query enhancement latency
  - Re-ranking throughput
  - Agent response time
  - Batch processing speed

---

## 📦 Dependencies

### Installed ✅
- `@anthropic-ai/sdk` - Claude API
- `openai` - OpenAI API
- `readline` - Terminal input
- `cli-progress` - Progress bars

### To Install ⏳
- `cohere-ai` - Cohere Rerank API (optional, Phase 3)
- `better-sqlite3` - SQLite for persistence (optional, future)
- `sqlite-vec` - Vector search extension (optional, future)

---

## 📊 Progress Metrics

### Overall Progress
- **Phases Complete**: 2 / 6 (33%)
- **Files Created**: 8
- **Files Modified**: 6
- **Lines of Code**: ~3,700
- **Test Coverage**: 0% (tests pending)

### By Phase
| Phase | Status | Files | Lines | Tests | Notes |
|-------|--------|-------|-------|-------|-------|
| Phase 1 | ✅ Complete | 5 new | ~2,500 | ⏳ Pending | LLM provider infrastructure |
| Phase 2 | ✅ Complete | 3 new | ~1,200 | ⏳ Pending | Query enhancement |
| Phase 3 | ⏳ Not Started | - | - | - | Contextual retrieval + re-ranking |
| Phase 4 | ⏳ Not Started | - | - | - | Autonomous chat agent |
| Phase 5 | ⏳ Not Started | - | - | - | Document processing pipeline |
| Phase 6 | ⏳ Not Started | - | - | - | Advanced search intelligence (RAG) |

---

## 🎯 Success Metrics

### Query Enhancement (Phase 2)
- ⏳ **Accuracy**: Manual evaluation of 50 test queries (target: 85%+)
- ⏳ **Search improvement**: Recall@10 improvement (target: +10%)
- ⏳ **Latency**: < 500ms per query enhancement

### Contextual Retrieval (Phase 3)
- ⏳ **Ranking quality**: NDCG@10 improvement (target: +15%)
- ⏳ **Latency**: Two-stage retrieval < 1s

### Autonomous Agent (Phase 4)
- ⏳ **Task completion rate**: 90%+ on test scenarios
- ⏳ **Tool usage efficiency**: < 3 tool calls per query
- ⏳ **Response quality**: Manual evaluation

### Document Processing (Phase 5)
- ⏳ **Metadata accuracy**: 85%+ on manual review
- ⏳ **Throughput**: 10+ documents/minute
- ⏳ **Relationship accuracy**: 80%+ precision on top-5

### Search Synthesis (Phase 6)
- ⏳ **Answer accuracy**: 90%+ on test questions
- ⏳ **Source citation rate**: 100%
- ⏳ **Confidence calibration**: High confidence → high accuracy

---

## 🚀 Next Steps

### Immediate (Testing Phase 1 & 2)
1. ⏳ Add unit tests for LLM providers (75% coverage)
2. ⏳ Add unit tests for QueryEnhancer (75% coverage)
3. ⏳ Integration test: Query enhancement with real Ollama
4. ⏳ Manual QA: Test with Ollama, OpenAI, Anthropic
5. ⏳ Benchmark query enhancement latency

### Sprint 2 (Phase 3: Contextual Retrieval)
1. ⏳ Design re-ranker provider interface
2. ⏳ Implement Transformers cross-encoder re-ranker
3. ⏳ Implement two-stage retrieval pipeline
4. ⏳ Add contextual scoring with user history
5. ⏳ Update SemanticSearchService with re-ranking
6. ⏳ Update MCP search tool with rerank parameter

### Sprint 3 (Phase 4 & 5)
1. ⏳ Implement autonomous chat agent
2. ⏳ Add chat CLI command
3. ⏳ Implement document processing pipeline
4. ⏳ Add process CLI command

### Sprint 4 (Phase 6 & Polish)
1. ⏳ Implement RAG answer synthesis
2. ⏳ Add synthesize_answer MCP tool
3. ⏳ Complete all integration tests
4. ⏳ Performance benchmarks
5. ⏳ Documentation updates
6. ⏳ User acceptance testing

---

## 📝 Documentation Status

### Completed ✅
- ✅ LLM provider interface documentation (JSDoc)
- ✅ Query enhancement system prompt (2500+ words)
- ✅ LLM-SERVICES-PROGRESS.md (implementation tracking)
- ✅ LLM-SERVICES-PLAN.md (this document)

### Pending ⏳
- ⏳ Update ARCHITECTURE.md with LLM services
- ⏳ Create LLM-SERVICES.md user guide
- ⏳ Add usage examples to README
- ⏳ API documentation for new MCP tools

---

## 🤝 Contributing Guidelines

When implementing remaining phases:

1. **Follow established patterns**
   - Plugin architecture for providers
   - Dependency injection via Container
   - Error handling with custom error classes
   - Logging at appropriate levels (debug, info, warn, error)

2. **Add comprehensive tests**
   - 75%+ coverage target
   - Co-located `.test.ts` files
   - Mock external dependencies
   - Integration tests in `test/integration/`

3. **Document thoroughly**
   - JSDoc comments for all public APIs
   - System prompts with examples
   - Update progress tracking documents

4. **Test with Ollama provider**
   - Ollama (local, free)

5. **Update this plan**
   - Mark tasks as complete (✅)
   - Update progress metrics
   - Document design decisions

---

## 🔮 Future Enhancements (Post-Phase 6)

### Phase 7: Advanced Features (Optional)
- Multi-query retrieval (use variations simultaneously)
- Query expansion with document feedback
- Personalized ranking models per user
- A/B testing framework for enhancement strategies
- Query suggestion / autocomplete
- Semantic caching (similar queries share cache)

### Phase 8: Monitoring & Optimization (Optional)
- LLM call latency tracking
- Cache hit rate monitoring
- Query enhancement quality metrics (NDCG, MRR)
- Cost tracking (API calls, tokens)
- Performance dashboards

### Phase 9: Database Migration (Optional)
- SQLite vector store implementation
- Conversation history persistence
- User context storage
- Query enhancement cache persistence

---

**Last Updated**: 2025-11-10
**Status**: Phase 2 Complete - Ready for Testing
**Next Milestone**: Testing Phase 1 & 2, then Phase 3 Implementation
