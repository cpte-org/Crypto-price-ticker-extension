import assert from 'node:assert/strict';
import test from 'node:test';

import {
  constants,
  createRuntime,
  formatBadgePrice,
  parseRetryAfter,
  validateQuote,
} from '../extension/runtime.js';

const coin = { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', providerId: 'bitcoin' };

function harness({
  time = 1_800_000_000_000,
  stored,
  fetchImpl,
  fetchDuration = 0,
  existingAlarm = null,
} = {}) {
  let nowValue = time;
  let storage = stored ?? {};
  const calls = { fetch: 0, badges: [], titles: [], alarms: [], listeners: {} };
  const event = (name) => ({
    addListener(fn) {
      calls.listeners[name] = fn;
    },
  });
  const api = {
    storage: {
      local: {
        async get() {
          return storage;
        },
        async set(value) {
          storage = { ...storage, ...value };
        },
      },
    },
    action: {
      async setBadgeText({ text }) {
        calls.badges.push(text);
      },
      async setBadgeBackgroundColor() {},
      async setBadgeTextColor() {},
      async setTitle({ title }) {
        calls.titles.push(title);
      },
      onClicked: event('click'),
    },
    alarms: {
      async get() {
        return existingAlarm;
      },
      async create(name, options) {
        calls.alarms.push([name, options]);
      },
      onAlarm: event('alarm'),
    },
    runtime: { onStartup: event('startup'), onInstalled: event('installed') },
  };
  const defaultFetch = async () => ({
    ok: true,
    headers: { get: () => null },
    async json() {
      return { bitcoin: { usd: 123.456789, last_updated_at: Math.floor(nowValue / 1000) } };
    },
  });
  const runtime = createRuntime({
    api,
    coin,
    now: () => nowValue,
    fetchImpl: async (...args) => {
      calls.fetch += 1;
      const response = await (fetchImpl ?? defaultFetch)(...args);
      nowValue += fetchDuration;
      return response;
    },
    logger: { warn() {} },
  });
  return {
    api,
    runtime,
    calls,
    get storage() {
      return storage;
    },
    advance(ms) {
      nowValue += ms;
    },
  };
}

test('formats compact prices within four characters at boundaries', () => {
  const cases = new Map([
    [0.00001, '<.01'],
    [0.01, '.01'],
    [0.1234, '.123'],
    [0.9999, '1'],
    [1.234, '1.23'],
    [12.34, '12.3'],
    [999.4, '999'],
    [999.5, '1k'],
    [1499, '1.5k'],
    [999_499, '999k'],
    [999_500, '1m'],
    [12_300_000, '12m'],
    [1e18, '1e18'],
    [1e100, '?'],
  ]);
  for (const [input, expected] of cases) {
    assert.equal(formatBadgePrice(input), expected, String(input));
    assert.ok(formatBadgePrice(input).length <= 4);
  }
});

test('validates price and provider timestamp', () => {
  const now = 1_800_000_000_000;
  assert.throws(
    () => validateQuote({ bitcoin: { usd: 0, last_updated_at: now / 1000 } }, coin, now),
    /price/,
  );
  assert.throws(
    () =>
      validateQuote({ bitcoin: { usd: 1, last_updated_at: (now - 300_001) / 1000 } }, coin, now),
    /stale/,
  );
  assert.throws(
    () => validateQuote({ bitcoin: { usd: 1, last_updated_at: (now + 60_001) / 1000 } }, coin, now),
    /future/,
  );
  assert.throws(
    () => validateQuote({ bitcoin: { usd: 1e100, last_updated_at: now / 1000 } }, coin, now),
    /supported range/,
  );
});

test('parses Retry-After seconds and HTTP dates', () => {
  const now = Date.parse('2027-01-15T08:00:00Z');
  assert.equal(parseRetryAfter('90', now), 90_000);
  assert.equal(parseRetryAfter('Fri, 15 Jan 2027 08:02:00 GMT', now), 120_000);
  assert.equal(parseRetryAfter('invalid', now), 0);
});

test('success schedules first, stores quote, and renders exact tooltip', async () => {
  const h = harness();
  await h.runtime.initialize();
  assert.equal(h.calls.fetch, 1);
  assert.equal(h.calls.alarms[0][0], constants.ALARM_NAME);
  assert.equal(h.calls.badges.at(-1), '123');
  assert.match(h.calls.titles.at(-1), /Price: \$123\.456789/);
  assert.match(h.calls.titles.at(-1), /Source: CoinGecko/);
  assert.equal(h.storage[constants.STATE_KEY].nextAttemptAt, 1_800_000_060_000);
});

test('429 Retry-After persists across restart and later recovers', async () => {
  let fail = true;
  const fetchImpl = async () =>
    fail
      ? { ok: false, status: 429, headers: { get: () => '120' } }
      : {
          ok: true,
          headers: { get: () => null },
          async json() {
            return { bitcoin: { usd: 7, last_updated_at: 1_800_000_120 } };
          },
        };
  const first = harness({ fetchImpl });
  await first.runtime.refresh();
  assert.equal(first.calls.badges.at(-1), '?');
  assert.equal(first.storage[constants.STATE_KEY].nextAttemptAt, 1_800_000_120_000);

  const restarted = harness({ stored: first.storage, fetchImpl });
  await restarted.runtime.initialize();
  assert.equal(restarted.calls.fetch, 0);
  restarted.advance(120_000);
  fail = false;
  await restarted.runtime.refresh();
  assert.equal(restarted.calls.fetch, 1);
  assert.equal(restarted.calls.badges.at(-1), '7');
});

test('invalid JSON, invalid price, stale timestamp, and offline failures show unknown', async (t) => {
  const failures = [
    async () => ({
      ok: true,
      headers: { get: () => null },
      async json() {
        throw new SyntaxError('bad json');
      },
    }),
    async () => ({
      ok: true,
      headers: { get: () => null },
      async json() {
        return { bitcoin: { usd: -1, last_updated_at: 1_800_000_000 } };
      },
    }),
    async () => ({
      ok: true,
      headers: { get: () => null },
      async json() {
        return { bitcoin: { usd: 1, last_updated_at: 1_799_999_000 } };
      },
    }),
    async () => {
      throw new TypeError('offline');
    },
  ];
  for (const fetchImpl of failures)
    await t.test(fetchImpl.name || 'failure', async () => {
      const h = harness({ fetchImpl });
      const result = await h.runtime.refresh();
      assert.equal(result.ok, false);
      assert.equal(h.calls.badges.at(-1), '?');
    });
});

test('timeout remains active while the response body hangs', async () => {
  let timerCallback;
  let aborted = false;
  const apiHarness = harness({
    fetchImpl: async (_url, { signal }) => ({
      ok: true,
      headers: { get: () => null },
      json: () =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
          timerCallback();
        }),
    }),
  });
  apiHarness.runtime = createRuntime({
    api: apiHarness.api,
    coin,
    now: () => 1_800_000_000_000,
    fetchImpl: async (_url, { signal }) => ({
      ok: true,
      headers: { get: () => null },
      json: () =>
        new Promise((_r, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
          queueMicrotask(timerCallback);
        }),
    }),
    setTimer(fn, ms) {
      assert.equal(ms, constants.REQUEST_TIMEOUT_MS);
      timerCallback = fn;
      return 1;
    },
    clearTimer() {},
    logger: { warn() {} },
  });
  const result = await apiHarness.runtime.refresh();
  assert.equal(aborted, true);
  assert.equal(result.ok, false);
});

