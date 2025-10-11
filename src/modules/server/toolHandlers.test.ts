import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolHandlers } from './toolHandlers.js';
import type {
  IInstructionModuleParser,
  ISearchService,
  IContentService,
  ISemanticSearchService,
  ILogger,
} from '../core/interfaces.js';
import type { SearchResult } from '../core/types.js';

// Mock services
const createMockLogger = (): ILogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createMockParser = (): IInstructionModuleParser => ({
  parseInstructionModules: vi.fn(),
  clearModuleCache: vi.fn(),
});

const createMockSearchService = (): ISearchService => ({
  searchInstructionModules: vi.fn(),
});

const createMockContentService = (): IContentService => ({
  getModulesContent: vi.fn(),
});

const createMockSemanticSearchService = (): ISemanticSearchService => ({
  buildIndex: vi.fn(),
  semanticSearch: vi.fn(),
  hybridSearch: vi.fn(),
});

describe('ToolHandlers - Unified Search', () => {
  let toolHandlers: ToolHandlers;
  let mockParser: IInstructionModuleParser;
  let mockSearchService: ISearchService;
  let mockContentService: IContentService;
  let mockSemanticSearchService: ISemanticSearchService;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockParser = createMockParser();
    mockSearchService = createMockSearchService();
    mockContentService = createMockContentService();
    mockSemanticSearchService = createMockSemanticSearchService();
    mockLogger = createMockLogger();

    toolHandlers = new ToolHandlers(
      mockParser,
      mockSearchService,
      mockContentService,
      mockSemanticSearchService,
      mockLogger
    );
  });

  describe('handleSearch - mode validation', () => {
    it('should default to fuzzy mode when mode is not specified', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'test.module',
          name: 'Test Module',
          description: 'Test',
          category: 'Foundation',
          subcategory: 'Test',
          filePath: 'test.md',
          score: 0.8,
          matchedFields: ['name'],
        },
      ];

      vi.mocked(mockSearchService.searchInstructionModules).mockResolvedValue(
        mockResults
      );

      const result = await toolHandlers.handleSearch({ query: 'test' });

      expect(result.mode).toBe('fuzzy');
      expect(mockSearchService.searchInstructionModules).toHaveBeenCalled();
    });

    it('should accept fuzzy mode', async () => {
      vi.mocked(mockSearchService.searchInstructionModules).mockResolvedValue([]);

      const result = await toolHandlers.handleSearch({
        query: 'test',
        mode: 'fuzzy',
      });

      expect(result.mode).toBe('fuzzy');
    });

    it('should accept semantic mode', async () => {
      vi.mocked(mockSemanticSearchService.semanticSearch).mockResolvedValue([]);

      const result = await toolHandlers.handleSearch({
        query: 'test',
        mode: 'semantic',
      });

      expect(result.mode).toBe('semantic');
    });

    it('should accept hybrid mode', async () => {
      vi.mocked(mockSearchService.searchInstructionModules).mockResolvedValue([]);
      vi.mocked(mockSemanticSearchService.hybridSearch).mockResolvedValue([]);

      const result = await toolHandlers.handleSearch({
        query: 'test',
        mode: 'hybrid',
      });

      expect(result.mode).toBe('hybrid');
    });

    it('should handle case-insensitive mode values', async () => {
      vi.mocked(mockSearchService.searchInstructionModules).mockResolvedValue([]);
      vi.mocked(mockSemanticSearchService.semanticSearch).mockResolvedValue([]);

      const result1 = await toolHandlers.handleSearch({
        query: 'test',
        mode: 'FUZZY',
      });
      expect(result1.mode).toBe('fuzzy');

      const result2 = await toolHandlers.handleSearch({
        query: 'test',
        mode: 'Semantic',
      });
      expect(result2.mode).toBe('semantic');
    });

    it('should throw error for invalid mode', async () => {
      await expect(
        toolHandlers.handleSearch({ query: 'test', mode: 'invalid' })
      ).rejects.toThrow(
        "Invalid search mode: 'invalid'. Must be one of: fuzzy, semantic, hybrid"
      );
    });

    it('should throw error for non-string mode', async () => {
      await expect(
        toolHandlers.handleSearch({ query: 'test', mode: 123 })
      ).rejects.toThrow('Search mode must be a string');
    });
  });

  describe('handleSearch - fuzzy mode', () => {
    it('should perform fuzzy search and return results', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'foundation.logic.deductive-reasoning',
          name: 'Deductive Reasoning',
          description: 'Logical deduction',
          category: 'Foundation',
          subcategory: 'Logic',
          filePath: 'foundation/logic/deductive-reasoning.md',
          score: 0.9,
          matchedFields: ['name', 'description'],
        },
      ];

      vi.mocked(mockSearchService.searchInstructionModules).mockResolvedValue(
        mockResults
      );

      const result = await toolHandlers.handleSearch({
        query: 'deductive logic',
        mode: 'fuzzy',
        limit: 10,
      });

      expect(result).toEqual({
        query: 'deductive logic',
        mode: 'fuzzy',
        totalResults: 1,
        returnedResults: 1,
        results: mockResults,
      });

      expect(mockSearchService.searchInstructionModules).toHaveBeenCalledWith([
        'deductive',
        'logic',
      ]);
    });

    it('should respect limit parameter', async () => {
      const mockResults: SearchResult[] = Array(20)
        .fill(null)
        .map((_, i) => ({
          id: `test.module.${i}`,
          name: `Test Module ${i}`,
          description: 'Test',
          category: 'Foundation',
          subcategory: 'Test',
          filePath: `test${i}.md`,
          score: 0.8 - i * 0.01,
          matchedFields: ['name'],
        }));

      vi.mocked(mockSearchService.searchInstructionModules).mockResolvedValue(
        mockResults
      );

      const result = await toolHandlers.handleSearch({
        query: 'test',
        mode: 'fuzzy',
        limit: 5,
      });

      expect(result.returnedResults).toBe(5);
      expect(result.results).toHaveLength(5);
      expect(result.totalResults).toBe(20);
    });
  });

  describe('handleSearch - semantic mode', () => {
    it('should perform semantic search with options', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'technology.language.typescript.generics',
          name: 'TypeScript Generics',
          description: 'Generic programming',
          category: 'Technology',
          subcategory: 'Language',
          filePath: 'technology/language/typescript/generics.md',
          score: 0.85,
          matchedFields: ['semantic'],
        },
      ];

      vi.mocked(mockSemanticSearchService.semanticSearch).mockResolvedValue(
        mockResults
      );

      const result = await toolHandlers.handleSearch({
        query: 'type-safe reusable code',
        mode: 'semantic',
        limit: 10,
        tiers: ['technology'],
        similarityThreshold: 0.7,
        includeRelevanceLevel: true,
      });

      expect(result).toEqual({
        query: 'type-safe reusable code',
        mode: 'semantic',
        totalResults: 1,
        returnedResults: 1,
        results: mockResults,
        filters: { tiers: ['technology'] },
      });

      expect(mockSemanticSearchService.semanticSearch).toHaveBeenCalledWith(
        'type-safe reusable code',
        10,
        {
          tiers: ['technology'],
          similarityThreshold: 0.7,
          // Note: includeRelevanceLevel is not included when true (default behavior)
        }
      );
    });

    it('should handle tier filtering as string or array', async () => {
      vi.mocked(mockSemanticSearchService.semanticSearch).mockResolvedValue([]);

      // Single tier as string
      await toolHandlers.handleSearch({
        query: 'test',
        mode: 'semantic',
        tiers: 'foundation',
      });

      expect(mockSemanticSearchService.semanticSearch).toHaveBeenCalledWith(
        'test',
        10,
        { tiers: ['foundation'] }
      );

      // Multiple tiers as array
      await toolHandlers.handleSearch({
        query: 'test',
        mode: 'semantic',
        tiers: ['foundation', 'principle'],
      });

      expect(mockSemanticSearchService.semanticSearch).toHaveBeenCalledWith(
        'test',
        10,
        { tiers: ['foundation', 'principle'] }
      );
    });
  });

  describe('handleSearch - hybrid mode', () => {
    it('should perform hybrid search with default alpha', async () => {
      const lexicalResults: SearchResult[] = [
        {
          id: 'test.module',
          name: 'Test',
          description: 'Test',
          category: 'Foundation',
          subcategory: 'Test',
          filePath: 'test.md',
          score: 0.7,
          matchedFields: ['name'],
        },
      ];

      const hybridResults: SearchResult[] = [
        {
          id: 'test.module',
          name: 'Test',
          description: 'Test',
          category: 'Foundation',
          subcategory: 'Test',
          filePath: 'test.md',
          score: 0.8,
          matchedFields: ['name', 'semantic'],
        },
      ];

      vi.mocked(mockSearchService.searchInstructionModules).mockResolvedValue(
        lexicalResults
      );
      vi.mocked(mockSemanticSearchService.hybridSearch).mockResolvedValue(
        hybridResults
      );

      const result = await toolHandlers.handleSearch({
        query: 'test',
        mode: 'hybrid',
        limit: 10,
      });

      expect(result).toEqual({
        query: 'test',
        mode: 'hybrid',
        alpha: 0.6, // Default alpha
        totalResults: 1,
        returnedResults: 1,
        results: hybridResults,
      });

      expect(mockSemanticSearchService.hybridSearch).toHaveBeenCalledWith(
        ['test'],
        lexicalResults,
        0.6,
        10,
        {}
      );
    });

    it('should accept custom alpha value', async () => {
      vi.mocked(mockSearchService.searchInstructionModules).mockResolvedValue([]);
      vi.mocked(mockSemanticSearchService.hybridSearch).mockResolvedValue([]);

      await toolHandlers.handleSearch({
        query: 'test',
        mode: 'hybrid',
        alpha: 0.8,
      });

      expect(mockSemanticSearchService.hybridSearch).toHaveBeenCalledWith(
        ['test'],
        [],
        0.8,
        10,
        {}
      );
    });

    it('should validate alpha is between 0 and 1', async () => {
      vi.mocked(mockSearchService.searchInstructionModules).mockResolvedValue([]);
      vi.mocked(mockSemanticSearchService.hybridSearch).mockResolvedValue([]);

      // Alpha too high - should use default
      await toolHandlers.handleSearch({
        query: 'test',
        mode: 'hybrid',
        alpha: 1.5,
      });

      expect(mockSemanticSearchService.hybridSearch).toHaveBeenCalledWith(
        ['test'],
        [],
        0.6, // Falls back to default
        10,
        {}
      );
    });
  });

  describe('handleSearch - error handling', () => {
    it('should throw error when query is missing', async () => {
      await expect(toolHandlers.handleSearch(undefined)).rejects.toThrow(
        "Missing arguments for search. 'query' is required."
      );
    });

    it('should validate query parameter', async () => {
      await expect(toolHandlers.handleSearch({ query: '' })).rejects.toThrow(
        'Search query must be a non-empty string'
      );
    });

    it('should validate limit parameter', async () => {
      await expect(
        toolHandlers.handleSearch({ query: 'test', limit: 100 })
      ).rejects.toThrow('Search limit must be between 1 and 50');
    });
  });
});
