# Code Duplication Quick Reference

## Overview
Analysis of the `copilot-instructions-mcp` codebase identified **123+ lines** of duplicated code across **43+ locations**.

## Priority Summary

### 🔴 High Priority (Fix First)
1. **Type Guard Duplication** - `isRecord()` function duplicated in 2 files
2. **Error Formatting** - Pattern repeated 19+ times across codebase
3. **YAML Parsing Setup** - Inconsistent approaches in 2 locations

### 🟡 Medium Priority
4. **Memory Calculations** - Similar patterns in 5+ locations
5. **String Validation** - Repeated logic in 4+ places
6. **Map Indexing** - Similar indexing in 8+ locations
7. **Initialization Pattern** - Boilerplate in 3 services

### 🟢 Low Priority (Acceptable)
8. **List Rendering** - Appropriate encapsulation
9. **Cosine Similarity** - Already properly extracted

## Quick Wins (Easy Fixes)

### 1. Extract `isRecord()` Type Guard (5 minutes)
```typescript
// Create: src/modules/utils/typeGuards.ts
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
```
**Files to update:**
- `src/modules/services/content/content.ts:547`
- `src/modules/services/parsing/parsing.ts:169`

### 2. Create Error Utilities (15 minutes)
```typescript
// Create: src/modules/utils/errorUtils.ts
export function getErrorMessage(error: unknown, defaultMessage = 'Unknown error'): string {
  return error instanceof Error ? error.message : defaultMessage;
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function getErrorOrUndefined(error: unknown): Error | undefined {
  return error instanceof Error ? error : undefined;
}
```
**Replace in 19+ locations** - see full report for list

### 3. Unified YAML Parsing (10 minutes)
```typescript
// Create: src/modules/utils/yamlUtils.ts
import { parse as yamlParseFn } from 'yaml';

export function parseYamlSafe(content: string): unknown {
  return yamlParseFn(content);
}
```
**Files to update:**
- `src/modules/services/content/content.ts`
- `src/modules/services/parsing/parsing.ts`

## Impact Metrics

| Metric | Value |
|--------|-------|
| **Duplicate Locations** | 43+ |
| **Duplicate LOC** | 123+ |
| **New Utility Files** | 5 recommended |
| **Effort Estimate** | 2-3 weeks |
| **Risk Level** | Low (with proper testing) |

## Recommended New Files

1. `src/modules/utils/typeGuards.ts` - Type guard utilities
2. `src/modules/utils/errorUtils.ts` - Error handling utilities
3. `src/modules/utils/yamlUtils.ts` - YAML parsing utilities
4. `src/modules/utils/indexingUtils.ts` - Map indexing utilities
5. `src/modules/core/baseService.ts` - Base service class

## Implementation Order

### Week 1: High Priority
1. Create type guard utilities
2. Create error utilities
3. Create YAML utilities
4. Update all consumers
5. Run tests

### Week 2: Medium Priority
1. Memory calculation utilities
2. Validation helpers
3. Indexing utilities
4. Base service class
5. Run tests

### Week 3: Testing & Documentation
1. Add unit tests
2. Update documentation
3. Code review
4. Final testing

## Benefits

✅ **123+ fewer lines of duplicated code**  
✅ **43+ locations consolidated**  
✅ **Improved consistency**  
✅ **Better maintainability**  
✅ **Enhanced type safety**  
✅ **Easier testing**

## Full Report

See **[DUPLICATION_REPORT.md](./DUPLICATION_REPORT.md)** for:
- Detailed analysis of each duplication
- Code examples
- Complete recommendations
- Testing strategy
- Anti-patterns to avoid
- Full file list

---

**Next Steps:**
1. Review this summary
2. Read full report
3. Prioritize fixes based on team capacity
4. Create issues for each refactoring task
5. Implement in phases

**Questions?** See full report or contact the team.
