# OMNIVERSE II — deterministic world laboratory

**The verified fifteen-world baseline is publicly deployed. PR #6 adds immersive Three.js traversal as an unmerged candidate; content-depth and physical-device acceptance remain incomplete.**

The nine original scientific plugins remain intact behind a versioned Atlas adapter. Six additional PDK worlds simulate wilderness ecology, subterranean hydrology, archaeological exposure, terraforming, machine infrastructure, and signal propagation. All use the existing fixed-step kernel, named RNG streams, checkpoints, command journal, branches, experiments, workers and portable archives.

## Current inventory

These are initialized authoritative collections, not viewport dimensions or metadata multipliers. See [current machine-readable measurements](docs/current-inventory.json); the [original intake inventory](docs/expansion-manifest.json) remains frozen.

| World | Baseline → current regions | POIs / facility roles / actor roles | Chains / signature |
|---|---:|---:|---:|
| `ecosystem` | 48 → 144 | 36 / 12 / 6 | 3 / 1 |
| `station` | 18 → 54 | 36 / 12 / 6 | 3 / 1 |
| `civilization` | 9 → 27 | 36 / 12 / 6 | 3 / 1 |
| `atmosphere` | 48 → 144 | 36 / 12 / 6 | 3 / 1 |
| `ocean` | 48 → 144 | 36 / 12 / 6 | 3 / 1 |
| `celestial` | 18 → 54 | 36 / 12 / 6 | 3 / 1 |
| `megacity` | 18 → 54 | 36 / 12 / 6 | 3 / 1 |
| `industrial` | 18 → 54 | 36 / 12 / 6 | 3 / 1 |
| `geology` | 48 → 144 | 36 / 12 / 6 | 3 / 1 |
| `wild-meridian` | 16 → 48 | 36 / 12 / 6 | 3 / 1 |
| `hollow-deep` | 16 → 48 | 36 / 12 / 6 | 3 / 1 |
| `timeworn-empire` | 12 → 36 | 36 / 12 / 6 | 3 / 1 |
| `terraforming-frontier` | 16 → 48 | 36 / 12 / 6 | 3 / 1 |
| `machine-wilderness` | 16 → 48 | 36 / 12 / 6 | 3 / 1 |
| `signal-expanse` | 12 → 36 | 36 / 12 / 6 | 3 / 1 |

Additional original-world totals: **54 station compartments / 11,430 m³; 27 settlements + 18 founding sites; 144 ocean sectors / 432 depth layers; 9 celestial systems / 54 bodies; 54 industrial nodes / 76 routes**. Civilizational and megacity territory metadata are 14,400 km² and 1,620 km² respectively; these are modeled area conventions, not measured real geography.

Across all worlds: **540 persistent sites, 45 three-step investigations, 15 signature destinations, 99 scenarios, 192 quick interventions, 204 metrics and 13 cross-world adapters**. Twelve resource-consuming facility functions share the exploration layer. Counts alone are not proof of twelve independent domain-specific mechanics or complete historical/narrative variety. Original scenario and intervention collections are retained, not tripled again against intake.

The six new signatures are **Silent Valley**, **Cathedral Below**, **City of Three Foundations**, **First Green**, **Unfinished City**, and **Last Transmission**. Each frontier has a functional one-third-scale scenario using the same scientific systems.

## Explore and experiment

1. Choose a world in the quick switcher or World Library.
2. Open **Living World Atlas**. Instrument coverage finds contacts within four open links; unknown names and history stay hidden.
3. Detect, survey and discover a destination. Travel commits a fuel-costed route and arrives on simulation ticks.
4. Investigate measured evidence; repair or operate local installations using actual resources. Investigations enforce predecessor evidence. The final site of each chain requires restoration evidence before resolution.
5. **Investigate next** offers branch-local hypotheses with observation timestamps and 48-tick expiry—not claims of proven causation.
6. Use History & branches, the Scientific Observatory, Experiment Lab and comparison workbenches for counterfactual experiments.
7. After visiting a site, expand its **Site Memory**: each entry is an actual recorded expedition action or simulation event, with available before/after field changes. This is not a fabricated explanation of pre-simulation history.
8. If a second same-seed run is loaded, use **Compare with loaded parallel run** to inspect that site's different integrity, hazards, evidence and stocks. Unsurveyed parallel-site details remain sealed. Different ticks and different interventions can both create differences; do not infer causation from the comparison alone.

Actors survey, collect, maintain, deliver carried supplies, construct and assess risks. They operate in simulation time even when off-camera. They do **not** execute while the simulation is paused or the browser is closed.

