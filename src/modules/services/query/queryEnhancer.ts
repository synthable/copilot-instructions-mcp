/**
 * Query Enhancer Service
 *
 * Enhances user queries using LLM for better search performance.
 * Provides query rewriting, synonym expansion, variation generation,
 * and intent classification.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ILLMService } from '../llm/llmService.js';
import type { ILogger } from '../../core/interfaces.js';
import type {
  EnhancedQuery,
  QueryIntent,
  UserContext,
  QueryEnhancementOptions,
  QueryEnhancementResult,
  QueryCacheEntry,
} from './types.js';

/**
 * LLM response format for query enhancement
 */
interface LLMEnhancementResponse {
  rewritten: string;
  variations: string[];
  synonyms: Record<string, string[]>;
  intent: QueryIntent;
  contextualTerms: string[];
  intentConfidence: number;
  explanation?: string;
}

/**
 * Query Enhancement Service Interface
 */
export interface IQueryEnhancer {
  /**
   * Enhance a user query for better search performance
   */
  enhance(
    query: string,
    options?: QueryEnhancementOptions
  ): Promise<QueryEnhancementResult>;

  /**
   * Clear the query enhancement cache
   */
  clearCache(): void;

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; size: number };
}

/**
 * Query Enhancer Implementation
 *
 * Caching Strategy:
 * - 15-minute TTL (Time To Live) per entry
 * - FIFO (First-In, First-Out) eviction when cache exceeds 1000 entries
 * - Cache key based on query + user context hash
 */
export class QueryEnhancer implements IQueryEnhancer {
  private systemPrompt: string;
  private cache = new Map<string, QueryCacheEntry>();
  private cacheHits = 0;
  private cacheMisses = 0;
  private readonly defaultTTL: number = 15 * 60 * 1000; // 15 minutes

  constructor(
    private llmService: ILLMService,
    private logger: ILogger,
    systemPromptPath?: string
  ) {
    // Load system prompt from file
    const promptPath =
      systemPromptPath ?? join(process.cwd(), 'prompts', 'query-enhancement.md');

    try {
      this.systemPrompt = readFileSync(promptPath, 'utf-8');
      this.logger.debug('Query enhancement system prompt loaded', {
        path: promptPath,
        length: this.systemPrompt.length,
      });
    } catch (error) {
      this.logger.error(
        'Failed to load query enhancement system prompt',
        error as Error
      );
      // Fallback to basic prompt
      this.systemPrompt = this.getFallbackPrompt();
    }
  }

  /**
   * Ensure the LLM service is initialized before use
   */
  private async ensureLLM(): Promise<void> {
    if (!this.llmService.isInitialized()) {
      this.logger.debug('Initializing LLM service for query enhancement');
      await this.llmService.initialize();
    }
  }

