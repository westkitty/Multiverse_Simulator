# OMNIVERSE ENGINE — ARCHITECTURE

## 1. Module Boundaries

The architecture enforces a strict one-way dependency graph so the simulation kernel never depends on React or Three.js:

```text
SIMULATION CORE (src/core/)
  ├── contracts.ts          Versioned types, state hashing (FNV-1a 64-bit), roundDet/clampDet
  ├── rng.ts                Seeded Mulberry32 PRNG with isolated named streams
  ├── ecs.ts                Deterministic Entity-Component Storage with sorted queries
  ├── causalJournal.ts      Append-only bounded logical event journal & causal graph traversal
  ├── kernel.ts             Fixed-timestep scheduler, command bus, checkpoints, replay & branching
  ├── pluginRegistry.ts     World plugin registration & lifecycle management
  ├── experimentRunner.ts   Single-seed & paired multi-seed controlled experiment engine
  ├── comparisonEngine.ts   Same-world & cross-world reality comparison engine
  ├── crossWorldContract.ts Versioned cross-world event adapters & physical guardrails
  └── pdk.ts                World Plugin Development Kit & contract test harness
        │
WORLD PLUGINS (src/worlds/)
  ├── ecosystem/            World A: Living Ecosystem plugin
  ├── station/              World B: Modular Space Station plugin
  └── civilization/         World C: Civilization Network plugin
        │
PERSISTENCE & WORKER TRANSPORT (src/persistence/, src/worker/)
  ├── indexedDb.ts          IndexedDB stores (runs, experiments, preferences) + throttled autosave
  ├── archive.ts            Portable .omniverse.zip packager, Zod validator & integrity verifier
  ├── simulation.worker.ts  Web Worker simulation host
  └── workerBridge.ts       Bounded worker queue with crash isolation & main-thread fallback
        │
REACT & THREE.JS OBSERVATORY (src/renderers/, src/store/, src/ui/)
  ├── ThreeWorldViewport.tsx Imperative Three.js renderer + 2D schematic fallback + GPU cleanup
  ├── multiverseStore.ts    Zustand state store coordinating runs, workbenches & alerts
  └── views/                8 specialized laboratory workbenches
```

---

## 2. Fixed-Timestep Scheduler & Command Ordering

`SimulationKernel` advances authoritative simulation time (`tick: number`) in discrete unit steps:

1. **Post-Systems Command Flush (`post_systems`)**: Commands enqueued interactively while paused at tick $T$ are applied and recorded with `(executedAtTick: T, replayPhase: 'post_systems')`.
2. **Clock Advance**: `tick` increments to $T + 1$.
3. **Pre-Systems Command Flush (`pre_systems`)**: Pre-scheduled scenario commands for tick $T + 1$ are applied in deterministic `(tick, sequence)` order.
4. **Ordered System Execution**: Registered plugin systems execute in sorted `(system.order, system.id)` order.
5. **Metrics & Bounded Checkpointing**: Metrics are extracted and rounded via `roundDet`, and periodic checkpoints are stored within `budget.maxCheckpoints`.

---

## 3. Deterministic Seeded PRNG (`src/core/rng.ts`)

`SeededRng` derives independent `Mulberry32Stream` instances per subsystem stream name (`rng.stream('environment')`, `rng.stream('movement')`, `rng.stream('lifecycle')`). Drawing random numbers in one subsystem never perturbs another subsystem's random sequence. The complete state of all active streams is serialized in every checkpoint and `.omniverse.zip` archive.

---

## 4. Causality Model (`src/core/causalJournal.ts`)

Every event in `CausalEventJournal` carries an explicit `causalLinkType`:

- `'direct'`: Directly triggered by an explicit command or immediate parent event (`causedByEventId`).
- `'dependency'`: Propagated through a documented physical/subsystem dependency (e.g., Reactor SCRAM -> Battery Depletion -> Life Support Scrubber Power Loss -> Cabin CO2 Rise -> Crew Health Deterioration).
- `'inferred'`: Temporal/subsystem correlation without direct single-event certainty.
- `'unknown'`: Root autonomous state transition.

`inspectCausalChain(eventId)` traverses both upstream ancestors and downstream consequences to answer *What Happened? What Changed? What Caused It? What Was Affected? What Happened Next?*

---

## 5. Rendering Separation (`src/renderers/ThreeWorldViewport.tsx`)

World plugins expose `extractRenderFrame(state, config, runId, tick): RenderFrameData`. The Three.js viewport consumes `RenderFrameData` to update reusable geometries and materials, performing visual-only position interpolation (`prevPosition -> position`) between ticks without ever mutating authoritative simulation state. On unmount or world switching, all geometries, materials, and WebGL resources are explicitly disposed.
