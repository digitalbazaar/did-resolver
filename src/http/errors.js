/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
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
