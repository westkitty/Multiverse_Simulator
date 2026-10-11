# EXTENDING THE OMNIVERSE ENGINE — WORLD PLUGIN DEVELOPMENT KIT (PDK)

Developers can build and register a 4th (or $N$-th) simulation world without modifying a single line of `SimulationKernel`. A complete working 4th reference plugin (`createThermalLatticeTemplatePlugin`) is provided in `src/core/pdk.ts`.

---

## 1. Define a World Plugin with `defineWorldPlugin`

Use `defineWorldPlugin<TConfig, TState>` from `src/core/pdk.ts`:

```ts
import { z } from 'zod';
import { defineWorldPlugin } from './core/pdk';
import { roundDet, clampDet } from './core/contracts';

export const myWorldPlugin = defineWorldPlugin({
  id: 'my-fourth-world',
  name: 'World D — Custom Simulation',
  subtitle: 'Custom Physical Domain',
  version: '1.0.0',
  schemaVersion: 1,
  accentColor: '#a855f7',
  description: 'Custom deterministic simulation world.',
  physicalModelDocumentation: ['Explicit conservation and state transition equations.'],
  simplifiedMechanicsNote: 'Document simplified assumptions clearly.',
  configSchema: z.object({
    nodeCount: z.number().int().min(1).max(100),
    decayRate: z.number().min(0.01).max(1.0),
  }),
  defaultConfig: { nodeCount: 10, decayRate: 0.1 },
  scenarios: [/* Preset scenarios */],
  quickInterventions: [/* Interactive user command descriptors */],
  metricDefinitions: [/* Typed metric definitions with units */],

  initializeWorld(config, rng) {
    const initStream = rng.stream('init');
    // Return initial authoritative state using only `rng` (never Math.random)
    return { /* ... */ };
  },

  systems: [
    {
      id: 'sys_1_primary_step',
      name: 'Primary State Update',
      order: 10,
      step(ctx) {
        // Mutate ctx.state deterministically and emit causal events via ctx.emitEvent(...)
      },
    },
  ],

  applyCommand(state, command, ctx) {
    // Handle interactive commands and emit causal events
  },

  extractMetrics(state, config) {
    return { /* metricId: numericValue */ };
  },

  inspectEntities(state, config) {
    return [/* EntityInspection[] for 3D picking & Accessible State Table */];
  },

  extractRenderFrame(state, config, runId, tick) {
    return {
      worldId: 'my-fourth-world',
      runId,
      tick,
      ambientStatus: 'nominal',
      entities: [/* RenderEntityVisual[] */],
      zones: [/* RenderZoneVisual[] */],
      connections: [/* RenderConnectionVisual[] */],
      hudSummary: { /* key: value */ },
    };
  },
});
```

---

## 2. Register the Plugin

```ts
import { globalPluginRegistry } from './core/pluginRegistry';
globalPluginRegistry.register(myWorldPlugin);
```

---

## 3. Rules for Strict Determinism

1. **Never call `Math.random()` or `Date.now()`** inside `initializeWorld`, `systems[].step`, or `applyCommand`. Always draw from `ctx.rng.stream('subsystem_name')`.
2. **Round floating-point state transitions** using `roundDet(value, decimals)` from `src/core/contracts.ts`.
3. **Maintain stable entity iteration order** (sort entity arrays by ID or use `DeterministicECS` from `src/core/ecs.ts`).

---

## 4. Automated Contract Verification

Run `verifyWorldPluginContract(myWorldPlugin, 25, 1337)` in Vitest (or click **"Run PDK Contract Verification Suite"** in the **Diagnostics & PDK** workbench) to automatically verify:

- **Determinism**: Two independent runs with identical seed and commands produce identical 64-bit FNV-1a state hashes.
- **Serialization Round-Trip**: `serializeState` -> `restoreState` preserves the exact state hash.
- **Restart Continuation Equivalence**: A restored mid-run snapshot continues identically to an uninterrupted run.
- **Branch Isolation**: Forking and stepping a child branch never mutates the parent branch state hash.

---

## 5. Declaring Cross-World Event Adapters

Register explicit cross-world adapters in `defaultCrossWorldRegistry` (`src/core/crossWorldContract.ts`) specifying `sourceWorldId`, `sourceEventTypes`, `targetWorldId`, `targetCommandType`, `requiredUnits`, `informationLoss`, `validateSourceEvent`, and `translate`.
