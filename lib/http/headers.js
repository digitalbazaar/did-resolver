/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */

export const CONTENT_TYPES = {
  DID_DOCUMENT: 'application/did',
  RESOLUTION: 'application/did-resolution',
  DEREFERENCING: 'application/did-url-dereferencing'
};

// Sentinel returned when the Accept header names a type we cannot produce.
// Routes check for this value and respond 406.
export const UNSUPPORTED_ACCEPT = Symbol('unsupported-accept');

// Supported media types per mode, in preference order.
const RESOLUTION_TYPES = [
  CONTENT_TYPES.RESOLUTION,
  CONTENT_TYPES.DID_DOCUMENT
];

// Dereferencing additionally supports the DID URL dereferencing result
// envelope. This is a response format only — it does not enable service
// endpoint dereferencing or any outbound requests.
const DEREFERENCING_TYPES = [
  CONTENT_TYPES.DEREFERENCING,
  CONTENT_TYPES.RESOLUTION,
  CONTENT_TYPES.DID_DOCUMENT
];

/**
 * Determines the response content type based on the Accept header.
 *
 * Returns UNSUPPORTED_ACCEPT if the client named a specific type we cannot
 * produce. A missing or wildcard (*\/*) Accept header defaults to
 * application/did.
 *
 * @param {string} accept - The Accept header value from the request.
 * @param {'resolution'|'dereferencing'} [mode] - Operation mode; controls
 *   which media types are supported.
 * @returns {string|symbol} A content type string or UNSUPPORTED_ACCEPT.
 */
export function getResponseContentType(accept = '', mode = 'resolution') {
  // No preference — use the mode default.
  if(!accept || accept === '*/*' || accept.includes('*/*')) {
    return CONTENT_TYPES.DID_DOCUMENT;
  }

  // Use word-boundary matching: split on commas/whitespace and check exact
  // type tokens so 'application/did' doesn't match 'application/did-resolution'
  // or 'application/did-url-dereferencing'.
  const tokens = accept.split(/[,\s]+/).map(t => t.split(';')[0].trim());
  const supported = mode === 'dereferencing' ?
    DEREFERENCING_TYPES : RESOLUTION_TYPES;
  const match = supported.find(type => tokens.includes(type));
  return match ?? UNSUPPORTED_ACCEPT;
}
