/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */
import {resolver} from '../resolver.js';
import {errorToStatus} from '../http/errors.js';
import {CONTENT_TYPES, getResponseContentType} from '../http/headers.js';

/**
 * Handles GET and POST /1.0/identifiers/:did
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

  let didDocument;
  let resolutionMetadata = {};
  let documentMetadata = {};

  try {
    didDocument = await resolver.get({did});
  } catch(e) {
    const errorType = classifyError(e);
    const status = errorToStatus(errorType);

    resolutionMetadata = {error: errorType};

    if(contentType === CONTENT_TYPES.RESOLUTION) {
      return res.status(status).type(contentType).json({
        '@context': 'https://w3id.org/did-resolution/v1',
        didDocument: null,
        didResolutionMetadata: resolutionMetadata,
        didDocumentMetadata: {}
      });
    }
    return res.status(status).json({error: errorType, message: e.message});
  }

  if(contentType === CONTENT_TYPES.RESOLUTION) {
    return res.status(200).type(contentType).json({
      '@context': 'https://w3id.org/did-resolution/v1',
      didDocument,
      didResolutionMetadata: {
        contentType: CONTENT_TYPES.DID_DOCUMENT,
        ...resolutionMetadata
      },
      didDocumentMetadata: documentMetadata
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
  // Network / fetch failures for did:web that doesn't exist
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
