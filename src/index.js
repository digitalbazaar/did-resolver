/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */
import {createServer} from './server.js';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

const PORT = process.env.PORT ?? 8080;
const HOST = process.env.HOST ?? '0.0.0.0';

const app = createServer();

app.listen(PORT, HOST, () => {
  console.log(`DID Resolver listening on http://${HOST}:${PORT}`);
  console.log(`Resolve endpoint: http://${HOST}:${PORT}/1.0/identifiers/{did}`);
});
