/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */

export const CONTENT_TYPES = {
  DID_DOCUMENT: 'application/did+ld+json',
  RESOLUTION: 'application/did-resolution',
  DEREFERENCING: 'application/did-url-dereferencing',
  URI_LIST: 'text/uri-list'
};

/**
 * Determines the response content type based on the Accept header.
 *
 * @param {string} accept - The Accept header value from the request.
 * @param {'resolution'|'dereferencing'} mode - The operation mode.
 * @returns {string} The content type to use in the response.
 */
export function getResponseContentType(accept = '', mode = 'resolution') {
  if(accept.includes(CONTENT_TYPES.RESOLUTION)) {
    return CONTENT_TYPES.RESOLUTION;
  }
  if(accept.includes(CONTENT_TYPES.DEREFERENCING)) {
    return CONTENT_TYPES.DEREFERENCING;
  }
  if(accept.includes(CONTENT_TYPES.URI_LIST)) {
    return CONTENT_TYPES.URI_LIST;
  }
  if(accept.includes(CONTENT_TYPES.DID_DOCUMENT)) {
    return CONTENT_TYPES.DID_DOCUMENT;
  }
  // Default based on mode
  if(mode === 'dereferencing') {
    return CONTENT_TYPES.DID_DOCUMENT;
  }
  return CONTENT_TYPES.DID_DOCUMENT;
}
