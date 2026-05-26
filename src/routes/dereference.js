/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */
import {resolver} from '../resolver.js';
import {errorToStatus} from '../http/errors.js';
import {CONTENT_TYPES, getResponseContentType} from '../http/headers.js';

/**
 * Handles GET /1.0/identifiers/:didUrl (DID URL dereferencing)
 *
 * A DID URL includes a path, query, or fragment, e.g.:
 *   did:key:z6Mk...#key-1
 *   did:web:example.com?service=files
 *
 * Returns either:
 * - A full dereferencing result when Accept is application/did-url-dereferencing
 * - HTTP 303 redirect when Accept is text/uri-list
 * - The dereferenced resource directly for all other Accept values
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 */
export async function dereferenceHandler(req, res) {
  const didUrl = decodeURIComponent(req.params[0]);
  const accept = req.headers.accept ?? '';
  const contentType = getResponseContentType(accept, 'dereferencing');

  let content;
  let dereferencingMetadata = {};
  let contentMetadata = {};

  try {
    // did-io resolves DID URLs via the url parameter
    content = await resolver.get({url: didUrl});
  } catch(e) {
    const errorType = classifyError(e);
    const status = errorToStatus(errorType);

    dereferencingMetadata = {error: errorType};

    if(contentType === CONTENT_TYPES.DEREFERENCING) {
      return res.status(status).type(contentType).json({
        '@context': 'https://w3id.org/did-resolution/v1',
        dereferencingMetadata,
        contentStream: null,
        contentMetadata: {}
      });
    }
    return res.status(status).json({error: errorType, message: e.message});
  }

  // URI list: redirect to the resource URL
  if(contentType === CONTENT_TYPES.URI_LIST) {
    const serviceUrl = extractServiceUrl(content);
    if(serviceUrl) {
      return res.redirect(303, serviceUrl);
    }
  }

  if(contentType === CONTENT_TYPES.DEREFERENCING) {
    return res.status(200).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      dereferencingMetadata: {
        contentType: CONTENT_TYPES.DID_DOCUMENT,
        ...dereferencingMetadata
      },
      contentStream: content,
      contentMetadata
    });
  }

  return res.status(200).type(CONTENT_TYPES.DID_DOCUMENT).json(content);
}

/**
 * Extracts a service endpoint URL from a dereferenced resource, if present.
 *
 * @param {object} content - The dereferenced content.
 * @returns {string|null} A URL string or null.
 */
function extractServiceUrl(content) {
  if(typeof content?.serviceEndpoint === 'string') {
    return content.serviceEndpoint;
  }
  if(Array.isArray(content?.serviceEndpoint)) {
    return content.serviceEndpoint[0] ?? null;
  }
  return null;
}

/**
 * Maps an error thrown by did-io/drivers to a DID resolution error type.
 *
 * @param {Error} e - The caught error.
 * @returns {string} A DID resolution error type string.
 */
function classifyError(e) {
  const msg = e.message?.toLowerCase() ?? '';
  if(msg.includes('not supported') || msg.includes('no driver')) {
    return 'methodNotSupported';
  }
  if(msg.includes('not found') || msg.includes('404')) {
    return 'notFound';
  }
  if(msg.includes('invalid') || msg.includes('parse')) {
    return 'invalidDidUrl';
  }
  if(msg.includes('deactivated')) {
    return 'deactivated';
  }
  return 'internalError';
}
