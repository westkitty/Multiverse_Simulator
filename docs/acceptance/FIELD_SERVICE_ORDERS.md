# Paid expedition service orders — player-facing repair loop

## Starting release and gap

Starting from `main` merge `a9c896521c5bdacd124652dc2d77f45653fd7913` (PR #15), verified by [main Actions run 38376436295](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38376436295) with successful validate, Pages deploy and public browser smoke. PR #15 exposed already-existing scientific recovery commands for Industrial, Megacity and Geology inside playable 3D and independently measured hazard-/fuel-bounded route access. It did **not** connect that discovery to the separate, **paid field-site repair** action.

The actual native game already supports repairs (+25 installation condition, costs two expedition supplies), route-limited journey departures, tick-driven arrival and stock transfer from visited local sites. However, players cannot see a clear, route-aware service target and perform these commands from the same in-world recovery panel without manually hunting for a matching site.

## Service order contract

- The projection is **read-only**. Only sites whose actual `firstVisitedTick` is non-null, whose `availableInteractions` contains `repair`, and whose measured condition is below 75% are eligible. Do not leak coordinates, identity, or condition of unvisited sites.
- Qualify targets through real destination hazard (maximum 70), the actual blocked-route graph, true navigation-region safety and expedition's **current available fuel** using the existing `planRoute`; never select a route from a visible prop, camera position or hazard-only counter.
- Sort safe sites deterministically: current region first, then fewest travel ticks, lowest site condition, finally stable ID. Report counts of previously visited damaged, safely reachable damaged, and currently blocked damaged installations.
- If the expedition is in transit, show the actual arrival tick and no action. If no eligible visited damaged site exists, explain why. If all are blocked, explain hazard/routes/fuel and point to the world science controls rather than bypassing native safety.
- A local repair is enabled only when at least two expedition supplies are actually available. Otherwise offer the game's real **resupply** command only if a visited local site has finite fuel/supply stocks; give an accurate blocked reason if not.
- A remote order issues the real `exploration.action=travel` through the existing preflight/dispatch path and charges actual route fuel; arrival advances only through fixed simulation ticks. Then the service order recalculates and can offer the native `repair`. **No auto-arrival, teleport, free repairs, fuel refill or new economic rule.**
- Keep explicit stock counters, service receipts and the distinct global scientific emergency command in one responsive, accessible in-world panel. Existing two native science controls, three measured gauges and the full 3D controller remain unchanged.

## Validation

- Unit: all 15 worlds start with no invented visited service targets; realistic survey/discover/travel creates one local repair order; a native repair increases authoritative condition and deducts exactly two supplies; persistence/replay remains deterministic. Synthetic **test-local cloned states** isolate resupply, depleted stock, blocked destination, transit and fuel-limited remote routes; projection never changes the actual kernel hash or save.
- Browser: in the real Three.js screen, the initial order has no fabricated target. Survey and discover the nearby site, initiate real expedition travel, tick until arrival, and click a paid two-supply repair; observe an actual native action receipt and no JS errors.
- Full project gates: historical ZIP/Atlas old oracles, deterministic engine/branches, all 45 default-stock runs, 12 scientific access comparisons, Civil v2 housing repair and old v1 counterexamples, unit tests, lint/typecheck, performance, build/distribution, all browser checks, then main validate → Pages deploy → **public smoke**.
- No changes to original simulation plugins, engine tick order, RNG, save schemas, route threshold, expedition economics, unrelated world behavior, 3D renderer or historical fixtures.

## Claim limitations

A working, costed visit/repair workflow does **not** establish a sustainably supplied player economy, all-site rehabilitation after 2000 ticks, repeated global-restoration resource costs, long-session performance or physical-device mobile usability. Region danger can recur; service may become unavailable while a journey is in progress or a safe route degrades. A fully balanced long-run rescue campaign remains an independent research and engineering requirement.

**Status when authored:** branch `arena/field-service-dispatch-20261013` candidate; PR CI, merge and main Pages publication unverified.
