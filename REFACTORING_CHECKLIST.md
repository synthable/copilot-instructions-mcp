# Duplication Refactoring Checklist

This checklist provides step-by-step instructions for eliminating the identified code duplications.

## Pre-Refactoring Setup

- [ ] Read `DUPLICATION_REPORT.md` thoroughly
- [ ] Review `DUPLICATION_SUMMARY.md` for quick overview
- [ ] Check `docs/duplication-analysis-diagram.md` for visual understanding
- [ ] Create feature branch: `git checkout -b refactor/eliminate-duplications`
- [ ] Ensure all tests pass: `npm test`
- [ ] Ensure build succeeds: `npm run build`
- [ ] Ensure linting passes: `npm run lint`

---

## Phase 1: High Priority Refactoring (Week 1)

### Task 1.1: Type Guard Utilities (Est: 30 min)

- [ ] **Create** `src/modules/utils/typeGuards.ts`:
  ```typescript
  /**
   * Type guard to check if value is a record object
   */
  export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
  ```

- [ ] **Update** `src/modules/services/content/content.ts`:
  - [ ] Add import: `import { isRecord } from '../../utils/typeGuards.js';`
  - [ ] Remove lines 547-549 (duplicate `isRecord` function)
  - [ ] Verify all usages now use imported function

- [ ] **Update** `src/modules/services/parsing/parsing.ts`:
  - [ ] Add import: `import { isRecord } from '../../utils/typeGuards.js';`
  - [ ] Remove lines 169-171 (duplicate `isRecord` function)
  - [ ] Verify all usages now use imported function

- [ ] **Test**:
  - [ ] Run: `npm run build`
  - [ ] Run: `npm test`
  - [ ] Run: `npm run typecheck`

- [ ] **Commit**: `git commit -m "refactor: extract isRecord type guard to shared utility"`

---

### Task 1.2: Error Utility Functions (Est: 1 hour)

