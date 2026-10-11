> Current integration: all fifteen worlds now embed these contracts. See `src/worlds/atlas`, `src/worlds/frontiers`, `src/exploration/leads.ts`, and `docs/current-inventory.json`. Twelve facility operations, persistent mitigation, four-link survey coverage and expiring hypotheses extend the initial contract described below. Intermediate development-only Atlas archives have no migration guarantee.

# Phase 1: exploration foundation (local continuation)

## Scope and honest status

The reusable foundation lives in `src/exploration/`. It is **not yet connected to the production worlds or UI**. The registry remains nine worlds. There are no new production POIs, signature destinations or completed discovery chains. The three-location test fixture is unregistered and is not expansion content.

This continuation is local: the session's PR was previously merged. No remote push, Pages settings inspection or deployment was attempted in this continuation. Further remote work requires a new coding session. Prior deployment evidence is historical, not a fresh Pages-status check.

## Contracts

All schemas use strict, version-1 Zod records; unknown schema versions, non-finite values, negative budgets, invalid references, duplicate IDs, disconnected graphs and inconsistent saved inventories are rejected.

- **Generated facts** (`SiteFacts`): world/region/archetype identity, stable seed, coordinates with domain units, bounds, name, description, origin, formation epoch, association, dependency references and typed JSON-compatible domain extensions.
- **Definition** (`SiteDefinition`): starting condition/hazard/inhabitants/resources, interaction capabilities, evidence rules and rendering/accessibility descriptors. These are generation inputs, not runtime mesh objects.
- **Authoritative deltas** (`ExplorationState`): discovery progression, condition, hazard, resource inventories, inhabitants, observed evidence, first visit, expedition supplies/fuel/cargo, committed journey, per-branch route blockages and regional hazards, journal and action totals.
- **Derived presentation** (`presentSite`): unknown sites return null; detected sites expose only a non-secret label; names, details and generated history appear at their respective discovery/visit stages. Generated history is explicitly labeled, not presented as observed truth. This is UI disclosure control, not encryption of save files.

## Placement

A domain planner supplies spatial sockets with environmental tags, clearance, coordinates and region references. Templates declare required tags and physical radii. `populateAtlas` selects only compatible templates using socket-local named RNG streams, sorts the output canonically, validates consistent units and refuses overlapping placements. Reversing region/socket input order produces identical output. It never consumes a running world's RNG stream.

This is a placement primitive, **not** a terrain/hydrology/road planner. The caller must provide scientifically appropriate tags and sockets. No uniform random scatter or artificial POI floors are generated. Missing compatible content fails explicitly.

## Exploration mechanics

`applyExplorationCommand` validates and clones state before applying any effects. Failures leave the caller's state and resource budget unchanged.

- Detect requires local or adjacent open-route coverage.
- Survey consumes one supply; discovery identifies the surveyed destination.
- Travel requires a discovered, safe site; route planning accounts for blocked links, regional hazard, travel ticks and available fuel. It chooses the fastest fuel-feasible route with stable ties. Fuel is charged at departure, including for committed journeys that have not arrived yet.
- `advanceExploration` completes journeys only at simulation ticks; same-region site access still takes one tick. Camera movement and wall-clock time have no effect.
- Investigation requires visiting the site and any prior chain evidence. Evidence is collected only when its authoritative condition/hazard/resource predicate matches; observed values, units, tick and branch are retained. No matching new evidence means no cost and no state mutation.
- Repairs consume two supplies and restore up to 25 condition points. Recovery moves one unit of a named resource into expedition cargo; it does **not** convert arbitrary resources into fuel or supplies.
- Resolution requires all defined evidence. It means the site's defined investigation is complete, not that a scientific hypothesis has been proven universally.

Routes use domain-native ticks/fuel units; caves can use vertical coordinates, but gravity/climbing/flood propagation are not implemented here. In-flight routes are committed at departure. Mid-journey disruption/cancellation and resupply need explicit domain mechanics; no closed-browser catch-up exists.

## History, branch isolation and persistence

Every accepted action/arrival returns a structured event with a branch ID and before/after summary. Per-site event references and the recent journal are capped at 128 entries; cumulative action counts and collected evidence persist. Old detailed entries are deliberately compacted, not claimed to remain queryable indefinitely.

Embed the atlas and exploration deltas in the domain plugin's serialized authoritative state. Use `restoreExplorationState` when loading. Run `advanceExploration` in an ordered system and forward returned events through `ctx.emitEvent`. Apply commands through the same kernel command path. Kernel event IDs should be mapped by the domain adapter if direct journal links are needed: foundation event references currently identify exploration events, not kernel journal IDs. Dependency references are declared but do not yet modify a domain's power, ecology or geology.

The existing kernel's snapshots, hashes and portable archives then include exploration data automatically. No existing archive schema was changed. Production-world migrations remain to be designed when the foundation is integrated; do not silently inject this state into legacy worlds.

## Proof and limits

`src/test/exploration.test.ts` has nine focused tests covering placement order/seeds, schema/reference/geometry rejection, disclosure, atomic rejection, deterministic travel and alternate paths, evidence chains, repairs/recovery, fork isolation, corruption and bounded history. An unregistered `defineWorldPlugin` fixture exercises real kernel replay, actual counterfactual forks, causal emission and `.omniverse.zip` continuation. Original registry tests still require exactly nine production worlds.

Route searches have explicit 8,192 queued-label and 16,384 examined-label limits; exceeding a limit returns a budget error, not a fabricated route. Generation overlap validation is O(n²), and transactions clone/validate the state. These are correctness-first primitives: expanded-world/mobile performance is **UNVERIFIED**. Spatial indexing, delta-oriented updates, real terrain planners, curiosity leads, UI integration, autonomous world coupling and new worlds remain future implementation work, not completed features.
