import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
export async function verifyPackage(directory, coin, browser, version) {
  const name = `${coin.id}-${browser}.zip`;
  const bytes = await readFile(`${directory}/${name}`);
  const sums = await readFile(`${directory}/SHA256SUMS`, 'utf8');
  const expected = sums.split('\n').filter((line) => line.endsWith(`  ${name}`));
  if (
    expected.length !== 1 ||
    expected[0].split('  ')[0] !== createHash('sha256').update(bytes).digest('hex')
  )
    throw new Error(`Checksum mismatch: ${name}`);
  const files = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  const names = Object.keys(files).sort();
  const required = [
    'background.js',
    'manifest.json',
    ...[16, 32, 48, 64, 128].map((n) => `icon-${n}.png`),
  ].sort();
  if (JSON.stringify(names) !== JSON.stringify(required))
    throw new Error(`Unexpected package contents: ${name}`);
  if (
    manifest.version !== version ||
    manifest.name !== `Just ${coin.name} Ticker` ||
    manifest.manifest_version !== 3
  )
    throw new Error(`Wrong identity/version: ${name}`);
  if (
    JSON.stringify(manifest.permissions) !== JSON.stringify(['storage', 'alarms']) ||
    JSON.stringify(manifest.host_permissions) !== JSON.stringify(['https://api.coingecko.com/*'])
  )
    throw new Error(`Unexpected permissions: ${name}`);
  if (browser === 'chrome' && manifest.background?.service_worker !== 'background.js')
    throw new Error('Missing Chrome worker');
  if (
    browser === 'firefox' &&
    (manifest.background?.scripts?.[0] !== 'background.js' ||
      manifest.browser_specific_settings?.gecko?.id !== coin.firefoxId)
  )
    throw new Error('Invalid Firefox manifest');
  return { bytes, manifest, files };
}
