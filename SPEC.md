# did-resolver — Spec

## Purpose
A W3C-conformant DID Resolution server implementing the HTTPS binding defined in
[did-resolution §HTTPS Bindings](https://w3c.github.io/did-resolution/#bindings-https),
serving as Digital Bazaar's independent implementation for W3C standardization.

## Problem
The W3C DID Resolution spec requires two independent implementations to advance to
a global standard. Danube Tech (Markus Sabadello) has one. Digital Bazaar needs to
be the second. No other conformant reference implementation exists.

## Users
- W3C working group / test suite (primary conformance target)
- Any developer who needs a self-hostable DID resolution HTTP endpoint

## MVP
All of the following are required for v1 (W3C conformance gate):

- **GET** `/{did}` — resolve a DID, return DID document or full resolution result
- **POST** `/{did}` — resolve with options in JSON body
- **GET** `/{did-url}` — dereference a DID URL (with params/fragments/service refs)
- Correct `Content-Type` headers (`application/did+ld+json`, `application/did-resolution`, `application/did-url-dereferencing`)
- Correct HTTP status code mapping (200, 400, 404, 406, 410, 500, 501)
- HTTP 410 for deactivated DIDs
- TLS (HTTPS) in production
- Support for `did:key` and `did:web` methods via `did-io` drivers
- Pluggable driver architecture so new DID methods can be added with minimal code
- Pass W3C DID Resolution test suite

## Out of Scope (v1)
- Authentication / API keys
- Rate limiting
- Caching layer (did-io has LRU internally; no additional caching needed)
- Admin UI or dashboard
- Metrics / observability
- Support for DID methods beyond `did:key` and `did:web`
- Persistent storage

## Constraints
- **Deadline:** ~1 week to 80% complete implementation
- **Tech:** Node.js ESM, no transpilation, `node:` prefix for built-ins, DB eslint config
- **Core dependency:** [`did-io`](https://github.com/digitalbazaar/did-io) `CachedResolver` handles DID→DID Document resolution; this project wraps it in an HTTP server
- **Style:** Match `@digitalbazaar` repo conventions throughout (ESM, no TypeScript, DB eslint)
- **Standalone:** No Bedrock dependency; plain Node.js HTTP server (Express or bare `node:http`)

## Quality Priorities
1. **Correctness** — spec-conformant responses, status codes, and headers
2. **Maintainability** — adding a new DID method driver should be a one-liner
3. **Developer speed** — ship in a week; no over-engineering

## Open Questions
1. **HTTP framework:** Express vs. bare `node:http` vs. Fastify — which does DB prefer for standalone services?
2. **Test suite:** Will is working on it; do we need to run it locally to verify, or will CI handle that?
3. **Hosting:** Where does this get deployed for the W3C submission (DB infra, a public URL is required)?
4. **DID URL dereferencing depth:** Does v1 need to resolve service endpoint redirects (HTTP 303), or just return the resource?
