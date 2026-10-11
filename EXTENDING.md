# Extending OMNIVERSE II

## Use the real PDK contract

Start with `WorldPlugin<TConfig,TState>` in `src/core/contracts.ts`, `defineWorldPlugin` in `src/core/pdk.ts`, and the Thermal Lattice template. Source types—not historical prose—are authoritative for required fields and signatures.

Implement strict configuration validation, seeded initialization, ordered systems, commands, metrics, entity inspection, render extraction, and owned serialization/deserialization. Provide meaningful scenarios, quick interventions, metric definitions, model documentation and explicit simplifications. Register a new selectable world once in `src/worlds/index.ts`.

Never use wall clocks, `Math.random`, React state, camera visibility or renderer interpolation to drive authoritative physics. Use named RNG streams and deterministic rounding where required. Preserve IDs and saved-state compatibility; introduce explicit migrations or explain version limits rather than silently reinterpreting an archive.

## Frontier or native Atlas integration

- A new frontier domain can provide a `DomainSpec` in `src/worlds/frontiers/domains.ts`; it must supply genuinely distinct equations and field units, not only different labels/colors. `makeFrontierPlugin` supplies lifecycle and expedition plumbing.
- A native plugin can be integrated through `withNativeAtlas`, with a domain profile mapping real collections/fields/conditions. If adding territory, expand collections used by physics and remap every physical link. Do not satisfy area targets by changing metadata or camera coordinates.
- Distinguish initial functional scale from the expanded scale. Count actual state and proof categories; never sum actors, links and sites into an inflated content total.

## Adding sites and facilities

Define facts, initial state, evidence rules, available interactions and presentation using `src/exploration/contracts.ts`. `population.ts` supports deterministic socket/tag/clearance placement. Reuse owned transaction handling in `engine.ts`; never mutate the input before all validations succeed.

Bind measurements to a real simulation field and unit. Document where a generated historical claim differs from observed data. Keep hidden facts out of accessible names as well as visual text. Test prerequisite ordering, unknown/remote rejection, exhausted stocks, duplicate evidence, exhausted reserves, failed routes, restore/branch independence and command replay.

Existing facility roles cover supply transfer, local scans, salvage, refuge provisions, finite extraction, route reopening, workshop repair, processing, archive records, relays, containment and fuel generation. These shared mechanics are not permission to count arbitrary names as independently functional archetypes. Add domain-specific behavior and corresponding consequence tests where the concept requires it.

Autonomous actors must consume/produce/transport or maintain authoritative state, not merely increment animation counters. Cargo should have an origin, resource accounting and a destination; offscreen actors must use the same rules.

## Cross-world adapters

Register with `defaultCrossWorldRegistry` only for scientifically coherent experimental transfers. Declare source event/schema, finite fields and units, target command, conversion limits, provenance and information loss. Preview must not mutate either run. Verify rejection of incompatible worlds/events and application on a target branch without altering the source.

## Verification checklist

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:dist
npm run test:browser
```

Extend `currentInventory.test.ts` with actual collections and explicit PASS/FAIL/UNVERIFIED categories. Preserve `docs/expansion-manifest.json` as frozen intake evidence. Test multiple seeds, baseline and expanded scales, bounded long runs, all interventions against controls, exact continuation, failed imports, legacy records and accessible fallback.

For exact-tick assertions use individual `kernel.step()` calls; production batches intentionally have a responsiveness deadline. Record CPU/FPS/memory measurements with environment and method—never infer browser FPS from CPU step timings.

The deployment workflow is gated for main/manual runs, not PR publication. A successful build or workflow definition does not activate Pages or prove the deployed simulator works. Use the administrator handoff and live-verification checklist in `README.md` when permissions are unavailable.
