# Comprehensive Phased Implementation Plan: Plugin Architecture

## Overview
Refactor the copilot-instructions-mcp embedding and vector storage system to use a plugin architecture, enabling runtime provider switching while maintaining backward compatibility.

**Decision Summary:**
- **Approach**: Sequential implementation (Embedding first, Vector Store second)
- **Embedding Providers**: Transformers (wrap existing) + Ollama
- **Vector Store**: Interface only with FileVectorStore (SQLite-vec stub for future)
- **Test Coverage**: Essential paths only (70-75% target)

---

## Phase 1: Embedding Provider Plugin System
**Duration:** 3-4 days | **Priority:** High | **Dependencies:** None

### 1.1 Create Plugin Infrastructure (Day 1 Morning)

**New Files:**
- `src/modules/plugins/embedding/embeddingProvider.interface.ts` (~120 LOC)
  - Define `IEmbeddingProvider` interface
  - Define `EmbeddingProviderConfig` type
  - Define `EmbeddingProgressCallback` type
  - Export provider-agnostic types

**Interface Structure:**
```typescript
interface IEmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  initialize(config: EmbeddingProviderConfig): Promise<void>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  isInitialized(): boolean;
  dispose(): Promise<void>;
}
```

### 1.2 Wrap Existing EmbeddingService (Day 1 Afternoon)

**New File:**
- `src/modules/plugins/embedding/transformersProvider.ts` (~400 LOC)
  - Extract core logic from existing `EmbeddingService` (lines 86-647)
  - Implement `IEmbeddingProvider` interface
  - Preserve MD5 caching, batch processing, auto-disposal
  - Keep validation and error handling

**Refactor Existing:**
- `src/modules/services/embedding/embeddingService.ts`
  - Convert to thin wrapper around `IEmbeddingProvider`
  - Delegate to provider instance
  - Maintain existing `IEmbeddingService` interface for backward compatibility

### 1.3 Implement Ollama Provider (Day 2 Morning)

**New File:**
- `src/modules/plugins/embedding/ollamaProvider.ts` (~200 LOC)
  - Implement `IEmbeddingProvider` interface
  - HTTP client for Ollama API (`http://localhost:11434`)
  - Health check in `initialize()`
  - Error handling for connection failures
  - Support models: `nomic-embed-text`, `mxbai-embed-large`, custom

**Key Methods:**
- `embed()`: POST to `/api/embeddings`
- `embedBatch()`: Sequential processing (Ollama has no batch API)
- Error mapping: Ollama errors → provider errors

### 1.4 Update Configuration Schema (Day 2 Afternoon)

**Modify:**
- `src/config/config.schema.ts` (~50 LOC changes)
  - Expand `embeddingProvider` schema:
    ```typescript
    embeddingProvider: z.object({
      type: z.enum(['transformers', 'ollama']).default('transformers'),
      model: z.string().default('all-mpnet-base-v2'),
      baseUrl: z.string().optional(), // For Ollama
      dimensions: z.number().optional(),
      cacheEnabled: z.boolean().default(true),
      maxCacheSize: z.number().optional(),
    })
    ```
  - Add validation rules
  - Maintain backward compatibility (default to 'transformers')

**New File:**
- `src/config/config.migration.ts` (~80 LOC)
  - Helper to migrate old config format
  - Warning logger for deprecated fields

### 1.5 Update Dependency Injection Container (Day 3 Morning)

**Modify:**
- `src/modules/core/container.ts` (~150 LOC changes)
  - Add `createEmbeddingProvider()` factory method
  - Update `getEmbeddingService()` to use provider
  - Support provider configuration injection
  - Maintain lazy initialization pattern

**Factory Pattern:**
```typescript
private createEmbeddingProvider(config: Config): IEmbeddingProvider {
  switch (config.embeddingProvider.type) {
    case 'transformers':
      return new TransformersEmbeddingProvider(config.embeddingProvider);
    case 'ollama':
      return new OllamaEmbeddingProvider(config.embeddingProvider);
    default:
      throw new Error(`Unknown provider: ${config.embeddingProvider.type}`);
  }
}
```

### 1.6 Update Vector Generator Tool (Day 3 Afternoon)

