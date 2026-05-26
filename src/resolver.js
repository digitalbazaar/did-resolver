/*!
 * Copyright (c) 2024 Digital Bazaar, Inc.
 */
import {CachedResolver} from '@digitalbazaar/did-io';
import {keyDriver} from './drivers/key.js';
import {webDriver} from './drivers/web.js';

// Create the shared resolver instance and register drivers.
// To add a new DID method: import its driver and call resolver.use(driver).
export const resolver = new CachedResolver();

resolver.use(keyDriver);
resolver.use(webDriver);
