/**
 * @fileoverview Tests for ResourceService functionality.
 *
 * This module tests URI-based resource access to instruction modules,
 * including URI parsing, format handling, and error cases.
 *
 * @author MCP Server Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceService } from './resourceService.js';
import type { IDependencies, IInstructionModuleParser } from './interfaces.js';
import type { InstructionModule } from './types.js';

describe('ResourceService', () => {
  let resourceService: ResourceService;
  let mockDependencies: IDependencies;
  let mockParser: IInstructionModuleParser;
  let mockModules: InstructionModule[];

  beforeEach(() => {
    // Setup mock modules
    mockModules = [
      {
        id: 'foundation.reasoning.systems-thinking',
        name: 'Systems Thinking',
        description: 'Reason about systems and feedback loops',
        category: 'Foundation',
        subcategory: 'reasoning',
        filePath: 'foundation/reasoning/systems-thinking.module.yml',
        semantic: 'Systems thinking semantic content',
        tags: ['reasoning', 'systems'],
        layer: 1,
      },
      {
        id: 'technology.testing.jest.mocking',
        name: 'Jest Mocking',
        description: 'Mock functions and modules in Jest',
        category: 'Technology',
        subcategory: 'testing',
        filePath: 'technology/testing/jest/mocking.module.yml',
      },
      {
        id: 'principle.architecture.solid',
        name: 'SOLID Principles',
        description: 'SOLID object-oriented design principles',
        category: 'Principle',
        filePath: 'principle/architecture/solid.md',
      },
    ];

    // Setup mock parser
    mockParser = {
      parseInstructionModules: vi.fn().mockResolvedValue(mockModules),
      clearModuleCache: vi.fn(),
    };

    // Setup mock dependencies
    mockDependencies = {
      fileSystem: {
        readFileSync: vi.fn().mockReturnValue('# Module Content\n\nTest content'),
        existsSync: vi.fn().mockReturnValue(true),
        readdirSync: vi.fn(),
        statSync: vi.fn(),
      },
      pathUtils: {
        join: vi.fn((...args) => args.join('/')),
        resolve: vi.fn((...args) => args.join('/')),
        relative: vi.fn((from: string, to: string) => to.replace(`${from}/`, '')),
      },
      processUtils: {
        cwd: vi.fn().mockReturnValue('/test/cwd'),
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };

    resourceService = new ResourceService(mockDependencies, mockParser);
  });

  describe('URI Parsing', () => {
    it('should parse URI with default markdown format', async () => {
      const result = await resourceService.readResource(
        'module://foundation/reasoning/systems-thinking'
      );

      expect(result.uri).toBe('module://foundation/reasoning/systems-thinking');
      expect(result.metadata?.moduleId).toBe('foundation.reasoning.systems-thinking');
      expect(result.metadata?.format).toBe('markdown');
    });

    it('should parse URI with explicit yaml format', async () => {
      const result = await resourceService.readResource(
        'module://technology/testing/jest/mocking/yaml'
      );

      expect(result.uri).toBe('module://technology/testing/jest/mocking/yaml');
      expect(result.metadata?.moduleId).toBe('technology.testing.jest.mocking');
      expect(result.metadata?.format).toBe('yaml');
    });

    it('should parse URI with explicit markdown format', async () => {
      const result = await resourceService.readResource(
        'module://foundation/reasoning/systems-thinking/markdown'
      );

      expect(result.metadata?.format).toBe('markdown');
    });

    it('should parse URI with raw format', async () => {
      const result = await resourceService.readResource(
        'module://principle/architecture/solid/raw'
      );

      expect(result.metadata?.format).toBe('raw');
    });

    it('should handle URI with multiple path segments', async () => {
      const result = await resourceService.readResource(
        'module://technology/testing/jest/mocking'
      );

      expect(result.metadata?.moduleId).toBe('technology.testing.jest.mocking');
    });

    it('should throw error for invalid URI scheme', async () => {
      await expect(
        resourceService.readResource('file://foundation/reasoning/systems-thinking')
      ).rejects.toThrow('Invalid URI scheme');
    });

    it('should throw error for empty path', async () => {
      await expect(resourceService.readResource('module://')).rejects.toThrow(
        'Empty path after scheme'
      );
    });

    it('should throw error for format-only URI', async () => {
      await expect(resourceService.readResource('module://yaml')).rejects.toThrow(
        'Format specified but no module path provided'
      );
    });
  });

  describe('Module Resolution', () => {
    it('should resolve module by ID', async () => {
      const result = await resourceService.readResource(
        'module://foundation/reasoning/systems-thinking'
      );

      expect(result.metadata?.name).toBe('Systems Thinking');
      expect(result.metadata?.category).toBe('Foundation');
      expect(result.metadata?.subcategory).toBe('reasoning');
    });

    it('should throw error for non-existent module', async () => {
      await expect(
        resourceService.readResource('module://nonexistent/module/path')
      ).rejects.toThrow('Module not found');
    });

    it('should throw error if file does not exist', async () => {
      mockDependencies.fileSystem.existsSync = vi.fn().mockReturnValue(false);

      await expect(
        resourceService.readResource('module://foundation/reasoning/systems-thinking')
      ).rejects.toThrow('File not found');
    });
  });

  describe('Content Format Handling', () => {
    describe('Raw Format', () => {
      it('should return raw file content for raw format', async () => {
        const rawContent = 'Raw file content';
        mockDependencies.fileSystem.readFileSync = vi.fn().mockReturnValue(rawContent);

        const result = await resourceService.readResource(
          'module://foundation/reasoning/systems-thinking/raw'
        );

        expect(result.contents[0].text).toBe(rawContent);
        expect(result.contents[0].mimeType).toBe('text/plain');
      });
    });

    describe('YAML Format', () => {
      it('should return raw YAML content for .module.yml files', async () => {
        const yamlContent = 'id: test\nversion: 1.0.0';
        mockDependencies.fileSystem.readFileSync = vi.fn().mockReturnValue(yamlContent);

        const result = await resourceService.readResource(
          'module://foundation/reasoning/systems-thinking/yaml'
        );

        expect(result.contents[0].text).toBe(yamlContent);
        expect(result.contents[0].mimeType).toBe('application/x-yaml');
      });

      it('should return note for legacy markdown files with yaml format', async () => {
        const result = await resourceService.readResource(
          'module://principle/architecture/solid/yaml'
        );

        expect(result.contents[0].text).toContain('Legacy Markdown Module');
        expect(result.contents[0].mimeType).toBe('application/x-yaml');
      });
    });

    describe('Markdown Format', () => {
      it('should return formatted markdown for YAML modules', async () => {
        const yamlContent = 'id: test\nversion: 1.0.0';
        mockDependencies.fileSystem.readFileSync = vi.fn().mockReturnValue(yamlContent);

        const result = await resourceService.readResource(
          'module://foundation/reasoning/systems-thinking/markdown'
        );

        expect(result.contents[0].text).toContain('# Systems Thinking');
        expect(result.contents[0].text).toContain('**ID:** foundation.reasoning.systems-thinking');
        expect(result.contents[0].text).toContain('**Category:** Foundation');
        expect(result.contents[0].text).toContain('```yaml');
        expect(result.contents[0].mimeType).toBe('text/markdown');
      });

      it('should return formatted markdown for legacy markdown modules', async () => {
        const markdownContent = '# Content\n\nTest content';
        mockDependencies.fileSystem.readFileSync = vi.fn().mockReturnValue(markdownContent);

        const result = await resourceService.readResource(
          'module://principle/architecture/solid/markdown'
        );

        expect(result.contents[0].text).toContain('# SOLID Principles');
        expect(result.contents[0].text).toContain('**ID:** principle.architecture.solid');
        expect(result.contents[0].text).toContain(markdownContent);
        expect(result.contents[0].mimeType).toBe('text/markdown');
      });

      it('should include subcategory in markdown output', async () => {
        const result = await resourceService.readResource(
          'module://foundation/reasoning/systems-thinking'
        );

        expect(result.contents[0].text).toContain('**Category:** Foundation > reasoning');
      });

      it('should not include subcategory if not present', async () => {
        const result = await resourceService.readResource('module://principle/architecture/solid');

        const categoryLine = result.contents[0].text
          .split('\n')
          .find(line => line.startsWith('**Category:**'));
        expect(categoryLine).not.toContain('>');
      });
    });
  });

  describe('Resource Response Structure', () => {
    it('should return proper resource content structure', async () => {
      const result = await resourceService.readResource(
        'module://foundation/reasoning/systems-thinking'
      );

      expect(result).toHaveProperty('uri');
      expect(result).toHaveProperty('contents');
      expect(result).toHaveProperty('metadata');
      expect(Array.isArray(result.contents)).toBe(true);
      expect(result.contents).toHaveLength(1);
    });

    it('should include all required content fields', async () => {
      const result = await resourceService.readResource(
        'module://foundation/reasoning/systems-thinking'
      );

      const content = result.contents[0];
      expect(content).toHaveProperty('uri');
      expect(content).toHaveProperty('mimeType');
      expect(content).toHaveProperty('text');
      expect(typeof content.text).toBe('string');
    });

    it('should include complete metadata', async () => {
      const result = await resourceService.readResource(
        'module://foundation/reasoning/systems-thinking'
      );

      expect(result.metadata).toMatchObject({
        moduleId: 'foundation.reasoning.systems-thinking',
        name: 'Systems Thinking',
        category: 'Foundation',
        subcategory: 'reasoning',
        description: 'Reason about systems and feedback loops',
        format: 'markdown',
      });
    });

    it('should omit optional metadata fields if not present', async () => {
      // Create a module without description
      mockModules[0] = {
        ...mockModules[0],
        description: undefined as unknown as string,
      };

      const result = await resourceService.readResource(
        'module://foundation/reasoning/systems-thinking'
      );

      expect(result.metadata).not.toHaveProperty('description');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for file read failure', async () => {
      mockDependencies.fileSystem.readFileSync = vi.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(
        resourceService.readResource('module://foundation/reasoning/systems-thinking')
      ).rejects.toThrow('Error reading module');
    });

    it('should provide helpful error for non-existent modules', async () => {
      await expect(
        resourceService.readResource('module://invalid/module/path')
      ).rejects.toThrow('Available modules can be discovered using');
    });

    it('should handle parser errors gracefully', async () => {
      mockParser.parseInstructionModules = vi.fn().mockRejectedValue(new Error('Parse error'));

      await expect(
        resourceService.readResource('module://foundation/reasoning/systems-thinking')
      ).rejects.toThrow();
    });
  });

  describe('MIME Type Mapping', () => {
    it('should return correct MIME type for yaml format', async () => {
      const result = await resourceService.readResource(
        'module://foundation/reasoning/systems-thinking/yaml'
      );

      expect(result.contents[0].mimeType).toBe('application/x-yaml');
    });

    it('should return correct MIME type for markdown format', async () => {
      const result = await resourceService.readResource(
        'module://foundation/reasoning/systems-thinking/markdown'
      );

      expect(result.contents[0].mimeType).toBe('text/markdown');
    });

    it('should return correct MIME type for raw format', async () => {
      const result = await resourceService.readResource(
        'module://foundation/reasoning/systems-thinking/raw'
      );

      expect(result.contents[0].mimeType).toBe('text/plain');
    });
  });
});
