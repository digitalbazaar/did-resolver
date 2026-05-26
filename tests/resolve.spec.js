/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */
import {strict as assert} from 'node:assert';
import {createServer} from '../src/server.js';

// A known valid did:key (Ed25519 2020, z6Mk prefix) for testing.
// Source: https://github.com/digitalbazaar/did-method-key README
const TEST_DID_KEY =
  'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';

let app;
let server;
let baseUrl;

before(async () => {
  app = createServer();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('DID Resolution — GET /1.0/identifiers/:did', () => {
  it('resolves a did:key and returns a DID document', async () => {
    const res = await fetch(`${baseUrl}/1.0/identifiers/${TEST_DID_KEY}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, TEST_DID_KEY);
    assert.ok(Array.isArray(body['@context']));
  });

  it('returns application/did-resolution when Accept header is set', async () => {
    const res = await fetch(`${baseUrl}/1.0/identifiers/${TEST_DID_KEY}`, {
      headers: {Accept: 'application/did-resolution'}
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes(
      'application/did-resolution'));
    const body = await res.json();
    assert.ok(body.didDocument);
    assert.ok(body.didResolutionMetadata);
    assert.ok(body.didDocumentMetadata !== undefined);
  });

  it('returns 501 for an unsupported DID method', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/did:unsupported:abc123`);
    assert.equal(res.status, 501);
  });

  it('returns 404 for a did:web that does not exist', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/did:web:does-not-exist.example.invalid`);
    assert.equal(res.status, 404);
  });
});

describe('Health check', () => {
  it('GET /health returns 200', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });
});
