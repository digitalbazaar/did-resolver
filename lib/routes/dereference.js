/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import {classifyError, errorToStatus, makeErrorObject} from '../http/errors.js';
import {
  CONTENT_TYPES,
  getResponseContentType,
  UNSUPPORTED_ACCEPT
} from '../http/headers.js';
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
 * - Default → the dereferenced resource directly.
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<void>} Resolves when the response has been sent.
 */
export async function dereferenceHandler(req, res) {
  let didUrl;
  try {
    didUrl = decodeURIComponent(req.params[0]);
  } catch {
    return res.status(400).json({
      error: 'invalidDidUrl',
      message: 'Malformed percent-encoding in DID URL.'
    });
  }
  const accept = req.headers.accept ?? '';
  const contentType = getResponseContentType(accept, 'dereferencing');

  // 406 if the client named a type we cannot produce.
  if(contentType === UNSUPPORTED_ACCEPT) {
    return res.status(406).json({
      error: 'representationNotSupported',
      message: `Accept type not supported: ${accept}`
    });
  }

  // Parse the DID URL to extract the base DID and any query params.
  const {baseDid, serviceId, relativeRef} = _parseDIDUrl(didUrl);

  // If a ?service= param is present, resolve the base DID first and
  // perform service endpoint dereferencing ourselves — the did-io drivers
  // do not implement this (marked FIXME in did-method-web source).
  if(serviceId) {
    return _dereferenceService(
      {res, baseDid, serviceId, relativeRef, contentType});
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
 * @returns {Promise<void>} Resolves when the response has been sent.
 */
async function _dereferenceService(
  {res, baseDid, serviceId, relativeRef, contentType}) {
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
        dereferencingMetadata: {error: makeErrorObject(errorType)}
      });
    }
    return res.status(status).json({
      error: errorType,
      message: `Service "${serviceId}" not found in DID document.`
    });
  }

  // Extract a string URL from the endpoint — spec allows string, array, or
  // object map forms. We use the first resolvable string value.
  const rawEndpoint = Array.isArray(service.serviceEndpoint) ?
    service.serviceEndpoint[0] :
    service.serviceEndpoint;
  const endpointStr = typeof rawEndpoint === 'string' ?
    rawEndpoint :
    rawEndpoint?.uri ?? rawEndpoint?.id ?? null;

  if(!endpointStr) {
    return res.status(400).json({
      error: 'invalidDidUrl',
      message: 'Service endpoint is not a resolvable URL.'
    });
  }

  // Build the final endpoint URL. relativeRef is a path suffix appended to
  // the service endpoint per spec §B.1 — use the URL API to validate the
  // result and handle query strings / fragments in the relativeRef correctly.
  let endpointUrl;
  try {
    if(relativeRef) {
      // Normalise: strip trailing slash from base, ensure relativeRef starts
      // with '/', then validate by parsing as a URL.
      const base = endpointStr.replace(/\/$/, '');
      const suffix = relativeRef.startsWith('/') ?
        relativeRef : `/${relativeRef}`;
      endpointUrl = new URL(base + suffix).href;
    } else {
      endpointUrl = new URL(endpointStr).href;
    }
  } catch {
    return res.status(400).json({
      error: 'invalidDidUrl',
      message: 'Could not construct endpoint URL.'
    });
  }

  // text/uri-list → HTTP 303 redirect per spec. Body MUST be empty.
  if(contentType === CONTENT_TYPES.URI_LIST) {
    res.setHeader('Location', endpointUrl);
    return res.status(303).send('');
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

  // Default → return the endpoint URL as the resource directly (text/uri-list
  // content, not a redirect). Per spec §dereferencing-algorithm, the default
  // contentStream for a service endpoint is the URL itself.
  return res.status(200).type(CONTENT_TYPES.URI_LIST).send(endpointUrl);
}

/**
 * Parses a DID URL into its base DID and query components.
 *
 * @param {string} didUrl - The full DID URL.
 * @returns {{baseDid: string, serviceId: string|null,
 *   relativeRef: string|null}} Parsed DID URL components.
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
 * @returns {void} Response is sent directly.
 */
function _sendError({res, e, contentType}) {
  const errorType = classifyError(e, 'dereferencing');
  const status = errorToStatus(errorType);

  if(contentType === CONTENT_TYPES.DEREFERENCING) {
    return res.status(status).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      contentMetadata: {},
      contentStream: null,
      dereferencingMetadata: {error: makeErrorObject(errorType)}
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
 * @returns {void} Response is sent directly.
 */
function _sendContent({res, content, contentType}) {
  // text/uri-list: redirect if the content is a service node.
  if(contentType === CONTENT_TYPES.URI_LIST) {
    const serviceUrl = _extractServiceUrl(content);
    if(serviceUrl) {
      res.setHeader('Location', serviceUrl);
      return res.status(303).send('');
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

