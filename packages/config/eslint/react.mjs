import base from './base.mjs';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,

  // React Hooks
  reactHooks.configs['recommended-latest'],

  // React Refresh
  {
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': 'warn',
    },
  },

  // Browser globals
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
