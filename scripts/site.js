import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { root } from './catalog.js';
export const REPO = 'https://github.com/cpte-org/Crypto-price-ticker-extension';
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const products = JSON.parse(await readFile(new URL('catalog/products.json', root), 'utf8'));
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const header = `<header><a class="brand" href="index.html" aria-label="CPTE home"><img src="cpte-logo.png" width="32" height="38" alt="">CPTE</a><nav aria-label="Main"><a href="${REPO}">Source</a><a href="donate.html">Support</a></nav></header>`;
const footer = `<footer><span>CPTE</span><nav aria-label="Footer"><a href="${REPO}/releases">Releases</a><a href="privacy.html">Privacy</a><a href="contact.html">Contact</a><a href="https://www.coingecko.com/en/api">CoinGecko</a></nav></footer>`;
function productNav(active) {
  return `<nav class="product-tabs" aria-label="Products">${products.map((product) => `<a href="${product.path}"${product.id === active ? ' aria-current="page"' : ''}><span>${escape(product.name)}</span><small>${escape(product.navDetail)}</small></a>`).join('')}</nav>`;
}
export function page(title, content, active = null) {
  const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · CPTE</title><meta name="description" content="CPTE tools: browser coin tickers, extOS browser Linux, and a KDE Plasma price monitor."><link rel="icon" href="cpte-logo.png" type="image/png"><link rel="stylesheet" href="styles.css"></head><body>${header}<main>${productNav(active)}${content}</main>${footer}</body></html>\n`;
  return html.replace(
    /<a\b([^>]*\bhref="https?:\/\/[^"]+"[^>]*)>/g,
    '<a$1 target="_blank" rel="noopener noreferrer">',
  );
}
function card(coin, chromeSection) {
  const download = `${REPO}/releases/latest`;
  let action;
  if (!chromeSection) {
    action = `<a class="download" href="${download}" aria-label="Find ${escape(coin.name)} downloads on GitHub">GitHub builds <span aria-hidden="true">↗</span></a>`;
  } else if (['published', 'pending_review'].includes(coin.chrome.status)) {
    action = `<a class="install" href="https://chromewebstore.google.com/detail/${coin.chrome.id}" aria-label="Install ${escape(coin.name)} from Chrome Web Store">Add to Chrome <span aria-hidden="true">↗</span></a>`;
  } else {
    action = '<span class="listing-status">Coming soon</span>';
  }
  return `<li class="coin"><div class="identity"><img src="logos/${coin.id}.png" width="40" height="40" alt="" loading="lazy"><div><h3>${escape(coin.name)}</h3><span class="symbol">${escape(coin.symbol)}</span></div></div>${action}</li>`;
}
export function renderIndex(catalog) {
  const chromeCoins = catalog.coins.filter((c) => c.chrome.target);
  const other = catalog.coins.filter((c) => !c.chrome.target);
  const opera = catalog.coins.filter((c) => c.opera);
  return page(
    'Just Price Ticker',
    `<div class="page-heading"><h1>Just Price Ticker</h1><span class="version">v${version.split('.')[0]}</span></div>
<section id="chrome" aria-labelledby="chrome-title"><div class="section-title"><h2 id="chrome-title">Chrome Web Store</h2><span class="count">${chromeCoins.length} tickers</span></div><ul class="coins">${chromeCoins.map((c) => card(c, true)).join('')}</ul>${chromeCoins.length ? '' : '<p>Listings coming soon.</p>'}</section>
<section aria-labelledby="more-title"><div class="section-title"><h2 id="more-title">GitHub downloads</h2><a class="section-help" href="install.html">Installation guide</a></div><ul class="coins secondary">${other.map((c) => card(c, false)).join('')}</ul></section>
${opera.length ? `<section class="opera" aria-labelledby="opera-title"><div class="section-title"><h2 id="opera-title">Also on Opera</h2></div><div class="opera-links">${opera.map((c) => `<a href="${escape(c.opera.url)}">${escape(c.name)} <span aria-hidden="true">↗</span></a>`).join('')}</div></section>` : ''}`,
    'ticker',
  );
}
export function renderProduct(product) {
  return page(
    product.name,
    `<article class="product-detail"><p class="platform">${escape(product.platform)}</p><h1>${escape(product.listingName ?? product.name)}</h1><p class="product-description">${escape(product.description)}</p><ul class="features">${product.features.map((feature) => `<li>${escape(feature)}</li>`).join('')}</ul><div class="product-actions"><a class="primary-button" href="${escape(product.storeUrl)}">${escape(product.storeLabel)} <span aria-hidden="true">↗</span></a>${product.sourceUrl ? `<a href="${escape(product.sourceUrl)}">Source <span aria-hidden="true">↗</span></a>` : ''}${product.privacyUrl ? `<a href="${escape(product.privacyUrl)}">Privacy <span aria-hidden="true">↗</span></a>` : ''}</div>${product.note ? `<p class="product-note">${escape(product.note)}</p>` : ''}</article>`,
    product.id,
  );
}
export async function buildSite(catalog, directory) {
  await mkdir(directory, { recursive: true });
  await cp(new URL('site/', root), directory, { recursive: true });
  await cp(new URL('assets/brand/cpte-logo.png', root), `${directory}/cpte-logo.png`);
  await mkdir(`${directory}/logos`, { recursive: true });
  for (const coin of catalog.coins)
    await cp(new URL(coin.logo.file, root), `${directory}/logos/${coin.id}.png`);
  const pages = {
    'index.html': renderIndex(catalog),
    ...Object.fromEntries(
      products.filter((p) => p.id !== 'ticker').map((p) => [p.path, renderProduct(p)]),
    ),
    'install.html': page(
      'Install a GitHub build',
      `<article><p class="eyebrow">GITHUB DOWNLOADS</p><h1>Install your ticker.</h1><h2>Chrome / Chromium</h2><ol><li>Open the <a href="${REPO}/releases/latest">latest GitHub release</a> and download <code>coin-chrome.zip</code> for your coin.</li><li>Extract the ZIP into a folder you will keep.</li><li>Open <code>chrome://extensions</code>, enable Developer mode, choose “Load unpacked”, and select that folder.</li><li>Pin the ticker using your browser’s Extensions menu.</li></ol><p>GitHub builds need manual updates. Download the new build, replace the folder contents, then press Reload on the extensions page. Chrome Web Store installations update through Chrome.</p><h2>Firefox</h2><p>Our GitHub releases contain <strong>unsigned development builds</strong> named <code>coin-firefox.zip</code>. In Firefox, open <code>about:debugging#/runtime/this-firefox</code>, choose “Load Temporary Add-on”, and select the extracted <code>manifest.json</code>. The add-on is removed when Firefox closes.</p><p>Permanent installation in standard Firefox requires Mozilla signing. We no longer publish to the Firefox Add-ons store. These new builds do not automatically update older signed versions; disable the old ticker before testing one.</p><h2>Reading the badge</h2><p>The badge abbreviates large prices with k, m, b or t. Very small prices may appear as <code>&lt;.01</code>. Hover to read the full USD price. A question mark means a current price could not be confirmed; the tooltip includes the last known quote when available.</p></article>`,
    ),
    'privacy.html': page(
      'Privacy',
      `<article><h1>Just Price Ticker privacy</h1><p>The ticker requests its coin’s USD price from CoinGecko. CoinGecko receives the request, including your IP address and the requested coin, under <a href="https://www.coingecko.com/en/privacy">its privacy policy</a>.</p><p>The extension stores its last quote and retry timing locally in your browser. It does not read websites, browsing history, wallets or accounts. It has no analytics, advertising or account system.</p><p>This website does not use analytics or cookies. It is hosted by GitHub Pages; GitHub handles ordinary web requests under <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">its privacy statement</a>. Coin logos are served with the website.</p><p>Questions? <a href="contact.html">Contact us</a>.</p></article>`,
    ),
    'contact.html': page(
      'Contact',
      `<article><h1>Get in touch.</h1><p>Found a price or installation problem? <a href="${REPO}/issues">Open an issue on GitHub</a> with your coin, browser version and what happened.</p><p>For other questions: <a href="https://github.com/nfl0">contact the maintainer on GitHub</a>.</p></article>`,
    ),
    'donate.html': page(
      'Support',
      `<article><h1>Support a small tool.</h1><p>Just Price Ticker is free and open source. Voluntary donations support its continued development.</p><h2>Bitcoin</h2><p class="address">1DtTKJJosqgF4NzJHBqwMXGWoYwtpBoxpx</p><h2>Zcash</h2><p class="address">t1MRiPwepQYrTJReH2iVu8aHWXXcBXHnZAw</p></article>`,
    ),
  };
  for (const [name, html] of Object.entries(pages)) await writeFile(`${directory}/${name}`, html);
  await writeFile(`${directory}/.nojekyll`, '');
}
