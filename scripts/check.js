import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { readCatalog, root } from './catalog.js';
import { verifyPackage } from './packages.js';
const catalog = await readCatalog();
const { version } = JSON.parse(await readFile(new URL('package.json', root)));
for (const coin of catalog.coins) {
  const logo = await readFile(new URL(coin.logo.file, root));
  if (createHash('sha256').update(logo).digest('hex') !== coin.logo.sha256)
    throw new Error(`Logo checksum mismatch: ${coin.id}`);
  for (const browser of ['chrome', 'firefox']) {
    const { files } = await verifyPackage(
      new URL('dist/packages', root).pathname,
      coin,
      browser,
      version,
    );
    for (const n of [16, 32, 48, 64, 128]) {
      const m = await sharp(files[`icon-${n}.png`]).metadata();
      if (m.width !== n || m.height !== n) throw new Error('Wrong icon dimensions');
    }
  }
}
for (const name of [
  'index',
  'browser-linux',
  'kde-monitor',
  'install',
  'privacy',
  'contact',
  'donate',
]) {
  const html = await readFile(new URL(`dist/site/${name}.html`, root), 'utf8');
  for (const [, link] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    if (/^(https?:|mailto:)/.test(link)) continue;
    await stat(new URL(`dist/site/${link.split('#')[0]}`, root));
  }
  for (const [tag] of html.matchAll(/<a\b[^>]*href="https?:\/\/[^"]+"[^>]*>/g)) {
    if (!tag.includes('target="_blank"') || !tag.includes('rel="noopener noreferrer"'))
      throw new Error('External link must open safely in a new tab');
  }
  if (/googletagmanager|gitlab.com\/nfl0\/crypto-logos/.test(html))
    throw new Error('Legacy remote dependency');
}
console.log('Validated every package, icon, checksum, and generated page link.');
