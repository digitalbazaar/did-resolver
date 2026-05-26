/*!
 * Copyright (c) 2024 Digital Bazaar, Inc.
 */
import baseConfig from '@digitalbazaar/eslint-config';

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        // Node.js globals
        URL: 'readonly',
        URLSearchParams: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', {argsIgnorePattern: '^_'}]
    }
  },
  {
    // Mocha test globals
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        describe: 'readonly',
        it: 'readonly'
      }
    }
  }
];
