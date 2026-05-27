/*!
 * Copyright (c) 2025 Digital Bazaar, Inc.
 */

// Maps DID resolution error types to HTTP status codes per:
// https://w3c.github.io/did-resolution/#bindings-https
const ERROR_STATUS_MAP = new Map([
  ['invalidDid', 400],
  ['invalidDidUrl', 400],
  ['invalidDidDocument', 400],
  ['invalidDidDocumentLength', 400],
  ['representationNotSupported', 406],
  ['notFound', 404],
  ['notAllowed', 405],
  ['deactivated', 410],
  ['methodNotSupported', 501],
  ['internalError', 500]
]);

/**
 * Returns the HTTP status code for a given DID resolution error type.
 *
 * @param {string} errorType - The DID resolution error type string.
 * @returns {number} The HTTP status code.
 */
export function errorToStatus(errorType) {
  return ERROR_STATUS_MAP.get(errorType) ?? 500;
}

/**
 * Maps an error thrown by did-io/drivers to a DID resolution error type.
 *
 * @param {Error} e - The caught error.
 * @param {'resolution'|'dereferencing'} [mode] - Operation mode; controls
 *   whether invalid-input errors are reported as invalidDid or invalidDidUrl.
 * @returns {string} A DID resolution error type string.
 */
export function classifyError(e, mode = 'resolution') {
  const msg = e.message?.toLowerCase() ?? '';
  // did-io: "Driver for DID did:foo:bar not found."
  if(msg.includes('driver') && msg.includes('not found')) {
    return 'methodNotSupported';
  }
  // Network failures for did:web that doesn't resolve
  if(msg.includes('fetch failed') || msg.includes('enotfound') ||
    msg.includes('econnrefused') || e.status === 404) {
    return 'notFound';
  }
  if(msg.includes('not found')) {
    return 'notFound';
  }
  if(msg.includes('invalid') || msg.includes('parse')) {
    return mode === 'dereferencing' ? 'invalidDidUrl' : 'invalidDid';
  }
  if(msg.includes('deactivated')) {
    return 'deactivated';
  }
  return 'internalError';
}
