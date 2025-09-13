import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    ignores: ['node_modules', 'dist', 'build', 'coverage', 'logs', '.cache', '.next', 'vitest.config.ts'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-deprecated': 'warn',
      '@typescript-eslint/require-await': 'warn',

      "complexity": ["warn", { "max": 20 }]
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true
      },
    },
  },

  // vitest
  {
    files: ['**/*.{test,spec}.{js,ts,tsx}'],
    ...vitest.configs.recommended,
    rules: {
      // Essential for mocking patterns
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',

      // Allow long test functions
      'max-lines-per-function': 'off',

      // Keep type safety for string operations
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',
    },
  },

  // Prettier
  prettierConfig,
);
