import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import chromeWebstoreUpload from 'chrome-webstore-upload';
import { readCatalog, root, validateCatalog } from './catalog.js';
import { verifyPackage } from './packages.js';
export function selectTargets(catalog, names, allowUnverified = false) {
  validateCatalog(catalog);
  if (!names.length || new Set(names).size !== names.length)
    throw new Error('Select unique coin IDs');
  return names.map((id) => {
    const coin = catalog.coins.find((c) => c.id === id);
    if (!coin?.chrome.target) throw new Error(`Not in the ten-coin Chrome allowlist: ${id}`);
    if (!coin.chrome.id)
      throw new Error(
        `Missing Chrome Web Store ID: ${id}. Create its listing and record its ID first.`,
      );
    if (coin.chrome.status !== 'published' && !allowUnverified)
      throw new Error(
        `Unverified listing: ${id}; inspect the dashboard and use --allow-unverified explicitly for initial/reinstatement uploads`,
      );
    return coin;
  });
}
export function validatePublishResponse(result, itemId) {
  if (result.itemId !== itemId || !['PENDING_REVIEW', 'PUBLISHED'].includes(result.state))
    throw new Error('Unexpected publication identity or state');
  if (result.warningInfo?.warnings?.length)
    throw new Error(
      `Submission returned warnings; inspect the dashboard before retrying: ${JSON.stringify(result.warningInfo.warnings)}`,
    );
}
async function main() {
  const args = process.argv.slice(2);
  for (const arg of args)
    if (
      !['--execute', '--publish', '--allow-unverified'].includes(arg) &&
      !arg.startsWith('--coins=') &&
      !arg.startsWith('--packages=')
    )
      throw new Error(`Unknown argument: ${arg}`);
  const catalog = await readCatalog();
  const names = (
    args.find((a) => a.startsWith('--coins='))?.slice(8) ??
    catalog.coins
      .filter((c) => c.chrome.target)
      .map((c) => c.id)
      .join(',')
  ).split(',');
  const coins = selectTargets(catalog, names, args.includes('--allow-unverified'));
  const dir =
    args.find((a) => a.startsWith('--packages='))?.slice(11) ??
    new URL('dist/packages', root).pathname;
  const { version } = JSON.parse(await readFile(new URL('package.json', root)));
  const releasedCatalog = JSON.parse(await readFile(`${dir}/coins.json`));
  if (JSON.stringify(releasedCatalog) !== JSON.stringify(catalog))
    throw new Error('Release catalog differs from the checked-out source');
  // Complete preflight for every target before the first upload.
  for (const coin of coins) await verifyPackage(dir, coin, 'chrome', version);
  console.log(
    JSON.stringify(
      {
        version,
        mode: args.includes('--execute')
          ? args.includes('--publish')
            ? 'upload-and-submit'
            : 'upload-draft'
          : 'dry-run',
        targets: coins.map((c) => ({ coin: c.id, extensionId: c.chrome.id })),
      },
      null,
      2,
    ),
  );
  if (!args.includes('--execute')) return;
  const env = {
    publisherId: process.env.CWS_PUBLISHER_ID,
    clientId: process.env.CWS_CLIENT_ID,
    clientSecret: process.env.CWS_CLIENT_SECRET,
    refreshToken: process.env.CWS_REFRESH_TOKEN,
  };
  if (Object.values(env).some((v) => !v))
    throw new Error('Missing CWS credentials; see docs/RELEASING.md');
  for (const coin of coins) {
    const store = chromeWebstoreUpload({ ...env, extensionId: coin.chrome.id });
    const result = await store.uploadExisting(`${dir}/${coin.id}-chrome.zip`, undefined, 120);
    if (result.itemId !== coin.chrome.id || result.crxVersion !== version)
      throw new Error(`Unexpected uploaded identity/version for ${coin.id}`);
    if (result.uploadState !== 'SUCCEEDED')
      throw new Error(
        `Upload not confirmed for ${coin.id}: ${result.uploadState ?? 'unknown status'}`,
      );
    console.log(`${coin.id}: upload accepted`);
    if (args.includes('--publish')) {
      const result = await store.publish();
      validatePublishResponse(result, coin.chrome.id);
      console.log(`${coin.id}: ${result.state}`);
    }
    const status = await store.get();
    if (status.itemId !== coin.chrome.id)
      throw new Error(`Unexpected status identity for ${coin.id}`);
    console.log(`${coin.id}: status ${JSON.stringify(status)}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