test('storage and action failures are contained and fetch can still complete', async () => {
  const h = harness();
  h.api.storage.local.get = async () => {
    throw new Error('storage unavailable');
  };
  h.api.storage.local.set = async () => {
    throw new Error('storage unavailable');
  };
  h.api.action.setBadgeText = async () => {
    throw new Error('action unavailable');
  };
  const result = await h.runtime.refresh();
  assert.equal(result.ok, true);
  assert.equal(h.calls.fetch, 1);
  await h.runtime.refresh();
  assert.equal(h.calls.fetch, 1, 'in-memory cooldown survives failed persistence');
});

test('failed storage write keeps newer in-memory cooldown over older disk state', async () => {
  const h = harness({
    stored: {
      [constants.STATE_KEY]: { quote: null, failureCount: 0, nextAttemptAt: 0, lastError: null },
    },
  });
  h.api.storage.local.set = async () => {
    throw new Error('write failed');
  };
  await h.runtime.refresh();
  await h.runtime.refresh();
  assert.equal(h.calls.fetch, 1);
});

test('clicks share one request and cannot bypass cooldown', async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const h = harness({
    fetchImpl: async () => {
      await pending;
      return {
        ok: true,
        headers: { get: () => null },
        async json() {
          return { bitcoin: { usd: 2, last_updated_at: 1_800_000_000 } };
        },
      };
    },
  });
  h.runtime.register();
  const one = h.runtime.refresh();
  const two = h.runtime.refresh();
  h.calls.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.fetch, 1);
  release();
  await Promise.all([one, two]);
  await h.runtime.refresh();
  assert.equal(h.calls.fetch, 1);
});

