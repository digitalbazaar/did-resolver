/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
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

  // JSON error handler. Express signals malformed percent-encoding in the
  // path and malformed JSON bodies via next(err) with err.status = 400;
  // without this, clients would get Express's default HTML error page.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if(status >= 500) {
      // Do not leak internal error details.
      return res.status(status).json({
        error: 'internalError',
        message: 'Internal server error.'
      });
    }
    return res.status(status).json({
      error: 'invalidDid',
      message: 'Malformed request.'
    });
  });

  return app;
}

/**
 * Dispatches GET requests to resolve or dereference based on whether the
 * identifier is a plain DID or a DID URL.
 *
 * A DID URL contains a fragment (#), query (?), or a path component beyond
 * the method-specific identifier. Express has already percent-decoded
 * req.params, so no further decoding is done here.
 *
 * Service endpoint dereferencing (`?service=`) is intentionally not
 * supported (SSRF / DDoS amplification surface) and is rejected explicitly
 * so callers get a clear error instead of a silently different result.
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<void>} Resolves when the response has been sent.
 */
async function dispatchHandler(req, res) {
  const identifier = req.params[0] ?? '';

  // An unencoded `?service=...` lands in req.query; an encoded `%3F` lands
  // in the identifier itself. Reject both forms explicitly.
  if(req.query.service !== undefined || identifier.includes('?')) {
    return res.status(501).json({
      error: 'notImplemented',
      message: 'Service endpoint dereferencing (?service=) is not ' +
        'supported. Read the service endpoint from the resolved DID ' +
        'document directly.'
    });
  }

  const isDIDUrl = identifier.includes('#') || _hasPathBeyondDid(identifier);

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
 * @returns {boolean} True if the identifier has a path component beyond
 *   the DID.
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
