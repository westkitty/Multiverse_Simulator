# Matched long-run maintenance economy lab — 2026-10-12

## Scope and baseline

- Source: `src/test/defaultBalance.test.ts`; branch `arena/maintenance-economy-lab-20261012`, starting from verified Pages release `82f1bee6d014bc7739a0546698d80dfdf155b7df` (PR #11).
- Reuse the existing default-stock, 36-site investigation acceptance journeys in **Civilization, Industrial, Megacity and Geology**, for seeds **1, 2026 and 424242**.
- At the same post-investigation tick and same full native kernel state/RNG, fork the completed expedition into an **unattended control** and a **player-maintained treatment**. Neither fork overwrites the authoritative world model.
- Run both to tick 2000. Treatment uses the existing validated `exploration.action` (`travel`, `repair`) and `expedition.resupply` command bus, constrained to one command per two ticks when stationary. Routes, discovery, local visit requirements, access hazards, fuel and supplies are obeyed; journeys advance through normal world ticks.
- Compare mean condition across 36 sites, count condition below 25/100 and hazards above 70/100, record accepted repair/travel/resupply counts, final expedition stock and idle servicing checks. Verify treatment ZIP/run-record restore and five further deterministic ticks.
- CI prints one `ECONOMY_LAB` log line per world/seed and emits `docs/acceptance/maintenance-economy.json` when `npm run test:acceptance` runs. Generated data do not become a new historical/golden oracle merely by being written.
- Assertions require no failed default expeditions, matched initial hashes, valid repair commands, treatment-specific nonzero measured improvement over its unattended control, and deterministic treatment continuation.

## What a pass establishes

A 2000-tick **active maintenance policy** can measurably improve some world condition without direct state surgery, fake resources or relaxed invariants. The trial can also reveal unsafe or inaccessible regions and exhausted service budgets. It does **not** certify an unattended sustainable world, 2000-tick all-site recovery, independence of native science from maintenance, an optimal maintenance policy, indefinite equilibrium or physical-device FPS.

## Protected boundaries

Do not change native scientific world plug-ins, kernel order, tick policy, RNG, save schema, historical/Atlas ZIP fixtures, native commands, original stock baselines, plugin-default balancing constants, simulation check budgets, or Playwright accessibility. Never weaken 15-world baseline acceptance or substitute visual prop/POI counts for observed mechanics.

## Promotion and remaining decision

Read the actual per-seed treatment/control traces and collapsed-site counts. If the four worlds remain economically unserviceable, identify *which* constraint is binding before proposing native balancing changes. A separate bounded implementation and matched re-test is required before calling any value a canonical balance fix.

**Initial authoring status (historical):** candidate test implementation; exact-head results were pending.


## Verified PR-head test evidence

Authoritative run: [38325861812](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38325861812), tested head `62e4f1ec9bf8bbc334abe3c187473d82a60f36df`; full validation and **20/20 browser tests passed**. After this documentation-only change, a new exact-head check is required.

| World | Seed | Control mean | Maintained mean | Condition gain | Repairs | Service trips | Sites <25: managed/control |
|---|---:|---:|---:|---:|---:|---:|---:|
| Civilization | 1 | 0.000 | 4.952 | +4.952 | 18 | 0 | 34/36 |
| Civilization | 2026 | 0.000 | 4.952 | +4.952 | 18 | 0 | 34/36 |
| Civilization | 424242 | 0.000 | 4.952 | +4.952 | 18 | 0 | 34/36 |
| Megacity | 1 | 17.981 | 22.664 | +4.683 | 27 | 21 | 26/27 |
| Megacity | 2026 | 18.055 | 22.245 | +4.191 | 25 | 21 | 26/27 |
| Megacity | 424242 | 18.003 | 22.088 | +4.085 | 25 | 19 | 26/27 |
| Industrial | 1 | 0.000 | 2.532 | +2.532 | 12 | 4 | 35/36 |
| Industrial | 2026 | 0.000 | 2.532 | +2.532 | 12 | 4 | 35/36 |
| Industrial | 424242 | 0.000 | 2.532 | +2.532 | 12 | 4 | 35/36 |
| Geology | 1 | 6.563 | 14.819 | +8.256 | 27 | 26 | 27/34 |
| Geology | 2026 | 7.622 | 11.631 | +4.009 | 16 | 8 | 28/31 |
| Geology | 424242 | 10.191 | 17.838 | +7.646 | 25 | 23 | 26/32 |

Each row comes from a `ECONOMY_LAB` receipt in the actual CI job log. All **12 maintained treatments used zero resupplies**. The last column is the count of sites under 25% condition in maintained/control (36 total sites). This is not a recovered/sustainable-world success: the high collapse counts remain product defects. No new persistent report artifact is claimed beyond the reproducible generator and CI log.

**Next discriminating experiment:** compare native scientific interventions and physical-route accessibility from the same endangered checkpoint, accounting for command resources and simulation response. Do not automatically loosen access gates or change native decay constants. 
