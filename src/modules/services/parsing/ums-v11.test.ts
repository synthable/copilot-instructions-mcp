import { describe, it, expect } from 'vitest';
import type { UMSv11Module, UMSv11Body, CompositeListDirective } from '../../core/types.js';
import { validateFoundationLayer } from '../validation/validation.js';

describe('UMS v1.1 Implementation', () => {
  describe('Type Definitions', () => {
    it('should support UMS v1.1 module structure', () => {
      const v11Module: UMSv11Module = {
        id: 'test/module',
        version: '1.0.0',
        schemaVersion: '1.1',
        shape: 'specification',
        declaredDirectives: {
          required: ['purpose'],
          optional: ['recommended', 'discouraged'],
        },
        meta: {
          name: 'Test Module',
          description: 'Test v1.1 module',
          layer: 1,
          tags: ['test'],
        },
        body: {
          purpose: 'Test purpose',
          recommended: ['Best practice 1', 'Best practice 2'],
          discouraged: ['Anti-pattern 1'],
        },
      };

      expect(v11Module.schemaVersion).toBe('1.1');
      expect(v11Module.meta.layer).toBe(1);
      expect(v11Module.body.purpose).toBeDefined();
      expect(v11Module.body.recommended).toHaveLength(2);
    });

    it('should support composite list directives', () => {
      // Simple array format
      const simpleList: CompositeListDirective = ['Item 1', 'Item 2', 'Item 3'];

      expect(Array.isArray(simpleList)).toBe(true);
      expect(simpleList).toHaveLength(3);

      // Composite format with description
      const compositeList: CompositeListDirective = {
        desc: 'This is a description',
        list: ['Item 1', 'Item 2'],
      };

      expect(Array.isArray(compositeList)).toBe(false);
      expect(compositeList.desc).toBe('This is a description');
      expect(compositeList.list).toHaveLength(2);
    });

    it('should support all new v1.1 body directives', () => {
      const v11Body: UMSv11Body = {
        purpose: 'Renamed from goal',
        recommended: ['Best practice'],
        discouraged: ['Anti-pattern'],
        advantages: ['Advantage 1'],
        disadvantages: ['Disadvantage 1'],
        process: ['Step 1', 'Step 2'],
        constraints: ['Constraint 1'],
        principles: ['Principle 1'],
        criteria: ['- [ ] Check 1', '- [ ] Check 2'],
      };

      // Check all new v1.1 directives are present
      expect(v11Body.purpose).toBeDefined();
      expect(v11Body.recommended).toBeDefined();
      expect(v11Body.discouraged).toBeDefined();
      expect(v11Body.advantages).toBeDefined();
      expect(v11Body.disadvantages).toBeDefined();
    });
  });

  describe('Layer Validation', () => {
    it('should validate foundation layer values correctly', () => {
      // Valid foundation layer values
      expect(validateFoundationLayer(0, 'foundation')).toBe(0);
      expect(validateFoundationLayer(1, 'foundation')).toBe(1);
      expect(validateFoundationLayer(2, 'foundation')).toBe(2);
      expect(validateFoundationLayer(3, 'foundation')).toBe(3);
      expect(validateFoundationLayer(4, 'foundation')).toBe(4);

      // Invalid values should throw
      expect(() => validateFoundationLayer(5, 'foundation')).toThrow(
        'Layer must be between 0 and 4 (inclusive)'
      );

      expect(() => validateFoundationLayer(-1, 'foundation')).toThrow(
        'Layer must be between 0 and 4 (inclusive)'
      );

      // Non-foundation tiers should not have layer
      expect(() => validateFoundationLayer(1, 'principle')).toThrow(
        'Layer field is only allowed for foundation tier modules'
      );
    });
  });

  describe('Backward Compatibility', () => {
    it('should support both v1.0 and v1.1 schema versions', () => {
      const v10Module: Partial<UMSv11Module> = {
        schemaVersion: '1.0',
        body: {
          // v1.0 uses 'goal' instead of 'purpose'
        },
      };

      const v11Module: Partial<UMSv11Module> = {
        schemaVersion: '1.1',
        body: {
          purpose: 'v1.1 uses purpose',
          recommended: ['New v1.1 directive'],
        },
      };

      expect(v10Module.schemaVersion).toBe('1.0');
      expect(v11Module.schemaVersion).toBe('1.1');
      expect(v11Module.body?.recommended).toBeDefined();
    });
  });

  describe('Shape-specific Features', () => {
    it('should support different module shapes', () => {
      const shapes = [
        'specification',
        'pattern',
        'procedure',
        'playbook',
        'checklist',
        'data',
      ];

      shapes.forEach(shape => {
        const module: Partial<UMSv11Module> = {
          shape,
          body: {
            purpose: `Purpose for ${shape} shape`,
          },
        };

        expect(module.shape).toBe(shape);
        expect(module.body?.purpose).toContain(shape);
      });
    });
  });

  describe('Media Type Support', () => {
    it('should support data and examples with media types', () => {
      const moduleWithData: UMSv11Body = {
        data: {
          mediaType: 'application/json',
          value: '{"test": "data"}',
          language: 'json',
        },
        examples: [
          {
            title: 'JSON Example',
            rationale: 'Shows JSON usage',
            snippet: '{"key": "value"}',
            language: 'json',
          },
        ],
        resources: [
          {
            name: 'Reference Data',
            mediaType: 'text/yaml',
            value: 'key: value',
            language: 'yaml',
          },
        ],
      };

      expect(moduleWithData.data?.mediaType).toBe('application/json');
      expect(moduleWithData.examples?.[0]?.language).toBe('json');
      expect(moduleWithData.resources?.[0]?.mediaType).toBe('text/yaml');
    });
  });
});
