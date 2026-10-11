> Historical pre-expansion document. Not current acceptance or performance evidence.

> **OMNIVERSE II status — 2026-10-11:** This is the verified **nine-world baseline**, not the requested fifteen-world expansion. Publication preparation is implemented, but Pages activation returned HTTP 403 and the public site is **not verified live**. See [release evidence and blockers](docs/RELEASE_EVIDENCE.md) and the [machine-readable baseline/targets](docs/expansion-manifest.json). The earlier “3×” figures below describe the previous expansion, not completion of OMNIVERSE II.
>
> Target URL: https://westkitty.github.io/Multiverse_Simulator/ (unverified). Administrator: **Settings → Pages → Build and deployment → Source → GitHub Actions**.

# Omniverse Engine — Nine-World Triple-Scale Procedural Simulation Platform

A deterministic, browser-native scientific observatory and procedural simulation engine featuring **9 fully realized simulation worlds** (10 including the PDK Thermal Lattice template), **triple spatial scale (3.0×)**, **triple functional content (≥3× scenarios, interventions, and telemetry metrics)**, **10 cross-world causal event adapters**, counterfactual timeline branching, controlled multi-seed experiments, and reproducible `.omniverse.zip` archive portability.

---

## 1. Nine-World Triple-Scale Expansion Summary (Before vs. After)

Every primary world is registered through the Plugin Development Kit (`src/core/pdk.ts` & `src/worlds/index.ts`), exposes machine-verifiable `scaleMetadata`, and passes deterministic replay, continuation, branch isolation, and no-op intervention proofs.

| World ID | World Name | Spatial / Playable Area (Before -> After) | Scale Factor | Scenarios (Before -> After) | Quick Interventions (Before -> After) | Telemetry Metrics (Before -> After) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `ecosystem` | **World A: The Living Ecosystem** | 16 zones (`3,600 m²`, 4×4 grid) -> **48 habitat zones (`10,800 m²`, 8×6 grid, 6 biomes)** | **3.0×** | 3 -> **9** | 7 -> **21** | 6 -> **18** |
| `station` | **World B: Modular Space Station** | 6 compartments (`1,270 m³`, 5 hatches) -> **18 compartments (`3,810 m³`, 24 hatches, 3 rings)** | **3.0×** | 3 -> **9** | 7 -> **21** | 6 -> **18** |
| `civilization` | **World C: Civilization** | 3 starting settlements (`1,600 km²`, 3 routes) -> **9 starting settlements + 6 frontier sites (`4,800 km²`, 16 trade routes)** | **3.0×** | 3 -> **9** | 8 -> **24** | 6 -> **18** |
| `atmosphere` | **World D: The Living Atmosphere** | 16 baseline cells (`4,800 km²`) -> **48 synoptic climate cells (`14,400 km²`, 8×6 grid) + tracked cyclonic vortices** | **3.0×** | 3 -> **9** | 6 -> **18** | 6 -> **18** |
| `ocean` | **World E: The Abyssal Ocean** | 16 baseline sectors -> **48 horizontal marine sectors × 3 depth zones (`144 volumetric ocean cells`) + mobile shoals/pods** | **3.0×** | 3 -> **9** | 6 -> **18** | 6 -> **18** |
| `celestial` | **World F: Celestial Mechanics** | 1 star system (6 bodies) -> **3 explorable star systems (`Helios Prime`, `Kepler Binary`, `Trappist Dwarf`) with 18 celestial bodies** | **3.0×** | 3 -> **9** | 6 -> **18** | 6 -> **18** |
| `megacity` | **World G: The Living Megacity** | 6 baseline districts (`180 km²`) -> **18 interconnected metropolitan districts (`540 km²`, 6×3 grid, 24 transit/utility corridors)** | **3.0×** | 3 -> **9** | 6 -> **18** | 6 -> **18** |
| `industrial` | **World H: The Industrial Network** | 6 baseline facilities -> **18 production/distribution nodes across 4 commodity tiers + 24 freight routes & active convoys** | **3.0×** | 3 -> **9** | 6 -> **18** | 6 -> **18** |
| `geology` | **World I: The Restless Planet** | 16 baseline crustal cells -> **48 geological cells across 6 tectonic provinces + 28 fault segments & volcanic chambers** | **3.0×** | 3 -> **9** | 6 -> **18** | 6 -> **18** |
| **Total** | **9 Primary Simulation Worlds** | **378 active spatial regions / 498 volumetric & network elements** | **3.0×** | **81 Scenarios** | **174 Interventions** | **162 Metrics** |

