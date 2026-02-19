import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import turboPlugin from 'eslint-plugin-turbo';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores
  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      '**/.next/',
      '**/.turbo/',
      '**/coverage/',
      '**/supabase/',
      '**/drizzle/',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.ts',
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended (no type-aware — fast)
  ...tseslint.configs.recommended,

  // Turbo recommended (single config object, not array)
  turboPlugin.configs['flat/recommended'],

  // Main rules override
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      // Runtime env vars (PORT, secrets, etc.) are not build-time turbo deps
      'turbo/no-undeclared-env-vars': 'off',
    },
  },

  // Vitest test-file globals
  {
    files: ['**/*.{test,spec}.{ts,tsx}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
