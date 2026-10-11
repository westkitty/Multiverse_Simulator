> **Historical pre-uplift audit.** The refuge/departure implementation and current verification supersede the camp/refuge failure and unchanged-application statements below. See `../refuge-uplift/REVIEW.md`. The earlier failure is preserved in `../refuge-uplift/semantic-before.json`; current `semantic-results.json` checks the production camp/rest commands. Wider semantic breadth, unattended sustainability and external delivery/device limits remain unresolved.

# Acceptance follow-up — 2026-10-11

## Verdict: incomplete, with new executable evidence

Application baseline: `7e7f9334cefd9c276dba4a16558640377790f229`, branch `arena/37f107b8-multiverse-simulator`. This follow-up adds verification, fixtures and a release gate, **not a repair of every outstanding product requirement**. Application physics, UI, IDs, RNG, archive formats and production assets are unchanged.

| Requested acceptance family | Result | Evidence / remaining gap |
|---|---|---|
| Semantic content | **FAIL** | Camp/refuge roles have the same functional effect in all 15 worlds; quantity changes do not establish distinct mechanics. Wider semantic tripling is not certified. |
| Default-resource long-duration balance | **PARTIAL** | All 45 nearest-first expeditions complete; all continue to tick 2000 and restore/continue deterministically. Several native worlds deteriorate severely while unattended. This is not proof of a sustainable economy. |
| Independent historical archives | **PASS, scoped** | Nine ZIPs generated exclusively with historical source, restored by current plugins, matched against historical continuation hashes and replay. |
| Physical-device performance | **BLOCKED** | Actual renderer is SwiftShader. A measured software-rendering profile is included, not substituted for hardware evidence. |
| Verified Pages deployment | **BLOCKED** | Closed session cannot push, change GitHub or deploy. No new remote verification occurred. |

## 1. Semantic content: a reproducible counterexample

`semanticAcceptance.test.ts` operates role 0 (camp) and role 3 (refuge) under controlled visited-site conditions in each world. Both increase expedition supplies and decrease the same local supplies stock. Fuel, hazard, condition and cargo remain unchanged. Their normalized effect signatures match in **15/15 worlds**. Different transfer quantities and names do not make these independent functional archetypes.

This is a necessary-condition check, not a general algorithm for assessing narrative quality. It is an isolated operation fixture, not a player journey. The native command adapter adds physical effects for roles 5 and 7, not for these two roles; the duplicate identified here is not a hidden native mechanic.

Additional source findings:

- Each world's 36 sites share **one origin-history template**; three epoch labels alone do not establish three independently authored historical layers.
- Nine native adapters bind real native fields and retained scientific systems. Six frontier domains have distinct environmental equations. These are substantive existing implementations, but do not establish 12 independent domain-specific POI mechanics per world.
- Native sites repeat 12 names/roles three times. Signatures receive special names, while their restoration/evidence rules overlap ordinary sites of the same role.
- Three ordered chains per world and site persistence work. Count, connectivity and replay tests cannot certify semantic breadth or narrative causation.

Consequently, the earlier inventory remains useful as an inventory, **not semantic-content acceptance**. Product work is still needed: differentiate overlapping functions with real consequences; author domain-specific site/history/chain behavior; test those consequences and preserve earlier save/replay behavior. Merely weakening this test, changing labels or adding counters would not fix the requirement.

Raw results: `semantic-results.json`. The explicit acceptance command exits nonzero on this defect.

## 2. Default stocks, actual native ticks, routing sensitivity

The workload uses real `SimulationKernel` defaults: **150 fuel / 80 supplies**, seeds **1, 2026, 424242**, no stock/config mutation, no hidden resource grant, no direct expedition-clock advancement. Survey, travel, repair, investigation, resolution and local resupply execute through real kernel commands. Native physics, actor work, wear and resource production advance during travel.

Two policies were measured rather than assuming the first failure meant the world was impossible:

1. **Site-order policy:** 39/45 expeditions completed. Civilization stopped at 33/36 sites and Industrial at 34/36 for each seed. Stocks were not exhausted. Preserved in `default-balance-site-order.json`.
2. **Nearest-first policy:** choose a safe, reachable, prerequisite-ready site with minimum travel time, breaking ties by higher current hazard. Revisit surveyed frontier anchors where required. This completed **45/45 expeditions: 36 sites per world per seed**. No physics, hazard threshold, initial resources or supply-transfer rules changed. Results: `default-balance.json`.

The six formerly failing cases were also tested separately (`nearest-route-probe.json`). The policy reads authoritative state; this is a kernel-level feasibility workload, not proof that the browser explains or exposes an optimal route to a player. It is greedy, not an exhaustive planner. The ordinary list-order failure is retained as a real usability/balance sensitivity, not erased.

All 45 nearest-first runs then advance to tick 2000, check finite authoritative values, export/restore, and compare a further five ticks with the uninterrupted run. **45/45 pass.** This covers 90,225 authoritative ticks in the primary trajectories, plus restored continuations; it does not simulate closed-tab activity or claim any particular wall-clock duration inside the fictional worlds.

### Important long-duration limitation

A finite, replayable state is not necessarily a healthy world. At tick 2005, seed 1 mean site conditions include Civilization **0.002/100**, Industrial **0/100**, Megacity **17.971/100**, and Geology **6.501/100**. After completing the expedition, this workload deliberately leaves the world unattended; it does not apply ongoing maintenance or scientific interventions. These results do **not** certify indefinite unattended balance, recovery from late collapse, or player-manageable maintenance economics. Those remain product acceptance gaps.

