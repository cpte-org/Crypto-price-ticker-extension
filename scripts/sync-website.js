import { cp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './catalog.js';
const target = resolve(process.argv[2] ?? '../cpte-org.github.io');
if (target === fileURLToPath(root).replace(/\/$/, ''))
  throw new Error('Website destination must differ from source');
// Refuse an arbitrary directory; only sync the expected Pages repository.
const config = await readFile(join(target, '.git/config'), 'utf8');
if (!/github\.com[:/]cpte-org\/cpte-org\.github\.io(?:\.git)?/.test(config))
  throw new Error('Destination must be cpte-org/cpte-org.github.io');
await mkdir(target, { recursive: true });
// Explicit ticker-owned paths: never overwrite extOS or unrelated Pages content.
for (const name of [
  'index.html',
  'browser-linux.html',
  'kde-monitor.html',
  'cpte-logo.png',
  'contact.html',
  'donate.html',
  'install.html',
  'privacy.html',
  'styles.css',
  '.nojekyll',
  'LEGACY-LICENSE',
  'logos',
]) {
  await cp(new URL(`dist/site/${name}`, root), join(target, name), { recursive: true });
}
// The logos directory is generated; remove only obsolete PNGs from this owned output.
const currentLogos = new Set(await readdir(new URL('dist/site/logos/', root)));
for (const name of await readdir(join(target, 'logos'))) {
  if (name.endsWith('.png') && !currentLogos.has(name)) await rm(join(target, 'logos', name));
}
await writeFile(
  join(target, 'GENERATED.md'),
  '# Generated ticker website\n\nProduct pages, ticker data, styles and logos are built from [Crypto-price-ticker-extension](https://github.com/cpte-org/Crypto-price-ticker-extension). Edit the source there, run `npm ci && npm run check`, then `npm run sync:website`. extOS pages and their existing assets remain maintained here.\n',
);
console.log(`Updated generated ticker pages in ${target}; unrelated files preserved.`);