**Modify:**
- `src/tools/vectorGenerator.ts` (~50 LOC changes)
  - Update to work with new provider system
  - Respect config provider selection
  - Add CLI flag: `--provider <type>` to override config
  - Progress callback compatibility

### 1.7 Essential Testing (Day 3-4)

**New Test Files:**
- `src/modules/plugins/embedding/transformersProvider.test.ts` (~200 LOC)
  - Test initialization and model loading
  - Test single embedding generation
  - Test batch processing with cache
  - Test auto-disposal timer
  - Mock `@xenova/transformers`

- `src/modules/plugins/embedding/ollamaProvider.test.ts` (~150 LOC)
  - Test Ollama API calls (mock fetch)
  - Test error handling (connection refused, 404, etc.)
  - Test batch sequential processing
  - Mock HTTP responses

- `src/modules/core/container.test.ts` (~100 LOC)
  - Test provider factory selection
  - Test configuration injection
  - Test lazy initialization

**Test Coverage Target:** 70-75% for new code (essential paths only)

### 1.8 Documentation (Day 4)

**New Files:**
- `docs/embedding-providers.md` (~300 lines)
  - Provider comparison table
  - Configuration examples
  - Migration guide from hardcoded Transformers
  - Troubleshooting guide

**Update Files:**
- `README.md` - Add provider configuration section
- `CLAUDE.md` - Update architecture notes

### Phase 1 Deliverables
✅ Plugin system for embedding providers
✅ Transformers provider (backward compatible)
✅ Ollama provider (new capability)
✅ Configuration schema expansion
✅ Essential test coverage
✅ Migration documentation

**Breaking Changes:** None (default behavior unchanged)
**New Capabilities:** Runtime provider switching via config

---

## Phase 2: Vector Store Interface
**Duration:** 2-3 days | **Priority:** Medium | **Dependencies:** Phase 1 complete

### 2.1 Create Vector Store Plugin Interface (Day 5 Morning)

**New Files:**
- `src/modules/plugins/vectorStore/vectorStore.interface.ts` (~150 LOC)
  - Define `IVectorStore` interface (minimal, extensible)
  - Define query/result types
  - Define storage config types

**Interface Structure:**
```typescript
interface IVectorStore {
  initialize(config: VectorStoreConfig): Promise<void>;
  close(): Promise<void>;

  // Search (required for semantic search)
  search(query: VectorQuery): Promise<VectorSearchResult[]>;

  // Indexing (for future real-time indexing)
  index(entry: VectorEntry): Promise<void>;
  indexBatch(entries: VectorEntry[]): Promise<void>;

  // Management
  getStats(): Promise<VectorStoreStats>;
  clear(): Promise<void>;
}
```

### 2.2 Wrap Existing VectorStore (Day 5 Afternoon)

**New File:**
- `src/modules/plugins/vectorStore/fileVectorStore.ts` (~300 LOC)
  - Extract logic from existing `VectorStore` (lines 45-351)
  - Implement `IVectorStore` interface
  - Preserve MessagePack/JSON loading
  - Keep integrity validation
  - Maintain index building (Map-based O(1) lookup)

**Key Preservation:**
- Multi-format support (MessagePack preferred)
- MD5 checksum validation
- In-memory indexing for fast queries
- Metadata management

### 2.3 Create SQLite-vec Stub (Day 6 Morning)

**New File:**
- `src/modules/plugins/vectorStore/sqliteVectorStore.ts` (~80 LOC)
  - Stub implementation of `IVectorStore`
  - Throws "not implemented" errors
  - Documents required dependencies (`better-sqlite3`, `sqlite-vec`)
  - Includes TODO comments for future implementation

**Purpose:** Establish interface contract, enable future implementation

### 2.4 Update Configuration Schema (Day 6 Morning)

**Modify:**
- `src/config/config.schema.ts` (~40 LOC changes)
  - Add `vectorStore` configuration:
    ```typescript
    vectorStore: z.object({
      type: z.enum(['file', 'sqlite']).default('file'),
      path: z.string().optional(),
      dimensions: z.number().optional(),
      enableIntegrityCheck: z.boolean().default(true),
    })
    ```

### 2.5 Update Container and Services (Day 6 Afternoon)

