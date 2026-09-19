# TID Helper

The offline Pokémon Trainer ID / Secret ID / encounter-manipulation helper from
[hackmons.com](https://hackmons.com), extracted so anyone can read exactly what it does and check it.

This is the **whole** helper: the engines, every derived data file, the page, the build and the tests.
Nothing is withheld — if the tool tells you to press a button at a particular frame, the reason is in here.

## Why this exists

People in the Pokémon speedrunning community tried this tool, found it wrong, and said so. They were
right. Publishing the source is the honest response: a tool that tells you to spend an hour resetting a
cartridge should let you check its reasoning first.

## Read this before trusting anything here

Every table in this repository is **emulator-derived**.

- **Nothing has been confirmed on real hardware.**
- **No human has executed the scripts this prints** and reported what they got.
- Each data file carries a `not_derived` block naming exactly what has *not* been established, and the
  page renders it rather than hiding it. Read those first.

Where a published community manipulation exists, the helper prefers it over anything of ours and cites it.

## What is here

```
src/lib/shiny/          the engines (UMD: same files run in node and the browser)
  rng.js                the LCRNGs and shared helpers
  gen1tid.js            Gen 1 Trainer ID
  gen2tid.js            Gen 2 Trainer ID (the timed-tap methodology)
  generators.js         Gen 3 / Gen 4 encounter generators (Method H, Method 1/2/4, Method J/K)
  gen4.js seedtime4.js  Gen 4 support; required by generators.js under node, not shipped in the page
  buffer-decode.js      decoder for the compact Gen 1 buffered-route data
  tid-sources.js        the published-manipulation citation lookup
  data/                 every derived table, each with its own provenance and not_derived block
mobile/src/offline/tid-helper/   the page: one HTML file and a set of plain-JS modules
mobile/scripts/         the two generators that build the page into one self-contained HTML string
mobile/tests/           the test suite
```

## Build and test

```
npm install --prefix mobile     # only devDependency is typescript, used by one test
npm run build                   # produces the data modules and the single-file page
npm test                        # the full suite
```

The two build outputs are **not committed**: they are deterministic re-encodings of what is already here
(`tidHelperDataJson.ts` is the `data/*.json` files, `tidHelperHtml.ts` is the whole page inlined into one
string), so committing them would double the repository for no new information. Build them and diff against
what the site serves if you want to confirm they match.

The build produces one self-contained HTML string with no network access of any kind: no fetch, no external
stylesheet, no CDN. That is asserted by the tests, not just intended.

## What is NOT here

The mobile app shell and the hackmons.com website are separate and closed. They embed this page — the app
in a WebView, the site in an iframe — but neither adds to nor changes what is in this repository. Tests
covering that integration live with the app, because they test the app rather than the helper.

## Licence

**GPL-3.0-or-later** — see `LICENSE`.

## Credit

The methodologies are the speedrunning communities', not ours. See `CREDITS.md` for the full list: pret for
the disassemblies, PokeFinder and PKHeX for the conventions and the reversal, gambatte-core and mGBA for
the cores everything was measured on, EonTimer and FlowTimer for the timers the in-app cues stand in for,
and the 104 researchers credited per-manipulation in `src/lib/shiny/data/tid-sources.json`.

None of them endorse this tool, have reviewed it, or are responsible for what it gets wrong.

## Corrections welcome

If something here is wrong, please say so. Every fix in the recent history came from someone doing exactly
that.
