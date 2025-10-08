import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { ContentService } from './content.js';
import type { IDependencies, IInstructionModuleParser } from './interfaces.js';
import type { InstructionModule } from './types.js';
import path from 'node:path';

describe('ContentService - UMS v1.1 Rendering', () => {
  let mockDependencies: IDependencies;
  let mockParser: IInstructionModuleParser;
  let contentService: ContentService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDependencies = {
      fileSystem: {
        readFileSync: vi.fn(),
        readdirSync: vi.fn(),
        statSync: vi.fn(),
        existsSync: vi.fn(() => true),
      },
      pathUtils: path,
      processUtils: {
        cwd: vi.fn(() => '/test/cwd'),
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockParser = {
      parseInstructionModules: vi.fn(),
      clearModuleCache: vi.fn(),
    };

    contentService = new ContentService(mockDependencies, mockParser);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('UMS v1.1 YAML module rendering', () => {
    it('should render v1.1 module with all new directives', async () => {
      const v11Module: InstructionModule = {
        id: 'foundation/test/v11-module',
        name: 'Test V1.1 Module',
        description: 'A comprehensive v1.1 test module',
        category: 'Foundation',
        filePath: 'foundation/test/v11-module.module.yml',
        layer: 1,
        tags: ['test', 'v11'],
      };

      const v11YamlContent = `
id: "foundation/test/v11-module"
version: "1.0.0"
schemaVersion: "1.1"
shape: specification
declaredDirectives:
  required: ["purpose"]
  optional: ["process", "constraints", "principles", "recommended", "discouraged", "advantages", "disadvantages", "criteria"]
meta:
  name: "Test V1.1 Module"
  description: "A comprehensive v1.1 test module"
  layer: 1
  tags: ["test", "v11"]
body:
  purpose: "Test the v1.1 rendering capabilities"
  process:
    - "Step 1: Initialize"
    - "Step 2: Execute"
    - "Step 3: Validate"
  constraints:
    - "Must follow v1.1 specification"
    - "Must maintain backward compatibility"
  principles:
    - "Clear and concise"
    - "Well-documented"
  recommended:
    - "Use semantic versioning"
    - "Include comprehensive tests"
    - "Follow coding standards"
  discouraged:
    - "Breaking changes without notice"
    - "Undocumented features"
  advantages:
    - "Improved clarity"
    - "Better structure"
    - "Enhanced functionality"
  disadvantages:
    - "Migration effort required"
    - "Learning curve"
  criteria:
    - "- [ ] All tests pass"
    - "- [ ] Documentation updated"
    - "- [ ] Code reviewed"
`;

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([v11Module]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(
        v11YamlContent
      );

      const result = await contentService.getModulesContent([
        'foundation/test/v11-module',
      ]);

      expect(result.success).toBe(true);
      expect(result.content).toBeTruthy();

      const content = result.content!;

      // Check header
      expect(content).toContain('# Test V1.1 Module');
      expect(content).toContain('**ID:** foundation/test/v11-module');
      expect(content).toContain('**Category:** Foundation');

      // Check v1.1 specific features
      expect(content).toContain('## Core Definition'); // purpose -> Core Definition for specification shape
      expect(content).toContain('Test the v1.1 rendering capabilities');

      expect(content).toContain('## Process');
      expect(content).toContain('1. Step 1: Initialize');
      expect(content).toContain('2. Step 2: Execute');
      expect(content).toContain('3. Step 3: Validate');

      expect(content).toContain('## Constraints');
      expect(content).toContain('- Must follow v1.1 specification');

      expect(content).toContain('## Principles');
      expect(content).toContain('- Clear and concise');

      // Check new v1.1 directives
      expect(content).toContain('## Best Practices');
      expect(content).toContain('- Use semantic versioning');

      expect(content).toContain('## Anti-Patterns');
      expect(content).toContain('- Breaking changes without notice');

      expect(content).toContain('## Advantages / Use Cases');
      expect(content).toContain('- Improved clarity');

      expect(content).toContain('## Disadvantages / Trade-Offs');
      expect(content).toContain('- Migration effort required');

      expect(content).toContain('## Criteria');
      expect(content).toContain('- [ ] All tests pass');

      // Check metadata footer
      expect(content).toContain('_Foundation Layer: 1_');
      expect(content).toContain('_Tags: test, v11_');
    });

    it('should handle composite list directives with descriptions', async () => {
      const moduleWithCompositeList: InstructionModule = {
        id: 'foundation/test/composite',
        name: 'Composite List Test',
        description: 'Testing composite list directives',
        category: 'Foundation',
        filePath: 'foundation/test/composite.module.yml',
        layer: 0,
      };

      const compositeListYaml = `
id: "foundation/test/composite"
version: "1.0.0"
schemaVersion: "1.1"
shape: specification
declaredDirectives:
  required: []
  optional: ["purpose", "recommended", "discouraged"]
meta:
  name: "Composite List Test"
  description: "Testing composite list directives"
  layer: 0
body:
  purpose: "Test composite list rendering"
  recommended:
    desc: "These are the recommended practices for this module:"
    list:
      - "Practice 1: Follow standards"
      - "Practice 2: Write tests"
      - "Practice 3: Document thoroughly"
  discouraged:
    - "Simple array format"
    - "No description needed"
`;

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([
        moduleWithCompositeList,
      ]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(
        compositeListYaml
      );

      const result = await contentService.getModulesContent([
        'foundation/test/composite',
      ]);

      expect(result.success).toBe(true);
      const content = result.content!;

      // Check composite format with description
      expect(content).toContain('## Best Practices');
      expect(content).toContain('These are the recommended practices for this module:');
      expect(content).toContain('- Practice 1: Follow standards');

      // Check simple array format
      expect(content).toContain('## Anti-Patterns');
      expect(content).toContain('- Simple array format');
    });

    it('should render shape-specific purpose headings', async () => {
      const shapes = [
        { shape: 'specification', heading: 'Core Definition' },
        { shape: 'pattern', heading: 'Abstract' },
        { shape: 'procedure', heading: 'Primary Objective' },
        { shape: 'playbook', heading: 'Primary Objective' },
        { shape: 'procedural-specification', heading: 'Primary Objective' },
        { shape: 'checklist', heading: 'Verification Criteria' },
        { shape: 'custom', heading: 'Purpose' },
      ];

      for (const { shape, heading } of shapes) {
        const testModule: InstructionModule = {
          id: `test/${shape}`,
          name: `${shape} Test`,
          description: `Testing ${shape} shape`,
          category: 'Foundation',
          filePath: `test/${shape}.module.yml`,
          layer: 0,
        };

        const yamlContent = `
id: "test/${shape}"
version: "1.0.0"
schemaVersion: "1.1"
shape: ${shape}
declaredDirectives:
  required: ["purpose"]
  optional: []
meta:
  name: "${shape} Test"
  description: "Testing ${shape} shape"
  layer: 0
body:
  purpose: "Test purpose for ${shape} shape"
`;

        vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([testModule]);
        vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(
          yamlContent
        );

        const result = await contentService.getModulesContent([`test/${shape}`]);

        expect(result.success).toBe(true);
        expect(result.content).toContain(`## ${heading}`);
        expect(result.content).toContain(`Test purpose for ${shape} shape`);
      }
    });

    it('should handle data directive with media type inference', async () => {
      const dataModule: InstructionModule = {
        id: 'test/data-module',
        name: 'Data Module Test',
        description: 'Testing data directive',
        category: 'Foundation',
        filePath: 'test/data-module.module.yml',
      };

      const dataYaml = `
id: "test/data-module"
version: "1.0.0"
schemaVersion: "1.1"
shape: data
declaredDirectives:
  required: ["data"]
  optional: ["purpose"]
meta:
  name: "Data Module Test"
  description: "Testing data directive"
body:
  purpose: "Provide test data"
  data:
    mediaType: "application/json"
    value: '{"test": "data", "number": 42}'
`;

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([dataModule]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(dataYaml);

      const result = await contentService.getModulesContent(['test/data-module']);

      expect(result.success).toBe(true);
      const content = result.content!;

      expect(content).toContain('## Data');
      expect(content).toContain('```json');
      expect(content).toContain('{"test": "data", "number": 42}');
      expect(content).toContain('```');
    });

    it('should render examples with syntax highlighting', async () => {
      const exampleModule: InstructionModule = {
        id: 'test/example-module',
        name: 'Example Module Test',
        description: 'Testing examples directive',
        category: 'Technology',
        filePath: 'test/example-module.module.yml',
      };

      const exampleYaml = `
id: "test/example-module"
version: "1.0.0"
schemaVersion: "1.1"
shape: specification
declaredDirectives:
  required: ["examples"]
  optional: ["purpose"]
meta:
  name: "Example Module Test"
  description: "Testing examples directive"
body:
  purpose: "Demonstrate examples rendering"
  examples:
    - title: "TypeScript Example"
      rationale: "Shows proper TypeScript usage"
      snippet: "const greeting: string = 'Hello, World!';"
      language: "typescript"
    - title: "Generic Example"
      rationale: "Shows generic code without language"
      snippet: "print('Hello, World!')"
`;

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([exampleModule]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(exampleYaml);

      const result = await contentService.getModulesContent(['test/example-module']);

      expect(result.success).toBe(true);
      const content = result.content!;

      expect(content).toContain('## Examples');
      expect(content).toContain('### TypeScript Example');
      expect(content).toContain('Shows proper TypeScript usage');
      expect(content).toContain('```typescript');
      expect(content).toContain("const greeting: string = 'Hello, World!';");

      expect(content).toContain('### Generic Example');
      expect(content).toContain('```text');
      expect(content).toContain("print('Hello, World!')");
    });
  });

  describe('Backward compatibility with v1.0 modules', () => {
    it('should handle v1.0 modules with goal directive', async () => {
      const v10Module: InstructionModule = {
        id: 'foundation/test/v10-module',
        name: 'Test V1.0 Module',
        description: 'Legacy v1.0 module',
        category: 'Foundation',
        filePath: 'foundation/test/v10-module.module.yml',
      };

      const v10YamlContent = `
id: "foundation/test/v10-module"
version: "1.0.0"
schemaVersion: "1.0"
shape: specification
declaredDirectives:
  required: ["goal"]
  optional: ["constraints"]
meta:
  name: "Test V1.0 Module"
  description: "Legacy v1.0 module"
body:
  goal: "Legacy goal directive"
  constraints:
    - "Must work with v1.0"
`;

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([v10Module]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(
        v10YamlContent
      );

      const result = await contentService.getModulesContent([
        'foundation/test/v10-module',
      ]);

      expect(result.success).toBe(true);
      expect(result.content).toBeTruthy();

      // Should not contain v1.1 features
      expect(result.content).not.toContain('## Best Practices');
      expect(result.content).not.toContain('Foundation Layer:');

      // Should render basic module info
      expect(result.content).toContain('# Test V1.0 Module');
      expect(result.content).toContain('**Category:** Foundation');
    });
  });

  describe('Error handling and fallbacks', () => {
    it('should fall back to simple rendering when YAML parsing fails', async () => {
      const moduleWithInvalidYaml: InstructionModule = {
        id: 'test/invalid-yaml',
        name: 'Invalid YAML Module',
        description: 'Module with invalid YAML',
        category: 'Foundation',
        filePath: 'test/invalid-yaml.module.yml',
        layer: 2,
        tags: ['test', 'error'],
      };

      const invalidYaml = 'invalid: yaml: content: [unclosed';

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([
        moduleWithInvalidYaml,
      ]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(invalidYaml);

      const result = await contentService.getModulesContent(['test/invalid-yaml']);

      expect(result.success).toBe(true);
      const content = result.content!;

      // Should fall back to simple rendering
      expect(content).toContain('## Summary');
      expect(content).toContain('Module with invalid YAML');
      expect(content).toContain('**Foundation Layer:** 2');
      expect(content).toContain('**Tags:** test, error');
      expect(content).toContain('Full body directives could not be rendered');
    });

    it('should handle missing body section gracefully', async () => {
      const moduleWithoutBody: InstructionModule = {
        id: 'test/no-body',
        name: 'No Body Module',
        description: 'Module without body section',
        category: 'Foundation',
        filePath: 'test/no-body.module.yml',
      };

      const yamlWithoutBody = `
id: "test/no-body"
version: "1.0.0"
schemaVersion: "1.1"
shape: specification
declaredDirectives:
  required: []
  optional: []
meta:
  name: "No Body Module"
  description: "Module without body section"
`;

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([
        moduleWithoutBody,
      ]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(
        yamlWithoutBody
      );

      const result = await contentService.getModulesContent(['test/no-body']);

      expect(result.success).toBe(true);
      const content = result.content!;

      // Should fall back to simple rendering
      expect(content).toContain('## Summary');
      expect(content).toContain('Module without body section');
    });
  });
});
