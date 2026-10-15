# Visual field bearing and native condition beacons — implementation contract

## Verified baseline and independent work

- Production `main`: PR #18 merge `7e792b3d4a79de24482b94a8659542b0fdaf9137`, [run 38648271565](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38648271565) verified validate, Pages deploy and public smoke. The earlier 180-tick result is a bounded paid-maintenance benefit, not an indefinitely sustainable economy.
- Independent candidate: PR #19 route-vantage and 720-tick finite-service diagnostic. This **visual gameplay branch** is not part of PR #19; do not cancel, amend, or weaken its evidence run.
- Scope: existing 15-world Three.js exploration loop, in-world site guidance, visual evidence of actual condition changes. No simulation model, site definition, command, route, resource, RNG, save, archive, or dependency mutation.

## What the player gains

1. The first-person explorer offers an optional **visual-only field bearing** to the nearest known, relevant Atlas contact. It reports facing direction and distance using the camera's actual movement basis. `Next site` cycles among recognized contacts; `Hide guide` returns to unguided exploration. The guide uses its own visible controls for mouse and touch and is never an expedition travel command.
2. Known visited damaged sites are prioritized for exploration. Existing ongoing survey contacts follow, with hazardous and already-resolved locations demoted. The destination list is a deterministic projection; camera motion cannot change the world or consume resources.
3. In the real Three.js scene, beacons now reflect the **latest authorized Atlas projection**, not only discovery stage: unsurveyed gray, detected signal accent, unsafe surveyed red, critical surveyed orange, damaged surveyed amber, stable accent, resolved gold. A resolved site's current unsafe hazard overrides its historic completion glow. Unknown sites must not disclose authoritative condition/hazard.
4. Real repair receipts on the existing command bus alter the authoritative site integrity. At the next render refresh, its marker material changes *because that integrity changed*, not because a button fired a cosmetic success animation.

## Exact invariants

- `fieldWaypoints`, `fieldBearing`, and `fieldBeaconState` are pure presentation helpers. No new persistent fields, action types, unsafe bypass, fake coordinates, telemetry sources or physical route claims.
- Project only `discovery !== UNKNOWN` into the selectable bearing target list. Early DETECTED labels must continue using `presentSite` redaction; hidden names, origins, and hazards never enter wayfinding.
- Scene positions, yaw, and distances are **presentation-space** and never imply validated travel cost or safety. The displayed distance is explicitly in **scene units**, because coordinates are normalized from multiple native world scales; it is NOT a literal metre measurement. Actual travel remains kernel-validated with hazard cap 70, native route fuel, supplies and tick-driven arrival.
- Native site condition and hazards are exposed visually only at discovery levels where the existing presentational contract permits them (SURVEYED onward).
- Every Three.js material created by this change must be disposed during scene teardown. One existing requestAnimationFrame loop and normal world-switch cleanup remain intact.
- Controls remain keyboard focusable and touch operable. Reduced-motion preferences are unaffected; bearing is static text, not flashing animation.
- Do not claim hardware FPS or absolute scene visual quality without real-device evidence.

## Targeted verification

- `src/test/fieldWayfinding.test.ts`: hidden-contact exclusion; priority; beacon redaction and state thresholds; heading correctness across yaw wrap; complete 15-world hash-preserving projection.
- `e2e/immersive.spec.ts`: real field guide toggle in a playable environment; all fifteen worlds retain a visible field bearing interface; actual visited real installation gets two native paid repairs and renderer-owned damaged beacon count decreases.
- All mandatory existing CI checks: historical ZIP/Atlas, typecheck, lint, unit, deterministic performance, 15-world default-stock+semantic acceptance, build/dist, 24/24 Playwright production-browser suite.
- The exact GitHub Actions result and any new negative test must be appended after execution. Do not represent this candidate as deployed before post-merge production validate, Pages deploy and public smoke finish.

## Known limits and excluded ideas

This is an orientation and feedback increment, not a semantic-content tripling, true world-wide sustainability, new economy, physics/navigation mesh, 15 authored signature set-piece completion, or native GPU performance certification. Revisit broader world identity and authored discoveries after this complete first-person navigation loop is demonstrably stable.
