import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContentService,
  getPurposeHeading,
  inferLanguageFromMediaType,
} from './content.js';
import type { IDependencies, IInstructionModuleParser } from '../../core/interfaces.js';
import type { InstructionModule } from '../../core/types.js';
import path from 'node:path';

describe('UMS v1.1 Content Rendering', () => {
  let contentService: ContentService;
  let mockParser: IInstructionModuleParser;
  let mockDependencies: IDependencies;

  beforeEach(() => {
    mockDependencies = {
      fileSystem: {
        readFileSync: vi.fn(),
        existsSync: vi.fn(() => true),
        readdirSync: vi.fn(),
        statSync: vi.fn(),
      },
      pathUtils: path,
      processUtils: {
        cwd: vi.fn(() => '/test'),
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

  describe('v1.1 YAML Rendering Features', () => {
    it('should detect v1.1 modules and render new directives', async () => {
      const v11Module: InstructionModule = {
        id: 'foundation/test/v11',
        name: 'V1.1 Test Module',
        description: 'Testing v1.1 features',
        category: 'Foundation',
        filePath: 'foundation/test/v11.module.yml',
        layer: 1,
      };

      const v11Yaml = `
id: "foundation/test/v11"
version: "1.0.0"
schemaVersion: "1.1"
shape: specification
declaredDirectives:
  required: ["purpose"]
  optional: ["recommended", "discouraged", "advantages", "disadvantages"]
meta:
  name: "V1.1 Test Module"
  description: "Testing v1.1 features"
  layer: 1
body:
  purpose: "Test v1.1 purpose directive"
  recommended:
    - "Use best practices"
    - "Follow standards"
  discouraged:
    - "Avoid bad patterns"
  advantages:
    - "Clear structure"
  disadvantages:
    - "Learning curve"
`;

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([v11Module]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(v11Yaml);

      const result = await contentService.getModulesContent(['foundation/test/v11']);

      expect(result.success).toBe(true);
      expect(result.content).toContain('## Core Definition'); // purpose -> Core Definition for specification
      expect(result.content).toContain('Test v1.1 purpose directive');
      expect(result.content).toContain('## Best Practices'); // recommended
      expect(result.content).toContain('## Anti-Patterns'); // discouraged
      expect(result.content).toContain('## Advantages / Use Cases'); // advantages
      expect(result.content).toContain('## Disadvantages / Trade-Offs'); // disadvantages
      expect(result.content).toContain('_Foundation Layer: 1_');
    });

    it('should handle composite list format', async () => {
      const module: InstructionModule = {
        id: 'test/composite',
        name: 'Composite Test',
        description: 'Testing composite lists',
        category: 'Foundation',
        filePath: 'test/composite.module.yml',
      };

      const yamlWithComposite = `
id: "test/composite"
version: "1.0.0"
schemaVersion: "1.1"
shape: specification
declaredDirectives:
  required: []
  optional: ["recommended", "discouraged"]
meta:
  name: "Composite Test"
  description: "Testing composite lists"
body:
  recommended:
    desc: "These are recommended practices:"
    list:
      - "Practice 1"
      - "Practice 2"
  discouraged:
    - "Simple array item 1"
    - "Simple array item 2"
`;

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([module]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(
        yamlWithComposite
      );

      const result = await contentService.getModulesContent(['test/composite']);

      expect(result.success).toBe(true);
      expect(result.content).toContain('These are recommended practices:');
      expect(result.content).toContain('- Practice 1');
      expect(result.content).toContain('- Simple array item 1');
    });

    it('should render different purpose headings based on shape', () => {
      const shapeMappings = [
        { shape: 'specification', heading: 'Core Definition' },
        { shape: 'pattern', heading: 'Abstract' },
        { shape: 'procedure', heading: 'Primary Objective' },
        { shape: 'playbook', heading: 'Primary Objective' },
        { shape: 'checklist', heading: 'Verification Criteria' },
        { shape: 'unknown', heading: 'Purpose' },
      ];

      shapeMappings.forEach(({ shape, heading }) => {
        const actualHeading = getPurposeHeading(shape);
        expect(actualHeading).toBe(heading);
      });
    });

    it('should infer language from media types', () => {
      const mediaTypeMappings = [
        { mediaType: 'application/json', language: 'json' },
        { mediaType: 'text/javascript', language: 'javascript' },
        { mediaType: 'text/typescript', language: 'typescript' },
        { mediaType: 'text/python', language: 'python' },
        { mediaType: 'application/yaml', language: 'yaml' },
        { mediaType: 'text/unknown', language: 'text' },
      ];

      mediaTypeMappings.forEach(({ mediaType, language }) => {
        const inferredLanguage = inferLanguageFromMediaType(mediaType);
        expect(inferredLanguage).toBe(language);
      });
    });

    it('should fall back to simple rendering when parsing fails', async () => {
      const moduleWithBadYaml: InstructionModule = {
        id: 'test/bad-yaml',
        name: 'Bad YAML Module',
        description: 'Module with unparseable YAML',
        category: 'Foundation',
        filePath: 'test/bad-yaml.module.yml',
        layer: 0,
        tags: ['test'],
      };

      const badYaml = 'invalid: yaml: [unclosed';

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([
        moduleWithBadYaml,
      ]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(badYaml);

      const result = await contentService.getModulesContent(['test/bad-yaml']);

      expect(result.success).toBe(true);
      expect(result.content).toContain('## Summary');
      expect(result.content).toContain('Module with unparseable YAML');
      expect(result.content).toContain('**Foundation Layer:** 0');
      expect(result.content).toContain('**Tags:** test');
      expect(result.content).toContain('Full body directives could not be rendered');
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle v1.0 modules without v1.1 features', async () => {
      const v10Module: InstructionModule = {
        id: 'test/v10',
        name: 'V1.0 Module',
        description: 'Legacy v1.0 module',
        category: 'Foundation',
        filePath: 'test/v10.module.yml',
      };

      const v10Yaml = `
id: "test/v10"
version: "1.0.0"
schemaVersion: "1.0"
shape: specification
declaredDirectives:
  required: ["goal"]
  optional: []
meta:
  name: "V1.0 Module"
  description: "Legacy v1.0 module"
body:
  goal: "Legacy goal directive"
`;

      vi.mocked(mockParser.parseInstructionModules).mockResolvedValue([v10Module]);
      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(v10Yaml);

      const result = await contentService.getModulesContent(['test/v10']);

      expect(result.success).toBe(true);
      // Should not contain v1.1-specific content
      expect(result.content).not.toContain('Best Practices');
      expect(result.content).not.toContain('Foundation Layer:');
      // Should contain basic module structure
      expect(result.content).toContain('# V1.0 Module');
    });
  });
});