  /**
   * Enhance a user query
   */
  async enhance(
    query: string,
    options?: QueryEnhancementOptions
  ): Promise<QueryEnhancementResult> {
    const startTime = Date.now();

    // Ensure LLM service is initialized
    await this.ensureLLM();

    // Normalize options
    const opts: Required<QueryEnhancementOptions> = {
      maxVariations: options?.maxVariations ?? 5,
      maxSynonymsPerTerm: options?.maxSynonymsPerTerm ?? 3,
      includeContext: options?.includeContext ?? true,
      classifyIntent: options?.classifyIntent ?? true,
      userContext: options?.userContext ?? {},
      temperature: options?.temperature ?? 0.3,
      enableCache: options?.enableCache ?? true,
    };

    // Check cache
    if (opts.enableCache) {
      const cacheKey = this.generateCacheKey(query, opts.userContext);
      const cached = this.getFromCache(cacheKey);

      if (cached) {
        this.cacheHits++;
        this.logger.debug('Query enhancement cache hit', { query, cacheKey });

        return {
          query: cached,
          processingTimeMs: Date.now() - startTime,
          fromCache: true,
          provider: {
            name: this.llmService.getProviderName(),
            model: this.llmService.getModelName(),
          },
        };
      }

      this.cacheMisses++;
    }

    this.logger.debug('Enhancing query with LLM', {
      query,
      provider: this.llmService.getProviderName(),
      model: this.llmService.getModelName(),
      options: opts,
    });

    try {
      // Build user message with context
      const userMessage = this.buildUserMessage(query, opts.userContext);

      // Call LLM for enhancement
      const response = await this.llmService.chat(
        [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: userMessage },
        ],
        {
          temperature: opts.temperature,
          maxTokens: 1000,
        }
      );

      // Parse LLM response
      const enhanced = this.parseLLMResponse(response.content, query);

      // Limit variations and synonyms based on options
      enhanced.variations = enhanced.variations.slice(0, opts.maxVariations);

      // Limit synonyms per term
      for (const [term, syns] of enhanced.synonyms.entries()) {
        if (syns.length > opts.maxSynonymsPerTerm) {
          enhanced.synonyms.set(term, syns.slice(0, opts.maxSynonymsPerTerm));
        }
      }

      const processingTime = Date.now() - startTime;

      this.logger.info('Query enhancement successful', {
        query,
        rewritten: enhanced.rewritten,
        intent: enhanced.intent,
        variationCount: enhanced.variations.length,
        processingTimeMs: processingTime,
      });

      // Cache result
      if (opts.enableCache) {
        const cacheKey = this.generateCacheKey(query, opts.userContext);
        this.addToCache(cacheKey, enhanced);
      }

      return {
        query: enhanced,
        processingTimeMs: processingTime,
        fromCache: false,
        provider: {
          name: this.llmService.getProviderName(),
          model: this.llmService.getModelName(),
        },
      };
    } catch (error) {
      this.logger.error('Query enhancement failed', error as Error, { query });

      // Fallback: return minimal enhancement
      return {
        query: this.createFallbackEnhancement(query),
        processingTimeMs: Date.now() - startTime,
        fromCache: false,
      };
    }
  }

  /**
   * Clear the query enhancement cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.logger.debug('Query enhancement cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; size: number } {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.cache.size,
    };
  }

  /**
   * Build user message with context
   */
  private buildUserMessage(query: string, context: UserContext): string {
    const parts: string[] = [`Query: "${query}"`];

    if (context.recentModules && context.recentModules.length > 0) {
      parts.push(`\nRecent modules: ${context.recentModules.slice(0, 5).join(', ')}`);
    }

    if (context.conversationHistory && context.conversationHistory.length > 0) {
      const recent = context.conversationHistory.slice(-3);
      parts.push('\nConversation context:');
      for (const msg of recent) {
        parts.push(`${msg.role}: ${msg.content.slice(0, 100)}`);
      }
    }

    if (context.expertiseLevel) {
      parts.push(`\nUser expertise: ${context.expertiseLevel}`);
    }

    return parts.join('\n');
  }

  /**
   * Parse LLM response into EnhancedQuery
   */
  private parseLLMResponse(content: string, originalQuery: string): EnhancedQuery {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch =
        /```json\s*([\s\S]*?)\s*```/.exec(content) ??
        /```\s*([\s\S]*?)\s*```/.exec(content);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonStr) as LLMEnhancementResponse;

      const result: EnhancedQuery = {
        original: originalQuery,
        rewritten: parsed.rewritten,
        variations: parsed.variations,
        synonyms: new Map(Object.entries(parsed.synonyms)),
        intent: parsed.intent,
        contextualTerms: parsed.contextualTerms,
        intentConfidence: parsed.intentConfidence,
      };

      if (parsed.explanation) {
        result.explanation = parsed.explanation;
      }

      return result;
    } catch (error) {
      this.logger.warn(
        'Failed to parse LLM response for query enhancement',
        error as Error,
        { content: content.slice(0, 200) }
      );

      // Return fallback enhancement
      return this.createFallbackEnhancement(originalQuery);
    }
  }

  /**
   * Create fallback enhancement when LLM fails
   */
  private createFallbackEnhancement(query: string): EnhancedQuery {
    return {
      original: query,
      rewritten: query,
      variations: [query],
      synonyms: new Map(),
      intent: 'search',
      contextualTerms: [],
      intentConfidence: 0.5,
      explanation: 'Fallback enhancement (LLM unavailable)',
    };
  }

  /**
   * Generate cache key from query and context
   */
  private generateCacheKey(query: string, context: UserContext): string {
    const contextStr = JSON.stringify({
      recentModules: context.recentModules?.slice(0, 5),
      expertiseLevel: context.expertiseLevel,
    });

    return createHash('md5')
      .update(query + contextStr)
      .digest('hex');
  }

  /**
   * Get entry from cache (with TTL check)
   */
  private getFromCache(key: string): EnhancedQuery | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.enhanced;
  }

  /**
   * Add entry to cache
   */
  private addToCache(key: string, enhanced: EnhancedQuery): void {
    const entry: QueryCacheEntry = {
      query: enhanced.original,
      enhanced,
      timestamp: Date.now(),
      ttl: this.defaultTTL,
      contextHash: key,
    };

    this.cache.set(key, entry);

    // FIFO cache eviction: limit to 1000 entries
    // When limit exceeded, removes oldest entry (first insertion)
    // Note: This is FIFO (First-In, First-Out), not LRU (Least Recently Used)
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Get fallback system prompt
   */
  private getFallbackPrompt(): string {
    return `You are a query enhancement assistant. Given a user query, enhance it for better search.
Output JSON with: rewritten, variations (array), synonyms (object), intent, contextualTerms (array), intentConfidence (number).
Intent types: search, question, comparison, troubleshooting, exploration, clarification.`;
  }
}
