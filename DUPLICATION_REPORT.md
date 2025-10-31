# Code Duplication Analysis Report

**Project:** copilot-instructions-mcp  
**Date:** 2025-10-31  
**Total Source Files Analyzed:** 22 TypeScript files (excluding tests)  
**Total Lines of Code:** ~7,500+ LOC

## Executive Summary

This report identifies duplicated code patterns and functionality across the codebase. The analysis reveals several categories of duplication ranging from identical utility functions to similar structural patterns. While some duplication is acceptable (e.g., small type guards), consolidating others would improve maintainability and reduce technical debt.

**Key Findings:**
- 🔴 **High Priority**: 3 categories of significant duplication
- 🟡 **Medium Priority**: 4 categories of moderate duplication  
- 🟢 **Low Priority**: 2 categories of acceptable/minor duplication

---

## 1. 🔴 HIGH PRIORITY DUPLICATIONS

### 1.1 Identical Type Guard Functions

**Duplication Level:** EXACT (100% identical)

**Locations:**
- `src/modules/services/content/content.ts:547-549`
- `src/modules/services/parsing/parsing.ts:169-171`

**Code:**
```typescript
// Appears in both files
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
```

**Impact:** Low code volume but high maintenance risk. Changes to type checking logic would need to be made in multiple places.

**Recommendation:**
- Extract to shared utilities module: `src/modules/utils/typeGuards.ts`
- Export as `isRecord()` function
- Import in both content.ts and parsing.ts
- **Estimated savings:** 3 lines × 2 files = 6 lines

---

### 1.2 Error Message Formatting Pattern

**Duplication Level:** Pattern repeated 19+ times

**Pattern:**
```typescript
error instanceof Error ? error.message : 'Unknown error'
```

**Locations (sample):**
- `src/modules/utils/performanceMetrics.ts` (7 occurrences)
- `src/modules/utils/vectorStore.ts` (4 occurrences)
- `src/modules/services/embedding/semanticSearch.ts` (10+ occurrences)
- `src/modules/services/embedding/embeddingService.ts` (4 occurrences)
- `src/index.ts` (2 occurrences)

**Variations:**
```typescript
// Pattern 1: Just the message
error instanceof Error ? error.message : 'Unknown error'

// Pattern 2: Pass the error object
error instanceof Error ? error : undefined

// Pattern 3: Create new Error
error instanceof Error ? error : new Error(String(error))
```

**Impact:** High maintenance burden. Error handling inconsistencies across the codebase.

**Recommendation:**
- Create error utility functions in `src/modules/utils/errorUtils.ts`:
  ```typescript
  /**
   * Safely extracts error message from unknown error value
   */
  export function getErrorMessage(error: unknown, defaultMessage = 'Unknown error'): string {
    return error instanceof Error ? error.message : defaultMessage;
  }
  
  /**
   * Converts unknown value to Error instance
   */
  export function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
  
  /**
   * Returns error if it's an Error instance, undefined otherwise
   */
  export function getErrorOrUndefined(error: unknown): Error | undefined {
    return error instanceof Error ? error : undefined;
  }
  ```
- Replace all 19+ occurrences with utility function calls
- **Estimated savings:** 30+ lines, improved consistency

---

### 1.3 YAML Parsing Setup Pattern

**Duplication Level:** Similar setup in 2 locations

**Locations:**
- `src/modules/services/content/content.ts:27, 579`
- `src/modules/services/parsing/parsing.ts:23, 85-89`

**Pattern:**
```typescript
// content.ts
import { parse as yamlParseFn } from 'yaml';
// ...
const parsed: unknown = yamlParseFn(content);

// parsing.ts  
import { parse as yamlParseFn } from 'yaml';
// ...
const parseYaml: (s: string) => unknown = yamlParseFn as unknown as (
  s: string
) => unknown;
const parsedUnknown = parseYaml(content);
```

**Impact:** Inconsistent type casting approaches for the same operation.

**Recommendation:**
- Create unified YAML parsing utility in `src/modules/utils/yamlUtils.ts`:
  ```typescript
  import { parse as yamlParseFn } from 'yaml';

  /**
   * Unified YAML parsing wrapper
   * Returns unknown type - caller is responsible for type validation
   */
  export function parseYamlSafe(content: string): unknown {
    return yamlParseFn(content);
  }
  ```
- Both files should use the same utility
- Consolidate type casting logic in one place
- **Estimated savings:** 10+ lines, consistent type handling

---

## 2. 🟡 MEDIUM PRIORITY DUPLICATIONS

### 2.1 Memory Usage Calculation Pattern

**Duplication Level:** Similar calculations in 5+ locations

