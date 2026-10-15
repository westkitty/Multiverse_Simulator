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

## ADR 0003: Living Logistics Web and Bounded Functional Facilities

### Status
Accepted (Wave G2 Baseline)

### Date
2026-10-15

### Context
Gate G2 introduces:
1. P004 (The Living Logistics Web): Real production, inventory, logistics capacity, and courier transit. No resource duplication; transfers move from source depot to courier cargo custody to destination depot. Local resupply draws from finite depots with zero phantom generation.
2. P005 (Build the Things That Save the World): Persistent, specialized, and costed installations on validated placement sockets. Requires timed multi-tick construction, periodic upkeep, maintenance degradation on supply loss, operating rate adjustments, and direct domain metric benefits.

### Decision
1. **LogisticsNetwork (`src/features/logisticsWeb.ts`)**:
   - Manages `DepotState` instances with hard capacity limits and reservation tracking (`reservedOutbound`, `reservedInbound`).
   - Couriers take physical custody of dispatched cargo (`currentCargo`), ensuring the conservation invariant:
     $$\sum \text{Depot stocks} + \sum \text{Courier cargo} = \text{Initial} + \text{Produced} - \text{Consumed}$$
   - Route blockage aborts in-transit orders and safely returns cargo to source depots without loss or multiplication.
   - Local resupply is backed by finite depot stocks; exhausted depots reject extraction.
2. **FacilityManager (`src/features/facilitySystem.ts`)**:
   - Manages branch-owned `FacilityState` across validated site sockets.
   - Requires verified materials from local depot or budget ledger to begin construction.
   - Construction takes native ticks; facilities become active only upon completion.
   - Periodic upkeep debits sustain `maintenanceState` (0–100); unpaid upkeep degrades maintenance by 5/tick. Facilities below 25 condition become `degraded` and operate at reduced effectiveness.
   - `maintainFacility` pays upkeep and restores full operation; `retireFacility` frees the socket and reclaims 50% salvage materials.
   - Active facilities deliver domain metric benefits proportional to their `operatingRate`.
3. **Legacy Preservation**:
   - Under `worldRulesVersion: 0`, simulation runs execute without logistics constraints or facility requirements, maintaining exact deterministic hash identity and historical save replay.

### Consequences
- **Positive**: Exact physical conservation of cargo across all transport routes; authentic strategic trade-offs between construction, maintenance, and regional survival.
- **Negative / Constraints**: Facilities require persistent upkeep supply chains; neglecting maintenance directly degrades domain benefits.

## ADR 0004: Cascading Emergency State Machines, Visual Restoration Layers, and Three-Arm Policy Trials

### Status
Accepted (Wave G3 Baseline)

### Date
2026-10-15

### Context
Gate G3 introduces:
1. P006 (Cascading Emergencies): Multi-stage crises (dormant -> precursor -> active -> escalating -> contained -> resolved) that emerge dynamically from native hazard triggers. Precursors provide early warning and allow low-cost mitigation; unmitigated precursors escalate into active and escalating emergencies applying compounding metric penalties, budget drain, and secondary hazard triggers.
2. P007 (The World Must Remember Your Hands): Observable environmental visual restoration indicators directly derived from authoritative simulation state. Provides continuous or quantized opacities, mesh tier reveals, reduced-motion alternatives with zero particle motion and quantized opacity stepping, and accessible screen-reader summaries.
3. P017 initial (No Perfect Intervention): Every world defines competing priced policies. A deterministic Three-Arm Trial framework compares Baseline (status quo), Policy A (intensive/capital), and Policy B (alternative/conservation) over fixed horizons to quantify real trade-offs and secondary collateral effects.

### Decision
1. **EmergencyManager (`src/features/emergencySystem.ts`)**:
   - Manages structured `EmergencyState` per registered crisis.
   - Evaluates precursor and active thresholds. If unresolved within `escalateDelayTicks`, automatically escalates severity and penalties (2x multiplier in escalating stage).
   - Mitigations demote emergency stages and reduce severity proportional to intervention effectiveness.
   - Fully serializable for save compatibility.
2. **VisualRestorationManager (`src/features/visualRestoration.ts`)**:
   - Computes declarative restoration progress from simulation state metrics.
   - Categorizes layers into four stages: `degraded`, `stabilizing`, `restoring`, `flourishing`.
   - `reducedMotion` option eliminates continuous particle motion and quantizes opacity to discrete steps to prevent strobe or motion sickness.
   - Generates screen-reader accessible textual descriptions of environmental state.
3. **PolicyManager (`src/features/policyTrial.ts`)**:
   - Registers world-specific priced policies with explicit resource costs, direct benefits, and inevitable side-effects.
   - Evaluates three-arm comparative trials (Baseline vs Policy A vs Policy B) to demonstrate that every intervention has costs and trade-offs.
