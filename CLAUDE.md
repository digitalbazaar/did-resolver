# did-resolver

W3C-conformant DID Resolution server — Digital Bazaar's independent implementation
of the [DID Resolution HTTPS Binding](https://w3c.github.io/did-resolution/#bindings-https).

## Stack
- Node.js ESM (no TypeScript, no transpilation)
- `did-io` CachedResolver for DID→DID Document resolution
- `did:key` and `did:web` drivers (extensible)
- Standalone HTTP server (no Bedrock)

## Commands
```bash
node src/index.js        # Start server
npm test                 # Run tests
npm run lint             # Lint with @digitalbazaar/eslint-config
```

## Key Files
- `src/resolver.js` — did-io CachedResolver setup; add new DID methods here
- `src/routes/resolve.js` — GET/POST resolution handler
- `src/routes/dereference.js` — DID URL dereferencing handler
- `src/http/errors.js` — DID error → HTTP status code mapping

## Adding a New DID Method
1. Install the driver package
2. Create `src/drivers/<method>.js`
3. `import` and `use()` it in `src/resolver.js`

## Spec References
- [DID Resolution HTTPS Binding](https://w3c.github.io/did-resolution/#bindings-https)
- [did-io](https://github.com/digitalbazaar/did-io)