The full nearest-first workload passed in approximately 208 seconds on this sandbox. That is acceptance-suite wall time, not frame rate or a physical-device performance claim.

## 3. Independent historical-source fixtures

Source: local commit `cb6bc9b4456f2cb45b7610c0df6d3325bd67a5eb`.

`npm run fixtures:historical`:

1. Extracts that exact Git tree into a unique ignored `.cache` directory without switching branches or modifying history.
2. Verifies historical and current package lockfiles are byte-identical before reusing installed dependencies.
3. Executes only the **historical** kernel, plugins and ZIP exporter in the extracted tree.
4. For each of the nine original worlds: initializes seed 424242, executes its first quick intervention at tick 5, exports at tick 20, and computes an independent continuation oracle at tick 60.
5. Writes nine small ZIP fixtures and a provenance/SHA-256 manifest under `src/test/fixtures/historical/`.

Current-code tests verify binary integrity, successful ZIP validation, absence of silently added Atlas state, exact restored tick-20 state hash, the historical tick-60 hash after 40 current-code steps, and replay from genesis. **Nine tests pass.**

These are reconstructed **historical-source** files, not recovered past user downloads. They cover one seed and one command sequence per original world, not every possible old archive or intermediate Atlas release. ZIP metadata may change on regeneration; canonical continuation oracles must remain stable. The earlier same-checkout legacy tests remain additional, weaker coverage—not the source of these new expected hashes.

## 4. Hardware evidence: report what actually ran

`device-profile.json` records browser/OS-reported metadata and the actual application's WebGL renderer:

- Linux/KVM sandbox, two logical CPUs, reported Intel Xeon at 2.60 GHz.
- No `/dev/dri` device directory.
- Headless Chromium 153, 1440 × 1000 viewport.
- **ANGLE / SwiftShader (Subzero)**, explicitly forced software rendering.
- Five-second initial paused-Observatory animation-frame interval sample; no page errors.

The JSON includes observed intervals and JS heap values. Animation-frame callbacks are not GPU execution timings, JS heap is not GPU memory, and an idle sample is not sustained active-world performance. None is labeled as a physical GPU pass.

Reproduce the probe with a running production preview:

```sh
CHROMIUM_EXECUTABLE=/path/to/chromium HEADED=1 \
  node scripts/acceptance/device-probe.mjs
```

On a real device, **do not set `SOFTWARE_RENDERING=1`**. The script never awards hardware acceptance merely because the renderer string looks plausible: physical-device provenance remains unverified. Desktop and physical-mobile active-world/thermal trials, input responsiveness, memory trends and matching deployed build identity still need actual device access.

## 5. Deployment and release gate

The existing workflow retains main/manual-only deployment, dependent validation, pinned official actions, least permissions, the `github-pages` environment, concurrency and public-browser smoke tests. It now runs **`npm run test:acceptance` before building/uploading the release artifact**. This currently fails the semantic check; ordinary unit-test success can no longer silently bypass that known defect.

No workflow, push or deployment was executed remotely this turn. The prior recorded deployment failed because Pages was not enabled (configure-pages 404; activation previously returned 403). That is historical evidence, **not a fresh check of current settings**.

Required external handoff:

1. Start a new coding session for this repository; this session is closed to remote GitHub operations.
2. Finish the failed semantic and remaining long-duration product acceptance, retain these tests, and rerun all gates.
3. Repository → Settings → Pages → Build and deployment → Source → **GitHub Actions**. An authorized repository owner must resolve any remaining activation permission failure; do not expose credentials.
4. Push/review/merge through the new session and inspect successful validation, deployment and public-smoke jobs.
5. Verify the served commit identity, shell/assets/chunks/worker, 15-world navigation, persistence/reload/import/export, mobile and accessibility against the actual HTTPS Pages URL. An artifact upload, workflow start or HTTP 200 alone is insufficient.

## Reproduction and validation

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:acceptance  # currently FAILS semantic content; do not skip for release
npm run build
npm run verify:dist
npm run test:browser
```

- Ordinary suite: **110 passed**, two explicit acceptance tests skipped in this fast/default command. They are exercised by the separate, now-required release gate.
- Historical archive tests: **9 passed** within that ordinary suite.
- Semantic acceptance: **FAIL**, duplicate-effect counterexample in all 15 worlds.
- Default-resource nearest-first workload: **PASS** for all 45 trajectories and finite/restorable continuation; broader sustainable balance **not accepted**.
- Typecheck and lint: **PASS**.
- Production build: **PASS**, 88 modules; production asset filenames unchanged.
- Base-path/worker validation: **PASS**, seven HTML assets plus module worker under `/Multiverse_Simulator/`.
- Local production-browser tests: **12 passed** across desktop/mobile-emulated projects; software renderer, not physical-device evidence or Pages proof.
- No visual assets or application behavior were changed in this follow-up.

## Files and Git

New acceptance tests, nine historical ZIPs plus manifest, generator/probe scripts, and JSON evidence live under `src/test/`, `scripts/acceptance/`, and `docs/acceptance/`. Package scripts and the Pages workflow expose/enforce the new gate. Documentation links this review.

HEAD remains `7e7f933`; this follow-up is local, uncommitted work on the same session branch. No push, new PR, merge, branch switch or remote GitHub operation occurred. **Overall release acceptance remains incomplete.**
