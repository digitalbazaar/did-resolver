# did-resolver

A W3C-conformant [DID Resolution](https://w3c.github.io/did-resolution/) server
implementing the [HTTPS Binding](https://w3c.github.io/did-resolution/#bindings-https).

Digital Bazaar's independent implementation for W3C standardization — providing the
second conforming implementation required for the spec to advance to a global standard.

## How It Works

### Overview

A DID (Decentralized Identifier) is a URI like `did:key:z6Mk...` or
`did:web:example.com`. Resolving a DID means fetching the **DID Document** — a JSON-LD
object that describes the entity: its public keys, authentication methods, and service
endpoints.

This server exposes a single HTTP endpoint that accepts a DID (or DID URL), resolves
it to a DID Document using [`@digitalbazaar/did-io`](https://github.com/digitalbazaar/did-io), and
returns the result in the format the client requests.

```
Client                        did-resolver                     did-io
  |                               |                               |
  |-- GET /did:key:z6Mk... ------>|                               |
  |                               |-- resolver.get({did}) ------->|
  |                               |                               |-- driver lookup
  |                               |                               |-- fetch/derive doc
  |                               |<-- DID Document --------------|
  |<-- 200 application/did+ld+json|
```

### Endpoints

#### Resolve a DID

```
GET  /1.0/identifiers/{did}
POST /1.0/identifiers/{did}
```

- `GET` — resolution options passed as query parameters
- `POST` — resolution options passed as a JSON body

**Response formats** (controlled by `Accept` header):

| Accept Header | Response |
|---|---|
| `application/did+ld+json` | DID Document only |
| `application/did-resolution` | Full result: document + resolution metadata + document metadata |
| _(default)_ | DID Document only |

#### Dereference a DID URL

```
GET /1.0/identifiers/{did-url}
```

A DID URL extends a DID with a path, query, or fragment:
- `did:key:z6Mk...#key-1` → returns a specific verification method
- `did:web:example.com?service=files` → HTTP 303 redirect to the service endpoint URL
- `did:web:example.com?service=files&relativeRef=/path` → redirect with path appended

**Response formats** (controlled by `Accept` header):

| Accept Header | Response |
|---|---|
| `application/did-url-dereferencing` | Full result: content + dereferencing metadata |
| `text/uri-list` | HTTP 303 redirect to the resource URL |
| _(default)_ | The dereferenced resource directly |

### HTTP Status Codes

Per the [DID Resolution spec](https://w3c.github.io/did-resolution/#bindings-https):

| Condition | Status |
|---|---|
| Success | `200 OK` |
| Invalid DID syntax | `400 Bad Request` |
| DID not found | `404 Not Found` |
| Unsupported `Accept` type | `406 Not Acceptable` |
| DID deactivated | `410 Gone` |
| Internal resolver error | `500 Internal Server Error` |
| DID method not supported | `501 Not Implemented` |

### Error Format

When `Accept: application/did-resolution` is requested, error responses are
conformant resolution results with an RFC 9457-style error object in
`didResolutionMetadata`:

```json
{
  "@context": "https://w3id.org/did-resolution/v1",
  "didDocument": null,
  "didDocumentMetadata": {},
  "didResolutionMetadata": {
    "error": {
      "type": "https://www.w3.org/ns/did#METHOD_NOT_SUPPORTED"
    }
  }
}
```

Error type URIs follow the W3C DID namespace:
`https://www.w3.org/ns/did#INVALID_DID`, `#NOT_FOUND`, `#METHOD_NOT_SUPPORTED`,
`#REPRESENTATION_NOT_SUPPORTED`, `#INTERNAL_ERROR`, etc.

### Deactivated DIDs

If a resolved DID document contains `"deactivated": true`, the server returns
`410 Gone` with a null `didDocument` and `"deactivated": true` in
`didDocumentMetadata`. Neither `did:key` nor `did:web` support deactivation
(both are static/derived methods with no registry). Ledger-based methods such
as `did:veres-one` or `did:ion` do — register such a driver to exercise this
path.

### Supported DID Methods

| Method | Description |
|---|---|
| `did:key` | Self-certifying DID derived from a public key |
| `did:web` | DID Document hosted at a well-known HTTPS URL |

Additional methods can be added by registering a driver with the `CachedResolver` — see
[Adding a DID Method](#adding-a-did-method).

### Architecture

```
lib/
├── index.js          # Entry point — wires server + resolver
├── server.js         # HTTP server, route registration
├── resolver.js       # did-io CachedResolver instance
├── routes/
│   ├── resolve.js    # GET/POST resolution handler
│   └── dereference.js# DID URL dereferencing handler
├── drivers/
│   ├── key.js        # did:key driver
│   └── web.js        # did:web driver
└── http/
    ├── errors.js     # DID error → HTTP status code mapping
    └── headers.js    # Content-Type helpers
```

The server uses [Express](https://expressjs.com/) for routing and the DB-standard
ESM module format throughout.

**Resolution flow:**

1. Request arrives at `GET /1.0/identifiers/{did}`
2. Route handler extracts the DID and resolution options
3. `resolver.js` calls `did-io` `CachedResolver.get({did})`
4. The appropriate driver (key, web, etc.) fetches or derives the DID Document
5. The handler formats the response per the `Accept` header
6. Status code is set based on result or error type

## Installation

```bash
npm install
```

## Usage

```bash
# Start the server (default port 8080)
node lib/index.js

# Resolve a DID
curl http://localhost:8080/1.0/identifiers/did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH

# Get full resolution result
curl -H "Accept: application/did-resolution" \
  http://localhost:8080/1.0/identifiers/did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH

# Dereference a DID URL fragment (specific verification method)
curl http://localhost:8080/1.0/identifiers/did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH%23z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH

# Dereference a service endpoint (HTTP 303 redirect)
curl -L -H "Accept: text/uri-list" \
  http://localhost:8080/1.0/identifiers/did:web:example.com%3Fservice%3Dfiles
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `HOST` | `0.0.0.0` | Host to bind to |

## Adding a DID Method

1. Install the driver package:
   ```bash
   npm install @digitalbazaar/did-method-example
   ```

2. Create `lib/drivers/example.js`:
   ```js
   import {driver} from '@digitalbazaar/did-method-example';

   export const exampleDriver = driver();
   ```
   If the method uses multikey cryptography, also register the key suite:
   ```js
   import {Ed25519VerificationKey2020} from
     '@digitalbazaar/ed25519-verification-key-2020';

   exampleDriver.use({
     multibaseMultikeyHeader: 'z6Mk',
     fromMultibase: Ed25519VerificationKey2020.from
   });
   ```

3. Register it in `lib/resolver.js`:
   ```js
   import {exampleDriver} from './drivers/example.js';
   resolver.use(exampleDriver);
   ```

That's it.

## Development

```bash
npm test       # Run test suite
npm run lint   # Lint with @digitalbazaar/eslint-config
```

## Spec Conformance

All 35 tests in the
[w3c-ccg/did-resolution-mocha-test-suite](https://github.com/w3c-ccg/did-resolution-mocha-test-suite)
pass against this implementation.

| Requirement | Status |
|---|---|
| `GET /1.0/identifiers/{did}` binding | ✅ |
| `POST /1.0/identifiers/{did}` binding | ✅ |
| Resolution result shape (`didDocument`, `didResolutionMetadata`, `didDocumentMetadata`) | ✅ |
| `didResolutionMetadata.contentType` present on success | ✅ |
| `Content-Type` header matches `didResolutionMetadata.contentType` | ✅ |
| RFC 9457 error objects with W3C DID namespace URIs | ✅ |
| `INVALID_DID` + 400 for malformed DID input | ✅ |
| `NOT_FOUND` + 404 | ✅ |
| `METHOD_NOT_SUPPORTED` + 501 | ✅ |
| `REPRESENTATION_NOT_SUPPORTED` + 406 | ✅ |
| Deactivated DID → 410 + null document | ✅ (requires a method that supports deactivation) |
| 303 redirect with empty body for `text/uri-list` | ✅ |
| DID URL dereferencing result shape | ✅ |

## Spec References

- [W3C DID Resolution](https://w3c.github.io/did-resolution/)
- [HTTPS Binding](https://w3c.github.io/did-resolution/#bindings-https)
- [DID Resolution Mocha Test Suite](https://github.com/w3c-ccg/did-resolution-mocha-test-suite)
- [@digitalbazaar/did-io](https://github.com/digitalbazaar/did-io)
- [Danube Tech Universal Resolver](https://github.com/decentralized-identity/universal-resolver) (reference implementation)

## License

[BSD-3-Clause](LICENSE) © Digital Bazaar