---

## 2. Overview of the Nine Simulation Worlds

### World A — The Living Ecosystem (`ecosystem`)
- **Spatial Scale**: 48 interconnected habitat zones (`8 × 6` grid spanning `120 m × 90 m = 10,800 m²`) across 6 biomes (`meadow`, `forest`, `wetland`, `highland`, `riparian`, `savanna`).
- **Causal Systems**: Solar/moisture hydrological cycle, lateral groundwater diffusion, flora logistic regeneration, herbivore/predator/decomposer foraging, metabolic aging, reproduction, migration, and carcass nutrient recycling.

### World B — Modular Space Station (`station`)
- **Spatial Scale**: 18 pressurized compartments (`3,810 m³`) arranged across a Central Spine, Port Habitation Wing, Starboard Science Wing, and Aft Engineering Ring connected by 24 bulkhead hatches.
- **Causal Systems**: Solar array generation, dual-reactor power bus, battery storage, priority load shedding, bulkhead pressure equalization, micrometeoroid hull breaches, O₂/CO₂ life-support scrubbing, thermal loops, and 12 autonomous crew members.

### World C — Civilization (`civilization`)
- **Spatial Scale**: 9 starting settlements plus 6 colonizable frontier sites (`15 total regional nodes`) spanning `4,800 km²` connected by 16 trade convoy corridors.
- **Causal Systems**: Seasonal river/aquifer hydrology, agrarian/industrial/research labor allocation, trade convoy dispatch, civic infrastructure depreciation, social stability, migration waves, and autonomous frontier founding.

### World D — The Living Atmosphere (`atmosphere`)
- **Spatial Scale**: 48 synoptic climate cells (`8 × 6` grid spanning `14,400 km²`) over ocean, coastal, plains, forest, desert, and mountain terrain, plus mobile cyclonic storm entities.
- **Causal Systems**: Latitudinal solar insolation, barometric pressure gradients, geostrophic + Coriolis wind vectors, neighbor heat & moisture advection, evaporation/condensation/precipitation, soil moisture/flooding, and cyclogenesis.

### World E — The Abyssal Ocean (`ocean`)
- **Spatial Scale**: 48 horizontal marine sectors stratified across 3 vertical depth zones (`Epipelagic 0–200 m`, `Mesopelagic 200–1000 m`, `Bathypelagic/Abyssal 1000–4000 m` = 144 volumetric ocean cells) plus mobile marine shoals and predator pods.
- **Causal Systems**: Surface wind gyres, deep thermohaline circulation (temperature + PSU salinity density gradients), Ekman coastal upwelling, marine snow export, phytoplankton-grazer-predator food webs, dissolved O₂ dynamics, coral bleaching, and anoxic dead-zone formation.

### World F — Celestial Mechanics (`celestial`)
- **Spatial Scale**: 3 explorable multi-body star systems (`Helios Prime`, `Kepler Binary`, `Trappist Dwarf`) containing 18 total stars, rocky planets, gas giants, ice giants, moons, and asteroid belts.
- **Causal Systems**: Keplerian orbital propagation with N-body secular resonance perturbations, stellar luminosity & coronal mass ejections (CMEs), planetary radiative equilibrium (`Teq`), greenhouse warming, volatile inventory, and astrobiological habitability index (`0–100`).

### World G — The Living Megacity (`megacity`)
- **Spatial Scale**: 18 interconnected metropolitan districts (`6 × 3` matrix covering `540 km²`) linked by 24 high-capacity transit and utility corridors.
- **Causal Systems**: Residential/commercial/industrial/green/transit/utility zoning, commuter flow & road congestion, public transit mode share, electrical grid dispatch & brownouts, municipal water/waste treatment, air quality index (`AQI`), housing affordability, and emergency response.

