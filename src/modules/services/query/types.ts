/**
 * Query Enhancement Types
 *
 * Defines data structures for query enhancement, intent classification,
 * and query expansion for improved search performance.
 */

/**
 * User query intent classification
 */
export type QueryIntent =
  | 'search' // Looking for specific modules/information
  | 'question' // Asking a question that requires synthesis
  | 'comparison' // Comparing concepts or approaches
  | 'troubleshooting' // Debugging or fixing an issue
  | 'exploration' // Browsing or discovering concepts
  | 'clarification'; // Seeking clarification on a topic

/**
 * Enhanced query with expansions and intent
 */
export interface EnhancedQuery {
  /**
   * Original user query
   */
  original: string;

  /**
   * Rewritten query optimized for search
   */
  rewritten: string;

  /**
   * Multiple query variations for multi-query retrieval
   */
  variations: string[];

  /**
   * Synonym map: original term -> [synonyms]
   */
  synonyms: Map<string, string[]>;

  /**
   * Detected query intent
   */
  intent: QueryIntent;

  /**
   * Contextual terms extracted or inferred
   */
  contextualTerms: string[];

  /**
   * Confidence score for intent classification (0-1)
   */
  intentConfidence: number;

  /**
   * Optional explanation of how query was enhanced
   */
  explanation?: string;
}

/**
 * User context for contextual query enhancement
 */
export interface UserContext {
  /**
   * Recently accessed module IDs (for personalization)
   */
  recentModules?: string[];

  /**
   * Current conversation history (for chat-based queries)
   */
  conversationHistory?: {
    role: 'user' | 'assistant';
    content: string;
  }[];

  /**
   * User's domain/expertise level
   */
  expertiseLevel?: 'beginner' | 'intermediate' | 'advanced';

  /**
   * Preferred categories or tags
   */
  preferences?: {
    categories?: string[];
    tags?: string[];
  };

  /**
   * Session metadata (timestamp, session ID, etc.)
   */
  sessionMetadata?: Record<string, unknown>;
}

/**
 * Query enhancement options
 */
export interface QueryEnhancementOptions {
  /**
   * Maximum number of query variations to generate
   * @default 5
   */
  maxVariations?: number;

  /**
   * Maximum number of synonyms per term
   * @default 3
   */
  maxSynonymsPerTerm?: number;

  /**
   * Whether to include contextual terms
   * @default true
   */
  includeContext?: boolean;

  /**
   * Whether to classify intent
   * @default true
   */
  classifyIntent?: boolean;

  /**
   * User context for personalization
   */
  userContext?: UserContext;

  /**
   * Temperature for LLM generation (0.0-1.0)
   * Lower = more conservative, Higher = more creative
   * @default 0.3
   */
  temperature?: number;

  /**
   * Whether to cache enhanced queries
   * @default true
   */
  enableCache?: boolean;
}

/**
 * Query enhancement result with metadata
 */
export interface QueryEnhancementResult {
  /**
   * The enhanced query
   */
  query: EnhancedQuery;

  /**
   * Time taken to enhance query (ms)
   */
  processingTimeMs: number;

  /**
   * Whether result was from cache
   */
  fromCache: boolean;

  /**
   * LLM provider and model used
   */
  provider?: {
    name: string;
    model: string;
  };
}

/**
 * Cache entry for enhanced queries
 */
export interface QueryCacheEntry {
  /**
   * Original query (cache key)
   */
  query: string;

  /**
   * Enhanced query result
   */
  enhanced: EnhancedQuery;

  /**
   * Timestamp when cached
   */
  timestamp: number;

  /**
   * Context hash (for context-sensitive caching)
   */
  contextHash?: string;

  /**
   * TTL in milliseconds
   */
  ttl: number;
}
