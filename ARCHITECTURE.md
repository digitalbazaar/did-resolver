# did-resolver — Architecture

## Deployment Target
Standalone Node.js HTTPS server. Self-hosted on DB infrastructure with a public URL
for W3C test suite submission.

## External Dependencies
| Dependency | Purpose |
|---|---|
| [`did-io`](https://github.com/digitalbazaar/did-io) | Core DID→DID Document resolution via `CachedResolver` |
| [`did-method-key`](https://github.com/digitalbazaar/did-method-key) | `did:key` driver for did-io |
| [`did-method-web`](https://github.com/digitalbazaar/did-method-web) | `did:web` driver for did-io |
| Node.js `node:https` / Express (TBD) | HTTP server |
| `@digitalbazaar/eslint-config` | Code style enforcement |

## Structure
**Modular monolith** — single process, single repo, clear internal module boundaries.

```
did-resolver/
├── src/
│   ├── index.js          # Entry point — wires server + resolver
│   ├── server.js         # HTTP server setup, route registration
│   ├── routes/
│   │   ├── resolve.js    # GET/POST /:did — resolution handler
│   │   └── dereference.js# GET /:didUrl — dereferencing handler
│   ├── resolver.js       # did-io CachedResolver instance + driver loading
│   ├── drivers/
│   │   ├── key.js        # did:key driver registration
│   │   └── web.js        # did:web driver registration
│   └── http/
│       ├── errors.js     # DID error → HTTP status code mapping
│       └── headers.js    # Content-Type helpers
├── tests/
├── docs/
├── .claude/skills/
├── scripts/
├── .env
├── .env.example
├── .gitignore
├── package.json
├── SPEC.md
├── ARCHITECTURE.md
└── CLAUDE.md
```

## Key Principles
- **Pluggable drivers** — `resolver.js` exports a single `use(driver)` wrapper; adding a new DID method is one `use()` call in a new file under `drivers/`
- **Functional core, imperative shell** — resolution logic is pure functions; HTTP handling is the shell
- **No ORM, no framework magic** — minimal dependencies; prefer `node:http`/`node:https` or a thin Express layer
- **ESM throughout** — `"type": "module"` in `package.json`, `.js` extensions on all imports
- **`node:` prefix** for all Node built-in imports

## Critical Paths
- **Resolution endpoint** — must return spec-correct responses; wrong status codes or Content-Type headers will fail W3C conformance tests
- **Error mapping** — every DID resolution error type (invalidDid, notFound, deactivated, etc.) must map to the correct HTTP status code per spec

## Boundaries
| Layer | Responsibility | What crosses the boundary |
|---|---|---|
| HTTP layer (`server.js`, `routes/`) | Parse request, set headers, write response | Raw DID string, resolution options |
| Resolution layer (`resolver.js`) | Call did-io, return result or throw | DID document, resolution metadata |
| Driver layer (`drivers/`) | Register method-specific drivers | Driver instance |
| Error layer (`http/errors.js`) | Map DID errors → HTTP status codes | Error type string → status integer |

## HTTP Status Code Mapping
Per [did-resolution spec §HTTPS Bindings](https://w3c.github.io/did-resolution/#bindings-https):

| Condition | Status |
|---|---|
| Success | 200 |
| Invalid DID / bad request | 400 |
| DID not found | 404 |
| Unsupported `Accept` type | 406 |
| DID deactivated | 410 |
| Internal error | 500 |
| DID method not supported | 501 |

## Decisions Log
| Decision | Rationale | Date |
|---|---|---|
| Use `did-io` CachedResolver | DB-maintained, has `did:key` and `did:web` drivers, pluggable architecture | 2026-05-26 |
| Standalone Node.js (no Bedrock) | Speed; Bedrock adds complexity not needed for a single-endpoint server | 2026-05-26 |
| ESM, no TypeScript | DB house style | 2026-05-26 |
| `did:key` + `did:web` only for v1 | Both covered by did-io; extensible via driver pattern | 2026-05-26 |
| HTTP framework TBD | Need to confirm DB preference (bare node:http vs Express) | 2026-05-26 |
