import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { verifyPackage } from '../scripts/packages.js';
const coin = { id: 'bitcoin', name: 'Bitcoin', firefoxId: 'bitcoin@cpte.org' };
async function fixture(t, mutate = () => {}) {
  const directory = await mkdtemp(join(tmpdir(), 'cpte-package-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = {
    manifest_version: 3,
    name: 'Just Bitcoin Ticker',
    version: '4.0.0',
    permissions: ['storage', 'alarms'],
    host_permissions: ['https://api.coingecko.com/*'],
    background: { service_worker: 'background.js' },
  };
  const files = Object.fromEntries(
    [16, 32, 48, 64, 128].map((n) => [`icon-${n}.png`, new Uint8Array([1])]),
  );
  files['background.js'] = strToU8('/* fixture */');
  mutate(manifest, files);
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  const zip = zipSync(files);
  await writeFile(join(directory, 'bitcoin-chrome.zip'), zip);
  await writeFile(
    join(directory, 'SHA256SUMS'),
    `${createHash('sha256').update(zip).digest('hex')}  bitcoin-chrome.zip\n`,
  );
  return directory;
}
test('valid package passes preflight', async (t) => {
  const dir = await fixture(t);
  assert.equal((await verifyPackage(dir, coin, 'chrome', '4.0.0')).manifest.version, '4.0.0');
});
test('modified archive fails before upload', async (t) => {
  const dir = await fixture(t);
  await writeFile(join(dir, 'bitcoin-chrome.zip'), 'tampered');
  await assert.rejects(verifyPackage(dir, coin, 'chrome', '4.0.0'), /Checksum/);
});
test('valid checksum cannot disguise wrong coin, version, permissions or extra files', async (t) => {
  for (const mutate of [
    (m) => (m.name = 'Just Ethereum Ticker'),
    (m) => (m.version = '3.0.0'),
    (m) => m.permissions.push('tabs'),
    (_m, f) => (f['credentials.txt'] = strToU8('not allowed')),
  ]) {
    const dir = await fixture(t, mutate);
    await assert.rejects(verifyPackage(dir, coin, 'chrome', '4.0.0'));
  }
});
