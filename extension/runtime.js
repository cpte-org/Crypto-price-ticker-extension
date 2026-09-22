const ALARM_NAME = 'price-watchdog';
const STATE_KEY = 'priceRuntimeState';
const MIN_ATTEMPT_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;
const MAX_QUOTE_AGE_MS = 5 * 60_000;
const MAX_FUTURE_SKEW_MS = 60_000;
const REQUEST_TIMEOUT_MS = 12_000;
const ALARM_SKEW_TOLERANCE_MS = 1_000;
const BADGE_BACKGROUND_COLOR = '#0d66d5';
const BADGE_TEXT_COLOR = '#ffffff';
const MAX_FAILURE_COUNT = 16;
const MAX_DATE_MS = 8_640_000_000_000_000;

function trimDecimal(value) {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

export function formatBadgePrice(value) {
  if (!Number.isFinite(value) || value <= 0) return '?';
  if (value < 0.01) return '<.01';

  if (value >= 999.5) {
    const suffixes = ['', 'k', 'm', 'b', 't'];
    let unit = Math.min(4, Math.max(1, Math.floor(Math.log10(value) / 3)));
    let scaled = value / 1000 ** unit;
    if (scaled >= 999.5 && unit < 4) {
      unit += 1;
      scaled /= 1000;
    }
    const digits = scaled < 10 ? 1 : 0;
    const compact = `${trimDecimal(scaled.toFixed(digits))}${suffixes[unit]}`;
    if (compact.length <= 4) return compact;
    const scientific = value.toExponential(0).replace('e+', 'e');
    return scientific.length <= 4 ? scientific : '?';
  }

  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, '');
  if (value >= 1) return trimDecimal(value.toFixed(2));
  if (value >= 0.1) return trimDecimal(value.toFixed(3).replace(/^0/, ''));
  return trimDecimal(value.toFixed(3).replace(/^0/, ''));
}

export function parseRetryAfter(value, now) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export function validateQuote(payload, coin, now) {
  const record = payload?.[coin.providerId];
  const price = record?.usd;
  const updatedSeconds = record?.last_updated_at;
  if (!Number.isFinite(price) || price <= 0)
    throw new Error('Provider returned an invalid USD price');
  if (!Number.isFinite(updatedSeconds) || updatedSeconds <= 0)
    throw new Error('Provider returned an invalid timestamp');

  const updatedAt = updatedSeconds * 1000;
  if (formatBadgePrice(price) === '?')
    throw new Error('Provider returned a price outside the supported range');
  if (!Number.isFinite(updatedAt) || Math.abs(updatedAt) > MAX_DATE_MS)
    throw new Error('Provider returned an invalid timestamp');
  if (updatedAt < now - MAX_QUOTE_AGE_MS) throw new Error('Provider quote is stale');
  if (updatedAt > now + MAX_FUTURE_SKEW_MS) throw new Error('Provider timestamp is in the future');
  return { price, updatedAt, fetchedAt: now };
}

function initialState() {
  return { quote: null, failureCount: 0, nextAttemptAt: 0, lastError: null };
}

function normalizeState(value, currentTime) {
  const state = value && typeof value === 'object' ? value : {};
  const quote = state.quote;
  const validQuote =
    quote &&
    Number.isFinite(quote.price) &&
    quote.price > 0 &&
    formatBadgePrice(quote.price) !== '?' &&
    Number.isFinite(quote.updatedAt) &&
    quote.updatedAt > 0 &&
    quote.updatedAt <= MAX_DATE_MS &&
    Number.isFinite(quote.fetchedAt) &&
    quote.fetchedAt > 0 &&
    quote.fetchedAt <= MAX_DATE_MS &&
    quote.updatedAt <= currentTime + MAX_FUTURE_SKEW_MS &&
    quote.fetchedAt <= currentTime + MAX_FUTURE_SKEW_MS
      ? { price: quote.price, updatedAt: quote.updatedAt, fetchedAt: quote.fetchedAt }
      : null;
  const nextAttemptAt =
    Number.isFinite(state.nextAttemptAt) &&
    state.nextAttemptAt > currentTime &&
    state.nextAttemptAt <= currentTime + MAX_BACKOFF_MS
      ? state.nextAttemptAt
      : 0;
  return {
    quote: validQuote,
    failureCount: Number.isInteger(state.failureCount)
      ? Math.min(MAX_FAILURE_COUNT, Math.max(0, state.failureCount))
      : 0,
    nextAttemptAt,
    lastError: typeof state.lastError === 'string' ? state.lastError : null,
  };
}

function exactPrice(price) {
  return String(price);
}

function quoteTime(timestamp) {
  return new Date(timestamp).toISOString();
}

