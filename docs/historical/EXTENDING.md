> Historical pre-expansion documentation; consult the root document and source contracts for current behavior.

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

## OMNIVERSE II verification additions

Use Node >=22.12, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run verify:dist`. Install Chromium with `npx playwright install --with-deps chromium`, then run `npm run test:browser`. For public verification use `SMOKE_BASE_URL=https://westkitty.github.io/Multiverse_Simulator/ EXPECTED_RELEASE_COMMIT=<full-sha> npm run test:browser`.

`npm run measure:baseline` writes the intake manifest using seed 424242 and default configuration. Preserve its frozen baseline when implementing new worlds; do not reinterpret old scale metadata as the new expansion. No new plugin/POI API is promised yet. CI release policy and activation instructions are in `docs/RELEASE_EVIDENCE.md`.

## Phase 1 exploration integration contract

See `docs/EXPLORATION_CONTRACTS.md`. Domain plugins must own and serialize exploration state, advance it through ordered kernel systems, emit returned events through the kernel journal, supply domain-valid placement sockets, and validate restoration. `src/test/exploration.test.ts` includes an unregistered PDK integration example; it is not a production world. Do not count fixture sites toward content targets or assume declared simulation dependencies already affect domain systems.
