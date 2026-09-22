# Price-only rebuild — 2026-09-22

Implementation and local validation are complete. Repository delivery is authorized by the owner. GitHub release creation and automated Chrome Web Store uploads remain separate operations; the owner submitted NEAR manually.

## Delivered

- Replaced Python builders, source string replacement and remote-logo cloning with one shared JavaScript runtime, a validated coin catalog and a locked Node build.
- Removed trend colors, flashing and display-mode toggling. The badge uses a fixed #0d66d5 blue background with white text and shows an abbreviated USD price; the tooltip carries the full provider value and timestamp. Click requests a refresh within the existing cooldown.
- Added fresh/stale quote validation, 12-second request/body timeout, single-flight requests, persistent bounded backoff, strict Retry-After deadlines and restart recovery. Unavailable data shows `?`; stale values remain explicitly labeled in the tooltip.
- Downloaded 32 current logo assets and recorded their local paths, source URLs, retrieval date and checksums to the source tree. Ordinary builds fetch no images or coin metadata.
- Curated 32 popular coins using the 2026-09-22 market snapshot, retaining the ten Chrome targets. Stablecoins and Figure Heloc, WhiteBIT Coin, Rain, LEO Token, Canton and Monero are excluded.
- Generated 64 browser ZIPs in `dist/packages`, unpacked test builds in `dist/extensions`, and SHA-256 checksums. Version is 4.0.0.
- Added Chrome upload/submission tooling using `chrome-webstore-upload` 6.0.0, with exactly ten permitted coin targets, independently pinned existing IDs, complete preflight, dry-run default, release/catalog matching, and response validation.
- Added CI, tagged GitHub releases, manual Chrome publishing and website-artifact workflows. GitHub Actions references are pinned to commits.
- Rebuilt the static website from the shared catalog, with all ten intended Chrome listings first and GitHub-only tickers below. Bitcoin and NEAR use normal Add to Chrome buttons at the owner’s request; their pending-review status remains recorded in the catalog. Product tabs navigate between Just Price Ticker, extOS and Multi-Coin Monitor. Four verified Opera listings appear at the bottom. External links open in new tabs. The site uses the original CPTE logo, trimmed copy and v4 branding, with no client-side JavaScript.
- Synced generated pages into the local Pages repository. Existing extOS files and the user's pre-existing README edit remain unchanged. The sync updates ticker files only; extOS stays maintained in the Pages repository.
- Removed obsolete tracked ZIPs, XPIs, old builders, donor files and stale screenshots from the extension repository. Git history retains the originals; new binaries belong in releases.

## Validation

- `npm run check`: formatting, automated tests, build and all generated artifact checks passed.
- 35 individual Node test cases passed (including nested failure cases). Node 26's isolated reporter groups them as three passing test files; the non-isolated run displayed all 35.
- All 64 archives passed filename/content, manifest, version, permission, icon-dimension and checksum validation.
- Rebuilding under UTC and Pacific/Honolulu produced identical ZIP checksums on the same installed toolchain. This is not a claim of bit-identical output across different native image-processing versions/platforms.
- The initial 32 price-provider IDs passed the live API check before the selection revision. Replacement IDs and logos were verified against current market metadata; the price-only runtime is unchanged.
- An isolated Brave 151 / Chromium browser loaded the built Bitcoin extension and fetched a live quote. The smoke test injected HTTP 429 and offline errors, verified explicit unavailable/stale display, recovered the price/tooltip, and preserved the retry deadline across a full browser restart.
- Chrome publishing preflight passed for the eight verified targets in dry-run mode. No authenticated store call was made.
- Local website page/asset links and both repository diffs passed checks. Website visual/browser QA was not performed.

## Remaining external work / limits

- Chrome credentials are not set in this session. Configure `CWS_PUBLISHER_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN` for publishing. Repository-side secrets were not inspected.
- Eight public Chrome listings were verified at version 3.0.0: Ethereum, Zcash, Solana, Polygon, Polkadot, Dogecoin, Avalanche and Cardano.
- The owner confirmed Bitcoin's existing listing (`edocckdppcejnpljkgohkdgniefflgfo`) is pending Chrome review; the previous public-page check did not establish its dashboard state.
- The owner submitted NEAR v4.0.0 manually under `inpjbnddnhkoagnddjniomhnfandjkfa`; it is pending review. Automation setup is deferred.
- Firefox ZIPs are explicitly unsigned development builds, for temporary installation. No Mozilla signing or store publication is included. New development IDs do not update historical signed installations. Firefox execution was not tested in a Firefox browser.
- Real browser verification used Brave/Chromium, not branded Chrome; branded Chrome may restrict command-line extension loading.
- No public API can guarantee uninterrupted prices. The implementation exposes failures and retries automatically; alarms can be delayed by browser sleep, and multiple installed tickers share the provider's IP rate limits.

See `docs/RELEASING.md` for the exact release, store and website operations. `npm run preview` starts the local site at http://127.0.0.1:4173.
