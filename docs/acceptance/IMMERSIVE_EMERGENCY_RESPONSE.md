# Immersive emergency science recovery — player-facing access contract

## Verified starting release

PR #14 Civilization full-housing stability repair merged as `8e98850d57b69e1f7301025697e1b143b520a187`; [main Actions run 38353782557](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38353782557) passed validate, Pages deploy and **20/20 public browser smoke tests**. The new Civilization Atlas v2 remained safely reachable at tick 2005 in three fixed-seed acceptance runs; earlier v1 archives remain replayable.

PR #13 scientific-access experiment [run 38331327164](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38331327164) demonstrated that two original restoration commands reopen **36/36** fuel-bounded sites after 30 native ticks in Industrial, Megacity and Geology, whereas their untreated matched worlds are often inaccessible. That does **not** prove an endlessly sustainable, economically priced recovery loop.

## Player problem

The actual playable 3D expedition exposes two curated native science controls for each world, but does not expose the specific catastrophic hazard-recovery command required by Industrial, Megacity or Geology. Without leaving the immersive gameplay for the Observatory, players cannot invoke these experimentally verified native restoration actions.

## Bounded implementation

- Add a curated **emergency recovery** action to the 3D field-experiment panel for precisely three native worlds, via the real existing plugin quick-intervention descriptors:
  - Industrial: `ind-repair-all-facilities`, `repair_facility_breakdowns`.
  - Megacity: `cty-infrastructure-overhaul`, `overhaul_city_infrastructure`.
  - Geology: `geo-emergency-reconstruction`, `reinforce_vulnerable_areas`.
- Fail closed when a descriptor is missing/not categorized as restoration; do not synthesize any command. All other worlds retain their existing two controls and three gauges; Civilization v2 stays on the source-level repaired housing rules.
- Expose **safely reachable sites**, **unsafe destination sites**, and **route-or-fuel barriers** computed from the active authoritative Atlas via unmodified `planRoute`, the existing hazard cap **70**, blocked-route graph and current expedition fuel. Memoize route computation to actual world/UI revisions, not animation frames. Do not label a site safe based solely on current hazard when a route/fuel constraint blocks it.
- Use the existing production command bus and success-event receipt handler; a failed receipt must never display success. User-triggered commands do not teleport, repair individual sites, alter historical evidence, or consume expedition supplies outside existing native behavior.
- Provide semantic accessible controls, keyboard focus, clear hazard data, 44px touch target and responsive mobile design.
- Do not suggest that native commands have costs the world does not implement. Text explicitly explains there is **no separately modeled expedition-supply debit**, and player must advance simulation ticks and inspect measured outcomes.

## Required verification

1. Unit tests select exact descriptors across all 15 worlds, reject missing/unknown native commands, verify three worlds only, and show route calculations are deterministic read-only projections.
2. Existing in-world field protocol/POI/traversal smoke stays intact; new Playwright test switches through G/H/I, verifies safety counters, clicks actual native actions, checks authoritative command-receipt evidence, advances one real simulation tick and checks for browser errors.
3. Historical ZIP restoration, determinism/branching, old Atlas v1, 45 default-stock investigations, 12 native scientific recovery trials, 3x5 v1 Civilization counterexamples, Civil v2 housing repair, isolated performance gate, typecheck, lint, build/dist, browser and public Pages smoke remain green.
4. No change to simulation physics, scientific-world plugin source, save schema, RNG, navigation thresholds, source archives, gameplay controls, assets, dependency lockfiles or worker runtime.

## Remaining known defects and limits

This is a **gameplay accessibility / control-surface improvement**, not a balance correction. All three affected worlds can again reach danger at later ticks if underlying native hazards recur. Paid field-site maintenance and its local supplies are still separate. No user-device FPS, mobile thermal, 2000-tick indefinite economic equilibrium or comprehensive AAA content breadth is proven by this work.

**Candidate status at authoring:** branch `arena/immersive-emergency-recovery-20261013`; CI, merge and post-release smoke pending.
