import { readFile } from 'node:fs/promises';
export const CHROME_TARGETS = Object.freeze([
  'bitcoin',
  'ethereum',
  'zcash',
  'solana',
  'polygon',
  'polkadot',
  'dogecoin',
  'avalanche',
  'cardano',
  'near',
]);
export const CHROME_IDS = Object.freeze({
  bitcoin: 'edocckdppcejnpljkgohkdgniefflgfo',
  ethereum: 'dgafljegcabiiplpjmfcepmndcabcgpm',
  zcash: 'glopllgnheolomicjjhiceipcdonpoae',
  solana: 'ijkgnghfcjkghhdkbgfjibooiflohcif',
  polygon: 'ofgicionacifegbldflkoaamkibgonfd',
  polkadot: 'cmohhbkheacpenaieifolaffbldifdcb',
  dogecoin: 'ganhfpkgiadcdpkechelfbmjhnonagel',
  avalanche: 'amjbppcggjdnpgbfhjmicmaneifodlld',
  cardano: 'acfodajggdfhmkgalgjijpbnpgnhpdeo',
  near: 'inpjbnddnhkoagnddjniomhnfandjkfa',
});
export const root = new URL('../', import.meta.url);
const excludedProviderIds = new Set([
  'figure-heloc',
  'whitebit',
  'rain',
  'leo-token',
  'canton-network',
  'monero',
  'usd-coin',
]);
const stablecoinIds = new Set(
  JSON.parse(await readFile(new URL('catalog/stablecoins.json', root), 'utf8')).providerIds,
);
export function validateCatalog(catalog) {
  if (!Array.isArray(catalog.coins) || !catalog.coins.length) throw new Error('Empty catalog');
  const ids = new Set(),
    storeIds = new Set(),
    providers = new Set();
  for (const coin of catalog.coins) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(coin.id) || ids.has(coin.id))
      throw new Error(`Invalid/duplicate coin: ${coin.id}`);
    ids.add(coin.id);
    if (!/^[a-z0-9-]+$/.test(coin.providerId) || providers.has(coin.providerId))
      throw new Error('Invalid/duplicate price provider ID');
    if (excludedProviderIds.has(coin.providerId) || stablecoinIds.has(coin.providerId))
      throw new Error(`Excluded asset: ${coin.providerId}`);
    providers.add(coin.providerId);
    if (
      coin.opera &&
      coin.opera.url !==
        `https://addons.opera.com/en/extensions/details/just-${coin.id}-ticker-pro/`
    )
      throw new Error('Unexpected Opera listing URL');
    if (!coin.name || !coin.symbol || coin.logo.file !== `assets/logos/${coin.id}.png`)
      throw new Error(`Incomplete coin: ${coin.id}`);
    if (coin.chrome.target !== CHROME_TARGETS.includes(coin.id))
      throw new Error('Chrome target allowlist mismatch');
    if (coin.chrome.target && coin.chrome.id !== CHROME_IDS[coin.id])
      throw new Error('Chrome ID differs from pinned coin identity');
    if (!['published', 'pending_review', 'unverified', 'unpublished'].includes(coin.chrome.status))
      throw new Error('Invalid store status');
    if (coin.chrome.id !== null) {
      if (!/^[a-p]{32}$/.test(coin.chrome.id) || storeIds.has(coin.chrome.id))
        throw new Error('Invalid/duplicate Chrome ID');
      storeIds.add(coin.chrome.id);
    }
    if (
      coin.chrome.status === 'published' &&
      (!coin.chrome.target || !coin.chrome.id || !coin.chrome.verifiedAt)
    )
      throw new Error('Published listing needs verification');
    if (coin.chrome.status === 'pending_review' && (!coin.chrome.target || !coin.chrome.id))
      throw new Error('Pending review requires an existing Chrome listing');
    if (!/^[a-z0-9-]+@cpte\.org$/.test(coin.firefoxId)) throw new Error('Invalid Firefox ID');
  }
  if (catalog.coins.filter((c) => c.chrome.target).length !== 10)
    throw new Error('Exactly ten Chrome targets required');
  return catalog;
}
export async function readCatalog() {
  return validateCatalog(JSON.parse(await readFile(new URL('catalog/coins.json', root), 'utf8')));
}
