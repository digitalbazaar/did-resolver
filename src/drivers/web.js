/*!
 * Copyright (c) 2024 Digital Bazaar, Inc.
 */
import {driver} from '@digitalbazaar/did-method-web';
import {Ed25519VerificationKey2020} from
  '@digitalbazaar/ed25519-verification-key-2020';

export const webDriver = driver();

// Register the Ed25519 2020 suite so z6Mk... keys in did:web documents
// can be resolved to their full key material.
webDriver.use({
  multibaseMultikeyHeader: 'z6Mk',
  fromMultibase: Ed25519VerificationKey2020.from
});
