# Multiverse Simulator — recursive field-service bug sweep

Date: 2026-10-13. Source baseline: `main` commit `564a6212d1b66184ffa89b2ed0ca37f4f09ba9f4` (merged PR #16). Audit target: the real 3D recovery/service-order user journey, native Atlas travel/resupply/repair, deterministic saves and historical regression protections.

## Authority and coverage

The user requested repeated bug sweeping, meaningful uplift and repair—not an audit-only checklist. The most recent authored contract is `docs/acceptance/FIELD_SERVICE_ORDERS.md`. Protected: 15 playable worlds; science models; native 70-hazard and fuel route gates; original paid service and local first-visited stock behavior; deterministic journal/save/branches; historic fixtures; original 3D/touch paths; no free supplies or teleportation; PR + exact-head CI + Pages/public smoke.

**Pass-1 inspection:** `src/exploration/fieldServicePlan.ts`, `engine.ts`, `dossier.ts`, `departure.ts`, `nativeFieldExperiments.ts`, native Atlas adapter command handling, `src/ui/views/AtlasView.tsx`, `src/store/multiverseStore.ts`, `src/App.tsx`, `e2e/immersive.spec.ts`, `src/test/fieldServicePlan.test.ts`, historical and default-resource acceptance, current operational/bible contracts, recent PRs #14-#16 and release jobs. GitHub inventory includes 170 tracked blobs; remaining world-plugin internals, complete browser-render details and actual physical devices are not covered by this bounded pass. The local container has no DNS/network access to clone the repository, so executable regression evidence comes from exact-head GitHub Actions, not a claimed local test.

## Confirmed defect ledger

### BS-001 — Refuellable service target incorrectly presented as terminally blocked
- Severity: HIGH. Status: **PATCHED; exact-head validation pending**.
- Evidence: original `planFieldService` uses a `planRoute` call constrained by **current** fuel to assemble `feasible`. If no target remains, it unconditionally returns `blocked` before checking whether the first previously visited local site has finite fuel the game's existing resupply command can transfer.
- User impact: already-visited damaged sites are unreachable through the 3D service deck, even though a valid finite-stock local refuelling path exists.
- Repair: classify routes blocked by fuel versus site danger versus blocked corridors. If the first visited local source has enough cumulative finite fuel to make an otherwise legal route viable, offer the existing `expedition.resupply` command (up to 10 fuel per transfer) **without modifying route safety or granting resources**.
- Regression: a cloned 36-site true Atlas with one visited damaged destination, insufficient current fuel and finite local source returns `resupply`; no source stock or unsafe destination still returns `blocked`; real authoritative kernel hash remains unchanged.

### BS-002 — Remote supplies excluded from legal repair logistics
- Severity: HIGH. Status: **PATCHED; exact-head validation pending**.
- Evidence: original plan returns `need-supplies` whenever expedition supplies are below two and current-region resupply cannot supply the difference, **before considering an already-visited remote destination with finite supplies**. Travel itself spends fuel, not repair supplies.
- Impact: paid maintenance is stranded when a legal future destination can pay for repair after arrival.
- Repair: prefer native finite local transfer if sufficient; otherwise permit a fuel-safe travel order to a previously visited, locally stocked destination; after real travel tick/arrival, native resupply and two-supply repair remain separate commands. A split origin+destination stock plan is also supported without adding any stock.
- Regression: three 3-stage cloned-plan trials demonstrate travel → resupply → repair, and origin resupply → travel → destination resupply → repair. All native route/fuel/hazard checks are preserved.

### BS-003 — Blocked orders conceal the actual repair obstacle
- Severity: MEDIUM. Status: **UPLIFT APPLIED; verification pending**.
- Evidence: original UI reports one undifferentiated blocked count.
- Improvement: show separate categories for previously visited damaged sites with hazardous destinations, fuel-limited real routes, and hazardous/closed/disconnected routes; show the finite refill alternative when possible. Counts are computed read-only and must sum exactly to total blocked.
- Regression: case-specific route/hazard/fuel tests; dedicated accessible text in the existing 3D service deck. No new persistent state.

### BS-004 — Published PR #16 public smoke cancelled despite green validation/deploy
- Severity: MEDIUM release-evidence gap, **not a demonstrated production-code bug**.
- Evidence: [main Actions run 38391679266](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38391679266), initial attempt validate/deploy SUCCESS, public-smoke CANCELLED. Production release was not end-to-end certified by its first attempt.
- Action: requested a re-run of the same cancelled public-smoke job with no application mutations; inspect its final status and browser count before claiming release verified.

## Verified constraints / rejected false positives

- The native engine really selects the FIRST previously visited local source and can send only up to ten supplies and up to ten fuel **per actual resupply**. Another local site cannot be silently selected or combined.
- The shared command bus defaults to throwing on a rejected interactive command; the existing service receipt code does not silently swallow normal in-band rejections. No speculative rewriting of store dispatch was authorized.
- `App.tsx` keys Atlas/Explore views by active run, so per-run local service-feedback state is reset by React remount; no cross-run feedback bug is established.
- New read-only route projections never debit or credit fuel and cannot count unvisited site names.

## Pass-2 / final gate

Pending exact-head proof from PR CI: archive/source parity, historical oracles, typecheck, lint, unit, 15-world default-stock acceptance, 3-seed Civil-v2, 12 native scientific restoration trials, isolated performance, production build + distribution, 3D/desktop/mobile-emulated Playwright and subsequent merged-main validate/deploy/public smoke. Revisit all three patched categories after any failed test and rerun a fresh scope audit.

## Known out-of-scope/unverified product deficits

The previous 2,000-tick trials still reveal extensive site-integrity collapse in Industrial, Megacity and Geology, and global scientific restoration commands are not yet economically priced. The app also lacks physical-device sustained FPS/thermal testing and independently authored tripled gameplay for all fifteen worlds. A clean **bounded service-order** resweep is not a global guarantee of zero bugs. No production pass or release is claimed until those respective gates finish.
