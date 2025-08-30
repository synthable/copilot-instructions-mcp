import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: ['node_modules', 'dist', 'build', 'coverage', 'logs', '.cache', '.next', 'vitest.config.ts'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      '@typescript-eslint/no-deprecated': 'warn',
      '@typescript-eslint/require-await': 'warn',

      "complexity": ["warn", { "max": 20 }]
    },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
  },

  // vitest
  {
    files: ['**/*.{test,spec}.{js,ts,tsx}'],
    ...vitest.configs.recommended,
  },
  prettierConfig,
);
