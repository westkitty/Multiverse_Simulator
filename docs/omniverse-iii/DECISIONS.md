# Omniverse III Architecture Decision Records (ADRs)

## ADR 0001: Opt-in WorldRulesVersion and FeatureModule Seam Architecture

### Status
Accepted (Wave G0 Baseline)

### Date
2026-10-15

### Context
Operation Omniverse III prescribes implementing 20 deep feature systems (P001–P020) across all 15 playable universes simultaneously. The existing engine (`SimulationKernel`, `WorldPlugin`, `withNativeAtlas`, `frontierPlugin`) is deterministic, battle-tested, and serves production via GitHub Pages with historical archives and strict oracle verification.

Under no circumstances may:
1. Legacy archives or historical saves alter their deterministic execution hash.
2. The simulation engine be replaced by an ungrounded secondary framework.
3. Feature development privilege a subset of worlds as pilots while leaving others behind.
4. Cosmetic visual changes masquerade as simulation physics.

### Decision
1. **Explicit Opt-in Versioning (`worldRulesVersion`)**:
   - `worldRulesVersion: 0` (or omitted/undefined) represents the legacy simulation rules. Legacy runs continue to execute legacy systems, quick interventions, and Atlas v1/v2 exploration routes without debit or behavioral drift.
   - `worldRulesVersion: 1` activates the Omniverse III feature systems for new runs or forked branches explicitly opting in.
2. **Compositional Feature Seam (`WorldFeatureModule`)**:
   - Modules reside in `src/features/` and compose cleanly with existing `WorldPlugin` instances.
   - Authoritative simulation state remains exclusively owned by `SimulationKernel` in `src/core/kernel.ts`.
   - Feature modules declare typed capability manifests, action validators, deterministic execution hooks, and read-only projections.
3. **Synthetic Test-Only Fixture**:
   - The capability seam is proven via an isolated synthetic test module (`synthetic-test-domain`) in tests rather than mutating any production universe prematurely.
4. **All-15 World Parity**:
   - All 15 domains (`ecosystem`, `station`, `civilization`, `atmosphere`, `ocean`, `celestial`, `megacity`, `industrial`, `geology`, `wild-meridian`, `hollow-deep`, `timeworn-empire`, `terraforming-frontier`, `machine-wilderness`, `signal-expanse`) are registered in lockstep with explicit schemas and test contracts.

### Consequences
- **Positive**: Strict 100% hash preservation for historical saves, zero regression risk on existing production Atlas journeys, modular and testable domain architecture.
- **Negative / Constraints**: Every feature addition requires both legacy negative assertions (does not fire under version 0) and version 1 positive assertions across all 15 universes.

## ADR 0002: Ordered Hazard Dependency Graphs and Bounded Scientific Budget Ledger

### Status
Accepted (Wave G1 Baseline)

### Date
2026-10-15

### Context
Gate G1 introduces:
1. P002 (The Anatomy of a Catastrophe): Observable, interruptible failure chains driven by world-native telemetry, with explicit threshold evaluations, causal links, and upstream cause tracing.
2. P003 (Conservation Has Teeth): Finite, accounted scientific budgets where interventions require preview and atomic debit, preventing negative balances and phantom resource creation.
3. Initial P013 (Causality Detective): Controlled experiments with matched seeds, single-variable interventions, and observable outcome verification.

### Decision
1. **HazardDependencyGraph (`src/features/hazardGraph.ts`)**:
   - Every universe defines a directed acyclic graph (DAG) of hazard nodes and links.
   - Nodes specify source/target metrics, threshold condition operators (`>`, `<`, etc.), severity tiers, and associated mitigation action families.
   - Evaluator distinguishes empirical `observedTrigger` from interpretative `hypothesizedExplanation`.
   - Supports backward traversal (`findUpstreamCauses`) and forward risk projection (`findDownstreamRisks`).
2. **ScientificBudgetLedger (`src/features/budgetLedger.ts`)**:
   - Manages bounded non-negative stocks (energy, supplies, materials, etc.) per universe under `worldRulesVersion >= 1`.
   - `previewDebit` guarantees cost transparency before action commitment.
   - `applyTransaction` executes atomic debits and credits with receipt logging; any shortfall results in atomic rollback with no state change and no balance distortion.
   - Zero phantom generation: replenishment only accumulates via explicit per-tick rates or verified recovery events.
3. **Legacy Preservation**:
   - Under `worldRulesVersion: 0`, simulation systems bypass budget debits and cascade penalties, preserving exact legacy hash oracles and replay determinism.

### Consequences
- **Positive**: Complete causal transparency for all 15 failure sequences; rigorously bounded resource economics without infinite free actions.
- **Negative / Constraints**: Interventions must specify valid resource debits that fit within available stocks; tests must assert atomic rollback on insufficient balances.
