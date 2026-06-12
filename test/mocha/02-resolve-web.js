/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import {strict as assert} from 'node:assert';
import {createServer} from '../../lib/server.js';
import nock from 'nock';

// did:web:identity.foundation is a real, stable, publicly resolvable DID
// maintained by the Decentralized Identity Foundation.
const LIVE_DID_WEB = 'did:web:identity.foundation';

// Mock did:web domain — nock intercepts HTTPS calls to this host.
const MOCK_DOMAIN = 'did-resolver-test.example';
const MOCK_DID_WEB = `did:web:${MOCK_DOMAIN}`;

// A minimal valid DID document returned by the nock interceptor.
const MOCK_DID_DOCUMENT = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: `did:web:${MOCK_DOMAIN}`,
  verificationMethod: [
    {
      id: `did:web:${MOCK_DOMAIN}#key-1`,
      type: 'Ed25519VerificationKey2020',
      controller: `did:web:${MOCK_DOMAIN}`,
      publicKeyMultibase: 'z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'
    }
  ],
  authentication: [`did:web:${MOCK_DOMAIN}#key-1`]
};

let resolverServer;
let baseUrl;

before(async () => {
  const app = createServer();
  await new Promise(resolve => {
    resolverServer = app.listen(0, '127.0.0.1', () => {
      const {port} = resolverServer.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise(resolve => resolverServer.close(resolve));
  nock.cleanAll();
});

// Register nock interceptor before each mock test and clean up after.
function interceptMockDid() {
  nock(`https://${MOCK_DOMAIN}`)
    .get('/.well-known/did.json')
    .reply(200, MOCK_DID_DOCUMENT);
}

describe('GET /1.0/identifiers/:did — did:web (mock via nock)', () => {
  it('resolves a did:web via intercepted HTTPS and returns a DID document',
    async () => {
      interceptMockDid();
      const res = await fetch(
        `${baseUrl}/1.0/identifiers/${MOCK_DID_WEB}`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.id, MOCK_DID_DOCUMENT.id, 'id matches');
      assert.ok(Array.isArray(body['@context']), '@context is array');
      assert.ok(
        Array.isArray(body.verificationMethod), 'verificationMethod is array');
    });

  it('returns correct Content-Type for did:web document', async () => {
    interceptMockDid();
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/${MOCK_DID_WEB}`);
    assert.ok(
      res.headers.get('content-type').includes('application/did'));
  });

  it('returns full resolution result for did:web with Accept header',
    async () => {
      interceptMockDid();
      const res = await fetch(
        `${baseUrl}/1.0/identifiers/${MOCK_DID_WEB}`,
        {headers: {Accept: 'application/did-resolution'}});
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.didDocument, 'didDocument present');
      assert.equal(body.didDocument.id, MOCK_DID_DOCUMENT.id);
      assert.ok(body.didResolutionMetadata, 'didResolutionMetadata present');
      assert.ok(
        body.didDocumentMetadata !== undefined, 'didDocumentMetadata present');
    });

  it('returns 404 when did:web host returns 404', async () => {
    // Use a different domain to avoid hitting the LRU cache from prior tests.
    const notFoundDomain = 'did-resolver-notfound.example';
    nock(`https://${notFoundDomain}`)
      .get('/.well-known/did.json')
      .reply(404);
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/did:web:${notFoundDomain}`);
    assert.equal(res.status, 404);
  });
});

describe('GET /1.0/identifiers/:did — did:web (live)', function() {
  // Live network tests are skipped by default. Set LIVE_TESTS=1 to enable.
  before(function() {
    if(!process.env.LIVE_TESTS) {
      this.skip();
    }
  });

  it('resolves did:web:identity.foundation (live)', async () => {
    const res = await fetch(
      `${baseUrl}/1.0/identifiers/${LIVE_DID_WEB}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, LIVE_DID_WEB);
    assert.ok(Array.isArray(body['@context']), '@context is array');
    assert.ok(
      Array.isArray(body.verificationMethod), 'verificationMethod present');
  });

  it('returns full resolution result for live did:web with Accept header',
    async () => {
      const res = await fetch(
        `${baseUrl}/1.0/identifiers/${LIVE_DID_WEB}`,
        {headers: {Accept: 'application/did-resolution'}});
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.didDocument.id, LIVE_DID_WEB);
      assert.ok(body.didResolutionMetadata.contentType);
    });
});
