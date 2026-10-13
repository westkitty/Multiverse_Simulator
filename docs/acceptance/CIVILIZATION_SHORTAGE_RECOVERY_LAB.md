# Civilization famine-recovery experiment — paired evidence protocol

## Verified baseline

Main commit `75b6ce48d826839c3b1741d9d2b18f73573b2794`, PR #13. GitHub Actions [38332677659](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38332677659) passed validation, deployed to Pages, and ran **20/20 public browser smoke tests**. Three fixed seeds of authentic tick-2005 Civilization all have **0/36 safely reachable sites**. A two-pulse civic jubilee gives +33 regional hazard reduction immediately, but the benefit is gone at +30 ticks. All 36 site targets stay unsafe.

## Hypothesis

Native population/food/water shortages repeatedly subtract 6–18 stability points/tick, while jubilee improves stability without feeding anyone. Test existing recovery sequences *without* changing travel thresholds, food consumption, simulation multipliers, RNG, save format, or production world plug-ins.

## Real-command recovery arms

Every arm forks exactly the same fully serialized native Civilization checkpoint from the existing complete 36-site default-stock investigation and its 2,000-tick idle continuation, for seeds 1, 2026 and 424242. Each receives ordinary plugin-owned commands via the real command bus, with no direct state mutation.

| Arm | Existing commands |
|---|---|
| Civic stability only | 2 × Commonwealth Jubilee |
| Emergency bridge | 1 × +95 food/water famine relief, 1 × Jubilee |
| Production-only | +1 waterworks, +1 farms, crop rotation and aquifer/soil enrichment |
| Relief to production | +95 famine relief, waterworks, farms, soil enrichment, Jubilee |
| Repeated uncosted relief (positive control, NOT a balance fix) | +95 famine relief at offsets 0, 30, 60, 90 |

Compare identical untreated control/treatment arms at offsets +6, +30 and +120 native ticks. Record **actual safe route access (of 36), hazardous site targets, native regional stability/hazard, shortage-count, food and water inventories, food and water production/consumption, material stocks, population and site integrity**. Verify exact record hash and five further deterministic ticks for every arm. Report 15 trial rows across three seeds as `CIVILIZATION_SHORTAGE_RECOVERY` receipts and emit `docs/acceptance/civilization-shortage-recovery.json` when acceptance tests run.

## What counts as a repair

- An immediate food increase is not proof that agriculture has recovered.
- Temporary route reopening is not proof it stays open 120 ticks later.
- Free emergency airlifts are explicitly a **NON-ECONOMIC positive control**. Repeatable free food/water creation cannot certify an affordable sustainable gameplay loop.
- A genuine persistent recovery candidate must have a positive safety/reachability margin at +120, active autonomous production relative to consumption, low shortage recurrence, and a justified cost/constraint model.
- A negative result must leave canonical world parameters and route limits unchanged. Follow it with a narrower root-cause repair instead of hiding the failure.

## Protected

Historical ZIP fixtures, 15 worlds, scientific plugins, simulation kernel, RNG, worker, fixed-step determinism, default starting resources, native navigation gates, published 3D gameplay, storage and branching, browser/mobile controls, environment configuration, dependency lockfiles, GitHub Pages and performance gates.

**Current status:** candidate instrumentation only. Exact PR-head CI, observed treatment results, merge and deployment pending.
