> Historical pre-expansion document. Not current acceptance or performance evidence.

# Omniverse Engine — Triple-Scale Performance & Spatial Optimization Report

## 1. Triple-Scale Performance Budgets & Benchmarks

With all 9 worlds expanded to **3.0× spatial scale** (48 habitat zones, 18 station compartments, 15 settlement sites, 48 climate cells, 144 volumetric ocean cells, 18 celestial bodies, 18 megacity districts, 18 industrial nodes, and 48 geological cells), the simulation engine maintains deterministic fixed-timestep execution well within interactive frame budgets.

| World ID | Active Spatial Elements | Mean Step Time (ms/tick) | 50-Tick Batch Duration | Bounded Telemetry Cap |
| :--- | :--- | :---: | :---: | :---: |
| `ecosystem` | 48 habitat zones + up to 420 organisms | ~0.65 ms | ~32 ms | 600 points |
| `station` | 18 compartments + 24 hatches + 12 crew | ~0.22 ms | ~11 ms | 600 points |
| `civilization` | 15 regional sites + 16 convoy routes | ~0.28 ms | ~14 ms | 600 points |
| `atmosphere` | 48 synoptic cells + cyclonic vortices | ~0.31 ms | ~16 ms | 600 points |
| `ocean` | 144 volumetric cells (48 × 3 layers) + shoals | ~0.48 ms | ~24 ms | 600 points |
| `celestial` | 3 star systems + 18 orbital bodies | ~0.19 ms | ~10 ms | 600 points |
| `megacity` | 18 districts + 24 transit/utility corridors | ~0.25 ms | ~13 ms | 600 points |
| `industrial` | 18 supply-chain nodes + 24 freight routes | ~0.27 ms | ~14 ms | 600 points |
| `geology` | 48 crustal cells + 28 fault segments | ~0.34 ms | ~17 ms | 600 points |

---

## 2. Spatial & Rendering Optimizations for 3× Scale

1. **O(1) Grid Coordinate Indexing**:
   - Grid-based worlds (`ecosystem`, `atmosphere`, `ocean`, `geology`) map world-space `(x, z)` coordinates directly into `(gridX, gridZ)` cell indices (`idx = gridZ * 8 + gridX`) rather than performing `O(N²)` distance scans during neighbor diffusion, advection, and organism foraging.
2. **Precomputed Adjacency Lists**:
   - Networked worlds (`station`, `civilization`, `megacity`, `industrial`) iterate over pre-indexed corridor/hatch adjacency lists for pressure equalization, commuter routing, electrical load dispatch, and freight convoy transport.
3. **Bounded Ring Buffers (`ResourceBudget`)**:
   - `CausalEventJournal` (`maxCausalEvents = 2500`), telemetry histories (`maxTelemetryHistory = 600`), and auto-checkpoints (`maxCheckpoints = 32`) strictly bound memory growth across multi-thousand-tick runs.
4. **Domain-Split Production Bundles (`vite.config.ts`)**:
   - Production assets are code-split into `worlds-biosphere`, `worlds-planetary-orbital`, `worlds-civilization-urban`, `vendor-three`, and `vendor-react`, keeping every bundle chunk under 480 kB.

## Independently measured intake (2026-10-11) — supersedes estimates above

Linux sandbox, Node 22.22.3, Vitest/jsdom, seed 424242, default configs. 100 individual `kernel.stepMany(1)` calls per world; timings include kernel bookkeeping/checkpoint work. No warmup exclusion. These are measurements, not browser FPS guarantees. No expansion/performance uplift is claimed.

| World | p50 ms/tick | p95 ms/tick | ZIP bytes at tick 100 |
|---|---:|---:|---:|
| ecosystem | 7.202 | 12.514 | 66562 |
| station | 1.526 | 2.375 | 15246 |
| civilization | 0.894 | 1.541 | 20106 |
| atmosphere | 1.973 | 4.006 | 26815 |
| ocean | 5.881 | 9.457 | 42084 |
| celestial | 1.212 | 2.286 | 18241 |
| megacity | 1.255 | 2.411 | 17605 |
| industrial | 1.640 | 3.107 | 18115 |
| geology | 1.851 | 3.133 | 24102 |

Reproduce with `npm run measure:baseline`; raw values and collection counts are in `docs/expansion-manifest.json`. Do not compare the historical estimates directly to these measurements: their sampling method/environment was not recorded. Browser smoke used Chromium 153 with software GPU on desktop and mobile-emulated viewports; physical mobile performance, p95 frame time, GPU memory, draw calls, world-switch/save latency and long-session resource growth remain **UNVERIFIED**. Production worker is ~475 kB uncompressed; largest render chunk ~474 kB. No new GPU-disposal or instancing optimization is claimed.

## Phase 1 primitive budgets (not a performance-uplift claim)

Exploration's recent journal and per-site event references are each capped at 128; evidence and cumulative action counts survive compaction. Navigation fails explicitly beyond 8,192 queued or 16,384 examined labels. Placement uses pairwise overlap validation; transactions validate/clone owned state. These modules are not on the production rendering path yet. No new browser FPS, expanded-world step-cost or memory improvement has been measured or claimed.
