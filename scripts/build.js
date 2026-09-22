import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { readCatalog, root } from './catalog.js';
import { buildSite } from './site.js';
const { version } = JSON.parse(await readFile(new URL('package.json', root)));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
const catalog = await readCatalog();
const dist = fileURLToPath(new URL('dist/', root));
await rm(dist, { recursive: true, force: true });
await mkdir(`${dist}/packages`, { recursive: true });
const checksums = [];
for (const coin of catalog.coins) {
  const icons = {};
  for (const size of [16, 32, 48, 64, 128])
    icons[`icon-${size}.png`] = new Uint8Array(
      await sharp(new URL(coin.logo.file, root).pathname)
        .resize(size, size, { fit: 'contain', background: '#00000000' })
        .png()
        .toBuffer(),
    );
  const runtime = await build({
    entryPoints: [fileURLToPath(new URL('extension/background.js', root))],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'firefox140',
    plugins: [
      {
        name: 'coin-config',
        setup(b) {
          b.onResolve({ filter: /^\.\/coin\.js$/ }, () => ({ path: 'coin', namespace: 'config' }));
          b.onLoad({ filter: /.*/, namespace: 'config' }, () => ({
            contents: `export default ${JSON.stringify({ id: coin.id, name: coin.name, symbol: coin.symbol, providerId: coin.providerId })}`,
          }));
        },
      },
    ],
  });
  for (const browser of ['chrome', 'firefox']) {
    const manifest = {
      manifest_version: 3,
      name: `Just ${coin.name} Ticker`,
      version,
      description: `${coin.name} (${coin.symbol}) price in USD, right in your toolbar.`,
      homepage_url: 'https://cpte-org.github.io/',
      permissions: ['storage', 'alarms'],
      host_permissions: ['https://api.coingecko.com/*'],
      icons: Object.fromEntries([16, 32, 48, 64, 128].map((n) => [n, `icon-${n}.png`])),
      action: {
        default_icon: { 16: 'icon-16.png', 32: 'icon-32.png' },
        default_title: `${coin.name} — fetching USD price`,
      },
      background:
        browser === 'chrome' ? { service_worker: 'background.js' } : { scripts: ['background.js'] },
    };
    if (browser === 'chrome') manifest.minimum_chrome_version = '120';
    else
      manifest.browser_specific_settings = {
        gecko: {
          id: coin.firefoxId,
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
      };
    const files = {
      ...icons,
      'background.js': runtime.outputFiles[0].contents,
      'manifest.json': new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n'),
    };
    const dir = `${dist}/extensions/${coin.id}/${browser}`;
    await mkdir(dir, { recursive: true });
    for (const [name, data] of Object.entries(files)) await writeFile(`${dir}/${name}`, data);
    const zip = zipSync(
      Object.fromEntries(
        Object.entries(files)
          .sort()
          .map(([name, data]) => [name, [data, { mtime: new Date(2020, 0, 1, 0, 0, 0) }]]),
      ),
      { level: 9 },
    );
    const name = `${coin.id}-${browser}.zip`;
    await writeFile(`${dist}/packages/${name}`, zip);
    checksums.push(`${createHash('sha256').update(zip).digest('hex')}  ${name}`);
  }
}
await writeFile(`${dist}/packages/SHA256SUMS`, checksums.sort().join('\n') + '\n');
await cp(new URL('catalog/coins.json', root), `${dist}/packages/coins.json`);
await buildSite(catalog, `${dist}/site`);
console.log(
  `Built ${catalog.coins.length * 2} extension ZIPs and the static website (v${version}).`,
);
