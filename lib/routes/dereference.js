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
 * Dereferences a fragment or path within a resolved DID document, e.g.
 * `did:key:z6Mk...#key-1` returns the matching verification method node.
 *
 * Service endpoint dereferencing (`?service=`) is intentionally not supported:
 * resolving caller-supplied endpoints turns the server into an outbound HTTP
 * request engine (SSRF / DDoS amplification surface). Callers that need a
 * service endpoint should read it from the resolved DID document directly.
 *
 * Per https://w3c.github.io/did-resolution/#bindings-https:
 * - Accept: application/did-url-dereferencing → DID URL dereferencing
 *   result ({dereferencingMetadata, contentStream, contentMetadata}).
 * - Accept: application/did-resolution → Full resolution result object.
 * - Default → The dereferenced resource directly.
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<void>} Resolves when the response has been sent.
 */
export async function dereferenceHandler(req, res) {
  // Express has already percent-decoded the wildcard param; decoding again
  // here would corrupt identifiers containing literal percent characters.
  const didUrl = req.params[0] ?? '';
  const accept = req.headers.accept ?? '';
  const contentType = getResponseContentType(accept, 'dereferencing');

  // 406 if the client named a type we cannot produce.
  if(contentType === UNSUPPORTED_ACCEPT) {
    return res.status(406).json({
      error: 'representationNotSupported',
      message: `Accept type not supported: ${accept}`
    });
  }

  // For fragment / path DID URLs, delegate to the driver. The driver operates
  // on the resolved DID document and makes no caller-controlled outbound
  // requests.
  let content;
  try {
    content = await resolver.get({url: didUrl});
  } catch(e) {
    return _sendError({res, e, contentType});
  }

  return _sendContent({res, content, contentType});
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
      dereferencingMetadata: {error: makeErrorObject(errorType)},
      contentStream: null,
      contentMetadata: {}
    });
  }
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
  if(contentType === CONTENT_TYPES.DEREFERENCING) {
    return res.status(200).type(contentType).json({
      // Must match the HTTP Content-Type header per the HTTPS Binding spec.
      dereferencingMetadata: {contentType: CONTENT_TYPES.DEREFERENCING},
      contentStream: content,
      contentMetadata: {}
    });
  }
  if(contentType === CONTENT_TYPES.RESOLUTION) {
    return res.status(200).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      didDocument: content,
      didDocumentMetadata: {},
      // Must match the HTTP Content-Type header per the HTTPS Binding spec.
      didResolutionMetadata: {contentType: CONTENT_TYPES.RESOLUTION}
    });
  }

  return res.status(200).type(CONTENT_TYPES.DID_DOCUMENT).json(content);
}
