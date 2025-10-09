import { describe, it, expect } from 'vitest';
import { validateFoundationLayer } from './validation.js';

describe('validateFoundationLayer', () => {
  describe('Foundation tier modules', () => {
    it('should accept valid layer values 0-4', () => {
      expect(validateFoundationLayer(0, 'foundation')).toBe(0);
      expect(validateFoundationLayer(1, 'Foundation')).toBe(1);
      expect(validateFoundationLayer(2, 'FOUNDATION')).toBe(2);
      expect(validateFoundationLayer(3, 'foundation')).toBe(3);
      expect(validateFoundationLayer(4, 'foundation')).toBe(4);
    });

    it('should throw error for missing layer field', () => {
      expect(() => validateFoundationLayer(undefined, 'foundation')).toThrow(
        'Foundation tier modules must have a layer field'
      );

      expect(() => validateFoundationLayer(null, 'foundation')).toThrow(
        'Foundation tier modules must have a layer field'
      );
    });

    it('should throw error for non-integer layer values', () => {
      expect(() => validateFoundationLayer(1.5, 'foundation')).toThrow(
        'Layer must be an integer'
      );

      expect(() => validateFoundationLayer('1', 'foundation')).toThrow(
        'Layer must be an integer'
      );

      expect(() => validateFoundationLayer(true, 'foundation')).toThrow(
        'Layer must be an integer'
      );
    });

    it('should throw error for layer values outside 0-4 range', () => {
      expect(() => validateFoundationLayer(-1, 'foundation')).toThrow(
        'Layer must be between 0 and 4 (inclusive)'
      );

      expect(() => validateFoundationLayer(5, 'foundation')).toThrow(
        'Layer must be between 0 and 4 (inclusive)'
      );

      expect(() => validateFoundationLayer(100, 'foundation')).toThrow(
        'Layer must be between 0 and 4 (inclusive)'
      );
    });
  });

  describe('Non-foundation tier modules', () => {
    const nonFoundationTiers = ['principle', 'technology', 'execution', 'other'];

    it('should return undefined when layer is not provided', () => {
      nonFoundationTiers.forEach(tier => {
        expect(validateFoundationLayer(undefined, tier)).toBeUndefined();
      });
    });

    it('should throw error when layer is provided for non-foundation modules', () => {
      nonFoundationTiers.forEach(tier => {
        expect(() => validateFoundationLayer(0, tier)).toThrow(
          'Layer field is only allowed for foundation tier modules'
        );

        expect(() => validateFoundationLayer(2, tier)).toThrow(
          'Layer field is only allowed for foundation tier modules'
        );
      });
    });

    it('should handle case-insensitive tier names', () => {
      expect(() => validateFoundationLayer(1, 'PRINCIPLE')).toThrow(
        'Layer field is only allowed for foundation tier modules'
      );

      expect(() => validateFoundationLayer(1, 'Technology')).toThrow(
        'Layer field is only allowed for foundation tier modules'
      );

      expect(() => validateFoundationLayer(1, 'EXECUTION')).toThrow(
        'Layer field is only allowed for foundation tier modules'
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string tier', () => {
      expect(() => validateFoundationLayer(1, '')).toThrow(
        'Layer field is only allowed for foundation tier modules'
      );
    });

    it('should handle whitespace in tier names', () => {
      expect(validateFoundationLayer(2, 'foundation')).toBe(2);

      expect(() => validateFoundationLayer(1, 'principle')).toThrow(
        'Layer field is only allowed for foundation tier modules'
      );
    });
  });
});
