import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readCatalog, validateCatalog, CHROME_TARGETS } from '../scripts/catalog.js';
import { selectTargets, validatePublishResponse } from '../scripts/publish-chrome.js';
import { renderIndex, renderProduct, products } from '../scripts/site.js';
const catalog = await readCatalog();
test('catalog contains the curated non-stable selection and exactly ten Chrome targets', async () => {
  const snapshot = JSON.parse(
    await readFile(new URL('../catalog/market-snapshot.json', import.meta.url)),
  );
  assert.equal(snapshot.length, 32);
  for (const c of snapshot) assert.ok(catalog.coins.some((coin) => coin.providerId === c.id));
  assert.equal(catalog.coins.filter((c) => c.chrome.target).length, 10);
  assert.deepEqual(
    catalog.coins.filter((c) => c.chrome.target).map((c) => c.id),
    CHROME_TARGETS,
  );
  assert.equal(catalog.coins.find((c) => c.id === 'polygon').providerId, 'polygon-ecosystem-token');
  assert.equal(catalog.coins.find((c) => c.id === 'polkadot').symbol, 'DOT');
});
test('publisher fails closed for additional, unknown, duplicate and unconfigured targets', () => {
  for (const names of [['litecoin'], ['extos'], ['bitcoin', 'bitcoin'], ['near'], []])
    assert.throws(() => selectTargets(catalog, names));
  assert.equal(
    selectTargets(catalog, ['ethereum'])[0].chrome.id,
    'dgafljegcabiiplpjmfcepmndcabcgpm',
  );
  const copy = structuredClone(catalog);
  copy.coins.find((c) => c.id === 'litecoin').chrome.target = true;
  assert.throws(() => validateCatalog(copy));
});
test('reject duplicate provider or store identities and unsafe asset paths', () => {
  for (const mutate of [
    (c) => (c.coins[1].providerId = c.coins[0].providerId),
    (c) => (c.coins[1].chrome.id = c.coins[0].chrome.id),
    (c) => (c.coins[0].logo.file = '../secret'),
    (c) => (c.coins[0].id = '../secret'),
  ]) {
    const copy = structuredClone(catalog);
    mutate(copy);
    assert.throws(() => validateCatalog(copy));
  }
});
test('website groups all ten Chrome targets with store buttons including pending listings', () => {
  const html = renderIndex(catalog);
  const sections = html.split('id="more-title"');
  assert.ok(sections[0].includes('dgafljegcabiiplpjmfcepmndcabcgpm'));
  assert.ok(sections[0].includes('edocckdppcejnpljkgohkdgniefflgfo'));
  assert.ok(sections[0].includes('logos/near.png'));
  assert.ok(!sections[1].includes('logos/near.png'));
  assert.equal((sections[0].match(/class="coin"/g) || []).length, 10);
  assert.equal((sections[0].match(/class="install"/g) || []).length, 10);
  assert.ok(sections[0].includes('inpjbnddnhkoagnddjniomhnfandjkfa'));
  assert.doesNotMatch(sections[0], /In review|Coming soon/);
  assert.doesNotMatch(html, /detail\/null/);
  assert.ok(!/<script/.test(html));
  assert.equal((html.match(/class="coin"/g) || []).length, catalog.coins.length);
});

test('swapped store IDs and unverified uploads fail closed', () => {
  const copy = structuredClone(catalog);
  [copy.coins[0].chrome.id, copy.coins[1].chrome.id] = [
    copy.coins[1].chrome.id,
    copy.coins[0].chrome.id,
  ];
  assert.throws(() => validateCatalog(copy));
  assert.throws(() => selectTargets(catalog, ['bitcoin']));
  assert.equal(selectTargets(catalog, ['bitcoin'], true)[0].id, 'bitcoin');
});
test('publication responses require expected identity, state, and no warnings', () => {
  assert.doesNotThrow(() =>
    validatePublishResponse({ itemId: 'expected', state: 'PENDING_REVIEW' }, 'expected'),
  );
  for (const r of [
    { itemId: 'other', state: 'PUBLISHED' },
    { itemId: 'expected', state: 'ITEM_STATE_UNSPECIFIED' },
    {
      itemId: 'expected',
      state: 'PENDING_REVIEW',
      warningInfo: { warnings: [{ reason: 'test' }] },
    },
  ])
    assert.throws(() => validatePublishResponse(r, 'expected'));
});

test('stablecoins and explicitly excluded assets cannot enter the catalog', () => {
  for (const providerId of [
    'tether',
    'usd-coin',
    'dai',
    'usds',
    'ethena-usde',
    'figure-heloc',
    'whitebit',
    'rain',
    'leo-token',
    'canton-network',
    'monero',
  ]) {
    const copy = structuredClone(catalog);
    copy.coins.find((c) => !c.chrome.target).providerId = providerId;
    assert.throws(() => validateCatalog(copy), /Excluded asset/);
  }
});
test('all external actions open safely in a new tab; product tabs remain local', () => {
  for (const html of [
    renderIndex(catalog),
    ...products.filter((p) => p.id !== 'ticker').map(renderProduct),
  ]) {
    for (const [tag] of html.matchAll(/<a\b[^>]*href="https?:\/\/[^"]+"[^>]*>/g)) {
      assert.match(tag, /target="_blank"/);
      assert.match(tag, /rel="noopener noreferrer"/);
    }
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    for (const product of products) assert.ok(html.includes(`href="${product.path}"`));
    assert.ok(html.includes('src="cpte-logo.png"'));
  }
});
test('concise ticker page includes four Opera listings and v4 branding', () => {
  const html = renderIndex(catalog);
  assert.doesNotMatch(html, /A quiet little ticker|Find your coin|No charts, no trends|ONE COIN/);
  assert.match(html, />v4</);
  assert.equal(
    (html.match(/https:\/\/addons.opera.com\/en\/extensions\/details\//g) || []).length,
    4,
  );
  assert.ok(
    renderProduct(products.find((p) => p.id === 'kde')).includes('https://store.kde.org/p/2127626'),
  );
  assert.ok(
    renderProduct(products.find((p) => p.id === 'extos')).includes(
      'bodnnlfejnhfpmldjcbiencknfghdgfk',
    ),
  );
});
