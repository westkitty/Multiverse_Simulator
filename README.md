# THE SIMULATION MULTIVERSE (`OMNIVERSE ENGINE`)

> *"Create a world. Change its conditions. Watch consequences unfold. Rewind history. Branch reality. Compare outcomes. Understand why."*

**The Simulation Multiverse (Omniverse Engine v1.0.0)** is a modular, deterministic multiverse simulation laboratory and causal experimentation workbench built with TypeScript (strict mode), React 18, Vite, Three.js, Web Workers, IndexedDB, and Zod.

---

## Core Capabilities

- **Shared Deterministic Simulation Kernel (`src/core/`)**:
  - Completely decoupled from React and Three.js.
  - Fixed-timestep simulation scheduler separated from wall-clock, rendering, and UI animation time.
  - Documented seeded PRNG (`Mulberry32` with isolated named streams in `src/core/rng.ts`) with full state serialization and zero reliance on `Math.random()`.
  - Deterministic Entity-Component Storage (`src/core/ecs.ts`) with monotonic stable IDs and sorted queries.
  - 64-bit FNV-1a canonical state hashing (`computeStateHash`) and deterministic replay verification from Genesis (`replayFromStart`).
- **Causality Engine & Append-Only Event Journal (`src/core/causalJournal.ts`)**:
  - Every significant simulation event records `EventId`, `RunId`, `Tick`, `EventType`, `SourceSystem`, `SourceEntity`, `AffectedEntities`, structured `payload`, before/after `deltas`, `causedByEventId`, and explicit causal link classification (`direct`, `dependency`, `inferred`, or `unknown`).
  - Interactive 5-part Causal Chain Inspector answering: *What Happened? What Changed? What Caused It? What Was Affected? What Happened Next?*
- **Three Genuine World Modules (`src/worlds/`)**:
  1. **World A — Living Ecosystem (`ecosystem`)**: Spatial 4×4 habitat basin (16 zones with moisture, soil nutrients, and logistic primary flora biomass) + mobile Herbivore and Apex Predator agents with energy metabolism, hydration, threat avoidance, foraging/hunting, reproduction, mortality, and decomposition back into soil nutrients.
  2. **World B — Modular Space Station (`station`)**: 6-compartment orbital station (*Command Bridge*, *Life Support Bay*, *Habitation & Hydroponics*, *Engineering & Battery Hub*, *Reactor Core*, *Docking Airlock*) connected by controllable hatches. Models ideal-gas molar inventories ($N_2$, $O_2$, $CO_2$), derived total/partial pressures (kPa), mass-conserving hatch equalization, choked orifice hull-breach decompression, prioritized electrical bus load shedding, $CO_2$ scrubbing, and crew physiology.
  3. **World C — Civilization Network (`civilization`)**: Multi-settlement regional landscape (*Aethelgard Basin*, *Solis Mesa*, *Meridian Delta*, plus charterable frontier colonies) with food, water, and construction material stockpiles, workforce labor allocation, infrastructure tiers (Farms, Waterworks, Housing, Storage), trade convoy routes, and regional drought resilience.
- **Timeline & Branching Realities**:
  - Copy-on-write checkpoints, historical rewind/restore, branch lineage visualization, and counterfactual branch forking without cross-branch mutation.
- **Scientific Experiment Laboratory (`src/core/experimentRunner.ts`)**:
  - Controlled counterfactual experiments supporting both single-seed deterministic runs ($N=1$) and paired multi-seed ensembles ($N=2\dots 6$), reporting descriptive variation (mean, min/max, paired delta SD) without unsupported $p$-value claims.
- **Side-by-Side Reality Comparison (`src/core/comparisonEngine.ts`)**:
  - Dual synchronized or independent viewports, same-world metric delta tables, configuration diffing, and unit-safe cross-world comparison.
- **Cross-World Event Contract (`src/core/crossWorldContract.ts`)**:
  - Explicit versioned adapters with unit conversion formulas, information-loss disclosures, preview before execution, and strict rejection of physically incompatible transfers (e.g., rejecting Space Station hull decompression into the open planetary Ecosystem).
- **Save System & Portable `.omniverse.zip` Archives (`src/persistence/`)**:
  - IndexedDB persistence with throttled autosave and portable `.omniverse.zip` archives containing `manifest.json`, `config.json`, `state.json`, `checkpoints.json`, `events.json`, and `integrity.json` with FNV-1a 64-bit checksum validation.
- **World Plugin Development Kit (`src/core/pdk.ts`)**:
  - Declarative `defineWorldPlugin` API, automated contract verification suite (`verifyWorldPluginContract`), and a 4th reference plugin (`thermal-lattice-template`).

---

## Installation & Development

```bash
# Install dependencies
npm install

# Start local development server (binds to 0.0.0.0:5173)
npm run dev

# Run TypeScript strict checking
npm run typecheck

# Run ESLint static analysis
npm run lint

# Run automated unit, integration, UI, and adversarial stress tests
npm test

# Build production bundle
npm run build

# Preview production build locally (binds to 0.0.0.0:4173)
npm run preview
```

---

## Controls & Navigation

- **Header Quick World Switcher**: Switch immediately between *World A: Ecosystem*, *World B: Space Station*, and *World C: Civilization*.
- **3D Observatory Viewport**:
  - **Orbit**: Left-click drag (or 1-finger touch drag).
  - **Pan**: Right-click drag or `Shift` + Left-click drag.
  - **Zoom**: Scroll wheel.
  - **Inspect Entity / Zone**: Click any organism, habitat patch, station compartment, hatch, crew member, or settlement in the 3D scene (or select from the Accessible Tabular State Mirror).
  - **Reset Camera / Fit to World**: Top-right buttons inside the viewport.

---

## Browser Requirements & Limitations

- Runs completely offline-capable in any modern ES2022 browser with IndexedDB support.
- Uses standard WebGL (no WebGPU or compute shader requirement). When WebGL is unavailable or context is lost, the viewport automatically engages an interactive 2D SVG Tactical Schematic and Accessible Entity Table with zero data loss.
- Deterministic reproducibility is guaranteed within the same engine version, plugin version, seed, configuration, and ordered command sequence in IEEE-754 JavaScript runtimes using `roundDet` fixed-precision rounding. Cross-architecture bitwise floating-point identity across non-IEEE-754 hardware is not claimed.
