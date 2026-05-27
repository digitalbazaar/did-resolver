/*!
 * Copyright (c) 2025 Digital Bazaar, Inc.
 */
import config from '@digitalbazaar/eslint-config/node-recommended';

export default [
  ...config,
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
