# Omniverse Engine — System Architecture

## 1. Architectural Principles

1. **Strict Authoritative Separation**:
   - The simulation engine (`src/core/`) and all 9 world plugins (`src/worlds/`) are pure, deterministic TypeScript modules with zero React or Three.js dependencies.
   - All random decisions flow exclusively through named `SeededRng` Mulberry32 streams (`src/core/rng.ts`) serialized in every snapshot.
   - No `Math.random()`, `Date.now()`, or renderer frame timing ever enters authoritative state calculation.

2. **Phase-Accurate Fixed-Timestep Execution (`SimulationKernel`)**:
   - Each tick advances through a deterministic pipeline:
     1. `pre_step` queued operator commands
     2. Ordered world systems (`systems.sort((a, b) => a.order - b.order)`)
     3. `post_step` queued commands
     4. Metric extraction (`extractMetrics`)
     5. Canonical FNV-1a 64-bit state hashing (`hashCanonicalState`)
     6. Automatic checkpoint capture & bounded telemetry retention

3. **Plugin Development Kit (`src/core/pdk.ts`) & `WorldScaleMetadata`**:
   - Every world is defined via `defineWorldPlugin(plugin)` and registered in `globalPluginRegistry` (`src/worlds/index.ts`).
   - Each world declares machine-verifiable `scaleMetadata`:
     - `baselineSpatialUnits` vs. `expandedSpatialUnits` (`scaleFactor >= 3.0`)
     - `spatialUnitLabel`, `playableAreaBefore`, `playableAreaAfter`
     - `baselineScenarios`, `baselineInterventions`, `baselineMetrics`
   - `verifyWorldPluginContract(plugin)` proves determinism, snapshot round-trip continuation, counterfactual branch isolation, and command validation.

---

## 2. Nine-World Domain Architecture

| World ID | Module Path | Primary Spatial Representation | Ordered Causal Systems |
| :--- | :--- | :--- | :---: |
| `ecosystem` | `src/worlds/ecosystem/ecosystemPlugin.ts` | 48 Habitat Zones (`8×6` grid, 6 biomes) + mobile organism agents | 4 ordered systems (Hydrology -> Flora -> Fauna Foraging/Migration -> Carcass Decomposition) |
| `station` | `src/worlds/station/stationPlugin.ts` | 18 Pressurized Compartments (`3,810 m³`) + 24 bulkhead hatches + 12 crew | 4 ordered systems (Power/Solar/Reactor Bus -> Pressure/Breach Equalization -> O₂/CO₂/Thermal -> Crew Tasking) |
| `civilization` | `src/worlds/civilization/civilizationPlugin.ts` | 9 Starting Settlements + 6 Frontier Sites + 16 Convoy Routes | 4 ordered systems (Hydrology/Seasons -> Production/Research -> Trade Convoys -> Stability/Migration/Founding) |
| `atmosphere` | `src/worlds/atmosphere/atmospherePlugin.ts` | 48 Synoptic Climate Cells (`8×6` grid) + tracked Cyclonic Storms | 4 ordered systems (Radiative/Pressure -> Geostrophic Wind & Advection -> Moisture/Clouds/Rain -> Cyclogenesis) |
| `ocean` | `src/worlds/ocean/oceanPlugin.ts` | 48 Horizontal Sectors × 3 Depth Zones (`144 cells`) + mobile Shoals/Pods | 4 ordered systems (Gyres/Thermohaline -> Upwelling/Nutrients -> Trophic Food Web -> Oxygen/Coral/Pollution) |
| `celestial` | `src/worlds/celestial/celestialPlugin.ts` | 3 Star Systems (`Helios`, `Kepler Binary`, `Trappist`) with 18 Bodies | 4 ordered systems (Keplerian Propagation -> Secular Perturbations -> Stellar Flux/Flares -> Energy/Habitability) |
| `megacity` | `src/worlds/megacity/megacityPlugin.ts` | 18 Metropolitan Districts (`6×3` matrix) + 24 Transit/Utility Corridors | 4 ordered systems (Commuting/Congestion -> Grid/Water/Waste -> AQI/Heat Island -> Housing/Vitality/Emergencies) |
| `industrial` | `src/worlds/industrial/industrialPlugin.ts` | 18 Supply-Chain Nodes (4 Tiers) + 24 Freight Corridors + Convoys | 4 ordered systems (Power/Equipment Health -> Extraction/Refining/Assembly -> Freight Convoys -> Demand/Backlogs) |
| `geology` | `src/worlds/geology/geologyPlugin.ts` | 48 Crustal Cells (`8×6` grid, 6 Plates) + 28 Fault Segments | 4 ordered systems (Tectonic Loading -> Mohr-Coulomb Rupture & Waves -> Magma/Volcanism -> Erosion/Landslides) |

---

## 3. Cross-World Causal Event Translation (`src/core/crossWorldContract.ts`)

`CrossWorldContractRegistry` registers 10 versioned adapters connecting all 9 worlds:
- Each adapter specifies `sourceWorldId`, `sourceEventTypes`, `targetWorldId`, `targetCommandType`, `requiredUnits` (explicit physical unit conversion formulas), and `informationLoss`.
- `previewTransfer(event, sourceWorldId, targetWorldId)` validates compatibility and returns a full preview of the translated command, payload, and provenance before execution.

---

## 4. Three.js 3D Viewport & 2D SVG Fallback (`src/renderers/ThreeWorldViewport.tsx`)

- **Auto-Fit Camera Scaling**: Automatically computes the bounding box of all zones and entities (`maxSpan`) so triple-scale 48-cell grids, 18-compartment orbital stations, and 3-star-system orbital basins frame cleanly on load and via the **Fit World** button.
- **Layer Visibility Toggles**: Operators can independently toggle `Zones`, `Entities`, `Links`, and `Labels` in both 3D WebGL and 2D SVG Schematic modes.
- **Color-Independent Accessibility**: Every node and entity badge pairs color with a distinct status glyph (`✓` nominal, `⚠` warning, `✖` critical) and exposes a synchronized keyboard-navigable `AccessibleStateTable`.