export function createRuntime({
  api,
  coin,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  logger = console,
}) {
  let flight = null;
  let memoryState = initialState();
  let memoryDirty = false;
  let watchdogPromise = null;
  let watchdogReady = false;

  const report = (error) => {
    try {
      logger?.warn?.(error);
    } catch {
      // Logging must never turn a contained extension failure into a rejection.
    }
  };

  const safely = async (operation) => {
    try {
      return await operation();
    } catch (error) {
      report(error);
      return undefined;
    }
  };

  async function loadState() {
    try {
      const stored = await api.storage.local.get(STATE_KEY);
      if (!memoryDirty && stored && Object.prototype.hasOwnProperty.call(stored, STATE_KEY)) {
        memoryState = normalizeState(stored[STATE_KEY], now());
      }
    } catch (error) {
      report(error);
    }
    memoryState = normalizeState(memoryState, now());
    return memoryState;
  }

  async function saveState(state) {
    memoryState = normalizeState(state, now());
    memoryDirty = true;
    try {
      await api.storage.local.set({ [STATE_KEY]: memoryState });
      memoryDirty = false;
    } catch (error) {
      report(error);
    }
  }

  function titleFor(state, currentTime) {
    const lines = [`${coin.name} (${coin.symbol}) USD`, 'Source: CoinGecko'];
    const isCurrent =
      state.failureCount === 0 &&
      state.quote &&
      state.quote.updatedAt >= currentTime - MAX_QUOTE_AGE_MS &&
      state.quote.updatedAt <= currentTime + MAX_FUTURE_SKEW_MS;
    if (state.quote) {
      lines.push(`${isCurrent ? 'Price' : 'Last known'}: $${exactPrice(state.quote.price)}`);
      lines.push(`Provider time: ${quoteTime(state.quote.updatedAt)}`);
    }
    if (
      state.failureCount > 0 ||
      !state.quote ||
      state.quote.updatedAt < currentTime - MAX_QUOTE_AGE_MS
    ) {
      lines.push(state.lastError ? `Unavailable: ${state.lastError}` : 'Price unavailable');
    }
    return lines.join('\n');
  }

  async function render(state) {
    const currentTime = now();
    const isCurrent =
      state.failureCount === 0 &&
      state.quote &&
      state.quote.updatedAt >= currentTime - MAX_QUOTE_AGE_MS &&
      state.quote.updatedAt <= currentTime + MAX_FUTURE_SKEW_MS;
    await safely(() => api.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR }));
    await safely(() => api.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR }));
    await Promise.all([
      safely(() =>
        api.action.setBadgeText({ text: isCurrent ? formatBadgePrice(state.quote.price) : '?' }),
      ),
      safely(() => api.action.setTitle({ title: titleFor(state, currentTime) })),
    ]);
  }

  async function scheduleWatchdog() {
    if (watchdogReady) return;
    if (!watchdogPromise) {
      watchdogPromise = (async () => {
        try {
          let existing = null;
          try {
            existing = await api.alarms.get(ALARM_NAME);
          } catch (error) {
            report(error);
          }
          if (!existing)
            await api.alarms.create(ALARM_NAME, { delayInMinutes: 1, periodInMinutes: 1 });
          watchdogReady = true;
        } catch (error) {
          report(error);
        }
      })().finally(() => {
        watchdogPromise = null;
      });
    }
    await watchdogPromise;
  }

  async function requestQuote() {
    const controller = new AbortController();
    const timer = setTimer(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin.providerId)}&vs_currencies=usd&include_last_updated_at=true&precision=full`;
      const response = await fetchImpl(url, { signal: controller.signal, cache: 'no-store' });
      if (!response?.ok) {
        const error = new Error(`CoinGecko HTTP ${response?.status ?? 'error'}`);
        error.retryAfterMs = parseRetryAfter(response?.headers?.get?.('retry-after'), now());
        throw error;
      }
      return validateQuote(await response.json(), coin, now());
    } finally {
      clearTimer(timer);
    }
  }

  async function performRefresh(cooldownToleranceMs) {
    const attemptStartedAt = now();
    await scheduleWatchdog();
    const state = await loadState();
    await render(state);
    const currentTime = now();
    if (currentTime + (state.failureCount === 0 ? cooldownToleranceMs : 0) < state.nextAttemptAt) {
      return { attempted: false, state };
    }

    try {
      const quote = await requestQuote();
      const next = {
        quote,
        failureCount: 0,
        nextAttemptAt: attemptStartedAt + MIN_ATTEMPT_INTERVAL_MS,
        lastError: null,
      };
      await saveState(next);
      await render(next);
      return { attempted: true, ok: true, state: next };
    } catch (error) {
      const failures = Math.min(MAX_FAILURE_COUNT, state.failureCount + 1);
      const exponential = MIN_ATTEMPT_INTERVAL_MS * 2 ** Math.min(failures - 1, 4);
      const delay = Math.min(MAX_BACKOFF_MS, Math.max(exponential, error?.retryAfterMs || 0));
      const next = {
        ...state,
        failureCount: failures,
        nextAttemptAt: now() + delay,
        lastError: error?.message || 'Refresh failed',
      };
      await saveState(next);
      await render(next);
      return { attempted: true, ok: false, state: next };
    }
  }

  function refresh({ cooldownToleranceMs = 0 } = {}) {
    if (!flight)
      flight = performRefresh(cooldownToleranceMs).finally(() => {
        flight = null;
      });
    return flight;
  }

  async function initialize() {
    return refresh();
  }

  function runFromListener(operation) {
    operation().catch(report);
  }

  function register() {
    api.action.onClicked.addListener(() => runFromListener(refresh));
    api.alarms.onAlarm.addListener((alarm) => {
      if (alarm?.name === ALARM_NAME) {
        runFromListener(() => refresh({ cooldownToleranceMs: ALARM_SKEW_TOLERANCE_MS }));
      }
    });
    api.runtime?.onStartup?.addListener(() => runFromListener(initialize));
    api.runtime?.onInstalled?.addListener(() => runFromListener(initialize));
  }

  return { initialize, refresh, register, loadState, render };
}

export const constants = {
  ALARM_NAME,
  STATE_KEY,
  MIN_ATTEMPT_INTERVAL_MS,
  MAX_BACKOFF_MS,
  MAX_QUOTE_AGE_MS,
  MAX_FUTURE_SKEW_MS,
  REQUEST_TIMEOUT_MS,
  ALARM_SKEW_TOLERANCE_MS,
};
