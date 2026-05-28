/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import {strict as assert} from 'node:assert';
import {createServer} from '../lib/server.js';
import nock from 'nock';

// Mock did:web domain with a service endpoint in its DID document.
const MOCK_DOMAIN = 'did-resolver-service.example';
const MOCK_DID_WEB = `did:web:${MOCK_DOMAIN}`;
const SERVICE_ENDPOINT = 'https://files.example.com/storage';

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
  authentication: [`did:web:${MOCK_DOMAIN}#key-1`],
  service: [
    {
      id: `did:web:${MOCK_DOMAIN}#files`,
      type: 'FileStorageService',
      serviceEndpoint: SERVICE_ENDPOINT
    }
  ]
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

// Intercept the HTTPS fetch the did:web driver will make.
function interceptMockDid() {
  nock(`https://${MOCK_DOMAIN}`)
    .get('/.well-known/did.json')
    .reply(200, MOCK_DID_DOCUMENT);
}

describe('Service endpoint dereferencing — ?service= param', () => {
  it('returns the service endpoint URL as application/did by default',
    async () => {
      interceptMockDid();
      const didUrl = encodeURIComponent(`${MOCK_DID_WEB}?service=files`);
      const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('application/did'),
        'Content-Type is application/did');
      const body = await res.json();
      assert.equal(body.serviceEndpoint, SERVICE_ENDPOINT,
        'body contains the endpoint URL');
    });

  it('returns 406 when Accept is text/uri-list', async () => {
    interceptMockDid();
    const didUrl = encodeURIComponent(`${MOCK_DID_WEB}?service=files`);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`, {
      headers: {Accept: 'text/uri-list'}
    });
    assert.equal(res.status, 406, 'text/uri-list is no longer supported');
  });

  it('returns full resolution result with service endpoint', async () => {
    interceptMockDid();
    const didUrl = encodeURIComponent(`${MOCK_DID_WEB}?service=files`);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`, {
      headers: {Accept: 'application/did-resolution'}
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes(
      'application/did-resolution'));
    const body = await res.json();
    assert.ok(body.didResolutionMetadata, 'didResolutionMetadata present');
    assert.equal(body.didResolutionMetadata.serviceEndpoint, SERVICE_ENDPOINT,
      'serviceEndpoint in metadata');
  });

  it('ignores relativeRef param (not supported)', async () => {
    interceptMockDid();
    const didUrl = encodeURIComponent(
      `${MOCK_DID_WEB}?service=files&relativeRef=/docs/spec.html`);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.serviceEndpoint, SERVICE_ENDPOINT,
      'returns base endpoint URL without relativeRef appended');
  });

  it('returns 404 when service ID is not found in DID document', async () => {
    interceptMockDid();
    const didUrl = encodeURIComponent(
      `${MOCK_DID_WEB}?service=nonexistent`);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.ok(body.message.includes('"nonexistent"'),
      'error message names the missing service');
  });

  it('returns 404 with resolution body when service not found', async () => {
    interceptMockDid();
    const didUrl = encodeURIComponent(
      `${MOCK_DID_WEB}?service=nonexistent`);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`, {
      headers: {Accept: 'application/did-resolution'}
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.didResolutionMetadata.error.type,
      'https://www.w3.org/ns/did#NOT_FOUND');
    assert.equal(body.didDocument, null);
  });
});
