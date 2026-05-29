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
 * A DID URL includes a path, query, or fragment. Examples follow.
 * ```
 * did:key:z6Mk...#key-1           → Verification method node.
 * did:web:example.com?service=foo → Service endpoint URL.
 * ```
 *
 * Per https://w3c.github.io/did-resolution/#bindings-https:
 * - Accept: application/did-resolution → Full result object.
 * - Default → The dereferenced resource directly.
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
  const contentType = getResponseContentType(accept);

  // 406 if the client named a type we cannot produce.
  if(contentType === UNSUPPORTED_ACCEPT) {
    return res.status(406).json({
      error: 'representationNotSupported',
      message: `Accept type not supported: ${accept}`
    });
  }

  // Parse the DID URL to extract the base DID and any query params.
  const {baseDid, serviceId} = _parseDIDUrl(didUrl);

  // If a ?service= param is present, resolve the base DID first and
  // perform service endpoint dereferencing ourselves — the did-io drivers
  // do not implement this (marked FIXME in did-method-web source).
  if(serviceId) {
    return _dereferenceService({res, baseDid, serviceId, contentType});
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
 * @param {string} options.contentType - Resolved response content type.
 * @returns {Promise<void>} Resolves when the response has been sent.
 */
async function _dereferenceService({res, baseDid, serviceId, contentType}) {
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
    if(contentType === CONTENT_TYPES.RESOLUTION) {
      return res.status(status).type(contentType).json({
        '@context': 'https://w3id.org/did-resolution/v1',
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {error: makeErrorObject(errorType)}
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

  let endpointUrl;
  try {
    endpointUrl = new URL(endpointStr).href;
  } catch {
    return res.status(400).json({
      error: 'invalidDidUrl',
      message: 'Could not construct endpoint URL.'
    });
  }

  if(contentType === CONTENT_TYPES.RESOLUTION) {
    return res.status(200).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        contentType: CONTENT_TYPES.DID_DOCUMENT,
        serviceEndpoint: endpointUrl
      }
    });
  }

  return res.status(200).type(CONTENT_TYPES.DID_DOCUMENT).json({
    serviceEndpoint: endpointUrl
  });
}

/**
 * Parses a DID URL into its base DID and query components.
 *
 * @param {string} didUrl - The full DID URL.
 * @returns {{baseDid: string, serviceId: string|null}} Parsed DID URL
 *   components.
 */
function _parseDIDUrl(didUrl) {
  const qIdx = didUrl.indexOf('?');
  const hIdx = didUrl.indexOf('#');

  // Base DID ends at the first '?' or '#'
  const splitIdx = qIdx !== -1 ? qIdx : hIdx;
  const baseDid = splitIdx !== -1 ? didUrl.slice(0, splitIdx) : didUrl;

  let serviceId = null;

  if(qIdx !== -1) {
    const queryStr = hIdx !== -1 ?
      didUrl.slice(qIdx + 1, hIdx) :
      didUrl.slice(qIdx + 1);
    const params = new URLSearchParams(queryStr);
    serviceId = params.get('service');
  }

  return {baseDid, serviceId};
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

  if(contentType === CONTENT_TYPES.RESOLUTION) {
    return res.status(status).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {error: makeErrorObject(errorType)}
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
  if(contentType === CONTENT_TYPES.RESOLUTION) {
    return res.status(200).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      didDocument: content,
      didDocumentMetadata: {},
      didResolutionMetadata: {contentType: CONTENT_TYPES.DID_DOCUMENT}
    });
  }

  return res.status(200).type(CONTENT_TYPES.DID_DOCUMENT).json(content);
}
