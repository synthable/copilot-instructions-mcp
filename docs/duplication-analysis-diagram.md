# Code Duplication Visual Analysis

## Current State: Duplicated Patterns Across Codebase

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Duplication Hotspots                          │
└─────────────────────────────────────────────────────────────────────┘

[Type Guard Duplication]
    ├─ content.ts ──┐
    │               ├─ isRecord() function (IDENTICAL)
    └─ parsing.ts ──┘

[Error Formatting Pattern] (19+ occurrences)
    ├─ performanceMetrics.ts ──┐
    ├─ vectorStore.ts          │
    ├─ semanticSearch.ts       ├─ error instanceof Error ? error.message : ...
    ├─ embeddingService.ts     │
    ├─ memoryUtils.ts          │
    └─ index.ts ───────────────┘

[YAML Parsing]
    ├─ content.ts ──┐
    │               ├─ Different type casting approaches
    └─ parsing.ts ──┘

[Memory Calculations]
    ├─ semantic_benchmark.ts ──┐
    ├─ memoryUtils.ts          ├─ process.memoryUsage().rss / (1024 * 1024)
    └─ performanceMetrics.ts ──┘

[Map-based Indexing]
    ├─ vectorStore.ts ──────────┐
    ├─ semanticSearch.ts        │
    ├─ content.ts               ├─ new Map(), id indexing patterns
    └─ embeddingService.ts ─────┘
```

## Proposed State: Consolidated Utilities

```
┌─────────────────────────────────────────────────────────────────────┐
│                      New Utility Modules                             │
└─────────────────────────────────────────────────────────────────────┘

[typeGuards.ts] ◄─────────┬─── content.ts
                           └─── parsing.ts
    • isRecord()
    • (other type guards)

[errorUtils.ts] ◄─────────┬─── performanceMetrics.ts (7×)
                           ├─── vectorStore.ts (4×)
                           ├─── semanticSearch.ts (10×)
                           ├─── embeddingService.ts (4×)
                           └─── index.ts (2×)
    • getErrorMessage()
    • toError()
    • getErrorOrUndefined()

[yamlUtils.ts] ◄──────────┬─── content.ts
                           └─── parsing.ts
    • parseYamlSafe()

[memoryUtils.ts] ◄────────┬─── semantic_benchmark.ts
  (ENHANCED)               ├─── memoryUtils.ts (self)
                           └─── performanceMetrics.ts
    • getMemoryUsageMB()
    • getMemoryUsageBytes()
    • (existing utilities)

[indexingUtils.ts] ◄──────┬─── vectorStore.ts
                           ├─── semanticSearch.ts
                           ├─── content.ts
                           └─── embeddingService.ts
    • createIdIndex()
    • createGroupIndex()
    • (other indexing patterns)

[baseService.ts] ◄────────┬─── embeddingService.ts
                           ├─── vectorStore.ts
                           └─── semanticSearchService
    • InitializableService (base class)
```

## Dependency Graph: Before vs After

### Before (Duplicated)
```
content.ts ─────────┐
                    ├──► [isRecord duplicated]
parsing.ts ─────────┘

embeddingService ───┐
vectorStore ────────┤
semanticSearch ─────├──► [error formatting duplicated]
memoryUtils ────────┤
performanceMetrics ─┘
```

### After (Consolidated)
```
content.ts ─────────┐
                    ├──► typeGuards.ts ──► [isRecord()] (single source)
parsing.ts ─────────┘

embeddingService ───┐
vectorStore ────────┤
semanticSearch ─────├──► errorUtils.ts ──► [error utilities] (single source)
memoryUtils ────────┤
performanceMetrics ─┘
```

## Impact Visualization

### Code Reduction by Category

```
High Priority Duplications:
    Type Guards        [██░░░░░░░░]  6 LOC
    Error Formatting   [████████░░] 30 LOC  ← BIGGEST IMPACT
    YAML Parsing       [███░░░░░░░] 10 LOC

Medium Priority Duplications:
    Memory Calcs       [████░░░░░░] 15 LOC
    String Validation  [███░░░░░░░] 12 LOC
    Map Indexing       [█████░░░░░] 20 LOC
    Initialization     [████████░░] 30 LOC

Total Savings: 123+ LOC
```

### Distribution of Duplications

```
By File Type:
    Services  ████████████████░░░░  (65%) - 27 locations
    Utils     ███████░░░░░░░░░░░░░  (25%) - 11 locations
    Other     ███░░░░░░░░░░░░░░░░░  (10%) -  5 locations

By Priority:
    High      ████████████░░░░░░░░  (50%) - 21 locations
    Medium    ████████░░░░░░░░░░░░  (38%) - 16 locations
    Low       ███░░░░░░░░░░░░░░░░░  (12%) -  6 locations