### World H — The Industrial Network (`industrial`)
- **Spatial Scale**: 18 interconnected production and logistics facilities linked by 24 freight corridors with active shipment convoys.
- **Causal Systems**: 4-tier commodity provenance (`Raw Ore & Hydrocarbons -> Refined Alloys & Polymers -> Precision Components -> Finished Goods`), dedicated power plants, automated warehouses, bottleneck propagation, equipment wear/breakdowns, and order backlog fulfillment.

### World I — The Restless Planet (`geology`)
- **Spatial Scale**: 48 active crustal cells (`8 × 6` grid) spanning 6 tectonic plates (`Pacific Oceanic`, `Cordilleran Arc`, `Craton Shield`, `Rift Basin`, `Subduction Trench`, `Hotspot Plateau`) and 28 fault segments.
- **Causal Systems**: Plate boundary convergence/divergence/transform shear, Mohr-Coulomb fault rupture & seismic wave propagation (`Mw`), elastic stress transfer (aftershocks), magma chamber pressurization & Plinian eruptions, orogenic uplift, fluvial erosion, and landslides.

---

## 3. Ten Cross-World Causal Event Adapters

Managed by `CrossWorldContractRegistry` (`src/core/crossWorldContract.ts`), allowing operators to translate causal events from any source world into physically grounded interventions in a target world with explicit unit conversion formulas, provenance tracking, and information-loss notes:

1. `adapter-eco-collapse-to-civ-famine`: **Ecosystem Trophic Collapse -> Civilization Agricultural Blight**
2. `adapter-stn-power-to-civ-tech`: **Space Station Orbital Power Beaming -> Civilization Harvest & Tech Surge**
3. `adapter-civ-industry-to-eco-climate`: **Civilization Industrial Fallout -> Ecosystem Thermal & Acid Stress**
4. `adapter-atm-monsoon-to-eco-restoration`: **Atmospheric Monsoon Precipitation -> Ecosystem Watershed Restoration**
5. `adapter-atm-heatwave-to-civ-drought`: **Atmospheric Blocking High Heatwave -> Civilization Aquifer Depletion**
6. `adapter-geo-eruption-to-atm-aerosol-cooling`: **Volcanic Plinian Eruption -> Atmospheric Stratospheric Aerosol Cooling**
7. `adapter-geo-quake-to-city-emergency`: **Tectonic Fault Rupture -> Megacity Infrastructure & Grid Emergency**
8. `adapter-ind-finished-goods-to-city-grid`: **Industrial Finished Equipment Shipment -> Megacity Clean Power Expansion**
9. `adapter-cel-flare-to-stn-scram`: **Celestial Stellar Superflare CME -> Space Station Avionics & Reactor SCRAM**
10. `adapter-ocn-upwelling-to-eco-fertility`: **Marine Coastal Upwelling -> Ecosystem Estuarine Nutrient Enrichment**

Incompatible or physically nonsensical world pairs are explicitly rejected with human-readable diagnostics.

---

## 4. Quick Start & Verification Commands

```bash
# Install dependencies
npm install

# Run strict TypeScript typecheck
npm run typecheck

# Run ESLint
npm run lint

# Run the complete 24-test automated verification suite (all 9 worlds + 174 interventions)
npm test

# Build production bundle
npm run build

# Start live development server (bound to 0.0.0.0:5173)
npm run dev
```

### Local Phase 1 continuation

Reusable exploration contracts and mechanics are now implemented and tested in `src/exploration/`: deterministic socket placement, discovery states, fuel-limited tick travel, evidence-gated investigations, repairs, resource recovery and branch-owned history. **Not yet integrated into the nine production worlds or UI.** No new production POIs/worlds are claimed. See [scope, proof and limitations](docs/EXPLORATION_CONTRACTS.md). This merged session supports local work only; subsequent pushing/publishing requires a new coding session.
