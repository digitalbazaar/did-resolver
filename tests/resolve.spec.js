/*!
 * Copyright (c) 2024 Digital Bazaar, Inc.
 */
import {strict as assert} from 'node:assert';
import {createServer} from '../src/server.js';

// A known valid did:key (Ed25519 2020, z6Mk prefix) for testing.
// Source: https://github.com/digitalbazaar/did-method-key README
const TEST_DID_KEY =
  'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';

// The key ID fragment for the above DID (first verification method).
const TEST_KEY_FRAGMENT = `${TEST_DID_KEY}#${
  TEST_DID_KEY.slice('did:key:'.length)}`;

let server;
let baseUrl;

before(async () => {
  const app = createServer();
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

describe('Health check', () => {
  it('returns 200', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });
});

describe('GET /1.0/identifiers/:did — resolution', () => {
  it('resolves a did:key and returns a DID document', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/${TEST_DID_KEY}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, TEST_DID_KEY);
    assert.ok(Array.isArray(body['@context']));
  });

  it('returns correct Content-Type for DID document', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/${TEST_DID_KEY}`);
    assert.ok(
      res.headers.get('content-type').includes('application/did+ld+json'));
  });

  it('returns full resolution result when Accept is application/did-resolution',
    async () => {
      const res = await fetch(
        `${baseUrl}/1.0/identifiers/${TEST_DID_KEY}`,
        {headers: {Accept: 'application/did-resolution'}});
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes(
        'application/did-resolution'));
      const body = await res.json();
      assert.ok(body.didDocument, 'didDocument present');
      assert.ok(body.didResolutionMetadata, 'didResolutionMetadata present');
      assert.ok(
        body.didDocumentMetadata !== undefined, 'didDocumentMetadata present');
      assert.equal(body.didDocument.id, TEST_DID_KEY);
    });

  it('returns 501 for an unsupported DID method', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/did:unsupported:abc123`);
    assert.equal(res.status, 501);
  });

  it('returns 404 for a did:web that does not resolve', async () => {
    const res = await fetch(`${baseUrl}/1.0/identifiers/` +
      `did:web:does-not-exist.example.invalid`);
    assert.equal(res.status, 404);
  });

  it('returns 501 with resolution result body for unsupported method',
    async () => {
      const res = await fetch(
        `${baseUrl}/1.0/identifiers/did:unsupported:abc123`,
        {headers: {Accept: 'application/did-resolution'}});
      assert.equal(res.status, 501);
      const body = await res.json();
      assert.equal(body.didResolutionMetadata.error, 'methodNotSupported');
      assert.equal(body.didDocument, null);
    });

  it('returns 406 for an unsupported Accept type', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/${TEST_DID_KEY}`,
      {headers: {Accept: 'application/json'}});
    assert.equal(res.status, 406);
    const body = await res.json();
    assert.equal(body.error, 'representationNotSupported');
  });

  it('returns 406 for text/html Accept type', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/${TEST_DID_KEY}`,
      {headers: {Accept: 'text/html'}});
    assert.equal(res.status, 406);
  });

  it('returns 200 for wildcard Accept */*', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/${TEST_DID_KEY}`,
      {headers: {Accept: '*/*'}});
    assert.equal(res.status, 200);
  });
});

describe('POST /1.0/identifiers/:did — resolution with options', () => {
  it('resolves a did:key via POST', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/${TEST_DID_KEY}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({})
      });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, TEST_DID_KEY);
  });

  it('returns full resolution result via POST with Accept header', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/${TEST_DID_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/did-resolution'
        },
        body: JSON.stringify({})
      });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.didDocument);
    assert.ok(body.didResolutionMetadata);
  });

  it('returns 501 via POST for unsupported method', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/did:unsupported:abc123`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({})
      });
    assert.equal(res.status, 501);
  });
});

describe('GET /1.0/identifiers/:didUrl — dereferencing', () => {
  it('dereferences a DID URL with a fragment (#key)', async () => {
    const encoded = encodeURIComponent(TEST_KEY_FRAGMENT);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${encoded}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    // Should return the verification method node
    assert.ok(body.id ?? body['@context'] ?? body.type,
      'dereferenced resource has expected fields');
  });

  it('returns full dereferencing result when Accept is ' +
    'application/did-url-dereferencing', async () => {
    const encoded = encodeURIComponent(TEST_KEY_FRAGMENT);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${encoded}`, {
      headers: {Accept: 'application/did-url-dereferencing'}
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes(
      'application/did-url-dereferencing'));
    const body = await res.json();
    assert.ok(body.dereferencingMetadata, 'dereferencingMetadata present');
    assert.ok(body.contentMetadata !== undefined, 'contentMetadata present');
  });

  it('returns 501 for an unsupported DID method in a DID URL', async () => {
    const encoded = encodeURIComponent('did:unsupported:abc123#key-1');
    const res = await fetch(`${baseUrl}/1.0/identifiers/${encoded}`);
    assert.equal(res.status, 501);
  });

  it('returns 406 for an unsupported Accept type on dereferencing',
    async () => {
      const encoded = encodeURIComponent(TEST_KEY_FRAGMENT);
      const res = await fetch(`${baseUrl}/1.0/identifiers/${encoded}`, {
        headers: {Accept: 'application/json'}
      });
      assert.equal(res.status, 406);
      const body = await res.json();
      assert.equal(body.error, 'representationNotSupported');
    });
});
