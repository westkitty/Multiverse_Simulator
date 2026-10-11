# OMNIVERSE II — Phase 0 evidence

## Status (2026-10-11)

**Partial implementation, not the fifteen-world release.** Nine original worlds are preserved. Phase 0 validation and publication preparation are implemented; public activation is BLOCKED. Phases 1–8 expansion work is not complete.

- Session began on `arena/37f107b8-multiverse-simulator` at `b4e57734873df0af4f0bd760a9283557b0e8c977` (README only, clean worktree).
- Fetched `arena/1b370858-multiverse-simulator` at `632e7503fa00b7698f77a0a973d990a2a2b8c410` and fast-forwarded the session branch, preserving implementation history. No reset or branch deletion.
- Baseline: typecheck, lint, 24 tests, production build passed independently.
- Updated toolchain: Vitest 5 and jest-dom 7; npm audit reports zero vulnerabilities. Node >=22.12 required.
- Current checks: typecheck, lint, 25 tests across six suites, production build, production asset verification PASS.
- Chromium 153 headless desktop (1280×720) and emulated Pixel 7 (393×727) smoke tests PASS against the built project-base application. CPU/software rendering in Linux, not physical mobile hardware.
- Direct Playwright browser download was network-blocked; local browser supplied by the npm-distributed `@sparticuz/chromium` package outside the repository. CI installs standard Playwright Chromium.

## Requirements-to-evidence matrix

| Requirement | Status | Evidence / limitation |
|---|---|---|
| Preserve original nine IDs and systems | PASS | Registry/PDK tests; no world implementation changes |
| Deterministic replay, independent branches, continuation | PASS | Existing kernel, PDK and nine-world suites |
| Ten cross-world contracts, experiments, comparison | PASS | Existing contract and UI suites |
| Production project base and worker | PASS locally | `verify:dist`; real browser worker INIT_RUN + STEP_BATCH |
| All nine launch, inspect, step | PASS locally | Desktop/mobile `e2e/baseline.spec.ts` |
| Clock advances, accessible entity table | PASS locally | Browser smoke |
| Archive round-trip, save and reload | PASS locally | Browser checks saved tick AND hash after explicit Vault Load; unit archive corruption/quota tests |
| Browser history and refresh | PASS locally | Hash navigation, back and reload smoke |
| Mobile layout | PASS for tested screens | Observatory/Library/Vault width and controls; not an exhaustive accessibility audit |
| Six new worlds / fifteen registry entries | FAIL | Still nine primary plugins |
| Additional 3× territory, 540 POIs, 45 chains | FAIL | No expansion implemented; no normalized POI or chain records |
| Exploration director, site histories, expedition navigation | FAIL | Not implemented |
| Physical mobile FPS, long-session GPU memory | UNVERIFIED | No suitable hardware/profile acquired |
| Pages activation | BLOCKED | GET `/pages` 404; POST with `build_type=workflow` 403 `Resource not accessible by integration` |
| Public HTTPS browser smoke / release match | BLOCKED | No deployed site verified |

## Baseline → current → required scale

These numbers are **not** the earlier project's historical 3× claim. Current numbers remain unchanged.

| World | Baseline = current | OMNIVERSE II target | Expansion |
|---|---|---|---|
| A Ecosystem | 48 habitat zones | 144 | FAIL |
| B Station | 18 rooms, 3,810 m³ | 54 rooms, 11,430 m³ | FAIL |
| C Civilization | 9 settlements + 6 predefined founding sites; 4,800 km² | 27 settlements, 45 sites, 14,400 km² | FAIL |
| D Atmosphere | 48 cells | 144 | FAIL |
| E Ocean | 48 sectors, 144 depth cells | 144 sectors, 432 depth cells | FAIL |
| F Celestial | 3 systems, 18 bodies | 9 systems, 54 bodies | FAIL |
| G Megacity | 18 districts, 540 km² | 54 districts, 1,620 km² | FAIL |
| H Industrial | 18 nodes, 24 routes | 54 nodes, 72 routes | FAIL |
| I Geology | 48 cells | 144 | FAIL |
| J Wild Meridian | Not implemented | Functional 16 → 48 regions | FAIL |
| K Hollow Deep | Not implemented | Functional 16 → 48 regions | FAIL |
| L Timeworn Empire | Not implemented | Functional 12 → 36 regions | FAIL |
| M Terraforming Frontier | Not implemented | Functional 16 → 48 regions | FAIL |
| N Machine Wilderness | Not implemented | Functional 16 → 48 regions | FAIL |
| O Signal Expanse | Not implemented | Functional 12 → 36 regions | FAIL |

