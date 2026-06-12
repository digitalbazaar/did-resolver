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
 * Handles GET and POST /1.0/identifiers/:did.
 *
 * GET: resolution options from query parameters.
 * POST: resolution options from JSON body.
 *
 * Returns either:
 * - A full DID resolution result (document + metadata) when Accept is
 *   application/did-resolution
 * - The DID document alone for all other Accept values.
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<void>} Resolves when the response has been sent.
 */
export async function resolveHandler(req, res) {
  // Express has already percent-decoded the wildcard param; decoding again
  // here would corrupt identifiers containing literal percent characters.
  const did = req.params[0] ?? '';
  const accept = req.headers.accept ?? '';
  const contentType = getResponseContentType(accept);

  // POST body may carry resolution options; GET uses query params.
  // Currently did-io does not pass options through to drivers,
  // but we parse them here for future extensibility.
  // eslint-disable-next-line no-unused-vars
  const _options = req.method === 'POST' ?
    (req.body ?? {}) :
    req.query;

  // 406 if the client named a type we cannot produce.
  // Per spec, the response must still be a conformant resolution result
  // when the client requested application/did-resolution.
  if(contentType === UNSUPPORTED_ACCEPT) {
    const errorType = 'representationNotSupported';
    const wantsResolution = accept.includes('application/did-resolution');
    if(wantsResolution) {
      return res.status(406).type(CONTENT_TYPES.RESOLUTION).json({
        '@context': 'https://w3id.org/did-resolution/v1',
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {error: makeErrorObject(errorType)}
      });
    }
    return res.status(406).json({
      error: errorType,
      message: `Accept type not supported: ${accept}`
    });
  }

  // Validate DID syntax before hitting the driver. A conformant DID must
  // match did:method:method-specific-id — at minimum three colon-separated
  // segments where the first is 'did'.
  if(!_isValidDid(did)) {
    const errorType = 'invalidDid';
    const status = 400;
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
      message: 'Input is not a conformant DID.'
    });
  }

  const resolutionMetadata = {};
  const documentMetadata = {};
  let didDocument;

  try {
    didDocument = await resolver.get({did});
  } catch(e) {
    const errorType = classifyError(e, 'resolution');
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

  // Check if the document itself signals deactivation. Per spec, deactivated
  // DIDs MUST return 410 with null didDocument and deactivated: true in
  // didDocumentMetadata.
  if(didDocument.deactivated === true) {
    const errorType = 'deactivated';
    documentMetadata.deactivated = true;
    if(contentType === CONTENT_TYPES.RESOLUTION) {
      return res.status(410).type(contentType).json({
        '@context': 'https://w3id.org/did-resolution/v1',
        didDocument: null,
        didDocumentMetadata: documentMetadata,
        didResolutionMetadata: {error: makeErrorObject(errorType)}
      });
    }
    return res.status(410).json({
      error: errorType,
      message: 'DID has been deactivated.'
    });
  }

  if(contentType === CONTENT_TYPES.RESOLUTION) {
    return res.status(200).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      didDocument,
      didDocumentMetadata: documentMetadata,
      didResolutionMetadata: {
        contentType: CONTENT_TYPES.RESOLUTION,
        ...resolutionMetadata
      }
    });
  }

  return res.status(200).type(CONTENT_TYPES.DID_DOCUMENT).json(didDocument);
}

/**
 * Returns true if the string is a syntactically conformant DID.
 * Requires at minimum: did:<method>:<method-specific-id>
 * where method contains only lowercase letters/digits and method-specific-id
 * is non-empty.
 *
 * @param {string} did - The string to validate.
 * @returns {boolean} True if the string is a syntactically valid DID.
 */
function _isValidDid(did) {
  return /^did:[a-z0-9]+:.+$/.test(did);
}

