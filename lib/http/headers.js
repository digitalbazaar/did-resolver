/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */

export const CONTENT_TYPES = {
  DID_DOCUMENT: 'application/did+ld+json',
  RESOLUTION: 'application/did-resolution',
  DEREFERENCING: 'application/did-url-dereferencing',
  URI_LIST: 'text/uri-list'
};

// Sentinel returned when the Accept header names a type we cannot produce.
// Routes check for this value and respond 406.
export const UNSUPPORTED_ACCEPT = Symbol('unsupported-accept');

// Supported media types per mode, in preference order.
const RESOLUTION_TYPES = [
  CONTENT_TYPES.RESOLUTION,
  CONTENT_TYPES.DID_DOCUMENT
];

const DEREFERENCING_TYPES = [
  CONTENT_TYPES.DEREFERENCING,
  CONTENT_TYPES.URI_LIST,
  CONTENT_TYPES.RESOLUTION,
  CONTENT_TYPES.DID_DOCUMENT
];

/**
 * Determines the response content type based on the Accept header.
 *
 * Returns UNSUPPORTED_ACCEPT if the client named a specific type we cannot
 * produce. A missing or wildcard (*\/*) Accept header defaults to
 * application/did+ld+json.
 *
 * @param {string} accept - The Accept header value from the request.
 * @param {'resolution'|'dereferencing'} mode - The operation mode.
 * @returns {string|symbol} A content type string or UNSUPPORTED_ACCEPT.
 */
export function getResponseContentType(accept = '', mode = 'resolution') {
  // No preference — use the mode default.
  if(!accept || accept === '*/*' || accept.includes('*/*')) {
    return CONTENT_TYPES.DID_DOCUMENT;
  }

  const supported = mode === 'dereferencing' ?
    DEREFERENCING_TYPES :
    RESOLUTION_TYPES;

  // Return the first supported type the client will accept.
  const match = supported.find(type => accept.includes(type));
  return match ?? UNSUPPORTED_ACCEPT;
}