```

## Refactoring Flow

### Phase 1: Quick Wins (Week 1)
```
Day 1-2: Create Utilities
    [typeGuards.ts] ──► Test ──► Commit
    [errorUtils.ts] ───► Test ──► Commit
    [yamlUtils.ts] ────► Test ──► Commit

Day 3-5: Migrate Consumers
    Update content.ts ───► Test ──► Commit
    Update parsing.ts ───► Test ──► Commit
    Update 19 error sites ─► Test ──► Commit
```

### Phase 2: Medium Priority (Week 2)
```
Day 1-2: Enhance Utilities
    Enhance memoryUtils ─► Test ──► Commit
    Add validation helpers ► Test ──► Commit
    [indexingUtils.ts] ──► Test ──► Commit

Day 3-5: Base Classes & Migration
    [baseService.ts] ────► Test ──► Commit
    Update services ─────► Test ──► Commit
```

### Phase 3: Validation (Week 3)
```
Day 1-2: Testing
    Unit tests ──► Integration tests ──► Regression tests

Day 3-4: Documentation
    Update docs ──► Code review ──► Final approval

Day 5: Release
    Merge ──► Deploy ──► Monitor
```

## Module Relationships After Refactoring

```
┌────────────────────────────────────────────────────┐
│                Core Utilities                       │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │ typeGuards   │  │ errorUtils  │  │ yamlUtils │ │
│  └──────────────┘  └─────────────┘  └───────────┘ │
│  ┌──────────────┐  ┌─────────────┐                │
│  │ memoryUtils  │  │ indexingUtils│                │
│  └──────────────┘  └─────────────┘                │
└────────────────────────────────────────────────────┘
            ▲                    ▲
            │                    │
    ┌───────┴────────┐   ┌──────┴────────┐
    │   Services     │   │ Base Classes  │
    │  - content     │   │  - baseService│
    │  - parsing     │   └───────────────┘
    │  - embedding   │
    │  - search      │
    │  - validation  │
    └────────────────┘
```

## Complexity Reduction

### Cyclomatic Complexity Impact
```
Before:
    Each service implements own error handling ──► High complexity
    Each service implements own initialization ──► Repeated logic
    
After:
    Centralized utilities ──► Lower complexity per service
    Reusable components ──► Consistent patterns
    
Estimated Complexity Reduction: ~20-30%
```

## Maintainability Improvements

```
┌─────────────────────────┬──────────┬───────────┐
│ Metric                  │  Before  │   After   │
├─────────────────────────┼──────────┼───────────┤
│ Duplicate Locations     │    43+   │     0     │
│ Utility Modules         │     8    │    13     │
│ Error Handling Patterns │    19+   │     3     │
│ Type Guard Definitions  │     2    │     1     │
│ Lines of Code           │  7,500+  │  7,377-   │
│ Maintenance Cost        │   High   │  Medium   │
└─────────────────────────┴──────────┴───────────┘
```

## Testing Coverage Target

```
New Utility Modules:
    typeGuards.ts    ████████████████████ 100%
    errorUtils.ts    ████████████████████ 100%
    yamlUtils.ts     ████████████████████ 100%
    indexingUtils.ts ███████████████████░  95%
    baseService.ts   ██████████████████░░  90%

Overall Coverage:
    Before: ~75%
    Target: ~85%
    
Increase: +10 percentage points
```

## Risk Mitigation Strategy

```
[Low Risk Changes]
    Type guards ──► Easy to test ──► Low impact
    Error utils ──► Pure functions ──► Low impact

[Medium Risk Changes]
    YAML parsing ──► Type safety ──► Medium impact
    Memory utils ──► Well-tested ──► Medium impact

[Higher Risk Changes]
    Base classes ──► Inheritance ──► Higher impact
    Initialization ──► State mgmt ──► Higher impact

Risk Mitigation:
    1. Incremental rollout ──► One utility at a time
    2. Comprehensive testing ──► Unit + Integration
    3. Feature flags ──► Gradual adoption
    4. Rollback plan ──► Git revert ready
```

## Success Metrics

```
✅ Code Reduction: 123+ LOC saved
✅ Duplication: 43 → 0 locations
✅ Consistency: 19 error patterns → 3 utilities
✅ Type Safety: Centralized type guards
✅ Maintainability: Lower cognitive load
✅ Test Coverage: +10 percentage points
✅ Time to Fix Bugs: -30% (estimated)
✅ Onboarding Time: -20% (estimated)
```

---

## Legend

```
[█] = Completed
[░] = Remaining
──► = Data flow
◄── = Depends on
├─  = Related to
```

## References

- Full Report: `DUPLICATION_REPORT.md`
- Quick Reference: `DUPLICATION_SUMMARY.md`
- Source Code: `src/` directory
