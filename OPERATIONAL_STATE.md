# OPERATIONAL STATE RECORD (`OPERATIONAL_STATE.md`)

## 1. Verified Features

All features below have been verified via automated unit, integration, UI, and adversarial stress tests (`npm test`: 4 test suites, 18 tests passing) and production bundle verification (`npm run typecheck`, `npm run lint`, `npm run build`):

1. **Deterministic Simulation Kernel (`src/core/kernel.ts`)**:
   - Fixed-timestep advancement decoupled from React and Three.js.
   - Named-stream `Mulberry32` seeded PRNG (`src/core/rng.ts`) with full serialization and restore.
   - Phase-accurate command ordering (`pre_systems` vs `post_systems`) and exact Genesis replay verification (`replayFromStart`).
   - Periodic and manual checkpointing, historical state restore, and isolated branch forking.
2. **Causal Event Journal (`src/core/causalJournal.ts`)**:
   - Append-only bounded event journal with filtering by tick range, world, entity, event type, and severity.
   - Upstream ancestor and downstream descendant causal graph traversal (`inspectCausalChain`).
3. **World A — Living Ecosystem (`src/worlds/ecosystem/ecosystemPlugin.ts`)**:
   - 16-zone spatial habitat with moisture, soil nutrients, and logistic primary flora biomass.
   - Mobile Herbivore and Apex Predator agents with perception steering, foraging/hunting, metabolism, hydration, reproduction, mortality, and decomposition.
   - Verified trophic cascade scenario (`eco-trophic-cascade`).
4. **World B — Space Station (`src/worlds/station/stationPlugin.ts`)**:
   - 6 compartments and 5 hatches with ideal-gas molar conservation ($N_2$, $O_2$, $CO_2$), derived total/partial pressure (kPa), coupled hatch equalization, and choked-orifice breach blowdown.
   - Prioritized electrical bus load allocation (Reactor -> Battery -> Critical/Normal/Non-Essential Loads), $CO_2$ scrubbing, and crew physiology/repair.
   - Verified cascading failure scenario (`stn-cascading-failure`).
5. **World C — Civilization (`src/worlds/civilization/civilizationPlugin.ts`)**:
   - Multi-settlement regional network with food, water, and construction material stockpiles, workforce allocation, infrastructure upgrades, convoy trade routes, and regional drought scenario (`civ-water-crisis`).
6. **Three.js 3D Viewport & Accessible Fallback (`src/renderers/ThreeWorldViewport.tsx`)**:
   - Interactive 3D visualization for all 3 worlds with orbit/pan/zoom, raycast entity picking, visual-only position interpolation, GPU disposal, 2D SVG Tactical Schematic fallback, and Accessible Tabular State Mirror.
7. **Experiment Laboratory, Reality Comparison, Cross-World Contract, Data Vault & PDK**:
   - Controlled single-run and paired multi-seed experiments (`src/core/experimentRunner.ts`).
   - Same-world and unit-safe cross-world reality comparison (`src/core/comparisonEngine.ts`).
   - Versioned cross-world event translation with preview, provenance, and physical incompatibility rejection (`src/core/crossWorldContract.ts`).
   - IndexedDB persistence + portable `.omniverse.zip` archive export/import with FNV-1a 64-bit checksum verification (`src/persistence/`).
   - World Plugin Development Kit (`src/core/pdk.ts`) with a verified 4th reference plugin (`thermal-lattice-template`).

---

## 2. Known Limitations & Honest Disclosures

- **Runtime Floating-Point Determinism**: Deterministic reproducibility is guaranteed within IEEE-754 JavaScript runtimes for the same engine version, plugin version, seed, configuration, and command sequence using `roundDet`. Bitwise identity across non-IEEE-754 hardware architectures is not claimed.
- **Simplified Physical Models**: Each world plugin explicitly documents its governing equations and simplified assumptions (e.g., isothermal compartment gas approximation in World B; discrete seasonal tick production in World C) via `physicalModelDocumentation` and `simplifiedMechanicsNote`.
- **Browser Heap Telemetry**: Non-Chromium browsers do not expose `performance.memory.usedJSHeapSize`; the Diagnostics workbench reports `"API Unavailable"` rather than fabricating memory metrics.

---

## 3. Future Development Guidance

- To add new worlds, use `defineWorldPlugin` in `src/core/pdk.ts`, register the plugin in `src/worlds/index.ts`, and add a test invoking `verifyWorldPluginContract(newPlugin)` in `src/test/`.
- To add new cross-world bridges, register a `CrossWorldAdapter` in `src/core/crossWorldContract.ts` with explicit unit conversion and validation rules.
