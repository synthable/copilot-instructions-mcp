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

      '@typescript-eslint/no-floating-promises': 'error', // Critical for async code
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/return-await': 'error',

      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/prefer-as-const': 'error',
      
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-definitions': 'error',

      // --- Essential TypeScript rules ---
      // Prevents usage of the 'any' type, enforcing type safety
      '@typescript-eslint/no-explicit-any': 'error',
      // Disallows usage of variables before they are defined (hoisting bugs)
      '@typescript-eslint/no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
      // Ensures all functions explicitly declare return types (clarity, maintainability)
      '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true, allowTypedFunctionExpressions: true }],
      // Requires explicit member accessibility for class members (public/private/protected)
      '@typescript-eslint/explicit-member-accessibility': ['off', { accessibility: 'explicit' }],
      // Disallow inferrable types for cleaner code, but allow for const/let
      '@typescript-eslint/no-inferrable-types': ['warn', { ignoreParameters: true }],

      // --- Nice-to-have TypeScript rules ---
      // Prefer using optional chaining over && checks
      '@typescript-eslint/prefer-optional-chain': 'warn',
      // Prefer nullish coalescing over || for null/undefined checks
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      // Disallow unnecessary type assertions
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      // Disallow unnecessary conditionals
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      // Disallow unnecessary boolean literal comparisons
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'warn',
      // Disallow non-null assertions (!), which can hide bugs
      '@typescript-eslint/no-non-null-assertion': 'warn',

      'complexity': ['warn', { 'max': 20 }],
      'max-lines-per-function': ['warn', { max: 100, skipComments: true, skipBlankLines: true }],
      'max-lines': ['warn', { max: 400, skipComments: true, skipBlankLines: true }],

      // 'max-params': ['warn', { max: 4 }],
      // 'max-statements': ['warn', { max: 20 }],
      // 'max-depth': ['warn', { max: 4 }],
      // 'max-nested-callbacks': ['warn', { max: 3 }],
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
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',

      // Allow async test patterns
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',

      // Allow long test functions
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      'complexity': 'off',

      // Keep type safety for string operations
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/restrict-template-expressions': ['warn', { allowNumber: true }],
    },
  },

  // Prettier
  prettierConfig,
);
