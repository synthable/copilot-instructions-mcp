import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { InstructionModuleParser } from './parsing.js';
import type { IDependencies } from './interfaces.js';

// Mock external dependencies
vi.mock('fs', () => ({ promises: { stat: vi.fn() } }));

describe('InstructionModuleParser - UMS v1.1 Support', () => {
  let mockDependencies: IDependencies;
  let parser: InstructionModuleParser;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDependencies = {
      fileSystem: {
        readFileSync: vi.fn(),
        readdirSync: vi.fn(),
        statSync: vi.fn(),
        existsSync: vi.fn(),
      },
      pathUtils: {
        join: vi.fn((...args: string[]) => args.join('/')),
        relative: vi.fn((base: string, target: string) =>
          target.replace(base + '/', '')
        ),
        resolve: vi.fn((base: string, target: string) => `${base}/${target}`),
      },
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

    parser = new InstructionModuleParser(mockDependencies);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('UMS v1.1 layer field parsing', () => {
    it('should extract layer field from foundation modules', async () => {
      // Clear the cache first
      parser.clearModuleCache();

      const v11FoundationYaml = `
id: "foundation/ethics/do-no-harm"
version: "1.0.0"
schemaVersion: "1.1"
shape: specification
meta:
  name: "Do No Harm"
  description: "Test foundation module with layer"
  layer: 2
body:
  purpose: "Test purpose"
`;

      // Mock complete directory structure
      vi.mocked(mockDependencies.fileSystem.readdirSync)
        .mockReturnValueOnce(['foundation']) // First call: base directory
        .mockReturnValueOnce(['test.module.yml']); // Second call: foundation directory

      vi.mocked(mockDependencies.fileSystem.statSync).mockImplementation(path => {
        if (
          path.endsWith('foundation') ||
          path.includes('instructions-modules/foundation')
        ) {
          return { isDirectory: () => true, isFile: () => false } as any;
        }
        return { isDirectory: () => false, isFile: () => true } as any;
      });

      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(
        v11FoundationYaml
      );

      const modules = await parser.parseInstructionModules();

      expect(modules).toHaveLength(1);
      expect(modules[0]).toMatchObject({
        name: 'Do No Harm',
        description: 'Test foundation module with layer',
        category: 'Foundation',
        layer: 2,
      });
    });

    it('should handle foundation modules without layer field', async () => {
      const v10FoundationYaml = `
id: "foundation/test/module"
version: "1.0.0"
schemaVersion: "1.0"
shape: specification
meta:
  name: "Test Module"
  description: "Foundation module without layer"
body:
  goal: "Test goal"
`;

      vi.mocked(mockDependencies.fileSystem.readdirSync).mockImplementation(dir => {
        if (dir.includes('instructions-modules') && !dir.includes('foundation')) {
          return ['foundation'];
        }
        if (dir.includes('foundation')) {
          return ['test.module.yml'];
        }
        return [];
      });

      vi.mocked(mockDependencies.fileSystem.statSync).mockImplementation(path => {
        if (path.includes('foundation') && !path.includes('.yml')) {
          return { isDirectory: () => true, isFile: () => false } as any;
        }
        return { isDirectory: () => false, isFile: () => true } as any;
      });

      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(
        v10FoundationYaml
      );

      const modules = await parser.parseInstructionModules();

      expect(modules).toHaveLength(1);
      expect(modules[0]).toMatchObject({
        id: 'foundation/test/module',
        category: 'Foundation',
      });
      expect(modules[0].layer).toBeUndefined();
    });

    it('should validate layer field values for foundation modules', async () => {
      const invalidLayerYaml = `
id: "foundation/test/invalid"
version: "1.0.0"
schemaVersion: "1.1"
shape: specification
meta:
  name: "Invalid Layer"
  description: "Foundation module with invalid layer"
  layer: 5
body:
  purpose: "Test purpose"
`;

      vi.mocked(mockDependencies.fileSystem.readdirSync).mockImplementation(dir => {
        if (dir.includes('instructions-modules') && !dir.includes('foundation')) {
          return ['foundation'];
        }
        if (dir.includes('foundation')) {
          return ['invalid.module.yml'];
        }
        return [];
      });

      vi.mocked(mockDependencies.fileSystem.statSync).mockImplementation(path => {
        if (path.includes('foundation') && !path.includes('.yml')) {
          return { isDirectory: () => true, isFile: () => false } as any;
        }
        return { isDirectory: () => false, isFile: () => true } as any;
      });

      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(
        invalidLayerYaml
      );

      const modules = await parser.parseInstructionModules();

      expect(modules).toHaveLength(1);
      expect(modules[0].layer).toBeUndefined(); // Invalid layer should be excluded
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid layer value for foundation module')
      );
    });

    it('should ignore layer field for non-foundation modules', async () => {
      const nonFoundationWithLayerYaml = `
id: "principle/test/module"
version: "1.0.0"
schemaVersion: "1.1"
shape: specification
meta:
  name: "Principle Module"
  description: "Non-foundation module with layer"
  layer: 1
body:
  purpose: "Test purpose"
`;

      vi.mocked(mockDependencies.fileSystem.readdirSync).mockImplementation(dir => {
        if (dir.includes('instructions-modules') && !dir.includes('principle')) {
          return ['principle'];
        }
        if (dir.includes('principle')) {
          return ['test.module.yml'];
        }
        return [];
      });

      vi.mocked(mockDependencies.fileSystem.statSync).mockImplementation(path => {
        if (path.includes('principle') && !path.includes('.yml')) {
          return { isDirectory: () => true, isFile: () => false } as any;
        }
        return { isDirectory: () => false, isFile: () => true } as any;
      });

      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(
        nonFoundationWithLayerYaml
      );

      const modules = await parser.parseInstructionModules();

      expect(modules).toHaveLength(1);
      expect(modules[0]).toMatchObject({
        category: 'Principle',
      });
      expect(modules[0].layer).toBeUndefined();
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Layer field present in non-foundation module')
      );
    });
  });

  describe('Backward compatibility', () => {
    it('should handle v1.0 modules with goal directive', async () => {
      const v10Yaml = `
id: "foundation/test/v10"
version: "1.0.0"
schemaVersion: "1.0"
shape: specification
meta:
  name: "V1.0 Module"
  description: "Legacy v1.0 module"
body:
  goal: "Legacy goal directive"
  constraints:
    - "Test constraint"
`;

      vi.mocked(mockDependencies.fileSystem.readdirSync).mockImplementation(dir => {
        if (dir.includes('instructions-modules') && !dir.includes('foundation')) {
          return ['foundation'];
        }
        if (dir.includes('foundation')) {
          return ['v10.module.yml'];
        }
        return [];
      });

      vi.mocked(mockDependencies.fileSystem.statSync).mockImplementation(path => {
        if (path.includes('foundation') && !path.includes('.yml')) {
          return { isDirectory: () => true, isFile: () => false } as any;
        }
        return { isDirectory: () => false, isFile: () => true } as any;
      });

      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(v10Yaml);

      const modules = await parser.parseInstructionModules();

      expect(modules).toHaveLength(1);
      expect(modules[0]).toMatchObject({
        id: 'foundation/test/v10',
        name: 'V1.0 Module',
        description: 'Legacy v1.0 module',
        category: 'Foundation',
      });
      expect(modules[0].layer).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      const invalidYaml = 'invalid: yaml: content: [unclosed';

      vi.mocked(mockDependencies.fileSystem.readdirSync).mockImplementation(dir => {
        if (dir.includes('instructions-modules') && !dir.includes('foundation')) {
          return ['foundation'];
        }
        if (dir.includes('foundation')) {
          return ['invalid.module.yml'];
        }
        return [];
      });

      vi.mocked(mockDependencies.fileSystem.statSync).mockImplementation(path => {
        if (path.includes('foundation') && !path.includes('.yml')) {
          return { isDirectory: () => true, isFile: () => false } as any;
        }
        return { isDirectory: () => false, isFile: () => true } as any;
      });

      vi.mocked(mockDependencies.fileSystem.readFileSync).mockReturnValue(invalidYaml);

      const modules = await parser.parseInstructionModules();

      expect(modules).toHaveLength(0);
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse YAML module')
      );
    });
  });
});
