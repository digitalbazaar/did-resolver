/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */
import express from 'express';

import {dereferenceHandler} from './routes/dereference.js';
import {resolveHandler} from './routes/resolve.js';

export function createServer() {
  const app = express();

  app.use(express.json());

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
 * A plain DID has the form: did:<method>:<method-specific-id>
 * A DID URL with a path has a '/' after the method-specific identifier.
 * Note: did:web uses ':' as path separator — not a DID URL path.
 *
 * @param {string} did - The decoded identifier string.
 * @returns {boolean}
 */
function _hasPathBeyondDid(did) {
  const parts = did.split(':');
  if(parts.length < 3) {
    return false;
  }
  // did:web uses ':' as path separator — not a DID URL path
  if(parts[1] === 'web') {
    return false;
  }
  const methodSpecificId = parts.slice(2).join(':');
  return methodSpecificId.includes('/');
}
