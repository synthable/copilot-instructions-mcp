import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-plugin-prettier';

export default [
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // vitest
  {
    files: ['**/*.{test,spec}.{js,ts,tsx}'],
    ...vitest.configs.recommended,
  },

  // ignore
  { ignores: ['node_modules', 'dist', 'build', 'coverage', 'logs', '.cache', '.next'] },

  // prettier last
  prettier,
];