4. **Legacy Preservation**:
   - Under `worldRulesVersion: 0`, emergency cascading penalties and policy constraints remain inactive, preserving legacy determinism.

### Consequences
- **Positive**: True cascading crisis dynamics; transparent environmental recovery; rigorous three-arm policy trade-off evaluations.
- **Negative / Constraints**: Crises demand timely resource and intervention commitments; ignoring precursors leads to compounding multi-system degradation.

## ADR 0005: 45 Distinct Native Action Families and Calibrated Scientific Instruments Engine

### Status
Accepted (Wave G4 Baseline)

### Date
2026-10-15

### Context
Gate G4 introduces:
1. P001 (Fifteen Universes, Fifteen Distinct Systems / 45 Action Families):
   - Rather than generic resource transfers or rebranded buttons, each of the 15 universes possesses exactly 3 distinct native action families (45 total across the multiverse).
   - Each action family requires explicit read sets, write sets, typed prerequisites, finite audited resource costs, domain-native state mutations with exact units, decision implications, and dynamic contextual help.
2. Core P010 (A Scientist's Hands / Scientific Instruments):
   - In-world scientific measurements are physical interventions, not UI telemetry leaks.
   - Instruments (environmental samplers, structural probes, spectral/signal analyzers) feature physical channels, operating ranges, calibration wear/drift, energy/supply sampling costs, and calibration restoration.
   - Samples return provenance-stamped `SampleObservation` records containing channel, raw value, calibrated value, measurement unit, confidence score, tick, device class, calibration level, and audited debits.

### Decision
1. **NativeActionRegistry (`src/features/nativeActions.ts`)**:
   - Stores discriminated `NativeActionFamilyDefinition` instances.
   - Enforces condition validation on read set metrics (`<`, `>`, `<=`, `>=`, `==`) before permitting execution.
   - Atomically debits scientific budgets via `ScientificBudgetLedger` and applies bounded deltas to world state. Any prerequisite failure or budget shortfall triggers complete atomic rollback without partial state mutation.
2. **ScientificInstrument & ScientificInstrumentManager (`src/features/scientificInstruments.ts`)**:
   - Models physical in-world devices with multi-channel telemetry.
   - Validates target site discovery (`isDisclosed`), proximity constraints (`maxRangeMeters`), and sampling resource costs.
   - Applies deterministic noise and confidence degradation based on instrument calibration state; provides atomic calibration restoration.
   - Maintains bounded historical observation buffer for cross-referencing and verification.
3. **Seam Integration (`src/features/domainModules/domainHelper.ts`)**:
   - `StandardWorldFeatureModule` exposes standard G4 capabilities `instrument.sample` and `instrument.calibrate`.
   - Incorporates `instrumentManager` and `actionRegistry` into world modules, validating and applying actions atomically and projecting instruments and observations into `VisibleFeatureState`.
4. **Legacy Preservation**:
   - Under `worldRulesVersion: 0`, native action preconditions, instrument samplers, and sampling costs remain inactive, ensuring zero drift for legacy archives.

### Consequences
- **Positive**: 45 authentic, mechanically differentiated gameplay actions; rigorous physical instrument sampling replacing passive telemetry; complete auditability of scientific measurements.
- **Negative / Constraints**: Scientists must position expeditions within range of disclosed sites and maintain instrument calibration to acquire high-confidence scientific observations.

## ADR 0006: Identity-Preserving Continuum Navigation and Crew Specialization Roster

### Status
Accepted (Wave G5 Baseline)

### Date
2026-10-15

### Context
Gate G5 introduces:
1. P008 (The Atlas-to-World Continuum):
   - Multi-scale navigation across 4 continuous zoom scales (`universe -> region -> site -> field`).
   - Undiscovered sites are strictly redacted to maintain genuine fog-of-discovery; camera zoom transitions cannot bypass physical route travel, fuel consumption, or simulation ticks.
   - Coordinates translate deterministically across macro, regional, and micro field scopes.
2. P009 (Expeditions with Real Crew Specializations):
   - Field expeditions require assignable crew members spanning 6 certified specialization roles: Field Surveyor, Systems Engineer, Biosphere Ecologist, Logistics Courier, Heavy Constructor, Hazard Specialist.
   - Roles grant distinct operational modifiers, energy consumption and fatigue debits per deployment, and rest requirements.
   - Hazardous actions require certified specialists to execute legally; mission risk previews calculate expected hazard mitigation.
3. Complete P010 (A Scientist's Hands):
   - Full integration of instrument observation capabilities with crew field assignments and continuum coordinates.

### Decision
1. **AtlasContinuumNavigator (`src/features/atlasContinuum.ts`)**:
   - Manages zoom scales (`universe`, `region`, `site`, `field`) with monotonic clamp boundaries.
   - Redacts undisclosed sites in regional and site views until surveyed or discovered.
   - Enforces physical transit verification: inter-regional journeys require connected routes, sufficient fuel, and advance simulation ticks.
   - Provides coordinate conversion across relative and absolute scales.
2. **CrewManager & CrewMember (`src/features/crewSpecializations.ts`)**:
   - Models individual specialist crew members with assigned roles, energy levels (0-100), assignments, and accumulated work.
   - Enforces legality checks: disallows dispatching exhausted crew members (energy < 10) and mandates certified roles for specialized/hazardous assignments.
   - Calculates mission risk previews incorporating baseline site danger and specialist mitigation bonuses.
3. **Seam Integration (`src/features/domainModules/domainHelper.ts`)**:
   - Exposes standard G5 capabilities: `navigation.zoom`, `navigation.transit`, `crew.assign`, and `crew.rest`.
   - Initializes 6 specialist crew members per world in `StandardWorldFeatureModule`.
   - Projects active navigation scale and crew roster summaries into `VisibleFeatureState`.
4. **Legacy Preservation**:
   - Under `worldRulesVersion: 0`, navigation scaling, route fuel checks, and crew specialization requirements remain bypassed, maintaining full backward compatibility.

### Consequences
- **Positive**: Seamless multi-scale continuum navigation; meaningful specialist personnel management; robust risk previewing before expedition dispatch.
- **Negative / Constraints**: Players must manage fuel for transits, rest fatigued crew, and ensure correct specialist allocation for hazardous tasks.

## ADR 0007: Signature Destinations, Three Historical Eras, and Civic Actor Memory

### Status
Accepted (Wave G6 Baseline)

### Date
2026-10-15

### Context
Gate G6 introduces:
1. P011 (Fifteen Legendary Destinations):
   - 15 signature narrative and scientific landmarks (one unique destination per universe).
   - Structured 3-stage progression missions: `Stage 1: Survey & Cartography -> Stage 2: Core Stabilization -> Stage 3: Equilibrium Verification`.
   - Each stage requires active expedition dispatch, field observations, resource investment, and specialist crew assignments rather than passive time-delayed unlocks.
2. P012 (Three Genuine Ages of History):
   - 45 authored historical eras (3 distinct chronological ages per universe): Era 1 (Pristine / Founding Epoch), Era 2 (Crisis / Crucible Epoch), and Era 3 (Ascendant / Transcendent Equilibrium).
   - Each era applies genuine physical regime modifiers: varying base degradation rates, resource consumption factors, hazard escalation velocity, and scientific restoration multipliers.
   - Era transitions are driven by cumulative catalyst metrics and simulation duration thresholds.
3. P015 (Civilizations That Remember People):
   - In-simulation actor records immortalizing pioneering specialists, leaders, and scientists who resolved crises or completed signature milestones.
   - Dedicated physical monuments anchored at specific geographical sites with custom inscriptions.
   - Bounded civic chronicle records generating measurable cultural legacy modifiers (e.g. morale boosts, reduced fatigue, enhanced public support).

### Decision
1. **SignatureDestinationManager (`src/features/signatureDestinations.ts`)**:
   - Manages authored `SignatureDestinationDefinition` entries and runtime `DestinationMissionState`.
   - Tracks 3 discrete mission stages with completion criteria, required specialists, and resource budgets.
   - Issues audited completion events and bestows lasting scientific and operational accolades upon final stage resolution.
2. **HistoricalEraManager (`src/features/historicalEras.ts`)**:
   - Manages 3 chronological `HistoricalEraDefinition` configurations per universe.
   - Evaluates transition criteria monotonically: transitions cannot regress.
   - Exports active `EraRegimeModifiers` to scale physical simulation parameters across hazards, resource burns, and restoration yields.
3. **ActorMemoryManager (`src/features/actorMemory.ts`)**:
   - Records named `ActorMemoryRecord` entries with era associations, achievements, and sentiments.
   - Manages `MonumentRecord` physical dedications at continuum sites.
   - Generates and maintains `CivicChronicleEntry` logs and calculates aggregate civic legacy bonuses.
4. **Seam Integration (`src/features/domainModules/domainHelper.ts`)**:
   - Exposes standard G6 capabilities: `destination.start`, `destination.progress`, `era.transition`, `memorial.inscribe`, `monument.erect`.
   - Integrates destination, era, and actor memory managers into `StandardWorldFeatureModule`.
   - Evaluates era transitions in `stepOwnedSystems` and projects mission states, current era definitions, and actor/monument rosters into `VisibleFeatureState`.
5. **Legacy Preservation**:
   - Under `worldRulesVersion: 0`, signature missions, historical eras, and actor memory registries remain inactive, ensuring zero drift for legacy archives.

### Consequences
- **Positive**: Rich multi-stage narrative journeys at signature landmarks; dynamic macro-scale era transitions with tangible physical simulation shifts; persistent civic recognition of player and crew accomplishments.
- **Negative / Constraints**: Physical regime modifiers in late-stage eras demand higher resource stewardship and resilience planning from players.
