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
