/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */

// Single lookup table: error key → {status, uri}
// URIs follow the W3C DID namespace; status codes per HTTPS Binding spec.
const ERROR_MAP = new Map([
  ['invalidDid', {
    status: 400,
    uri: 'https://www.w3.org/ns/did#INVALID_DID'
  }],
  ['invalidDidUrl', {
    status: 400,
    uri: 'https://www.w3.org/ns/did#INVALID_DID_URL'
  }],
  ['invalidDidDocument', {
    status: 400,
    uri: 'https://www.w3.org/ns/did#INVALID_DID_DOCUMENT'
  }],
  ['representationNotSupported', {
    status: 406,
    uri: 'https://www.w3.org/ns/did#REPRESENTATION_NOT_SUPPORTED'
  }],
  ['notFound', {
    status: 404,
    uri: 'https://www.w3.org/ns/did#NOT_FOUND'
  }],
  ['deactivated', {
    status: 410,
    uri: 'https://www.w3.org/ns/did#DEACTIVATED'
  }],
  ['methodNotSupported', {
    status: 501,
    uri: 'https://www.w3.org/ns/did#METHOD_NOT_SUPPORTED'
  }],
  // INTERNAL_ERROR is referenced in the HTTPS Binding spec but not defined
  // in the W3C DID vocabulary at https://www.w3.org/ns/did.
  // See: https://github.com/w3c/did-resolution/issues/337
  ['internalError', {
    status: 500,
    uri: 'https://www.w3.org/ns/did#INTERNAL_ERROR'
  }]
]);

const FALLBACK = ERROR_MAP.get('internalError');

/**
 * Returns an RFC 9457-style error object for use in didResolutionMetadata.
 *
 * @param {string} errorType - The DID resolution error type key.
 * @returns {{type: string}} Error object with a type URI.
 */
export function makeErrorObject(errorType) {
  return {type: (ERROR_MAP.get(errorType) ?? FALLBACK).uri};
}

/**
 * Returns the HTTP status code for a given DID resolution error type.
 *
 * @param {string} errorType - The DID resolution error type string.
 * @returns {number} The HTTP status code.
 */
export function errorToStatus(errorType) {
  return (ERROR_MAP.get(errorType) ?? FALLBACK).status;
}

/**
 * Maps an error thrown by did-io/drivers to a DID resolution error type.
 *
 * Classification priority:
 * 1. Structured: e.status (set by @digitalbazaar/http-client on HTTP errors).
 * 2. Structured: e instanceof TypeError (bad-input errors from drivers).
 * 3. Message: stable internal DB strings only (driver-not-found pattern).
 *
 * @param {Error} e - The caught error.
 * @param {'resolution'|'dereferencing'} [mode] - Operation mode; controls
 *   whether invalid-input errors are reported as invalidDid or invalidDidUrl.
 * @returns {string} A DID resolution error type string.
 */
export function classifyError(e, mode = 'resolution') {
  // http-client sets e.status from the HTTP response status code.
  if(e.status === 404) {
    return 'notFound';
  }
  if(e.status >= 400 && e.status < 500) {
    return 'invalidDid';
  }

  // Message-based fallback for did-io's CachedResolver._methodForDid, which
  // throws a plain Error with no structured code. Once did-io adds a typed
  // error (tracked in https://github.com/digitalbazaar/did-io/issues/69),
  // replace this with `e.name === 'MethodNotSupportedError'`.
  if(e.message?.includes('Driver') && e.message?.includes('not found')) {
    return 'methodNotSupported';
  }

  // Network failure (no HTTP response): ENOTFOUND, ECONNREFUSED, fetch failed.
  // Node's fetch throws a TypeError for DNS/connection errors — check for
  // e.cause before treating it as bad input.
  if(!e.status) {
    return e instanceof TypeError && !e.cause ?
      (mode === 'dereferencing' ? 'invalidDidUrl' : 'invalidDid') :
      'notFound';
  }

  return 'internalError';
}
