# Extending the Omniverse Engine (Plugin Development Kit)

## 1. Registering a New Simulation World

All simulation worlds implement the `WorldPlugin<TConfig, TState>` contract defined in `src/core/contracts.ts` and are validated through `defineWorldPlugin` in `src/core/pdk.ts`.

### Required Plugin Fields
1. **Identity & Metadata**:
   - `id`, `name`, `subtitle`, `category`, `version`, `schemaVersion`, `description`, `accentColor`, `icon`, `educationalOverview`.
2. **Scale Metadata (`scaleMetadata`)**:
   - Declares `baselineSpatialUnits`, `expandedSpatialUnits`, `scaleFactor` (`>= 3.0`), `spatialUnitLabel`, `playableAreaBefore`, `playableAreaAfter`, `baselineScenarios`, `baselineInterventions`, and `baselineMetrics`.
3. **Configuration & Presets**:
   - `defaultConfig`, `validateConfig(raw)`, and `scenarios` (`>= 9` scientific scenarios per world).
4. **Deterministic Lifecycle**:
   - `createInitialState(config, rng, ecs)`
   - `systems`: Ordered array of `SimulationSystem<TConfig, TState>` executed each fixed tick.
   - `validateCommand(command, state)` and `applyCommand(ctx, command)`
   - `quickInterventions`: Operator-ready command presets (`>= 18` per world) where every intervention mutates authoritative state and emits a causal event.
5. **Observability & Serialization**:
   - `metrics` (`>= 18` telemetry metrics) and `extractMetrics(state, ecs, tick)`
   - `extractRenderFrame(state, ecs, tick)` returning 3D/2D `zones`, `entities`, `links`, and `ambientMood`
   - `inspectEntity(entityId, state, ecs)`
   - `evaluateAlerts(state, metrics, tick)`
   - `serializeState(state)` and `deserializeState(raw, schemaVersion)`

---

## 2. Automated Contract & No-Op Verification

Every registered world is automatically tested by:
- `verifyWorldPluginContract(plugin)` (`src/core/pdk.ts`): Verifies deterministic twin runs, snapshot continuation parity, counterfactual branch isolation, and invalid command rejection.
- `src/test/nineWorldsExpansion.test.ts`: Verifies `scaleFactor >= 3.0`, `>= 9` scenarios, `>= 18` interventions, `>= 18` metrics, and executes **every quick intervention against an unperturbed control run** to guarantee zero no-op interventions.
