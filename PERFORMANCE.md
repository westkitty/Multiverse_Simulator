# OMNIVERSE II — measured local performance

## CPU measurement, 2026-10-11

Source: `docs/current-inventory.json`, reproducible using `RECORD_CURRENT=1 npx vitest run src/test/currentInventory.test.ts`. Node 22.22.3, Linux, Vitest/jsdom, seed 424242, default configurations, 100 individual `kernel.step()` calls per world, no warmup exclusion. Percentiles include varying checkpoint work. These are **CPU timings, not browser FPS**; do not compare directly with the older batch-based intake benchmark.

| World | p50 step ms | p95 step ms | ZIP at tick 100, bytes |
|---|---:|---:|---:|
| ecosystem | 3.084 | 10.041 | 194726 |
| station | 0.853 | 7.559 | 77209 |
| civilization | 0.568 | 2.199 | 83766 |
| atmosphere | 1.619 | 6.328 | 148563 |
| ocean | 1.240 | 4.810 | 159684 |
| celestial | 0.655 | 4.088 | 81067 |
| megacity | 0.750 | 2.805 | 95247 |
| industrial | 0.604 | 2.275 | 81815 |
| geology | 0.944 | 3.572 | 133535 |
| wild-meridian | 0.530 | 2.042 | 64298 |
| hollow-deep | 0.511 | 1.733 | 66074 |
| timeworn-empire | 0.525 | 1.210 | 58787 |
| terraforming-frontier | 0.448 | 1.398 | 65201 |
| machine-wilderness | 0.465 | 0.966 | 64759 |
| signal-expanse | 0.487 | 1.205 | 58791 |

## Rendering and responsiveness

- Native cells/compartments are drawn with a shared instanced mesh (capacity 2,048; current maximum is 144 zones). Entities/links reuse meshes and materials. Zone opacity is shared rather than an independent material per zone.
- Object synchronization is skipped when frame, interpolation, layers and selection are unchanged. Visual interpolation never changes authoritative state.
- Camera fit, zoom/pan limits, fog, grid and SVG extents derive from live presentation bounds. Selected sites can be focused. Vertical connections now retain Y displacement.
- WebGL-unavailable fallback supports keyboard selection; accessible entity tables remain available.
- Browser renderer tests establish nonzero draw calls below visual-instance count in expanded Geology on desktop and mobile software Chromium. They do not establish hardware FPS or memory budgets.
- The production 250 ms `stepMany` responsiveness budget is preserved. Exact-tick tests use individual steps rather than depending on machine speed to finish a batch.

## Boundaries and unverified budgets

Exploration journals retain 128 recent actions per branch with compact action totals and persistent evidence. Route planning has explicit queue/search limits. Unknown sites are omitted from visual entity presentation. Simulation still runs all authoritative regions; this is not chunk-sleeping or lazy physical evolution.

Schema validation/cloning remains a CPU cost. Actor/connection rendering is not fully instanced, and there is no measured hardware LOD or GPU-memory budget. Hundred-tick CPU samples and software-renderer checks do not prove day-long stability, large branch collections, constrained-phone memory, or deployed HTTPS performance. Old estimated figures are preserved only in `docs/historical/PERFORMANCE.md` and are not current evidence.

## Matched Atlas UI work (current uplift)

`npx vitest run src/test/upliftMeasurement.test.tsx` compares the saved pre-uplift view with the current view using the same Ecosystem seed, mount and two filter changes. It measures real `extractRenderFrame` calls with the viewport mocked identically: **3 → 1**. See `docs/uplift/frame-measurement.json`. No FPS/latency conclusion follows from this count. Main JS gzip grows 65.91 → 69.11 kB, with 2.29 kB gzip of added CSS. Mobile navigation geometry changes 682 → 230 px at 393×852; all destinations remain available through horizontal scrolling.

## Device provenance follow-up — 2026-10-11

`docs/acceptance/device-profile.json` contains an actual five-second browser observation, explicitly **SwiftShader/software rendering**, not hardware certification. Its animation-frame intervals are not GPU execution timings; its JS heap is not GPU memory. See `docs/acceptance/REVIEW.md` for workload limits and the reproducible `scripts/acceptance/device-probe.mjs` command. Physical desktop/mobile sustained-load evidence remains blocked by device access.

## Refuge/departure cost — latest local uplift

This is a behavior/correctness uplift, not a claimed FPS optimization. Nearby route search is only requested when the planner is expanded. Existing render-frame reuse passes its regression test. Main compressed JS increased from 69.11 kB to 70.96 kB; CSS from 2.29 kB to 2.44 kB. Worker raw size increased from 534.69 kB to 537.00 kB. Scientific/vendor chunks are unchanged. Final build sizes and scope are recorded in `docs/refuge-uplift/REVIEW.md`; no physical-device speedup is claimed.

## OMNI projection cost and limits (2026-10-11)

New live curiosity leads preprocess the bounded causal event journal **once per Atlas projection** (O(E + S + J), where E is retained events, S is sites and J is bounded exploration action history), instead of searching all events separately for every POI. The selected site's short casefile filters recorded entries and caps the displayed result at twelve. Parallel-run comparison reads two matching site deltas; it does not simulate, clone the world, allocate new GPU objects or alter authoritative tick cadence.

These are algorithmic complexity changes only. No measured FPS, memory savings or physical-device performance improvement is claimed. Run the same software/hardware representative workloads before asserting such a gain.