**Modify:**
- `src/modules/core/container.ts` (~100 LOC changes)
  - Add `createVectorStore()` factory
  - Update `getVectorStore()` to use factory
  - Inject config into vector store

- `src/modules/services/embedding/semanticSearch.ts` (~30 LOC changes)
  - Update to use `IVectorStore` explicitly
  - No behavioral changes (already uses interface)

**Modify:**
- `src/modules/utils/vectorStore.ts`
  - Mark as deprecated
  - Redirect to `FileVectorStore` for compatibility
  - Add deprecation warnings in logs

### 2.6 Essential Testing (Day 7)

**New Test Files:**
- `src/modules/plugins/vectorStore/fileVectorStore.test.ts` (~200 LOC)
  - Test vector loading (MessagePack and JSON)
  - Test search with cosine similarity
  - Test indexing (add new vectors)
  - Test integrity validation
  - Mock file system

- `src/modules/core/container.test.ts` (update, +50 LOC)
  - Test vector store factory
  - Test config injection

**Test Coverage Target:** 70% for new code

### 2.7 Documentation (Day 7)

**New Files:**
- `docs/vector-stores.md` (~200 lines)
  - Vector store comparison (file vs SQLite-vec future)
  - Configuration guide
  - Performance characteristics
  - Future SQLite-vec implementation guide

**Update Files:**
- `docs/architecture.md` - Update architecture diagrams
- `docs/embedding-providers.md` - Link to vector stores doc

### Phase 2 Deliverables
✅ IVectorStore interface
✅ FileVectorStore (backward compatible)
✅ SQLite-vec stub (future preparation)
✅ Configuration schema
✅ Essential tests
✅ Documentation

**Breaking Changes:** None (defaults to file-based storage)
**New Capabilities:** Interface for future storage backends

---

## Phase 3 (Future Scope): SQLite-vec Implementation
**Not included in current plan - documented for future reference**

When ready to implement:
1. Add dependencies: `better-sqlite3`, `sqlite-vec` extension
2. Implement `SQLiteVectorStore` (~400 LOC)
   - Table schema with vector column
   - Vector similarity search using SQLite-vec functions
   - Metadata filtering support
   - Migration from file-based storage
3. Performance benchmarking
4. Migration tooling
5. Documentation updates

**Estimated Effort:** 2-3 days

---

## Testing Strategy

### Test Approach
- **Unit Tests:** Mock external dependencies (transformers, fetch, file system)
- **Integration Tests:** Test provider switching via config
- **Coverage Target:** 70-75% for new code (essential paths)
- **Skip:** Edge cases, complex error scenarios (add later if needed)

### Mock Patterns
```typescript
// Transformers
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(() => mockPipeline),
  env: { allowLocalModels: false },
}));

// Ollama
global.fetch = vi.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ embedding: [0.1, 0.2, ...] }),
}));

// File System
vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve(mockBuffer)),
}));
```

---

## Migration & Backward Compatibility

### Existing Deployments
**No action required** - defaults maintain current behavior:
- `embeddingProvider.type` defaults to `'transformers'`
- `vectorStore.type` defaults to `'file'`
- Pre-computed vectors still used when available

### Opt-In Migration
Users can add to `config.json`:
```json
{
  "embeddingProvider": {
    "type": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434"
  }
}
```

### Deprecation Strategy
- Old `VectorStore` class: Deprecated but functional (proxies to `FileVectorStore`)
- Remove in: v2.0.0 (breaking change release)
- Warnings: Log deprecation notices when old class is used

---

## Risk Mitigation

### High-Risk Items
1. **Vector format compatibility** - Mitigation: FileVectorStore preserves exact format
2. **Cache invalidation** - Mitigation: MD5 hashing unchanged, cache keys compatible
3. **Performance regression** - Mitigation: No architectural changes to critical paths

### Rollback Plan
- Phase 1: Git revert + remove plugin files (no breaking changes)
- Phase 2: Git revert + config default to 'file' type (no breaking changes)

---

## Timeline Summary

| Phase | Duration | Developer Days |
|-------|----------|----------------|
| Phase 1: Embedding Plugins | 3-4 days | 4 days |
| Phase 2: Vector Store Interface | 2-3 days | 3 days |
| **Total** | **5-7 days** | **7 days** |