`expansion-manifest.json` records seeded state collection lengths, frame counts, schemas, target floors, and benchmark measurements. `npm run measure:baseline` reproduces the inventory; it intentionally remains a nine-world intake test, not a fifteen-world acceptance test. Future expansion must preserve this baseline rather than silently regenerate it as a new baseline.

Content: 81 scenarios, 174 interventions, 162 metrics retained. **Zero new normalized POIs and zero new discovery chains.** Existing simulated rooms, actors and networks are real but are not counted as satisfying the new POI contract. Full distinct functional-structure/actor archetype inventories remain UNVERIFIED; raw collection counts are not archetype counts. Area labels in prior scale metadata are model assumptions, not geographical measurements.

## Deployment procedure and permission blocker

Target (NOT verified live): https://westkitty.github.io/Multiverse_Simulator/

Administrator's minimal step:
**Repository → Settings → Pages → Build and deployment → Source → GitHub Actions.**

The API credential reports admin role but cannot access the Pages setting. No credential should be pasted into chat. No DNS/custom-domain changes are needed.

`.github/workflows/deploy.yml` validates PRs and main; only main pushes or manual dispatch on main may deploy. Required gates: reproducible install → strict typecheck → lint → tests → production build → asset verification → desktop/mobile browser smoke. Only then upload `dist`; a separate deployment job configures Pages and deploys through the github-pages environment with scoped pages/id-token permissions. Deployment concurrency does not cancel an active release. A dependent public smoke job checks the actual HTTPS site and displayed commit.

Official action versions and immutable SHAs were resolved using their GitHub releases/README sources on intake: checkout v7.0.1, setup-node v7.1.0, configure-pages v6.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1. Source URLs: `https://github.com/actions/<action>/releases`.

After enabling Pages, merge only passing baseline PR checks under the repository's normal protection/review rules. If already merged, run **Actions → Verified baseline and GitHub Pages → Run workflow → main**. Success requires both deployment and public-smoke jobs; a pushed workflow or local HTTP 200 is not evidence of publication. Post-deployment smoke failure marks the workflow failed but does not automatically roll back Pages; restore a verified revision through a reviewed change.

## Confirmed repairs

1. Original Vite production assets used root paths. Project base now applied to build AND preview; the first browser run exposed preview-path 404s, repaired and retested.
2. Header claimed v2.0 while engine/package were v1.0.0. Header now displays engine version, BASELINE, registry world count, and CI commit.
3. Added hash-based workbench history compatible with project Pages URLs.
4. Fixed inflexible responsive grid minima; added focus outlines and touch-target sizing. Full accessibility conformance remains unverified.
5. Replaced vulnerable test tooling without modifying simulation or archive schemas; existing regression suite passes under the updated tools.

## Persistence and execution limits

State schema, archive format and IndexedDB schema remain version 1. No migration is introduced. Saved runs survive reload and can be restored from Data Vault; the baseline does not automatically resume the previously active run. Storage is browser-local, not cloud storage. Closed/suspended tabs do not have a persistent execution service. Only the active running simulation is scheduled automatically; paused and stored branches do not advance. Render-independent headless stepping is provided by the existing kernel/worker, not a promise of all worlds continuously advancing in the background.

## Remote validation evidence

- PR: https://github.com/westkitty/Multiverse_Simulator/pull/1
- Initial PR run `38129369955` failed because the Vite config was inadvertently omitted from the first commit. Corrective commit `812242f` included the already locally verified config.
- Corrected PR run **38129397003: SUCCESS** (all validation gates, including standard Playwright Chromium desktop/mobile browser tests on GitHub-hosted Ubuntu). Deploy/public-smoke correctly skipped for PR code.
- Additional adversarial repair canonicalizes the initial hash-history entry; browser Back now restores the initial Observatory too. Regression exercised in desktop and mobile smoke tests.