test('corrupt storage is recovered and expired quotes are never current', async () => {
  const h = harness({
    stored: {
      [constants.STATE_KEY]: { quote: { price: 'bad' }, failureCount: -9, nextAttemptAt: 'soon' },
    },
  });
  const state = await h.runtime.loadState();
  assert.deepEqual(state, { quote: null, failureCount: 0, nextAttemptAt: 0, lastError: null });

  await h.runtime.render({
    quote: { price: 42, updatedAt: 1_799_999_000_000, fetchedAt: 1_799_999_000_000 },
    failureCount: 0,
    nextAttemptAt: 0,
    lastError: null,
  });
  assert.equal(h.calls.badges.at(-1), '?');
  assert.match(h.calls.titles.at(-1), /Last known: \$42/);
});

test('normalization bounds persisted state and drops impossible quote dates', async () => {
  const time = 1_800_000_000_000;
  const h = harness({
    stored: {
      [constants.STATE_KEY]: {
        quote: { price: 42, updatedAt: 9e15, fetchedAt: time },
        failureCount: 1_000_000,
        nextAttemptAt: 9e15,
        lastError: 'old',
      },
    },
  });
  const state = await h.runtime.loadState();
  assert.equal(state.quote, null);
  assert.equal(state.failureCount, 16);
  assert.equal(state.nextAttemptAt, 0);
});

test('huge persisted cooldown resets across repeated worker restarts', async () => {
  const time = 1_800_000_000_000;
  const corruptDisk = {
    [constants.STATE_KEY]: {
      quote: null,
      failureCount: 16,
      nextAttemptAt: 9e15,
      lastError: 'old',
    },
  };
  const first = harness({ time, stored: structuredClone(corruptDisk) });
  await first.runtime.initialize();
  assert.equal(first.calls.fetch, 1);

  const second = harness({ time: time + 60_000, stored: structuredClone(corruptDisk) });
  await second.runtime.initialize();
  assert.equal(second.calls.fetch, 1);
});

test('existing watchdog is not reset by refreshes or clicks', async () => {
  const h = harness({ existingAlarm: { name: constants.ALARM_NAME, periodInMinutes: 1 } });
  h.runtime.register();
  await h.runtime.refresh();
  h.calls.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  await h.runtime.refresh();
  assert.equal(h.calls.alarms.length, 0);
  assert.equal(h.calls.fetch, 1);
});

test('successful cadence is measured from attempt start', async () => {
  const h = harness({ fetchDuration: 30_000 });
  await h.runtime.refresh();
  assert.equal(h.storage[constants.STATE_KEY].nextAttemptAt, 1_800_000_060_000);
  h.advance(30_000);
  await h.runtime.refresh();
  assert.equal(h.calls.fetch, 2, 'the one-minute watchdog can refresh every minute');
});

test('watchdog tolerates one-second jitter while clicks keep strict cooldown', async () => {
  const h = harness();
  h.runtime.register();
  await h.runtime.refresh();
  h.advance(59_500);

  h.calls.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.fetch, 1, 'click remains rate limited');

  h.calls.listeners.alarm({ name: constants.ALARM_NAME });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.fetch, 2, 'watchdog absorbs sub-second scheduling jitter');
});

test('initialize joins an active flight and renders cached state before fetch completes', async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const time = 1_800_000_000_000;
  const stored = {
    [constants.STATE_KEY]: {
      quote: { price: 8, updatedAt: time, fetchedAt: time },
      failureCount: 0,
      nextAttemptAt: 0,
      lastError: null,
    },
  };
  const h = harness({
    stored,
    fetchImpl: async () => {
      await pending;
      return {
        ok: true,
        headers: { get: () => null },
        async json() {
          return { bitcoin: { usd: 9, last_updated_at: time / 1000 } };
        },
      };
    },
  });
  h.runtime.register();
  const active = h.runtime.initialize();
  h.calls.listeners.startup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.fetch, 1);
  assert.equal(h.calls.badges.at(-1), '8');
  release();
  await active;
  assert.equal(h.calls.badges.at(-1), '9');
});

test('null fetch rejection is handled without masking the failure', async () => {
  const h = harness({
    fetchImpl: async () => {
      throw null;
    },
  });
  const result = await h.runtime.refresh();
  assert.equal(result.ok, false);
  assert.equal(result.state.lastError, 'Refresh failed');
});

test('watchdog jitter never shortens a server Retry-After deadline', async () => {
  const h = harness({
    fetchImpl: async () => ({ ok: false, status: 429, headers: { get: () => '120' } }),
  });
  h.runtime.register();
  await h.runtime.refresh();
  h.advance(119_500);
  h.calls.listeners.alarm({ name: constants.ALARM_NAME });
  await h.runtime.refresh();
  assert.equal(h.calls.fetch, 1);
  h.advance(500);
  h.calls.listeners.alarm({ name: constants.ALARM_NAME });
  await h.runtime.refresh();
  assert.equal(h.calls.fetch, 2);
});
