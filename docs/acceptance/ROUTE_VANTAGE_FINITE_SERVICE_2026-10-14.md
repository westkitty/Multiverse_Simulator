# Route-vantage and finite stock diagnostic (candidate)

Baseline: merged PR #18, `7e792b3d4a79de24482b94a8659542b0fdaf9137`, fully green production run [38648271565](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38648271565), including validation, Pages deployment, and public browser smoke.

## Question 1 — Megacity's four-site reachability discrepancy

The previous `safelyReachableSites` statistic calls the native route planner from each arm's *current expedition region and remaining fuel*. A paying expedition travels and spends fuel; the science-only expedition generally does neither. Therefore a -4 discrepancy alone does not prove the repaired world created hazardous or closed routes.

For the same end tick, compare science and paid maintenance under **one fixed source region and fuel budget**, plus infinite-fuel route safety, and diff native `regionHazards`, `blockedRoutes`, and per-site hazard. Retain the actual-position/actual-fuel count as a valid player-level statistic, but label it separately. Report destination IDs only in the non-public acceptance log. This test is observational and does not change gameplay.

## Question 2 — Native finite inventory after 180 ticks

Initial Megacity post-investigation expedition stocks in `docs/acceptance/default-balance.json`: seed 2026 fuel 461 and supplies 272 at tick 2005. The original 180-tick paid arm performed 66 repairs, costing 132 supplies, and zero resupplies. Stock exhaustion was not exercised.

Use one extra full-native Megacity seed-2026 three-arm-source-compatible diagnostic: two identical native science commands, then compare science-only and `planFieldService` paid treatment for **720 additional ticks**; at most one native paid action per two ticks, real travel/arrival, native supply and fuel deductions, no fabricated supply. Capture 180/360/540/720 checkpoints, resupply/repair/travel counts, stock totals, native route status under the same vantage, and exact saved-run five-tick deterministic continuation. Never assert that resupply *must* happen: record zero as a negative result and flag sustainability as unproven.

This is a bounded experiment, not 720-tick economic closure, 15-world balance certification, permanent recovery, or a change to the science budget. Do not change any plugin, the simulation kernel, RNG, save schema, route hazard cap (70), native resupply selector, or historical archive.

## Validation gate

Run the full existing `.github/workflows/deploy.yml` exact-head workload. Only PR candidate CI can establish these new observations. Do not claim this candidate is merged/deployed, or conclude that the Megacity discrepancy was a safety regression or a mere fuel artifact before reading its numeric route-vantage log.
