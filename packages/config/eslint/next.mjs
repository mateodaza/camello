import react from './react.mjs';
import nextPlugin from '@next/eslint-plugin-next';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...react,

  // Next.js recommended
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },

  // Disable react-refresh — conflicts with Next.js page/layout exports
  {
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
];
