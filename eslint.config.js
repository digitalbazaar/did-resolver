/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */
import baseConfig from '@digitalbazaar/eslint-config';

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        // Node.js globals
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly'
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