**Locations:**
- `src/benchmarks/semantic_benchmark.ts:30`
- `src/modules/utils/memoryUtils.ts:36-37`
- `src/modules/utils/performanceMetrics.ts:60, 65, 79`

**Patterns:**
```typescript
// Pattern 1: RSS in MB
process.memoryUsage().rss / (1024 * 1024)

// Pattern 2: Full memory info
const memUsage = process.memoryUsage();
const usedMB = memUsage.rss / (1024 * 1024);
```

**Impact:** Repeated calculation logic across performance monitoring code.

**Recommendation:**
- Enhance `src/modules/utils/memoryUtils.ts` with centralized functions:
  ```typescript
  export function getMemoryUsageMB(): number {
    return process.memoryUsage().rss / (1024 * 1024);
  }
  
  export function getMemoryUsageBytes(): number {
    return process.memoryUsage().rss;
  }
  ```
- Update all locations to use these utilities
- **Estimated savings:** 15+ lines

---

### 2.2 String Type Validation Pattern

**Duplication Level:** Repeated in validation.ts and other files

**Pattern:**
```typescript
if (!value || typeof value !== 'string') {
  throw new Error('Value must be a non-empty string');
}
```

**Locations:**
- `src/modules/services/validation/validation.ts` (4+ occurrences)
  - Line 78: `validateFilePath`
  - Line 161: `validateSearchQuery`
  - Line 244: `validateCategoryFilter`
  - Line 315: `validateModuleIds`

**Impact:** Repeated validation logic throughout validation module.

**Recommendation:**
- Create reusable validation helper in `validation.ts`:
  ```typescript
  function assertNonEmptyString(
    value: unknown,
    fieldName: string
  ): asserts value is string {
    if (!value || typeof value !== 'string') {
      throw new Error(`${fieldName} must be a non-empty string`);
    }
  }
  ```
- Use in all validation functions
- **Estimated savings:** 12+ lines

---

### 2.3 Map-based Indexing Pattern

**Duplication Level:** Similar indexing logic in multiple services

**Locations:**
- `src/modules/utils/vectorStore.ts:26-27, 282`
- `src/modules/services/embedding/semanticSearch.ts:160, 422, 437, 535`
- `src/modules/services/content/content.ts:633`
- `src/modules/services/embedding/embeddingService.ts:54`

**Patterns:**
```typescript
// Pattern 1: ID-based index
new Map<string, ModuleVector>()
const moduleMap = new Map(modules.map(m => [m.id, m]));

// Pattern 2: Tier/category grouping
new Map<string, ModuleVector[]>()
const tierGroups = new Map<string, ModuleVector[]>();

// Pattern 3: Cache with timestamp
new Map<string, { content: T; timestamp: number }>()
```

**Impact:** Similar indexing/caching logic scattered across services.

**Recommendation:**
- Create generic indexing utilities in `src/modules/utils/indexingUtils.ts`:
  ```typescript
  export function createIdIndex<T extends { id: string }>(
    items: T[]
  ): Map<string, T> {
    return new Map(items.map(item => [item.id, item]));
  }
  
  export function createGroupIndex<T>(
    items: T[],
    keyFn: (item: T) => string
  ): Map<string, T[]> {
    // Group items by key function
  }
  ```
- **Estimated savings:** 20+ lines, improved reusability

---

### 2.4 Initialization State Management Pattern

**Duplication Level:** Similar patterns across services

**Locations:**
- `src/modules/services/embedding/embeddingService.ts:53, 66-71`
- `src/modules/utils/vectorStore.ts:29, 45-49`
- `src/modules/services/embedding/semanticSearch.ts:85-93`

**Pattern:**
```typescript
private initialized = false;

async initialize(): Promise<void> {
  if (this.initialized) {
    this.logger.debug('Already initialized');
    return;
  }
  
  // initialization logic
  
  this.initialized = true;
}
```

**Impact:** Boilerplate initialization code repeated across multiple services.

**Recommendation:**
- Create base service class with initialization lifecycle:
  ```typescript
  abstract class InitializableService {
    protected initialized = false;
    
    async initialize(): Promise<void> {
      if (this.initialized) {
        this.onAlreadyInitialized();
        return;
      }
      await this.performInitialization();
      this.initialized = true;
    }
    
    protected abstract performInitialization(): Promise<void>;
    protected onAlreadyInitialized(): void { }
  }
  ```
- Services extend this base class
- **Estimated savings:** 30+ lines

---

## 3. 🟢 LOW PRIORITY DUPLICATIONS

### 3.1 List Rendering Logic

**Duplication Level:** Minor - specialized rendering