## Run and verify

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:dist
npx playwright install chromium
npm run test:browser
RECORD_CURRENT=1 npx vitest run src/test/currentInventory.test.ts
```

The Vite base is `/Multiverse_Simulator/`. Production preview binds to `0.0.0.0:4173`. Unit/integration tests cover deterministic replay, all native interventions, frontier intervention consequences, legacy continuation, archives, branch isolation, facility transactions and ordered investigation feasibility. Browser tests exercise all fifteen worlds on desktop/mobile plus WebGL-unavailable keyboard navigation. See [operational evidence](OPERATIONAL_STATE.md) and [measured performance](PERFORMANCE.md).

## Persistence and compatibility

Saves are local IndexedDB data or exported `.omniverse.zip` files—not cloud saves. Legacy original-world configurations without `atlasVersion` retain their original native extent. New runs opt into Atlas version 1 and expanded native collections. Raw legacy-plugin archives restored through the new adapters pass continuation/replay tests; independent historical-source fixtures now cover nine original worlds and fifteen pre-refuge Atlas runs. See `docs/refuge-uplift/REVIEW.md` for scope and provenance. Development-only intermediate Atlas save shapes are not promised compatible across revisions.

The engine/archive/IndexedDB versions remain 1.0.0/1/1. Original wrapped plugin versions are 3.0.0; frontier plugins are 1.0.0. Static generated history is labeled separately from timestamped observed evidence.

## Public release and in-progress Three.js exploration

The earlier nine-world Pages activation failures in runs 38129717092 and 38189010957 are historical. The repository's current `main` at `c070beb6ceffa649ae2370b9e42225b9e36eb001` has a successful Pages deployment and a separate public-site desktop/mobile Chromium smoke job: [main workflow 38192688920](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38192688920). Production URL: https://westkitty.github.io/Multiverse_Simulator/. All 16 public smoke tests passed. This does not prove physical-device FPS or other browsers.

**PR #6** ([feature branch](https://github.com/westkitty/Multiverse_Simulator/pull/6)) is a separate, unmerged Three.js exploration implementation. It gives each of the 15 worlds an enterable, full-width first-person scene with keyboard/touch input, data-derived environments, native route corridors, simulated actors and nearby site interactions. The real simulation remains authoritative for discovery, expedition travel, timing, resource costs, histories and saves. A 3D camera's location is presentation state, not a teleport or a second source of simulation truth.

To use the candidate after checking out PR #6 locally, run `npm ci`, `npm run dev`, then open **Explore in 3D** or **Enter this universe in 3D**. Use W/A/S/D or arrows, drag to look, E or **Inspect nearby** for site actions. Switch worlds with the existing header selector; use **Full dossier** for investigative detail. This is not yet the publicly deployed Pages build.

**Important boundary:** the fifteen-world scene inventory and spatial expansion do not certify the separate 3× meaningful content-depth request. Artistic polish, long-term economic behavior, physical touch-device performance, and legacy missing historical bytes remain open.

## Remaining acceptance work

- Complete semantic variety/content-tripling audit against intake; generalized facility roles are not fifteen separately designed sets of twelve mechanics.
- Long-duration/default-resource exploration balance, disruptive in-flight hazards, large branch/archive stress, and real-device FPS/memory acceptance.
- Independent archived historical fixtures and full live-HTTPS persistence/navigation verification.
- Merge/deploy and publicly smoke-test the Three.js exploration candidate only after exact-head CI and runtime acceptance; the earlier baseline deployment is already verified.

[Architecture](ARCHITECTURE.md) · [PDK extension guide](EXTENDING.md) · [exploration contracts](docs/EXPLORATION_CONTRACTS.md) · [historical baseline documentation](docs/historical/README.md)

## Current Atlas experience uplift

The Atlas now pairs frozen, timestamped field observations with current model telemetry, exposes ordered evidence prerequisites without revealing unknown identities, and provides stage-aware action guidance. Invalid resupply is reported in the inspector. Phone navigation retains every destination while using horizontal scrolling; workbench tabs support arrow keys, Home and End.

Current working-tree validation: **101 unit/integration tests and 12 desktop/mobile production-browser tests passed**. Matched frame-extraction work fell from 3 calls to 1 for mount plus two filter changes; the 393px-wide global header fell from 682px to 230px. These are not FPS claims. [Before/after evidence, source-state discrepancy and incomplete-release audit](docs/uplift/REVIEW.md).

### Acceptance follow-up (2026-10-11)

See [`docs/acceptance/REVIEW.md`](docs/acceptance/REVIEW.md) for the latest acceptance evidence: independent historical-source archive fixtures pass; 45 default-stock nearest-first expeditions complete with 2000-tick continuation checks. Semantic breadth still fails a functional-duplication test, sustainable unattended balance is not certified, and physical-device/Pages verification remain blocked. `npm run test:acceptance` is now a required release workflow gate; `npm test` alone is not release acceptance.

### Refuge and departure uplift (2026-10-11, latest)

Refuges now provide **Rest local teams**: actual local actor energy is restored using local stocks, not another expedition-stock transfer. Old recorded `operate` commands retain their original behavior for deterministic replay. Native Atlas plugins are version 3.1.0; frontier plugins are 1.1.0; state/config formats are unchanged. New `expedition.rest` commands require the updated application.

Departure briefings distinguish present access from future safety; optional nearby planning uses only revealed destinations and respects chain prerequisites. Local work no longer suggests a redundant departure. The specific camp/refuge semantic check now passes, not the broader claim of independently tripled authored content. [Latest evidence, screenshots, limitations and validation](docs/refuge-uplift/REVIEW.md).

### Archive verification on the remote patch branch

The supplied text-only patch does not contain the original historical ZIP files. CI regenerates the nine original-world archives with pinned Git source `cb6bc9b` and checks their state/continuation oracles against the preserved manifest. The pre-refuge Atlas source commit `7e7f933` was never pushed; CI may generate **state-equivalent** Atlas archives using current-source legacy commands *only when all 15 saved historical state/continuation oracle values match*. These are not byte-identical original pre-refuge archives. ZIP byte hashes change when `exportedAtIso` changes. The original supplied byte hashes remain in the tracked manifest, and any regenerated fixture manifest retains them separately. This is a narrower check than an independently supplied old ZIP restoration; that remains unverified until the original source or files become available.

### Counterfactual replay evidence

History & Branches replay verification now distinguishes roots (Genesis T0) from forks (their actual origin tick). A missing historical checkpoint or expired legacy fork history is **unverifiable**, not an automatic PASS. Portable branch archives carry an optional origin-journal proof without changing legacy archive versions. Verification reports the current state/RNG hash, not an independent scientific validation of the model.
