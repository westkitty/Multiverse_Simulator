# Closed-loop native recovery and paid maintenance — paired 180-tick laboratory

## Baseline

- Source: `main` commit `8f4e3569faaf80b8d2492c5eb8f9fd4d67cae8cd` (PR #17), fully green GitHub Actions [38400343670](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38400343670): validate, deploy, and 24/24 live public browser tests.
- The 3D interface already has native emergency restoration in Industrial, Megacity and Geology, plus player-owned read-only service order triage for previously visited damaged installations. It spends expedition supplies, real fuel, and locally transferable finite inventories.
- Previous matched PR #12-14 trials established isolated site maintenance and short-lived science access. **No prior trial showed the complete science → safe travel → paid repair chain operating on the same exhausted world.**

## Contract

From each actual default-stock 36-site investigation state continued to tick 2005, in Civilization v2, Industrial, Megacity, and Geology (seeds 1, 2026, 424242), fork three identical run records with the same state hash and RNG:

1. **Unattended control:** no further player intervention.
2. **Scientific-only:** apply the original plugin's authored restoration command twice on successive native ticks, then no player service.
3. **Scientific + paid service:** apply the identical two native commands, verify the resulting state hash matches the science-only arm, then at most one player service command per two ticks when not in transit. Call the **same** `planFieldService()` used by the live 3D deck. Issue only its authorized native `resupply`, `travel` or `repair` command and validate command receipts.

Both science arms and the control advance identical native fixed steps. Compare all three arms at +30, +90 and +180 ticks after restoration: safely reachable sites, mean regional hazard, mean site condition, sites below 25/75, visited damaged sites, serviceable vs blocked site counts, hazardous/closed/fuel-constrained routes, in-transit state, actual expedition fuel/supplies, and total site fuel/supplies.

For every paid service action, enforce native invariants: **exactly two expedition supplies debited per repair**, positive at-most-25 site-condition restoration, **exact route fuel debit** for travel, and at-most-10 fuel/supplies transferred from the first visited local stock source without duplication. Use normal arrival ticks; never teleport, fake visits, reveal unknown sites, bypass hazard 70, replenish global stocks, alter native simulation constants, or change the authoritative state directly.

Record command counts and blockers. Verify each treatment's save hash and deterministic five-tick continuation. The `CLOSED_LOOP_SUSTAINMENT` CI log line per world/seed is the compact human receipt; the `docs/acceptance/closed-loop-sustainment.json` generator output is a noncanonical diagnostic, not a historical golden fixture.

## Pass, limitation and next decision

- A passing acceptance run proves that the tested issued commands obeyed the native ledger and remained deterministic. It does **not** by itself prove positive conditions, complete site recovery, true autonomous upkeep, or indefinite economic sustainability. Inspect treatment/control **numeric results** before recommending new game balance or UI changes.
- Native global scientific commands themselves currently lack a finite world-level cost. The study measures **finite paid local service** conditional on a scientifically restored world, **not** an economically closed system. A future global-science budget must be separately designed, tested, and versioned if justified.
- The 180-tick result is a measured bounded window only, with three seeds and the 4 identified vulnerable worlds. Other eleven worlds, true long-run equilibria and physical mobile/device FPS are outside this specific proof.
- A negative result leaves canonical gameplay unchanged. Never loosen tests, route safety or resource budgets to make treatment appear successful.

**Status on authoring:** candidate test protocol and source changes; exact-head CI, observed results, merge and public release pending.

## Verified candidate measurements (before this evidence-only commit)

- Exact tested source head: `b3145d57abf120438598ebce19be81f9381222c2`; [GitHub Actions run 38460671911](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38460671911) **PASS** for typecheck, lint, historical ZIP/Atlas fixtures, unit, deterministic performance, 15-world default-stock/semantic acceptance including twelve new trials, build/distribution, and **24/24 candidate browser tests**.
- An earlier run failed a *strict floating-point test equality* at fractional site condition (+25 repair arithmetic); the test now checks the expected native repair debit and condition gain within ±1e-6 and emits specific values for a genuine mismatch. Native repair code, cost, limits and outcome were NOT changed.

| World / three seeds | Science-only mean condition | Science + paid service mean | Repairs / travel / supplies used | Sites below 25%: science → paid service |
|---|---|---|---|---|
| Civilization v2 | 86.183 | 88.266 | 3 / 2 / 6 (each) | 0 → 0 |
| Megacity | 17.880 / 17.954 / 17.902 | 61.776 / 61.190 / 59.007 | 67/20/134, 66/17/132, 63/16/126 | 27 → 11 / 11 / 12 |
| Industrial | 0.000 | 42.143 | 63 / 15 / 126 (each) | 36 → 20 |
| Geology | 6.303 / 7.444 / 9.867 | 54.765 / 55.811 / 57.626 | 70/19/140, 70/18/140, 69/19/138 | 34/32/32 → 15/14/13 |

- At tick +180, safely reachable sites: Civilization v2 untreated/science/paid **36/36**; Industrial **0/36 vs 36/36 vs 36/36**; Geology untreated **8/1/6**, science **36/36**, paid **36/36**; Megacity untreated **3/3/0**, science **11/15/11**, paid **15/11/11** for seeds 1, 2026, 424242 respectively. Megacity seed 2026 **lost four safely reachable sites** in the paid treatment relative to science-only, even as paid service improved mean condition. This is a meaningful unresolved access regression/interaction; do not hide it.
- **All twelve active treatments recorded zero local resupply commands** during the 180-tick window; the supplied expedition inventories were sufficient. Costed local repair succeeded and was recorded, but closed-loop local resource replenishment and the economically uncosted global science actions were **not** established sustainable. Geology travel in these runs cost zero fuel under the existing native route data; no fuel was fabricated by the test.

**Result verdict:** **PASS** for actual paid service command receipts/finite debit, positive local-condition benefit, 12 matched simulations, exact save continuation and existing regression suite. **NOT CERTIFIED** for indefinite upkeep, all-site recovery, every-region travel safety, balanced scientific intervention cost, hardware performance, or the 2000-tick post-intervention economy. Latest-world scientific model and traversal mechanics remain unchanged by this test.

**Next bounded question:** whether an economic budget for scientific rescue and repeated stock replenishment can be demonstrated under long-run native wear, and why Megacity seed 2026 lost safe route access during active service. No default physics, save schema, or hazard threshold shall change without a new isolated validated treatment/control study.

**Status when appended:** PR #18 source result verified at `b3145d57`; documentation-only head revalidation, merge and final Pages/public smoke still pending.
