// Optional Chromium integration check. Uses a fresh temporary profile, never your normal browser.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
const binary = process.env.BROWSER_BINARY;
if (!binary)
  throw new Error('Set BROWSER_BINARY to an extension-capable Chromium/Brave executable');
const profile = await mkdtemp('/tmp/cpte-browser-');
const launch = () =>
  spawn(
    binary,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--load-extension=${resolve('dist/extensions/bitcoin/chrome')}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
let browser = launch();
let logs = '';
browser.stderr.on('data', (x) => (logs += x));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 18000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await pause(100);
  }
  throw new Error('Timed out waiting for browser state');
}
const sockets = [];
async function connect(url) {
  const socket = new WebSocket(url);
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener('message', ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      }
    } else listeners.get(m.method)?.(m.params);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      pending.set(n, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: n, method, params }));
    });
  await send('Runtime.runIfWaitingForDebugger');
  return {
    send,
    on: (name, fn) => listeners.set(name, fn),
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    },
  };
}
try {
  let port = await until(async () => {
    try {
      return (await readFile(profile + '/DevToolsActivePort', 'utf8')).split('\n')[0];
    } catch {
      return false;
    }
  });
  const worker = async (except) =>
    until(async () => {
      const ts = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return ts.find(
        (t) =>
          t.type === 'service_worker' && t.url.startsWith('chrome-extension:') && t.id !== except,
      );
    });
  let target = await worker();
  let client = await connect(target.webSocketDebuggerUrl);
  const state = () =>
    client.evaluate(
      `(async()=>({...(await chrome.storage.local.get('priceRuntimeState')),badge:await chrome.action.getBadgeText({}),title:await chrome.action.getTitle({}),alarm:await chrome.alarms.get('price-watchdog')}))()`,
    );
  let current = await until(async () => {
    const s = await state();
    return s.priceRuntimeState && s;
  });
  assert.ok(current.alarm);
  console.log('Live startup:', current.badge, current.priceRuntimeState.lastError ?? 'valid quote');
  let mode = 'rate-limit';
  const intercept = async () => {
    client.on('Fetch.requestPaused', (p) => {
      const response =
        mode === 'offline'
          ? client.send('Fetch.failRequest', {
              requestId: p.requestId,
              errorReason: 'InternetDisconnected',
            })
          : client.send('Fetch.fulfillRequest', {
              requestId: p.requestId,
              responseCode: mode === 'rate-limit' ? 429 : 200,
              responseHeaders: [
                { name: 'Content-Type', value: 'application/json' },
                { name: 'Retry-After', value: '120' },
              ],
              body: Buffer.from(
                JSON.stringify({
                  bitcoin: { usd: 54321.123456, last_updated_at: Math.floor(Date.now() / 1000) },
                }),
              ).toString('base64'),
            });
      response.catch((e) => console.error(e.message));
    });
    await client.send('Fetch.enable', {
      patterns: [{ urlPattern: 'https://api.coingecko.com/*', requestStage: 'Request' }],
    });
  };
  const trigger = () =>
    client.evaluate(
      `(async()=>{const s=(await chrome.storage.local.get('priceRuntimeState')).priceRuntimeState;await chrome.storage.local.set({priceRuntimeState:{...s,nextAttemptAt:0}});await chrome.alarms.create('price-watchdog',{when:Date.now()+1000,periodInMinutes:1});})()`,
    );
  await intercept();
  await trigger();
  current = await until(async () => {
    const s = await state();
    return s.priceRuntimeState.lastError === 'CoinGecko HTTP 429' && s;
  });
  assert.equal(current.badge, '?');
  let retryAt = current.priceRuntimeState.nextAttemptAt;
  assert.ok(retryAt > Date.now() + 100000);
  console.log('HTTP 429: unavailable badge and persisted Retry-After verified');
  mode = 'success';
  await intercept();
  await trigger();
  current = await until(async () => {
    const s = await state();
    return (
      s.priceRuntimeState.failureCount === 0 &&
      s.priceRuntimeState.quote?.price === 54321.123456 &&
      s
    );
  });
  assert.equal(current.badge, '54k');
  assert.match(current.title, /54321\.123456/);
  console.log('Recovery: valid price and full-precision tooltip restored');
  mode = 'offline';
  await trigger();
  current = await until(async () => {
    const s = await state();
    return s.priceRuntimeState.failureCount > 0 && s;
  });
  assert.equal(current.badge, '?');
  assert.match(current.title, /Last known/);
  console.log('Offline: stale quote is explicitly unavailable');
  mode = 'success';
  await trigger();
  current = await until(async () => {
    const s = await state();
    return s.priceRuntimeState.failureCount === 0 && s;
  });
  assert.equal(current.badge, '54k');
  mode = 'rate-limit';
  await trigger();
  current = await until(async () => {
    const s = await state();
    return s.priceRuntimeState.lastError === 'CoinGecko HTTP 429' && s;
  });
  retryAt = current.priceRuntimeState.nextAttemptAt;
  browser.kill('SIGTERM');
  await once(browser, 'exit');
  await rm(profile + '/DevToolsActivePort', { force: true });
  browser = launch();
  browser.stderr.on('data', (x) => (logs += x));
  port = await until(async () => {
    try {
      return (await readFile(profile + '/DevToolsActivePort', 'utf8')).split('\n')[0];
    } catch {
      return false;
    }
  });
  target = await worker();
  client = await connect(target.webSocketDebuggerUrl);
  current = await until(async () => {
    const s = await state();
    return s.priceRuntimeState && s.badge === '?' && s;
  });
  assert.equal(current.priceRuntimeState.nextAttemptAt, retryAt);
  console.log('Browser restart: retry deadline survived');
  console.log(
    'Chromium smoke passed: startup, rate limit, browser restart, offline and recovery. Profile:',
    profile,
  );
} catch (error) {
  console.error(logs.slice(-1000));
  throw error;
} finally {
  for (const socket of sockets) socket.close();
  browser.kill('SIGTERM');
}
