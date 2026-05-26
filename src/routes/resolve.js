/*!
 * Copyright (c) 2024 Digital Bazaar, Inc.
 */
import {
  CONTENT_TYPES,
  getResponseContentType,
  UNSUPPORTED_ACCEPT
} from '../http/headers.js';
import {errorToStatus} from '../http/errors.js';
import {resolver} from '../resolver.js';

/**
 * Handles GET and POST /1.0/identifiers/:did
 *
 * GET: resolution options from query parameters.
 * POST: resolution options from JSON body.
 *
 * Returns either:
 * - A full DID resolution result (document + metadata) when Accept is
 *   application/did-resolution
 * - The DID document alone for all other Accept values
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 */
export async function resolveHandler(req, res) {
  const did = decodeURIComponent(req.params[0]);
  const accept = req.headers.accept ?? '';
  const contentType = getResponseContentType(accept, 'resolution');

  // POST body may carry resolution options; GET uses query params.
  // Currently did-io does not pass options through to drivers,
  // but we parse them here for future extensibility.
  // eslint-disable-next-line no-unused-vars
  const _options = req.method === 'POST' ?
    (req.body ?? {}) :
    req.query;

  // 406 if the client named a type we cannot produce.
  if(contentType === UNSUPPORTED_ACCEPT) {
    return res.status(406).json({
      error: 'representationNotSupported',
      message: `Accept type not supported: ${accept}`
    });
  }

  const resolutionMetadata = {};
  const documentMetadata = {};
  let didDocument;

  try {
    didDocument = await resolver.get({did});
  } catch(e) {
    const errorType = classifyError(e);
    const status = errorToStatus(errorType);

    if(contentType === CONTENT_TYPES.RESOLUTION) {
      return res.status(status).type(contentType).json({
        '@context': 'https://w3id.org/did-resolution/v1',
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {error: errorType}
      });
    }
    return res.status(status).json({error: errorType, message: e.message});
  }

  if(contentType === CONTENT_TYPES.RESOLUTION) {
    return res.status(200).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      didDocument,
      didDocumentMetadata: documentMetadata,
      didResolutionMetadata: {
        contentType: CONTENT_TYPES.DID_DOCUMENT,
        ...resolutionMetadata
      }
    });
  }

  return res.status(200).type(CONTENT_TYPES.DID_DOCUMENT).json(didDocument);
}

/**
 * Maps an error thrown by did-io/drivers to a DID resolution error type.
 *
 * @param {Error} e - The caught error.
 * @returns {string} A DID resolution error type string.
 */
function classifyError(e) {
  const msg = e.message?.toLowerCase() ?? '';
  // did-io: "Driver for DID did:foo:bar not found."
  if(msg.includes('driver') && msg.includes('not found')) {
    return 'methodNotSupported';
  }
  // Network failures for did:web that doesn't resolve
  if(msg.includes('fetch failed') || msg.includes('enotfound') ||
    msg.includes('econnrefused') || e.status === 404) {
    return 'notFound';
  }
  if(msg.includes('not found')) {
    return 'notFound';
  }
  if(msg.includes('invalid') || msg.includes('parse')) {
    return 'invalidDid';
  }
  if(msg.includes('deactivated')) {
    return 'deactivated';
  }
  return 'internalError';
}
