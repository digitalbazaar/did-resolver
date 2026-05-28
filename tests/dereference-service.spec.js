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
  it('returns the service endpoint URL as text/uri-list by default',
    async () => {
      interceptMockDid();
      const didUrl = encodeURIComponent(`${MOCK_DID_WEB}?service=files`);
      const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/uri-list'),
        'Content-Type is text/uri-list');
      const body = await res.text();
      assert.equal(body, SERVICE_ENDPOINT, 'body is the endpoint URL');
    });

  it('redirects with HTTP 303 when Accept is text/uri-list', async () => {
    interceptMockDid();
    const didUrl = encodeURIComponent(`${MOCK_DID_WEB}?service=files`);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`, {
      redirect: 'manual',
      headers: {Accept: 'text/uri-list'}
    });
    assert.equal(res.status, 303, 'HTTP 303 redirect');
    assert.equal(res.headers.get('location'), SERVICE_ENDPOINT,
      'Location header is service endpoint URL');
  });

  it('returns full dereferencing result with service endpoint', async () => {
    interceptMockDid();
    const didUrl = encodeURIComponent(`${MOCK_DID_WEB}?service=files`);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`, {
      headers: {Accept: 'application/did-url-dereferencing'}
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes(
      'application/did-url-dereferencing'));
    const body = await res.json();
    assert.ok(body.dereferencingMetadata, 'dereferencingMetadata present');
    assert.ok(body.contentStream, 'contentStream present');
    assert.equal(body.contentStream.url, SERVICE_ENDPOINT,
      'contentStream contains endpoint URL');
  });

  it('appends ?relativeRef= to the service endpoint URL', async () => {
    interceptMockDid();
    const didUrl = encodeURIComponent(
      `${MOCK_DID_WEB}?service=files&relativeRef=/docs/spec.html`);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`, {
      redirect: 'manual',
      headers: {Accept: 'text/uri-list'}
    });
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.get('location'),
      `${SERVICE_ENDPOINT}/docs/spec.html`,
      'relativeRef appended to endpoint URL');
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

  it('returns 404 with dereferencing body when service not found', async () => {
    interceptMockDid();
    const didUrl = encodeURIComponent(
      `${MOCK_DID_WEB}?service=nonexistent`);
    const res = await fetch(`${baseUrl}/1.0/identifiers/${didUrl}`, {
      headers: {Accept: 'application/did-url-dereferencing'}
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.dereferencingMetadata.error.type,
      'https://www.w3.org/ns/did#NOT_FOUND');
    assert.equal(body.contentStream, null);
  });
});
