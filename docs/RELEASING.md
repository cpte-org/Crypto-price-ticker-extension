# Release and store operations

## Verify and release

1. Update `package.json` and the lockfile version, then update release notes.
2. Run `npm ci && npm run check`.
3. Load a generated Chrome package in Chrome and a temporary Firefox package in Firefox. Check startup, hover, sleep/wake and offline recovery. Unit tests simulate failures but do not prove browser lifecycle behavior.
4. Commit the tested source, tag it `v<package version>`, and push the tag. The GitHub release workflow rebuilds, validates, and attaches all 64 browser ZIPs plus `SHA256SUMS` and the catalog. Source archives are supplied by GitHub.

Old ZIPs and XPIs remain in Git history. New artifacts live in GitHub Releases rather than duplicating generated binaries in source.

## Manual NEAR submission (current workflow)

Run `npm run check`, then upload `dist/packages/near-chrome.zip` manually in the Chrome Web Store developer dashboard. It is the v4.0.0 Manifest V3 package, with NEAR configuration and bundled local icons. Leave the ZIP intact for upload. Complete the listing details in the dashboard.

Bitcoin already has a listing and is pending review, as confirmed by the owner. NEAR has also been submitted for review under `inpjbnddnhkoagnddjniomhnfandjkfa`. Both listings use normal Add to Chrome buttons on the website so approval requires no website update.

Automated publishing setup is deferred. The existing automation below is optional future tooling, not required for this manual submission.

## Chrome Web Store automation (later)

`chrome-webstore-upload` v6 uses the Web Store v2 API. Set repository/environment secrets `CWS_PUBLISHER_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN`. Follow [the upstream authentication guide](https://github.com/fregante/chrome-webstore-upload/blob/main/How%20to%20generate%20Google%20API%20keys.md). Never put these in source or a browser package.

Configure the GitHub environment `chrome-web-store` with the desired release reviewers. The manually triggered Chrome workflow downloads **the existing GitHub release matching the checked-out package version**, verifies checksums, package identity and permissions for all selected coins, then uploads sequentially. Established store IDs are independently pinned to prevent accidental coin swaps. It defaults to uploading drafts; the publication input additionally submits them for review. The workflow rejects any ref other than the matching release tag, and rejects a released catalog that differs from that checkout.

The ten-target allowlist is enforced independently of catalog flags. Existing Chrome IDs are preserved. Unknown/non-target coins, duplicate IDs, missing IDs, wrong package identities and checksum failures abort preflight before any upload. An API rejection stops subsequent targets; an earlier successful upload is not rolled back. Inspect status before retrying a partial run.

Local dry run (no credentials required):

```sh
npm run publish:chrome -- --coins=ethereum,zcash,solana,polygon,polkadot,dogecoin,avalanche,cardano
```

Routine uploads require a verified listing. For an inspected initial or reinstatement upload, explicitly add `--allow-unverified` (or enable the workflow input).

Add `--execute` to upload drafts. Add both `--execute --publish` to upload and submit. The default selection includes all ten and requires `--allow-unverified` while Bitcoin and NEAR remain pending review. `--packages=/absolute/path` selects downloaded release artifacts.

Initial account work remains:

- Reconcile the developer dashboard with the ten desired listings and the account's 11-item capacity; do not create extra listings blindly.
- Preserve Bitcoin's existing ID `edocckdppcejnpljkgohkdgniefflgfo`. The owner confirmed its listing is pending review; no reinstatement or replacement listing is needed.
- NEAR's assigned ID `inpjbnddnhkoagnddjniomhnfandjkfa` is recorded in `catalog/coins.json` and the independent `CHROME_IDS` identity guard in `scripts/catalog.js`. The uploader updates existing items; it does not create the first listing or author store descriptions/screenshots.
- Preserve the unrelated extension. The scripts do not unpublish/delete any store item.
- Upload screenshots and listing copy as needed, and complete the store's privacy declarations using the actual runtime behavior.

An accepted upload or submission is not proof of public availability. After store approval, verify the public listing, then set `chrome.status` to `published`, record `verifiedAt` and `verifiedVersion`, rebuild and sync the website. Remove the published status if availability changes. No generated page promotes an unverified listing as installable.

## Website

Ticker source and data live here. `cpte-org/cpte-org.github.io` remains the Pages delivery repository and retains extOS content.

```sh
npm run check
npm run sync:website -- /path/to/cpte-org.github.io
```

The sync command accepts only a clone of that repository, copies generated files, and preserves unrelated files and its README. Review and commit the output there, then push using its established Pages publishing settings. The `Website artifact` workflow offers the same generated output as a downloadable CI artifact without requiring cross-repository credentials. No second coin list is maintained.

## Coin and logo refresh

The catalog is a reviewed snapshot, not a live ranking. Keep the ten fixed targets and a curated total of 32 popular cryptocurrencies. Exclude the stablecoin IDs in `catalog/stablecoins.json` and the owner-specified exclusions enforced by `scripts/catalog.js`. Refresh market ranks and the exclusion snapshot deliberately; preserve existing identities. Check provider IDs carefully when tokens migrate. Polygon now uses `polygon-ecosystem-token` (POL).

For each replacement logo, record the source URL/date and SHA-256 of the final PNG. Use a centered transparent 256×256 PNG; `npm run build` produces required icon sizes locally. Changing source data or images must pass `npm run check`. Logos and ordinary builds must not depend on the old external GitLab repository.