**Location:**
- `src/modules/services/content/content.ts:256-269`

**Code:**
```typescript
private renderList(items: string[], lines: string[], listType: ListType): void {
  items.forEach((item, index) => {
    if (!item) return;
    
    if (listType === 'task') {
      const checkboxItem = item.startsWith('- [ ]') ? item : `- [ ] ${item}`;
      lines.push(checkboxItem);
    } else if (listType === 'ordered') {
      lines.push(`${(index + 1).toString()}. ${item}`);
    } else {
      lines.push(`- ${item}`);
    }
  });
}
```

**Impact:** Self-contained, single responsibility. Used multiple times within same class.

**Recommendation:**
- **Keep as-is** - This is appropriate encapsulation within the ContentService
- No refactoring needed

---

### 3.2 Cosine Similarity Function

**Duplication Level:** None - single implementation

**Location:**
- `src/modules/services/embedding/semantic.ts:12-28`

**Code:**
```typescript
export function cosine(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0)
    return 0;
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

**Impact:** Already properly extracted to dedicated module. Used in:
- `src/modules/services/embedding/semanticSearch.ts` (3 imports/uses)

**Recommendation:**
- **Keep as-is** - Excellent example of proper code organization
- No duplication exists

---

## 4. STRUCTURAL PATTERNS (Not Duplications)

### 4.1 Validation Functions in validation.ts

**Pattern:** Multiple similar `validate*` functions

**Locations:**
- `validateFilePath` (line 73)
- `validateSearchQuery` (line 160)
- `validateSearchLimit` (line 200)
- `validateCategoryFilter` (line 239)
- `validateModuleIds` (line 300)
- `validateFoundationLayer` (line 376)

**Assessment:** This is **appropriate design**, not duplication. Each function:
- Validates a specific domain concept
- Has unique validation logic
- Follows consistent naming and structure
- Part of the public API

**Recommendation:**
- **Keep as-is** - This is good API design

---

### 4.2 Service Factory Functions

**Pattern:** `create*Service` factory functions

**Locations:**
- `createResourceService` (resourceService.ts:266)
- `createProductionSemanticConfig` (semanticConfig.ts)
- `createTestSemanticConfig` (semanticConfig.ts)

**Assessment:** Factory pattern implementation, not duplication.

**Recommendation:**
- **Keep as-is** - Standard design pattern

---

## 5. SECURITY PATTERNS

### 5.1 Security Limits Configuration

**Location:** `src/modules/services/parsing/parsing.ts:28-34`

```typescript
const SECURITY_LIMITS = {
  MAX_FILE_SIZE_BYTES: 100 * 1024,
  MAX_YAML_DEPTH: 10,
  MAX_ARRAY_LENGTH: 1000,
  MAX_STRING_LENGTH: 10000,
  PARSE_TIMEOUT_MS: 5000,
} as const;
```

**Used in:**
- `validateFileSize` (parsing.ts:39-56)
- `parseYamlSafely` (parsing.ts:61-115)
- `validateYamlStructure` (parsing.ts:120-165)

**Assessment:** Well-centralized security configuration. Not duplicated.

**Recommendation:**
- **Keep as-is** - Good security practice
- Consider moving to config.schema.ts if needed project-wide

---

## 6. SUMMARY & IMPACT ANALYSIS

### Duplication Metrics

| Category | Locations | Estimated LOC | Priority | Effort |
|----------|-----------|---------------|----------|--------|
| Type Guards (isRecord) | 2 | 6 | High | Low |
| Error Formatting | 19+ | 30+ | High | Medium |
| YAML Parsing Setup | 2 | 10+ | High | Low |
| Memory Calculations | 5+ | 15+ | Medium | Low |
| String Validation | 4+ | 12+ | Medium | Low |
| Map Indexing | 8+ | 20+ | Medium | Medium |
| Initialization | 3 | 30+ | Medium | Medium |
| **TOTAL** | **43+** | **123+** | - | - |

### Code Reduction Potential

By implementing all recommendations:
- **Direct LOC Reduction:** ~123 lines
- **Maintenance Burden Reduction:** Consolidating 43+ duplicate patterns into ~8 reusable utilities
- **Consistency Improvement:** Unified approach to common operations
- **Type Safety Enhancement:** Centralized type guards and casting

---

## 7. IMPLEMENTATION ROADMAP

### Phase 1: High Priority (Week 1)
1. ✅ Create `src/modules/utils/typeGuards.ts` with `isRecord()`
2. ✅ Create `src/modules/utils/errorUtils.ts` with error formatting functions
3. ✅ Create `src/modules/utils/yamlUtils.ts` with unified YAML parsing
4. ✅ Update all consumers to use new utilities
5. ✅ Run tests to verify no regressions

### Phase 2: Medium Priority (Week 2)
1. ✅ Enhance `memoryUtils.ts` with memory calculation functions
2. ✅ Add validation helpers to `validation.ts`
3. ✅ Create `indexingUtils.ts` for Map-based indexing
4. ✅ Create base `InitializableService` class
5. ✅ Update services to use new utilities
6. ✅ Run tests

### Phase 3: Testing & Documentation (Week 3)
1. ✅ Add unit tests for all new utilities
2. ✅ Update documentation
3. ✅ Code review
4. ✅ Final integration testing

---

## 8. RECOMMENDED NEW FILES

The following new utility modules should be created:

1. **`src/modules/utils/typeGuards.ts`**
   - `isRecord()` - Type guard for record objects
   - Other common type guards as needed

2. **`src/modules/utils/errorUtils.ts`**
   - `getErrorMessage()` - Safe error message extraction
   - `toError()` - Convert unknown to Error
   - `getErrorOrUndefined()` - Optional error extraction

3. **`src/modules/utils/yamlUtils.ts`**
   - `parseYamlSafe()` - Type-safe YAML parsing
   - Consolidate YAML parsing type casts

4. **`src/modules/utils/indexingUtils.ts`**
   - `createIdIndex()` - Create ID-based Map index
   - `createGroupIndex()` - Group items by key function
   - Other indexing utilities

5. **`src/modules/core/baseService.ts`**
   - `InitializableService` - Base class for services with initialization lifecycle
   - Common service patterns

**Total New Files:** 5  
**Estimated Size:** ~200-300 LOC total

---

## 9. ANTI-PATTERNS TO AVOID

During refactoring, avoid these common mistakes:

1. ❌ **Over-abstraction** - Don't create utilities for patterns used only once or twice
2. ❌ **Premature optimization** - Focus on maintainability, not micro-optimizations
3. ❌ **Breaking changes** - Ensure all refactoring is backward compatible
4. ❌ **Missing tests** - Add tests for all new utilities before refactoring
5. ❌ **Large PRs** - Break work into small, reviewable chunks

---

## 10. TESTING STRATEGY

For each refactored component:

1. ✅ **Unit tests** for new utility functions
2. ✅ **Integration tests** verifying behavior unchanged
3. ✅ **Regression tests** for edge cases
4. ✅ **Type checking** with `npm run typecheck`
5. ✅ **Existing tests** must all pass

**Test Coverage Target:** 80%+ for all new utilities

---

## 11. CONCLUSION

This analysis identifies **123+ lines of duplicated code** across **43+ locations** in the codebase. By implementing the recommended refactorings, the codebase will benefit from:

- ✅ Reduced maintenance burden
- ✅ Improved consistency
- ✅ Enhanced type safety
- ✅ Better testability
- ✅ Clearer code organization

The refactoring can be completed in **3 weeks** with minimal risk by following the phased approach outlined above.

---

## Appendix A: Files Analyzed

**Source Files (22):**
- benchmarks/semantic_benchmark.ts (209 LOC)
- config/config.schema.ts (minimal)
- index.ts (minimal)
- modules/core/container.ts (320 LOC)
- modules/core/interfaces.ts (356 LOC)
- modules/core/types.ts (343 LOC)
- modules/server/server.ts (380 LOC)
- modules/server/serverInitializer.ts (minimal)
- modules/server/toolHandlers.ts (317 LOC)
- modules/server/transport.ts (200 LOC)
- modules/services/content/content.ts (876 LOC)
- modules/services/embedding/embeddingService.ts (648 LOC)
- modules/services/embedding/semantic.ts (29 LOC)
- modules/services/embedding/semanticConfig.ts (357 LOC)
- modules/services/embedding/semanticSearch.ts (572 LOC)
- modules/services/parsing/parsing.ts (513 LOC)
- modules/services/resources/resourceService.ts (272 LOC)
- modules/services/search/search.ts (337 LOC)
- modules/services/validation/validation.ts (402 LOC)
- modules/utils/logger.ts (363 LOC)
- modules/utils/memoryUtils.ts (254 LOC)
- modules/utils/performanceMetrics.ts (379 LOC)
- modules/utils/vectorStore.ts (352 LOC)
- tools/vectorGenerator.ts (340 LOC)

**Total LOC:** ~7,500+

---

**Report Generated By:** Automated Code Analysis  
**Methodology:** Static analysis, pattern matching, manual code review  
**Confidence Level:** High (verified with grep, manual inspection)
