import coin from './coin.js';
import { createRuntime } from './runtime.js';

const api = globalThis.browser ?? globalThis.chrome;
const runtime = createRuntime({ api, coin });
runtime.register();
runtime.initialize().catch((error) => {
  try {
    console.warn(error);
  } catch {
    /* Keep the worker rejection handled. */
  }
});
