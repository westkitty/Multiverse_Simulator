# Civilization housing-capacity stability v2 — bounded repair contract

## Root cause (verified source and controlled counterexamples)

PR #14's first, exact-head diagnostic [38338127190](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38338127190) passed acceptance and 20/20 candidate browser checks. Fifteen controlled late-life recovery rows across three seeds all had large food/water reserves (over 800,000 units each at +120), zero shortage streaks, mean stability stuck at **10/100**, and 0/36 safely reachable sites. Only two Jubilee commands reopened 36/36 at +6, collapsing back to 0/36 by +30. Food relief, extra production infrastructure and even repeated no-cost airlifts did **not** resolve the long-term stability defect.

Native Civilization system `civ_3_consumption_demographics_and_shortages` computes population growth with `housingRoom = max(0, housingCapacity - population)` and clips growth to that room. It then treats **population exactly equal to housing capacity** as overcrowded (`population >= housingCapacity ? -1.5 : +1.8`) and subtracts stability every simulation tick even when demand is satisfied. This conflates full, adequately housed occupancy with actual overcrowding and yields a permanent unsafe-world trap.

## Proposed production correction: Atlas v2 only

1. Add an **explicit opt-in** `defaultAtlasVersion: 2` to the already-existing `withNativeAtlas` factory, used **only** by the Civilization plugin. Other fourteen worlds remain at Atlas v1.
2. New Civilization runs and authored scenario configs use persisted `atlasVersion:2`; saved Civilization `atlasVersion:1` configs are still validated, restored, simulated and replayed under their original rules.
3. In the *original Civilization demographics system*, use zero crowding stability drift when **at exactly housing capacity** and `atlasVersion===2`; retain the original negative pressure for actual population **above** capacity, the original positive drift for **below** capacity, and all shortage-driven penalties.
4. Do **not** migrate, rewrite, or silently retune existing saved worlds. New v2 sessions get the correction; v1 recorded simulations stay reproducible as recorded.
5. Protect the historical pre-refuge Atlas compatibility oracle by forcing the archived Civilization fixture generator to request the original `atlasVersion:1`. This is an explicit compatibility scenario, not a weakening of its hash comparison.

## Acceptance conditions

- Historical baseline ZIPs and nine pre-refuge Atlas continuation hashes match exactly; existing v1 initial states, loaded archives and deterministic continuation remain valid.
- A dedicated v1/v2 matched-seed contract test confirms new Civilization defaults use v2, other fourteen plugins remain v1, legacy v1 and modern v2 archives restore deterministically, and correctly housed full-capacity settlements have better stability than v1.
- The **real** full 45-run default-stock expedition acceptance remains green, with new Civilization at tick 2005 retaining at least 30/36 safely reachable sites without force-mutating routes or supplies.
- The original Civilization shortage-recovery study is preserved as an explicit v1 controlled experiment (3 seeds × 5 policies) rather than mistaking a healthy v2 run for the legacy incident.
- Complete typecheck, lint, unit tests, isolated performance, semantic/default-stock/historical acceptance, build, distribution and desktop/mobile browser verification all pass at the exact final PR head.
- No new state fields, resource injections, UI cheats, altered navigation threshold, worker changes, runtime dependency, or unrelated model modifications.

## Risks and evidence limits

This fix changes the evolution of **new** Civilization Atlas v2 runs and is **not** a replay-neutral rewrite of previous v1 simulations. It corrects the specific full-capacity pressure defect; real shortages and true overcapacity can still legitimately destabilize settlements. It does not prove every long-run economic equilibrium, player-resource budget, physical-device performance, 3× narrative breadth or stability of indefinitely long simulations.

**At authoring:** candidate source changes, exact-head CI and public release not yet verified.