**Assumptions:**
- Single developer, full-time
- No major blockers
- Existing familiarity with codebase

---

## File Change Summary

### New Files (13 total)
```
src/modules/plugins/
├── embedding/
│   ├── embeddingProvider.interface.ts        [new]
│   ├── transformersProvider.ts               [new]
│   ├── ollamaProvider.ts                     [new]
│   ├── transformersProvider.test.ts          [new]
│   └── ollamaProvider.test.ts                [new]
└── vectorStore/
    ├── vectorStore.interface.ts              [new]
    ├── fileVectorStore.ts                    [new]
    ├── sqliteVectorStore.ts (stub)           [new]
    └── fileVectorStore.test.ts               [new]

src/config/
└── config.migration.ts                       [new]

docs/
├── embedding-providers.md                    [new]
├── vector-stores.md                          [new]
└── architecture.md                           [new]
```

### Modified Files (7 total)
```
src/config/config.schema.ts                   [modify ~100 LOC]
src/modules/core/container.ts                 [modify ~250 LOC]
src/modules/core/container.test.ts            [modify ~150 LOC]
src/modules/services/embedding/embeddingService.ts [modify ~200 LOC]
src/modules/utils/vectorStore.ts              [deprecate, ~20 LOC]
src/tools/vectorGenerator.ts                  [modify ~50 LOC]
README.md                                     [modify ~30 LOC]
```

### Total LOC Impact
- **New Code:** ~2,200 LOC
- **Modified Code:** ~650 LOC
- **Test Code:** ~650 LOC
- **Documentation:** ~800 lines

---

## Success Criteria

### Phase 1 Complete When:
- ✅ Can switch between Transformers and Ollama via config
- ✅ Existing deployments work without changes
- ✅ Essential tests pass (70%+ coverage)
- ✅ Documentation published
- ✅ No performance regression on benchmark

### Phase 2 Complete When:
- ✅ IVectorStore interface defined and implemented
- ✅ FileVectorStore works identically to old VectorStore
- ✅ SQLite-vec stub exists with clear TODOs
- ✅ Essential tests pass
- ✅ Config supports vectorStore type selection
- ✅ Documentation complete

---

## Current Implementation Analysis Reference

### Key Preservation Requirements from Current Code

**From EmbeddingService (embeddingService.ts):**
- MD5-based caching system (lines 626-628)
- Batch processing with cache checks (lines 186-212)
- Auto-disposal timer after 5 minutes idle (lines 633-647)
- Progress callback support for UI feedback
- Text truncation based on model limits (1536 chars for all-mpnet-base-v2)
- Comprehensive validation and error handling (lines 389-508)

**From VectorStore (vectorStore.ts):**
- MessagePack format preference (production, lines 57-72)
- JSON fallback (development, lines 74-90)
- In-memory indexing: `Map<string, ModuleVector>` for O(1) lookups (lines 269-301)
- MD5 integrity validation (lines 162-212)
- Metadata management from separate metadata.json (lines 217-242)

**From SemanticSearchService (semanticSearch.ts):**
- Pre-computed vector loading priority (lines 102-105)
- Fallback to runtime embedding generation
- Parallel batch processing (line 312)
- Cosine similarity calculation for search (lines 398-510)
- Hybrid search with weighted blending (lines 512-571)

---

## Next Steps After Plan Approval

1. Create feature branch: `feat/embedding-provider-plugins`
2. Phase 1.1: Create plugin infrastructure
3. Commit frequently with descriptive messages
4. Run tests after each sub-phase
5. Update documentation as features complete
6. Code review before merge
7. Create GitHub issue tracking both phases

---

## Notes

- This plan prioritizes **backward compatibility** - no breaking changes
- **Performance preservation** is critical - maintain caching and batch processing
- **Testing** focuses on essential paths to balance coverage vs. timeline
- **Documentation** is comprehensive to enable future contributors
- **SQLite-vec** is explicitly deferred to Phase 3 (future work)

---

**Document Version:** 1.0
**Created:** 2025-10-29
**Last Updated:** 2025-10-29
**Status:** Ready for Implementation
