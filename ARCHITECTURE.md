# OMNIVERSE II — architecture

## Authoritative simulation and presentation

`src/core/kernel.ts` remains the authority for fixed simulation ticks, phase-aware commands, checkpoints, event causality, hash/replay verification, branches and archive records. `src/core/rng.ts` provides named deterministic streams. React, Three.js, animation clocks and camera visibility do not advance or mutate physical state.

`src/worlds/index.ts` distinguishes:
- `LEGACY_WORLD_PLUGINS`: nine unwrapped plugins used by compatibility/intake verification.
- `ORIGINAL_WORLD_PLUGINS`: those same nine native models with the Atlas adapter.
- `CORE_WORLD_PLUGINS`: all fifteen selectable worlds.
- The Thermal Lattice PDK template remains separate from the fifteen-world inventory.

The existing Observatory, timeline, experiment lab, comparison, contract observatory, diagnostics and data vault remain available. Worker modules use the same PDK registry; no browser request to sandbox localhost is required by the production app.

## Original-world expansion

`src/worlds/atlas/expandNative.ts` adds two independently seeded native extensions with stable suffixed IDs and remapped links. Cells, rooms, settlements, districts, nodes and celestial bodies enter the actual collections consumed by native systems—not a decorative second map. Gridded systems derive row limits from state, with legacy arithmetic retained for legacy extents. Station/city/industrial capacity reserves scale with expanded infrastructure. Native actor counts still respect configuration.

`nativeAtlas.ts` wraps rather than replaces each native system pipeline. `atlasVersion: 1` opts new runs into expansion; absent flags leave native-only legacy behavior intact. Atlas updates run after native systems, project scientific readings into regional state, update sites and autonomous teams, and advance committed expedition arrivals. Serialization deep-clones the attached state to avoid checkpoint/branch aliases.

Nine adapters map domain-native state to measurements and risk. Most site repair operates on local installations; designated processor operations additionally modify selected native environmental/infrastructure fields. These are bounded teaching-model interventions, not calibrated engineering predictions.

## Six frontier domains

`src/worlds/frontiers/domains.ts` defines six distinct regional equations, units, biomes, histories, signatures and actor names. `frontierPlugin.ts` supplies PDK lifecycle plumbing, adjacent-region exchange, infrastructure coupling, utility actors, serialized logistics, metrics and site rendering. Scale 1 and scale 3 use the same equations; default scale 3 has 48/48/36/48/48/36 regions.

Six actor roles change stocks, survey knowledge, infrastructure, cargo and risk assessments. Cargo delivery requires movement away from its pickup region. Energy depletion can stop unsupported actors. This establishes stateful autonomy, but long-run ecology and economy balance is not accepted solely from task counters.

## Exploration state model

`src/exploration/contracts.ts` separates:
1. Seeded site facts: identity, placement, provenance/history, simulation dependencies and archetype.
2. Dynamic branch-owned state: condition, mitigation, hazard, resources, inhabitants, observations, discovery, event references and journey.
3. Derived presentation: labels, visible objects and curiosity leads.

The progression is UNKNOWN → DETECTED → SURVEYED → DISCOVERED → VISITED → INVESTIGATED → RESOLVED. `applyExplorationCommand` validates into owned data and returns a transaction; rejected commands do not spend caller resources. Local actions require an actual visit. Travel plans a bounded graph route and debits fuel; simulation ticks commit arrival. Four-link instrument coverage bridges unsited terrain while retaining hidden names/history.

Evidence is a timestamped measurement with branch provenance. Generated history is explicitly classified separately. Three ordered investigations per world require predecessor evidence; restoration evidence gates resolution of chain-ending sites. Site operations implement twelve resource/navigation/maintenance functions. Local hazard mitigation persists and decays rather than being overwritten by the next environmental update.

Journals cap at 128 recent actions, retaining action totals and evidence. `leads.ts` derives at most six branch-local hypotheses from surveyed conditions/evidence and expires them 48 ticks after observation. It never advances discovery or claims correlation proves a cause.

## Rendering and accessibility

`frameBounds.ts` calculates presentation bounds. `ThreeWorldViewport.tsx` uses them for fit, pan/zoom, fog, reference grid and SVG extent. Shared instanced zone geometry reduces draw calls; entity/connection meshes are reused. Unchanged scene synchronization is skipped, while interpolation stays visual-only. Native Three.js frustum culling remains active; all simulation regions still advance independently of viewport visibility.

Keyboard-operable SVG, touch controls, reduced motion and the existing accessible entity table provide alternatives. Instanced rendering currently has a 2,048-zone capacity (actual maximum 144); increasing domain bounds beyond it requires resizing/chunking the renderer, not dropping authoritative simulation data.

## Contracts and persistence

The ten original cross-world adapters are retained. Three additional experimental transfers cover industrial supply allocation → terraforming, geological exposure → archaeology, and atmospheric drought → wilderness. Each specifies units, finite source validation, conversion/caps, information loss and source provenance; they are not claims of physically conserved transport between realities.

IndexedDB and portable archives remain local. Closed tabs and paused runs do not simulate in the background. Legacy native archive continuation is tested using raw plugins in the current checkout; independent archived binaries and intermediate development Atlas migrations are not certified. See `OPERATIONAL_STATE.md` for deployment and acceptance limits.

## Read-only field dossiers

`src/exploration/dossier.ts` projects already-owned Atlas state into known chain labels, missing evidence conditions and frozen-sample/current-model comparisons. It never emits evidence, advances ticks or changes schemas. `AtlasView` still validates and dispatches actual actions through the existing exploration engine/store; its guidance is not a second authority. Frames are memoized against the kernel, tick and UI revision, with a regression test that checks both cache reuse and command invalidation.

The inspection session is keyed by run ID. Mobile layout preserves DOM/focus order. Shared navigation styles are isolated in `src/ui/navigation.css`; the workbench tablist implements roving focus and arrow/Home/End selection. Current proof and remaining release limits are in `docs/uplift/REVIEW.md`.

## OMNI derived site memory (2026-10-11)

`src/exploration/forensics.ts` is strictly a projection layer: `siteChronicle` merges already-recorded branch-specific exploration actions and real kernel CausalEventJournal entries. It deduplicates the kernel's exploration event echoes and labels only known before/after values; generated history is never rewritten into an observed event. Future-dated entries are excluded. An actual site visit is required before the casefile can expose event details.

`compareSiteRealities` evaluates two independent run states without mutating either. It requires the same world, genesis seed, archetype and immutable site coordinates. The other run's state remains sealed until surveyed, and local stocks/evidence remain withheld until visited. A difference does **not** establish its cause, especially when run ticks differ.

`src/exploration/leads.ts` indexes recent localized causal events once per projection, then selects from the existing site discovery state and 48-tick evidence window. Recorded event titles are gated by visit; surveyed-only contacts may receive generic state-based leads without leaking event identity. These selectors never advance simulation ticks, enqueue commands, alter saved schemas or create content-count claims.

