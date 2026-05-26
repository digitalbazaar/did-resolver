/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */
import express from 'express';
import {resolveHandler} from './routes/resolve.js';
import {dereferenceHandler} from './routes/dereference.js';

export function createServer() {
  const app = express();

  app.use(express.json());

  // DID resolution and dereferencing share the same endpoint path.
  // A plain DID (no fragment/query beyond method-specific params) goes to
  // resolveHandler; a DID URL (containing #, ?, or a path after the method
  // specific identifier) goes to dereferenceHandler.
  //
  // We route both through a single wildcard and dispatch internally so that
  // the URL is decoded in one place.

  // Match /1.0/identifiers/<anything>
  app.get('/1.0/identifiers/*', dispatchHandler);
  app.post('/1.0/identifiers/*', resolveHandler);

  // Health check
  app.get('/health', (_req, res) => res.json({status: 'ok'}));

  // 404 fallback
  app.use((_req, res) => {
    res.status(404).json({error: 'notFound', message: 'Endpoint not found.'});
  });

  return app;
}

/**
 * Dispatches GET requests to resolve or dereference based on whether the
 * identifier is a plain DID or a DID URL.
 *
 * A DID URL contains a fragment (#), query (?), or a path component beyond
 * the method-specific identifier.
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 */
async function dispatchHandler(req, res) {
  const raw = req.params[0] ?? '';
  const decoded = decodeURIComponent(raw);

  // Detect DID URL: contains #, ?, or a path segment after the DID
  const isDIDUrl = decoded.includes('#') ||
    decoded.includes('?') ||
    _hasPathBeyondDid(decoded);

  if(isDIDUrl) {
    return dereferenceHandler(req, res);
  }
  return resolveHandler(req, res);
}

/**
 * Returns true if the identifier has a path component beyond the DID itself.
 * A plain DID looks like: did:<method>:<method-specific-id>
 * A DID URL with a path looks like: did:<method>:<id>/some/path
 *
 * @param {string} did - The decoded identifier string.
 * @returns {boolean}
 */
function _hasPathBeyondDid(did) {
  // Split on '/' — a plain DID has exactly 3 parts: did, method, id
  // (though method-specific IDs may themselves contain '/')
  // We use a simple heuristic: if there is a '/' after the method segment
  // and it is not part of a did:web identifier, treat it as a DID URL path.
  const parts = did.split(':');
  if(parts.length < 3) {
    return false;
  }
  // did:web uses ':' as path separator — not a DID URL path
  if(parts[1] === 'web') {
    return false;
  }
  // For other methods, a '/' in the method-specific ID indicates a DID URL path
  const methodSpecificId = parts.slice(2).join(':');
  return methodSpecificId.includes('/');
}
