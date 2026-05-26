/*!
 * Copyright (c) 2024 Digital Bazaar, Inc.
 */
import {CONTENT_TYPES, getResponseContentType} from '../http/headers.js';
import {errorToStatus} from '../http/errors.js';
import {resolver} from '../resolver.js';

/**
 * Handles GET /1.0/identifiers/:didUrl (DID URL dereferencing).
 *
 * A DID URL includes a path, query, or fragment, e.g.:
 *   did:key:z6Mk...#key-1           → verification method node
 *   did:web:example.com?service=foo  → service endpoint redirect
 *
 * Per https://w3c.github.io/did-resolution/#bindings-https:
 * - Accept: application/did-url-dereferencing → full result object
 * - Accept: text/uri-list → HTTP 303 redirect to the service endpoint URL
 * - Default → the dereferenced resource directly
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 */
export async function dereferenceHandler(req, res) {
  const didUrl = decodeURIComponent(req.params[0]);
  const accept = req.headers.accept ?? '';
  const contentType = getResponseContentType(accept, 'dereferencing');

  // Parse the DID URL to extract the base DID and any query params.
  const {baseDid, serviceId, relativeRef} = _parseDIDUrl(didUrl);

  // If a ?service= param is present, resolve the base DID first and
  // perform service endpoint dereferencing ourselves — the did-io drivers
  // do not implement this (marked FIXME in did-method-web source).
  if(serviceId) {
    return _dereferenceService(
      {res, baseDid, serviceId, relativeRef, contentType, didUrl});
  }

  // For fragment / path DID URLs, delegate to the driver.
  let content;
  try {
    content = await resolver.get({url: didUrl});
  } catch(e) {
    return _sendError({res, e, contentType});
  }

  return _sendContent({res, content, contentType});
}

/**
 * Resolves a service endpoint from a DID document and sends the response.
 *
 * @param {object} options - Options.
 * @param {object} options.res - Express response.
 * @param {string} options.baseDid - The base DID (without query/fragment).
 * @param {string} options.serviceId - The service ID from ?service=.
 * @param {string|null} options.relativeRef - Optional ?relativeRef= value.
 * @param {string} options.contentType - Resolved response content type.
 * @param {string} options.didUrl - Original full DID URL (for metadata).
 */
async function _dereferenceService(
  {res, baseDid, serviceId, relativeRef, contentType, didUrl}) {
  let didDocument;
  try {
    didDocument = await resolver.get({did: baseDid});
  } catch(e) {
    return _sendError({res, e, contentType});
  }

  const service = (didDocument.service ?? [])
    .find(s => s.id === `${baseDid}#${serviceId}` || s.id === serviceId);

  if(!service) {
    const errorType = 'notFound';
    const status = errorToStatus(errorType);
    if(contentType === CONTENT_TYPES.DEREFERENCING) {
      return res.status(status).type(contentType).json({
        '@context': 'https://w3id.org/did-resolution/v1',
        contentMetadata: {},
        contentStream: null,
        dereferencingMetadata: {error: errorType}
      });
    }
    return res.status(status).json({
      error: errorType,
      message: `Service "${serviceId}" not found in DID document.`
    });
  }

  // Build the final endpoint URL. If ?relativeRef= is present, append it.
  let endpointUrl = Array.isArray(service.serviceEndpoint) ?
    service.serviceEndpoint[0] :
    service.serviceEndpoint;

  if(relativeRef) {
    endpointUrl = endpointUrl.replace(/\/$/, '') + relativeRef;
  }

  // text/uri-list → HTTP 303 redirect per spec.
  if(contentType === CONTENT_TYPES.URI_LIST) {
    res.setHeader('Location', endpointUrl);
    return res.status(303).type(CONTENT_TYPES.URI_LIST).send(endpointUrl);
  }

  // application/did-url-dereferencing → full result object.
  if(contentType === CONTENT_TYPES.DEREFERENCING) {
    return res.status(200).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      contentMetadata: {},
      contentStream: {url: endpointUrl},
      dereferencingMetadata: {
        contentType: 'text/uri-list'
      }
    });
  }

  // Default → return the endpoint URL as plain JSON.
  return res.status(200).json({serviceEndpoint: endpointUrl, didUrl});
}

/**
 * Parses a DID URL into its base DID and query components.
 *
 * @param {string} didUrl - The full DID URL.
 * @returns {{baseDid: string, serviceId: string|null,
 *   relativeRef: string|null}}
 */
function _parseDIDUrl(didUrl) {
  const qIdx = didUrl.indexOf('?');
  const hIdx = didUrl.indexOf('#');

  // Base DID ends at the first '?' or '#'
  const splitIdx = qIdx !== -1 ? qIdx : hIdx;
  const baseDid = splitIdx !== -1 ? didUrl.slice(0, splitIdx) : didUrl;

  let serviceId = null;
  let relativeRef = null;

  if(qIdx !== -1) {
    const queryStr = hIdx !== -1 ?
      didUrl.slice(qIdx + 1, hIdx) :
      didUrl.slice(qIdx + 1);
    const params = new URLSearchParams(queryStr);
    serviceId = params.get('service');
    relativeRef = params.get('relativeRef');
  }

  return {baseDid, serviceId, relativeRef};
}

/**
 * Sends an error response in the appropriate format.
 *
 * @param {object} options - Options.
 * @param {object} options.res - Express response.
 * @param {Error} options.e - The caught error.
 * @param {string} options.contentType - The response content type.
 */
function _sendError({res, e, contentType}) {
  const errorType = _classifyError(e);
  const status = errorToStatus(errorType);

  if(contentType === CONTENT_TYPES.DEREFERENCING) {
    return res.status(status).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      contentMetadata: {},
      contentStream: null,
      dereferencingMetadata: {error: errorType}
    });
  }
  return res.status(status).json({error: errorType, message: e.message});
}

/**
 * Sends a successful dereferencing response.
 *
 * @param {object} options - Options.
 * @param {object} options.res - Express response.
 * @param {object} options.content - The dereferenced content.
 * @param {string} options.contentType - The response content type.
 */
function _sendContent({res, content, contentType}) {
  // text/uri-list: redirect if the content is a service node.
  if(contentType === CONTENT_TYPES.URI_LIST) {
    const serviceUrl = _extractServiceUrl(content);
    if(serviceUrl) {
      res.setHeader('Location', serviceUrl);
      return res.status(303).type(CONTENT_TYPES.URI_LIST).send(serviceUrl);
    }
  }

  if(contentType === CONTENT_TYPES.DEREFERENCING) {
    return res.status(200).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      contentMetadata: {},
      contentStream: content,
      dereferencingMetadata: {contentType: CONTENT_TYPES.DID_DOCUMENT}
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
function _extractServiceUrl(content) {
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
function _classifyError(e) {
  const msg = e.message?.toLowerCase() ?? '';
  if(msg.includes('driver') && msg.includes('not found')) {
    return 'methodNotSupported';
  }
  if(msg.includes('fetch failed') || msg.includes('enotfound') ||
    msg.includes('econnrefused') || e.status === 404) {
    return 'notFound';
  }
  if(msg.includes('not found')) {
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
