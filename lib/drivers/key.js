/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import {driver} from '@digitalbazaar/did-method-key';
import {Ed25519VerificationKey2020} from
  '@digitalbazaar/ed25519-verification-key-2020';

export const keyDriver = driver();

// Register the Ed25519 2020 suite so z6Mk... keys can be resolved.
keyDriver.use({
  multibaseMultikeyHeader: 'z6Mk',
  fromMultibase: Ed25519VerificationKey2020.from
});