- [ ] **Create** `src/modules/utils/errorUtils.ts`:
  ```typescript
  /**
   * Safely extracts error message from unknown error
   */
  export function getErrorMessage(
    error: unknown, 
    defaultMessage = 'Unknown error'
  ): string {
    return error instanceof Error ? error.message : defaultMessage;
  }

  /**
   * Converts unknown error to Error instance
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

- [ ] **Update** `src/modules/utils/performanceMetrics.ts` (7 occurrences):
  - [ ] Add import: `import { getErrorMessage, toError, getErrorOrUndefined } from './errorUtils.js';`
  - [ ] Line 98: Replace with `getErrorMessage(error)`
  - [ ] Line 101: Replace with `getErrorOrUndefined(error)`
  - [ ] Line 195: Replace with `toError(error)`
  - [ ] Line 232: Replace with `toError(error)`
  - [ ] Test: `npm test`

- [ ] **Update** `src/modules/utils/vectorStore.ts` (4 occurrences):
  - [ ] Add import
  - [ ] Replace error patterns
  - [ ] Test: `npm test`

- [ ] **Update** `src/modules/services/embedding/semanticSearch.ts` (10+ occurrences):
  - [ ] Add import
  - [ ] Replace all error patterns
  - [ ] Test: `npm test`

- [ ] **Update** `src/modules/services/embedding/embeddingService.ts` (4 occurrences):
  - [ ] Add import
  - [ ] Replace error patterns
  - [ ] Test: `npm test`

- [ ] **Update** `src/modules/utils/memoryUtils.ts` (1 occurrence):
  - [ ] Add import
  - [ ] Replace error patterns
  - [ ] Test: `npm test`

- [ ] **Update** `src/index.ts` (2 occurrences):
  - [ ] Add import
  - [ ] Replace error patterns
  - [ ] Test: `npm test`

- [ ] **Test Suite**:
  - [ ] Run: `npm run build`
  - [ ] Run: `npm test`
  - [ ] Run: `npm run typecheck`

- [ ] **Commit**: `git commit -m "refactor: consolidate error handling utilities"`

---

### Task 1.3: YAML Parsing Utilities (Est: 30 min)

- [ ] **Create** `src/modules/utils/yamlUtils.ts`:
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

- [ ] **Update** `src/modules/services/content/content.ts`:
  - [ ] Add import: `import { parseYamlSafe } from '../../utils/yamlUtils.js';`
  - [ ] Line 579: Replace `yamlParseFn(content)` with `parseYamlSafe(content)`
  - [ ] Remove import of `yamlParseFn` if no longer needed

- [ ] **Update** `src/modules/services/parsing/parsing.ts`:
  - [ ] Add import: `import { parseYamlSafe } from '../../utils/yamlUtils.js';`
  - [ ] Lines 85-89: Replace complex type casting with `parseYamlSafe(content)`
  - [ ] Remove import of `yamlParseFn` if no longer needed

- [ ] **Test**:
  - [ ] Run: `npm run build`
  - [ ] Run: `npm test`
  - [ ] Run: `npm run typecheck`

- [ ] **Commit**: `git commit -m "refactor: consolidate YAML parsing utilities"`

---

### Phase 1 Final Steps

- [ ] **Full Test Suite**:
  - [ ] `npm run build`
  - [ ] `npm test`
  - [ ] `npm run lint`
  - [ ] `npm run typecheck`

- [ ] **Review Changes**:
  - [ ] `git diff main`
  - [ ] Verify no unexpected changes

- [ ] **Create PR**: "Phase 1: High Priority Duplication Refactoring"

---

## Phase 2: Medium Priority Refactoring (Week 2)

### Task 2.1: Memory Calculation Utilities (Est: 30 min)

- [ ] **Enhance** `src/modules/utils/memoryUtils.ts`:
  ```typescript
  /**
   * Get memory usage in megabytes
   */
  export function getMemoryUsageMB(): number {
    return process.memoryUsage().rss / (1024 * 1024);
  }

  /**
   * Get memory usage in bytes
   */
  export function getMemoryUsageBytes(): number {
    return process.memoryUsage().rss;
  }
  ```

- [ ] **Update** `src/benchmarks/semantic_benchmark.ts`:
  - [ ] Line 30: Replace calculation with `getMemoryUsageMB()`

- [ ] **Update** `src/modules/utils/performanceMetrics.ts`:
  - [ ] Lines 60, 65, 79: Use `getMemoryUsageBytes()`

- [ ] **Test**:
  - [ ] `npm test`
  - [ ] Run benchmark if needed

- [ ] **Commit**: `git commit -m "refactor: consolidate memory calculation utilities"`

---

### Task 2.2: String Validation Helper (Est: 30 min)

- [ ] **Add to** `src/modules/services/validation/validation.ts`:
  ```typescript
  /**
   * Asserts that value is a non-empty string
   */
  function assertNonEmptyString(
    value: unknown,
    fieldName: string
  ): asserts value is string {
    if (!value || typeof value !== 'string') {
      throw new Error(`${fieldName} must be a non-empty string`);
    }
  }
  ```

- [ ] **Update** `validateFilePath` (line 78):
  - [ ] Replace validation with: `assertNonEmptyString(filePath, 'File path');`

- [ ] **Update** `validateSearchQuery` (line 161):
  - [ ] Replace validation with: `assertNonEmptyString(query, 'Search query');`

- [ ] **Update** `validateCategoryFilter` (line 244):
  - [ ] Adapt for optional string case

- [ ] **Update** `validateModuleIds` (line 315):
  - [ ] Use in array validation loop

- [ ] **Test**: `npm test`

- [ ] **Commit**: `git commit -m "refactor: add string validation helper"`

---

### Task 2.3: Indexing Utilities (Est: 1 hour)

- [ ] **Create** `src/modules/utils/indexingUtils.ts`:
  ```typescript
  /**
   * Creates an ID-based Map index from array of items
   */
  export function createIdIndex<T extends { id: string }>(
    items: T[]
  ): Map<string, T> {
    return new Map(items.map(item => [item.id, item]));
  }

  /**
   * Groups items by a key function
   */
  export function createGroupIndex<T>(
    items: T[],
    keyFn: (item: T) => string
  ): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const key = keyFn(item);
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }
    return groups;
  }
  ```

- [ ] **Update** `src/modules/utils/vectorStore.ts`:
  - [ ] Use `createIdIndex` for line 26
  - [ ] Use `createGroupIndex` for line 282

- [ ] **Update** `src/modules/services/embedding/semanticSearch.ts`:
  - [ ] Use `createIdIndex` for lines 160, 422

- [ ] **Update** `src/modules/services/content/content.ts`:
  - [ ] Use `createIdIndex` for line 633

- [ ] **Test**: `npm test`

- [ ] **Commit**: `git commit -m "refactor: add generic indexing utilities"`

---

### Task 2.4: Base Service Class (Est: 2 hours)

- [ ] **Create** `src/modules/core/baseService.ts`:
  ```typescript
  import type { ILogger } from './interfaces.js';

  /**
   * Base class for services with initialization lifecycle
   */
  export abstract class InitializableService {
    protected initialized = false;

    constructor(protected logger: ILogger) {}

    /**
     * Initialize the service
     */
    async initialize(): Promise<void> {
      if (this.initialized) {
        this.onAlreadyInitialized();
        return;
      }

      await this.performInitialization();
      this.initialized = true;
      this.onInitializationComplete();
    }

    /**
     * Check if service is initialized
     */
    isInitialized(): boolean {
      return this.initialized;
    }

    /**
     * Implement initialization logic
     */
    protected abstract performInitialization(): Promise<void>;

    /**
     * Called when already initialized
     */
    protected onAlreadyInitialized(): void {
      this.logger.debug(`${this.constructor.name} already initialized`);
    }

    /**
     * Called after successful initialization
     */
    protected onInitializationComplete(): void {
      this.logger.info(`${this.constructor.name} initialized successfully`);
    }
  }
  ```

- [ ] **Update** `src/modules/services/embedding/embeddingService.ts`:
  - [ ] Extend `InitializableService`
  - [ ] Move initialization logic to `performInitialization()`
  - [ ] Remove duplicate `initialized` field and checks

- [ ] **Update** `src/modules/utils/vectorStore.ts`:
  - [ ] Consider if this should extend base class
  - [ ] Refactor if appropriate

- [ ] **Update** `src/modules/services/embedding/semanticSearch.ts`:
  - [ ] Consider if this should extend base class
  - [ ] Refactor if appropriate

- [ ] **Test**: `npm test`

- [ ] **Commit**: `git commit -m "refactor: add base service class for initialization lifecycle"`

---

### Phase 2 Final Steps

- [ ] **Full Test Suite**:
  - [ ] `npm run build`
  - [ ] `npm test`
  - [ ] `npm run lint`
  - [ ] `npm run typecheck`

- [ ] **Create PR**: "Phase 2: Medium Priority Duplication Refactoring"

---

## Phase 3: Testing & Documentation (Week 3)

### Task 3.1: Unit Tests for New Utilities

- [ ] **Create** `src/modules/utils/typeGuards.test.ts`:
  - [ ] Test `isRecord()` with objects, nulls, primitives, arrays

- [ ] **Create** `src/modules/utils/errorUtils.test.ts`:
  - [ ] Test `getErrorMessage()` with Error, string, object
  - [ ] Test `toError()` conversions
  - [ ] Test `getErrorOrUndefined()` cases

- [ ] **Create** `src/modules/utils/yamlUtils.test.ts`:
  - [ ] Test `parseYamlSafe()` with valid YAML
  - [ ] Test error cases

- [ ] **Create** `src/modules/utils/indexingUtils.test.ts`:
  - [ ] Test `createIdIndex()` with various arrays
  - [ ] Test `createGroupIndex()` with different key functions

- [ ] **Create** `src/modules/core/baseService.test.ts`:
  - [ ] Test initialization lifecycle
  - [ ] Test double initialization prevention

- [ ] **Run Coverage**: `npm run coverage`
  - [ ] Verify 80%+ coverage for new utilities

---

### Task 3.2: Integration Testing

- [ ] **Run Full Test Suite**:
  - [ ] `npm test`
  - [ ] Verify all 81+ tests still pass

- [ ] **Manual Testing**:
  - [ ] Test semantic search functionality
  - [ ] Test content retrieval
  - [ ] Test parsing
  - [ ] Test validation

- [ ] **Performance Testing**:
  - [ ] Run benchmark: `npm run bench:semantic`
  - [ ] Verify no performance regression

---

### Task 3.3: Documentation Updates

- [ ] **Update** `README.md`:
  - [ ] Add note about refactoring
  - [ ] Link to duplication report

- [ ] **Update** `docs/ARCHITECTURE.md`:
  - [ ] Document new utility modules
  - [ ] Update module dependency diagrams

- [ ] **Create** `docs/UTILITIES.md`:
  - [ ] Document all utility functions
  - [ ] Provide usage examples
  - [ ] List common patterns

- [ ] **Update** inline documentation:
  - [ ] Add JSDoc comments to all new functions
  - [ ] Update changed function signatures

---

### Task 3.4: Code Review Preparation

- [ ] **Self-Review Checklist**:
  - [ ] All duplications eliminated
  - [ ] Tests pass
  - [ ] Coverage meets targets
  - [ ] Documentation complete
  - [ ] No console warnings
  - [ ] Linting passes
  - [ ] Type checking passes

- [ ] **Create Summary Document**:
  - [ ] List all changes made
  - [ ] Show before/after metrics
  - [ ] Highlight benefits

- [ ] **Prepare Demo**:
  - [ ] Show code reduction
  - [ ] Demonstrate improved consistency
  - [ ] Walk through new utilities

---

## Final Verification

### Pre-Merge Checklist

- [ ] **All Tests Pass**: `npm test`
- [ ] **Build Succeeds**: `npm run build`
- [ ] **Linting Clean**: `npm run lint`
- [ ] **Type Check**: `npm run typecheck`
- [ ] **Coverage Target**: `npm run coverage` (80%+)
- [ ] **No Regressions**: Manual testing complete

### Metrics Verification

- [ ] **Code Reduction**: Verify 123+ LOC saved
- [ ] **Duplication Count**: Verify 0 duplications remain
- [ ] **New Utilities**: Verify 5 new modules created
- [ ] **Test Coverage**: Verify coverage increased

### Documentation Verification

- [ ] All reports committed
- [ ] All checklists reviewed
- [ ] Architecture docs updated
- [ ] README updated

---

## Post-Merge Tasks

- [ ] **Monitor**: Watch for any issues in production
- [ ] **Gather Feedback**: From team on new utilities
- [ ] **Update Processes**: Incorporate learnings into coding standards
- [ ] **Knowledge Share**: Present refactoring results to team

---

## Notes & Tips

### Common Pitfalls to Avoid

1. ❌ Don't skip tests - they catch regressions
2. ❌ Don't commit unrelated changes - keep PRs focused
3. ❌ Don't rush - careful refactoring prevents bugs
4. ❌ Don't ignore linting errors - fix them immediately
5. ❌ Don't skip documentation - future you will thank you

### Best Practices

1. ✅ Commit after each completed task
2. ✅ Run tests frequently
3. ✅ Use descriptive commit messages
4. ✅ Keep PRs small and focused
5. ✅ Document as you go

### Time Tracking

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Phase 1 | 1 week | TBD | High priority duplications |
| Phase 2 | 1 week | TBD | Medium priority duplications |
| Phase 3 | 1 week | TBD | Testing and documentation |
| **Total** | **3 weeks** | **TBD** | To be updated during implementation |

---

## Resources

- **Full Report**: `DUPLICATION_REPORT.md`
- **Quick Summary**: `DUPLICATION_SUMMARY.md`
- **Visual Guide**: `docs/duplication-analysis-diagram.md`
- **Project README**: `README.md`

---

**Last Updated**: 2025-10-31  
**Status**: Ready for implementation  
**Assigned To**: _[Your Name]_
