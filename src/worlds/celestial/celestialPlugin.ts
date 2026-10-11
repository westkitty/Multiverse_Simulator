import { z } from 'zod';
import {
  clampDet,
  EntityInspection,
  RenderConnectionVisual,
  RenderEntityVisual,
  RenderFrameData,
  RenderZoneVisual,
  roundDet,
  SimulationCommand,
} from '../../core/contracts';
import { defineWorldPlugin } from '../../core/pdk';

const SOLAR_CONSTANT_WM2 = 1361;

export interface CelestialConfig extends Record<string, unknown> {
  stellarLuminosityMultiplier: number; // 0.3 .. 2.5
  gravitationalCouplingStrength: number; // 0.1 .. 2.5
  timeStepYearsPerTick: number; // 0.02 .. 0.5
  greenhouseForcingMultiplier: number; // 0.4 .. 2.5
  stellarFlareFrequency: number; // 0.0 .. 2.0
  focusStarSystem: 'all' | 'solara' | 'kepler' | 'trappist';
}

export interface StarSystemCluster {
  id: 'solara' | 'kepler' | 'trappist';
  name: string;
  spectralType: string;
  centerOffset: [number, number, number];
  stellarMassSolar: number;
  luminositySolar: number;
  surfaceTempK: number;
  flareActivityIndex: number; // 0..100
  habitableZoneInnerAu: number;
  habitableZoneOuterAu: number;
}

export interface CelestialBody {
  id: string;
  name: string;
  systemId: 'solara' | 'kepler' | 'trappist';
  bodyClass: 'star' | 'terrestrial' | 'ocean_world' | 'gas_giant' | 'ice_giant' | 'icy_moon' | 'comet_rogue';
  massEarth: number;
  radiusEarth: number;
  semiMajorAxisAu: number;
  eccentricity: number; // 0 .. 0.85
  inclinationDeg: number;
  orbitalPeriodYears: number;
  meanAnomalyRad: number;
  trueAnomalyRad: number;
  currentRadiusAu: number;
  orbitalVelocityKms: number;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  albedo: number; // 0.05 .. 0.85
  greenhouseOpticalDepth: number; // 0 .. 4.0
  incidentFluxWm2: number;
  equilibriumTempK: number;
  surfaceTempK: number;
  atmospherePressureBar: number;
  tidalHeatingWm2: number;
  habitabilityIndex: number; // 0 .. 100
  orbitalStabilityIndex: number; // 0 .. 100
  color: string;
}

export interface CelestialState {
  nextBodyId: number;
  systems: StarSystemCluster[];
  bodies: CelestialBody[];
  activeSystemFilter: 'all' | 'solara' | 'kepler' | 'trappist';
  elapsedSimYears: number;
  cumulativePerturbationEvents: number;
  cumulativeFlareEvents: number;
  lastFlareEventId: string | null;
  lastResonanceEventId: string | null;
}

const celestialConfigSchema = z.object({
  stellarLuminosityMultiplier: z.number().min(0.2).max(3.0),
  gravitationalCouplingStrength: z.number().min(0.05).max(3.0),
  timeStepYearsPerTick: z.number().min(0.01).max(0.5),
  greenhouseForcingMultiplier: z.number().min(0.2).max(3.0),
  stellarFlareFrequency: z.number().min(0).max(2.5),
  focusStarSystem: z.enum(['all', 'solara', 'kepler', 'trappist']),
});

function recomputeStarHabitableZone(sys: StarSystemCluster): void {
  const lum = Math.max(0.01, sys.luminositySolar);
  sys.habitableZoneInnerAu = roundDet(Math.sqrt(lum / 1.1), 3);
  sys.habitableZoneOuterAu = roundDet(Math.sqrt(lum / 0.53), 3);
}

function updateBodyPhysicsAndPosition(
  body: CelestialBody,
  sys: StarSystemCluster,
  greenhouseMult: number,
): void {
  if (body.bodyClass === 'star') {
    body.x = sys.centerOffset[0];
    body.z = sys.centerOffset[2];
    body.prevX = body.x;
    body.prevZ = body.z;
    body.currentRadiusAu = 0;
    body.orbitalVelocityKms = 0;
    body.equilibriumTempK = sys.surfaceTempK;
    body.surfaceTempK = sys.surfaceTempK;
    body.habitabilityIndex = 0;
    body.orbitalStabilityIndex = 100;
    return;
  }

  const a = Math.max(0.04, body.semiMajorAxisAu);
  const e = clampDet(body.eccentricity, 0, 0.85);
  body.orbitalPeriodYears = roundDet(
    Math.sqrt(Math.pow(a, 3) / Math.max(0.08, sys.stellarMassSolar)),
    4,
  );

  // First-order eccentric anomaly approximation: E ≈ M + e*sin(M) + 0.5*e^2*sin(2M)
  const M = body.meanAnomalyRad;
  const E = M + e * Math.sin(M) + 0.5 * e * e * Math.sin(2 * M);
  const nu =
    2 *
    Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2),
    );
  body.trueAnomalyRad = roundDet(nu, 4);

  const rAu = (a * (1 - e * e)) / Math.max(0.15, 1 + e * Math.cos(nu));
  body.currentRadiusAu = roundDet(rAu, 4);

  // Vis-viva orbital velocity (Earth @ 1 AU around 1 M_sun ≈ 29.78 km/s)
  const vKms = 29.78 * Math.sqrt(sys.stellarMassSolar * Math.max(0.05, 2 / rAu - 1 / a));
  body.orbitalVelocityKms = roundDet(vKms, 2);

  // Map orbital radius into visual scene coordinates around sys.centerOffset
  const visualRadius = 2.6 + Math.sqrt(rAu) * 7.8;
  body.x = roundDet(sys.centerOffset[0] + Math.cos(nu) * visualRadius, 2);
  body.z = roundDet(sys.centerOffset[2] + Math.sin(nu) * visualRadius, 2);

  // Stellar flux & planetary energy balance
  const flux = (SOLAR_CONSTANT_WM2 * sys.luminositySolar) / Math.max(0.002, rAu * rAu);
  body.incidentFluxWm2 = roundDet(flux, 1);

  // Equilibrium temperature: T_eq = 278.5 * (L * (1 - A) / r^2)^(1/4)
  const absorbedRatio = Math.max(0.01, (sys.luminositySolar * (1 - body.albedo)) / Math.max(0.002, rAu * rAu));
  const tEq = 278.5 * Math.pow(absorbedRatio, 0.25);
  body.equilibriumTempK = roundDet(tEq, 2);

  // Tidal heating on eccentric close-in orbits
  const tidal =
    e > 0.02
      ? clampDet((e * e * sys.stellarMassSolar * 18) / Math.pow(Math.max(0.08, a), 3), 0, 85)
      : 0;
  body.tidalHeatingWm2 = roundDet(tidal, 2);

  const ghWarmingK =
    body.greenhouseOpticalDepth *
    greenhouseMult *
    18.5 *
    clampDet(Math.sqrt(Math.max(0.05, body.atmospherePressureBar)), 0.1, 3.0);
  body.surfaceTempK = roundDet(tEq + ghWarmingK + tidal * 0.45, 2);

  // Habitability Index (liquid water window 265K..320K, rocky/ocean/moon class, moderate atmosphere, low eccentricity)
  if (body.bodyClass === 'gas_giant' || body.bodyClass === 'ice_giant') {
    body.habitabilityIndex = 0;
  } else {
    const tempScore = Math.max(0, 100 - Math.abs(body.surfaceTempK - 288) * 2.1);
    const atmScore =
      body.atmospherePressureBar >= 0.2 && body.atmospherePressureBar <= 6.0
        ? 100
        : Math.max(0, 60 - Math.abs(body.atmospherePressureBar - 1.0) * 15);
    const eccPenalty = e * 65;
    const flarePenalty = sys.flareActivityIndex * 0.22;
    body.habitabilityIndex = roundDet(
      clampDet(tempScore * 0.65 + atmScore * 0.35 - eccPenalty - flarePenalty, 0, 100),
      2,
    );
  }
}

export const celestialPlugin = defineWorldPlugin<CelestialConfig, CelestialState>({
  id: 'celestial',
  name: 'World F — Celestial Mechanics',
  subtitle: 'Multi-Star Orbital Dynamics, Secular Perturbations & Planetary Habitability',
  version: '2.0.0',
  schemaVersion: 1,
  accentColor: '#a855f7',
  description:
    'Interactive planetary-system and astrobiology laboratory modeling 3 explorable star systems and 18 celestial bodies with Keplerian + secular perturbation trajectories, vis-viva orbital velocities, stellar radiation flux, greenhouse energy balance, tidal heating, and circumstellar habitable zones.',
  physicalModelDocumentation: [
    '3 Star System Clusters (Solara G-Type, Kepler-Borealis K-Type, Trappist-Cygnus M-Dwarf) hosting 18 total celestial bodies (3x the 1-system / 6-body baseline).',
    'Documented Orbital Approximation: Solves Kepler’s equation M = E - e*sin(E) via second-order series expansion with vis-viva velocity v = sqrt(mu*(2/r - 1/a)) and secular giant-planet eccentricity coupling.',
    'Planetary Radiative Energy Balance: Incident flux S = S_0 * L / r^2; Equilibrium temperature T_eq = [S*(1 - A)/(4*sigma)]^(1/4), augmented by optical-depth greenhouse warming and eccentric tidal dissipation.',
  ],
  simplifiedMechanicsNote:
    'Uses bounded Keplerian elements with secular pairwise perturbation impulses rather than a symplectic N-body integrator, preventing chaotic numerical ejection while preserving orbital mechanics laws.',
  scaleMetadata: {
    areaUnitLabel: 'celestial bodies across 3 explorable star systems',
    baselinePlayableArea: 6,
    expandedPlayableArea: 18,
    baselineTerritoryScalar: 1,
    expandedTerritoryScalar: 3,
    baselineScenarioCount: 3,
    baselineInterventionCount: 6,
    baselineMetricCount: 6,
  },
  configSchema: celestialConfigSchema,
  defaultConfig: {
    stellarLuminosityMultiplier: 1.0,
    gravitationalCouplingStrength: 1.0,
    timeStepYearsPerTick: 0.08,
    greenhouseForcingMultiplier: 1.0,
    stellarFlareFrequency: 0.35,
    focusStarSystem: 'all',
  },
  scenarios: [
    {
      id: 'cel-hot-jupiter-migration',
      name: 'Giant Planet Inward Migration & Terrestrial Perturbation',
      subtitle: 'Secular Eccentricity Excitation -> Habitable Zone Disruption',
      description:
        'An eccentric gas giant perturbs inner rocky planets in the Solara and Kepler systems, pumping orbital eccentricity and driving seasonal extreme thermal swings.',
      hypothesis:
        'Circularizing the giant planet orbit or damping gravitational coupling stabilizes inner terrestrial surface temperatures within the liquid-water window.',
      seed: 60111,
      config: {
        stellarLuminosityMultiplier: 1.0,
        gravitationalCouplingStrength: 1.85,
        timeStepYearsPerTick: 0.08,
        greenhouseForcingMultiplier: 1.0,
        stellarFlareFrequency: 0.35,
        focusStarSystem: 'all',
      },
    },
    {
      id: 'cel-stellar-brightening-runaway',
      name: 'Main-Sequence Brightening & Runaway Greenhouse',
      subtitle: 'Luminosity Surge (+28%) -> Inner Habitable Zone Retreat',
      description:
        'Stellar luminosity increases across all three systems, pushing inner terrestrial worlds toward runaway greenhouse overheating while thawing outer icy moons.',
      hypothesis:
        'Increasing planetary Bond albedo or migrating terrestrial orbits outward preserves habitability above 70%.',
      seed: 60222,
      config: {
        stellarLuminosityMultiplier: 1.28,
        gravitationalCouplingStrength: 1.0,
        timeStepYearsPerTick: 0.08,
        greenhouseForcingMultiplier: 1.35,
        stellarFlareFrequency: 0.5,
        focusStarSystem: 'all',
      },
    },
    {
      id: 'cel-rogue-intruder-encounter',
      name: 'Interstellar Rogue Planetesimal Flyby',
      subtitle: 'High-Eccentricity Intruder -> Orbital Resonance Shock',
      description:
        'At Tick 4, a massive eccentric rogue body traverses the Solara system, exciting planetary eccentricities.',
      hypothesis:
        'Applying orbital station-keeping thrust after the flyby restores resonant stability.',
      seed: 60333,
      config: {
        stellarLuminosityMultiplier: 1.0,
        gravitationalCouplingStrength: 1.45,
        timeStepYearsPerTick: 0.08,
        greenhouseForcingMultiplier: 1.0,
        stellarFlareFrequency: 0.3,
        focusStarSystem: 'solara',
      },
      scheduledCommands: [
        {
          tick: 4,
          type: 'introduce_celestial_body',
          label: 'Rogue Planetesimal Intruder Arrival',
          payload: {
            systemId: 'solara',
            name: 'Rogue Nomad-IX',
            semiMajorAxisAu: 1.35,
            eccentricity: 0.58,
            massEarth: 8.5,
          },
        },
      ],
    },
    {
      id: 'cel-red-dwarf-superflare-lab',
      name: 'Trappist M-Dwarf Superflare & Tidal Lock Lab',
      subtitle: 'Compact Resonant Chain vs. Coronal Mass Ejections',
      description:
        'Focuses on the compact Trappist-Cygnus red-dwarf system where close-in worlds experience strong tidal heating and frequent stellar flares.',
      hypothesis:
        'Boosting planetary magnetospheric/atmospheric buffering prevents atmospheric stripping during flare storms.',
      seed: 60444,
      config: {
        stellarLuminosityMultiplier: 0.95,
        gravitationalCouplingStrength: 1.2,
        timeStepYearsPerTick: 0.05,
        greenhouseForcingMultiplier: 1.1,
        stellarFlareFrequency: 1.75,
        focusStarSystem: 'trappist',
      },
    },
    {
      id: 'cel-faint-young-sun-paradox',
      name: 'Faint Young Sun & Carbonate-Silicate Greenhouse',
      subtitle: 'Low Luminosity (0.74x) Offset by High CO2 Optical Depth',
      description:
        'Stars emit 26% less radiation, threatening global snowball glaciation unless greenhouse optical depth is maintained.',
      hypothesis:
        'Enhancing greenhouse optical depth prevents global glaciation and keeps mean habitable temperature above 275 K.',
      seed: 60555,
      config: {
        stellarLuminosityMultiplier: 0.74,
        gravitationalCouplingStrength: 0.9,
        timeStepYearsPerTick: 0.08,
        greenhouseForcingMultiplier: 1.65,
        stellarFlareFrequency: 0.4,
        focusStarSystem: 'all',
      },
    },
    {
      id: 'cel-kepler-multi-giant-resonance',
      name: 'Kepler-Borealis Laplace Resonance Chain',
      subtitle: 'Coupled Gas Giants & Tempered Ocean Moon',
      description:
        'Explores the Kepler-Borealis K-type system where massive gas giants warm an orbiting icy ocean world via tidal dissipation.',
      hypothesis:
        'Moderate eccentricity maintains subsurface/surface liquid water on outer moons beyond the classical radiative habitable zone.',
      seed: 60666,
      config: {
        stellarLuminosityMultiplier: 0.92,
        gravitationalCouplingStrength: 1.5,
        timeStepYearsPerTick: 0.1,
        greenhouseForcingMultiplier: 1.15,
        stellarFlareFrequency: 0.25,
        focusStarSystem: 'kepler',
      },
    },
    {
      id: 'cel-high-eccentricity-seasons',
      name: 'Extreme Eccentricity Thermo-Orbital Swings',
      subtitle: 'Periastron Scorch vs. Apastron Freeze',
      description:
        'Planets initialize on elongated elliptical orbits (e > 0.35), causing dramatic flux variations between periastron and apastron.',
      hypothesis:
        'Circularizing orbits (reducing e below 0.08) raises average habitability by more than 25 points.',
      seed: 60777,
      config: {
        stellarLuminosityMultiplier: 1.05,
        gravitationalCouplingStrength: 1.6,
        timeStepYearsPerTick: 0.07,
        greenhouseForcingMultiplier: 1.0,
        stellarFlareFrequency: 0.3,
        focusStarSystem: 'all',
      },
      scheduledCommands: [
        {
          tick: 1,
          type: 'perturb_orbital_eccentricity',
          label: 'Initial Elliptical Excitation',
          payload: { deltaEccentricity: 0.24 },
        },
      ],
    },
    {
      id: 'cel-outer-system-terraforming',
      name: 'Outer System Ocean-World Awakening',
      subtitle: 'Stellar Brightening + Greenhouse Seeding on Outer Worlds',
      description:
        'Tests whether outer icy worlds and moons can be brought into the liquid-water regime through targeted albedo and greenhouse engineering.',
      hypothesis:
        'Lowering surface albedo and adding greenhouse gases warms outer ocean worlds above 273 K.',
      seed: 60888,
      config: {
        stellarLuminosityMultiplier: 1.18,
        gravitationalCouplingStrength: 1.0,
        timeStepYearsPerTick: 0.09,
        greenhouseForcingMultiplier: 1.5,
        stellarFlareFrequency: 0.2,
        focusStarSystem: 'all',
      },
    },
    {
      id: 'cel-three-system-observatory',
      name: 'Three-System Astrobiology Baseline (18 Bodies)',
      subtitle: 'Nominal Multi-System Orbital & Habitability Reference',
      description:
        'Reference configuration spanning Solara, Kepler-Borealis, and Trappist-Cygnus (18 bodies total) for controlled orbital experiments.',
      hypothesis:
        'Low eccentricity and balanced greenhouse forcing sustain at least 5 habitable worlds across the 3 systems.',
      seed: 60999,
      config: {
        stellarLuminosityMultiplier: 1.0,
        gravitationalCouplingStrength: 1.0,
        timeStepYearsPerTick: 0.08,
        greenhouseForcingMultiplier: 1.0,
        stellarFlareFrequency: 0.35,
        focusStarSystem: 'all',
      },
    },
  ],
  quickInterventions: [
    {
      id: 'cel-view-all-systems',
      label: 'System View: All 3 Star Systems (18 Bodies)',
      description: 'Displays Solara, Kepler-Borealis, and Trappist-Cygnus simultaneously.',
      category: 'policy',
      commandType: 'select_star_system',
      defaultPayload: { systemId: 'all' },
    },
    {
      id: 'cel-view-solara',
      label: 'System View: Solara G-Type System',
      description: 'Focuses inspection on the Solara G2V planetary system.',
      category: 'policy',
      commandType: 'select_star_system',
      defaultPayload: { systemId: 'solara' },
    },
    {
      id: 'cel-view-kepler',
      label: 'System View: Kepler-Borealis K-Type System',
      description: 'Focuses inspection on the Kepler-Borealis K-dwarf multi-giant system.',
      category: 'policy',
      commandType: 'select_star_system',
      defaultPayload: { systemId: 'kepler' },
    },
    {
      id: 'cel-view-trappist',
      label: 'System View: Trappist-Cygnus M-Dwarf System',
      description: 'Focuses inspection on the compact Trappist-Cygnus resonant chain.',
      category: 'policy',
      commandType: 'select_star_system',
      defaultPayload: { systemId: 'trappist' },
    },
    {
      id: 'cel-luminosity-boost',
      label: 'Increase Stellar Luminosity (+20%)',
      description: 'Brightens host stars by +20%, shifting habitable zones outward and warming all planets.',
      category: 'crisis',
      commandType: 'modify_stellar_luminosity',
      defaultPayload: { luminosityFactor: 1.2 },
    },
    {
      id: 'cel-luminosity-dim',
      label: 'Dim Stellar Luminosity (-16%)',
      description: 'Reduces stellar radiative output by 16%, cooling inner scorched worlds.',
      category: 'policy',
      commandType: 'modify_stellar_luminosity',
      defaultPayload: { luminosityFactor: 0.84 },
    },
    {
      id: 'cel-excite-eccentricity',
      label: 'Gravitational Resonance Kick (+0.18 Eccentricity)',
      description: 'Increases orbital eccentricity across planetary bodies, amplifying seasonal flux swings and tidal heating.',
      category: 'crisis',
      commandType: 'perturb_orbital_eccentricity',
      defaultPayload: { deltaEccentricity: 0.18 },
    },
    {
      id: 'cel-circularize-orbits',
      label: 'Damp Orbital Eccentricities (-65% e)',
      description: 'Circularizes elliptical planetary orbits, stabilizing incident stellar flux.',
      category: 'restoration',
      commandType: 'circularize_orbits',
      defaultPayload: { dampingFactor: 0.35 },
    },
    {
      id: 'cel-migrate-outward',
      label: 'Migrate Terrestrial Orbits Outward (+12% AU)',
      description: 'Increases semi-major axis of terrestrial and ocean worlds by 12% via gravity-assist tugs.',
      category: 'structure',
      commandType: 'migrate_semi_major_axis',
      defaultPayload: { scaleFactor: 1.12 },
    },
    {
      id: 'cel-migrate-inward',
      label: 'Migrate Terrestrial Orbits Inward (-10% AU)',
      description: 'Moves terrestrial and ocean worlds 10% closer to their host stars.',
      category: 'structure',
      commandType: 'migrate_semi_major_axis',
      defaultPayload: { scaleFactor: 0.9 },
    },
    {
      id: 'cel-spawn-rogue-planet',
      label: 'Introduce Rogue Planetesimal (Nomad Body)',
      description: 'Injects a new high-eccentricity planetary body into the active star system.',
      category: 'crisis',
      commandType: 'introduce_celestial_body',
      defaultPayload: {
        systemId: 'solara',
        name: 'Rogue Centauri-V',
        semiMajorAxisAu: 1.22,
        eccentricity: 0.44,
        massEarth: 4.2,
      },
    },
    {
      id: 'cel-trigger-superflare',
      label: 'Trigger Coronal Mass Ejection Superflare',
      description: 'Emits an intense stellar flare burst, stripping thin atmospheres and spiking radiation.',
      category: 'crisis',
      commandType: 'trigger_stellar_flare',
      defaultPayload: { flareIntensity: 48, luminositySpikePct: 12 },
    },
    {
      id: 'cel-greenhouse-seeding',
      label: 'Seed Fluorocarbon Greenhouse (+0.45 Optical Depth)',
      description: 'Thickens planetary greenhouse blankets to warm cold outer worlds.',
      category: 'restoration',
      commandType: 'adjust_planetary_greenhouse',
      defaultPayload: { deltaOpticalDepth: 0.45 },
    },
    {
      id: 'cel-carbon-sequestration',
      label: 'Sequester Atmospheric Greenhouse (-0.40 Optical Depth)',
      description: 'Reduces greenhouse optical depth to cool overheating inner worlds.',
      category: 'restoration',
      commandType: 'adjust_planetary_greenhouse',
      defaultPayload: { deltaOpticalDepth: -0.4 },
    },
    {
      id: 'cel-orbital-mirrors-albedo',
      label: 'Deploy Orbital Sunshade Mirrors (+0.12 Albedo)',
      description: 'Increases planetary reflectivity to protect inner worlds from runaway heating.',
      category: 'structure',
      commandType: 'adjust_planetary_albedo',
      defaultPayload: { deltaAlbedo: 0.12 },
    },
    {
      id: 'cel-darken-ice-albedo',
      label: 'Dust Polar Ice Caps (-0.10 Albedo)',
      description: 'Lowers surface albedo on glaciated worlds to increase solar heat absorption.',
      category: 'structure',
      commandType: 'adjust_planetary_albedo',
      defaultPayload: { deltaAlbedo: -0.1 },
    },
    {
      id: 'cel-replenish-volatiles',
      label: 'Cometary Volatile Delivery (+0.8 bar Atmosphere)',
      description: 'Delivers water and nitrogen volatiles to terrestrial and icy worlds, boosting atmospheric pressure.',
      category: 'restoration',
      commandType: 'replenish_planetary_atmosphere',
      defaultPayload: { deltaBar: 0.8 },
    },
    {
      id: 'cel-stabilize-resonances',
      label: 'Lock Mean-Motion Orbital Resonances',
      description: 'Harmonizes orbital periods and restores orbital stability index across all three star systems.',
      category: 'restoration',
      commandType: 'stabilize_orbital_resonances',
      defaultPayload: { stabilityBoost: 24 },
    },
  ],
  metricDefinitions: [
    {
      id: 'totalCelestialBodies',
      label: 'Total Tracked Celestial Bodies',
      unit: 'bodies',
      category: 'Astrodynamics',
      description: 'Total stars, planets, moons, and rogue bodies across the 3 star systems.',
      higherIsBetter: true,
    },
    {
      id: 'activeStarSystems',
      label: 'Active Star Systems',
      unit: 'systems',
      category: 'Astrodynamics',
      description: 'Number of simulated stellar systems in the sector.',
    },
    {
      id: 'habitableWorldsCount',
      label: 'Worlds in Habitable Regime',
      unit: 'worlds',
      category: 'Astrobiology',
      description: 'Count of rocky/ocean bodies with habitability index >= 60%.',
      warningThreshold: 3,
      criticalThreshold: 1,
      higherIsBetter: true,
    },
    {
      id: 'meanHabitabilityIndex',
      label: 'Mean Candidate Habitability',
      unit: '%',
      category: 'Astrobiology',
      comparableDimension: 'system_stability_ratio',
      description: 'Average habitability score across all terrestrial, ocean, and icy moon worlds.',
      warningThreshold: 48,
      criticalThreshold: 30,
      higherIsBetter: true,
    },
    {
      id: 'maxHabitabilityIndex',
      label: 'Peak World Habitability Score',
      unit: '%',
      category: 'Astrobiology',
      description: 'Highest habitability index achieved by any single planet or moon.',
      higherIsBetter: true,
    },
    {
      id: 'meanTerrestrialTempK',
      label: 'Mean Terrestrial Surface Temp',
      unit: 'K',
      category: 'Thermodynamics',
      description: 'Average surface temperature (Kelvin) of non-giant planetary bodies.',
      warningThreshold: 325,
      criticalThreshold: 355,
    },
    {
      id: 'meanEquilibriumTempK',
      label: 'Mean Radiative Equilibrium Temp',
      unit: 'K',
      category: 'Thermodynamics',
      description: 'Average blackbody radiative equilibrium temperature before greenhouse warming.',
    },
    {
      id: 'meanIncidentFluxWm2',
      label: 'Mean Planetary Stellar Flux',
      unit: 'W/m²',
      category: 'Radiation',
      description: 'Average stellar irradiance received by orbiting bodies.',
    },
    {
      id: 'meanEccentricity',
      label: 'Mean Planetary Eccentricity',
      unit: 'e',
      category: 'Astrodynamics',
      description: 'Average orbital eccentricity across all orbiting bodies (0 = circular).',
      warningThreshold: 0.22,
      criticalThreshold: 0.38,
      higherIsBetter: false,
    },
    {
      id: 'maxEccentricity',
      label: 'Peak Orbital Eccentricity',
      unit: 'e',
      category: 'Astrodynamics',
      description: 'Highest eccentricity among all tracked orbits.',
      warningThreshold: 0.35,
      criticalThreshold: 0.55,
      higherIsBetter: false,
    },
    {
      id: 'meanOrbitalVelocityKms',
      label: 'Mean Orbital Velocity',
      unit: 'km/s',
      category: 'Astrodynamics',
      description: 'Average vis-viva orbital velocity across all orbiting bodies.',
    },
    {
      id: 'meanSemiMajorAxisAu',
      label: 'Mean Semi-Major Axis',
      unit: 'AU',
      category: 'Astrodynamics',
      description: 'Average orbital semi-major axis in Astronomical Units.',
    },
    {
      id: 'totalStellarLuminositySolar',
      label: 'Combined Stellar Luminosity',
      unit: 'L☉',
      category: 'Radiation',
      description: 'Sum of stellar luminosity across Solara, Kepler-Borealis, and Trappist-Cygnus.',
    },
    {
      id: 'meanTidalHeatingWm2',
      label: 'Mean Tidal Dissipation Flux',
      unit: 'W/m²',
      category: 'Thermodynamics',
      description: 'Average internal tidal heating driven by orbital eccentricity.',
    },
    {
      id: 'meanAtmospherePressureBar',
      label: 'Mean Terrestrial Atmosphere',
      unit: 'bar',
      category: 'Astrobiology',
      description: 'Average surface atmospheric pressure across rocky and ocean worlds.',
    },
    {
      id: 'meanFlareActivityIndex',
      label: 'Stellar Flare Activity Index',
      unit: 'idx',
      category: 'Radiation',
      description: 'Average coronal flare and stellar wind activity across the 3 stars.',
      warningThreshold: 45,
      criticalThreshold: 70,
      higherIsBetter: false,
    },
    {
      id: 'elapsedSimYears',
      label: 'Elapsed Orbital Time',
      unit: 'years',
      category: 'Astrodynamics',
      description: 'Cumulative simulated orbital years elapsed since Genesis.',
    },
    {
      id: 'meanOrbitalStabilityIndex',
      label: 'System Orbital Stability Index',
      unit: '%',
      category: 'Astrodynamics',
      description: 'Composite dynamical stability metric across all 3 planetary systems.',
      warningThreshold: 65,
      criticalThreshold: 42,
      higherIsBetter: true,
    },
  ],

  initializeWorld(config) {
    const lumMult = config.stellarLuminosityMultiplier;

    const systems: StarSystemCluster[] = [
      {
        id: 'solara',
        name: 'Solara Prime (G2V System)',
        spectralType: 'G2V Yellow Dwarf',
        centerOffset: [-28, 0, -6],
        stellarMassSolar: 1.0,
        luminositySolar: roundDet(1.0 * lumMult, 3),
        surfaceTempK: 5778,
        flareActivityIndex: roundDet(14 * config.stellarFlareFrequency, 1),
        habitableZoneInnerAu: 0.95,
        habitableZoneOuterAu: 1.37,
      },
      {
        id: 'kepler',
        name: 'Kepler-Borealis (K1V Multi-Giant System)',
        spectralType: 'K1V Orange Dwarf',
        centerOffset: [26, 0, -8],
        stellarMassSolar: 0.82,
        luminositySolar: roundDet(0.52 * lumMult, 3),
        surfaceTempK: 5120,
        flareActivityIndex: roundDet(18 * config.stellarFlareFrequency, 1),
        habitableZoneInnerAu: 0.68,
        habitableZoneOuterAu: 0.99,
      },
      {
        id: 'trappist',
        name: 'Trappist-Cygnus (M5V Compact Resonant System)',
        spectralType: 'M5V Red Dwarf',
        centerOffset: [0, 0, 22],
        stellarMassSolar: 0.24,
        luminositySolar: roundDet(0.09 * lumMult, 3),
        surfaceTempK: 3450,
        flareActivityIndex: roundDet(38 * config.stellarFlareFrequency, 1),
        habitableZoneInnerAu: 0.28,
        habitableZoneOuterAu: 0.41,
      },
    ];

    for (const sys of systems) {
      recomputeStarHabitableZone(sys);
    }

    // 18 Celestial Bodies total across the 3 star systems (6 per system = 18 bodies, 3x the 6-body baseline)
    const rawBodies: Array<Omit<CelestialBody, 'orbitalPeriodYears' | 'trueAnomalyRad' | 'currentRadiusAu' | 'orbitalVelocityKms' | 'x' | 'z' | 'prevX' | 'prevZ' | 'incidentFluxWm2' | 'equilibriumTempK' | 'surfaceTempK' | 'tidalHeatingWm2' | 'habitabilityIndex'>> = [
      // --- SYSTEM 1: SOLARA (6 bodies) ---
      {
        id: 'body-solara-star',
        name: 'Solara-A (Host Star)',
        systemId: 'solara',
        bodyClass: 'star',
        massEarth: 333000,
        radiusEarth: 109,
        semiMajorAxisAu: 0,
        eccentricity: 0,
        inclinationDeg: 0,
        meanAnomalyRad: 0,
        albedo: 0.01,
        greenhouseOpticalDepth: 0,
        atmospherePressureBar: 0,
        orbitalStabilityIndex: 100,
        color: '#facc15',
      },
      {
        id: 'body-solara-1',
        name: 'Pyros-I (Inner Scorched World)',
        systemId: 'solara',
        bodyClass: 'terrestrial',
        massEarth: 0.55,
        radiusEarth: 0.82,
        semiMajorAxisAu: 0.48,
        eccentricity: 0.12,
        inclinationDeg: 3.2,
        meanAnomalyRad: 0.5,
        albedo: 0.14,
        greenhouseOpticalDepth: 0.2,
        atmospherePressureBar: 0.1,
        orbitalStabilityIndex: 92,
        color: '#f97316',
      },
      {
        id: 'body-solara-2',
        name: 'Gaia-Prime (Temperate Biosphere)',
        systemId: 'solara',
        bodyClass: 'terrestrial',
        massEarth: 1.04,
        radiusEarth: 1.01,
        semiMajorAxisAu: 1.02,
        eccentricity: 0.03,
        inclinationDeg: 0.4,
        meanAnomalyRad: 1.8,
        albedo: 0.29,
        greenhouseOpticalDepth: 1.05,
        atmospherePressureBar: 1.02,
        orbitalStabilityIndex: 96,
        color: '#22c55e',
      },
      {
        id: 'body-solara-3',
        name: 'Thalassa-III (Pelagic Ocean World)',
        systemId: 'solara',
        bodyClass: 'ocean_world',
        massEarth: 1.38,
        radiusEarth: 1.14,
        semiMajorAxisAu: 1.28,
        eccentricity: 0.05,
        inclinationDeg: 1.1,
        meanAnomalyRad: 3.1,
        albedo: 0.22,
        greenhouseOpticalDepth: 1.45,
        atmospherePressureBar: 1.65,
        orbitalStabilityIndex: 94,
        color: '#06b6d4',
      },
      {
        id: 'body-solara-4',
        name: 'Jovian-Hyperion (Gas Giant)',
        systemId: 'solara',
        bodyClass: 'gas_giant',
        massEarth: 285,
        radiusEarth: 10.8,
        semiMajorAxisAu: 2.35,
        eccentricity: 0.08,
        inclinationDeg: 1.4,
        meanAnomalyRad: 4.2,
        albedo: 0.48,
        greenhouseOpticalDepth: 2.2,
        atmospherePressureBar: 100,
        orbitalStabilityIndex: 98,
        color: '#eab308',
      },
      {
        id: 'body-solara-5',
        name: 'Cryo-Europa (Resonant Icy Moon)',
        systemId: 'solara',
        bodyClass: 'icy_moon',
        massEarth: 0.22,
        radiusEarth: 0.62,
        semiMajorAxisAu: 2.55,
        eccentricity: 0.14,
        inclinationDeg: 2.0,
        meanAnomalyRad: 5.1,
        albedo: 0.58,
        greenhouseOpticalDepth: 0.85,
        atmospherePressureBar: 0.35,
        orbitalStabilityIndex: 89,
        color: '#93c5fd',
      },

      // --- SYSTEM 2: KEPLER-BOREALIS (6 bodies) ---
      {
        id: 'body-kepler-star',
        name: 'Kepler-Borealis (K1V Host Star)',
        systemId: 'kepler',
        bodyClass: 'star',
        massEarth: 273000,
        radiusEarth: 88,
        semiMajorAxisAu: 0,
        eccentricity: 0,
        inclinationDeg: 0,
        meanAnomalyRad: 0,
        albedo: 0.01,
        greenhouseOpticalDepth: 0,
        atmospherePressureBar: 0,
        orbitalStabilityIndex: 100,
        color: '#fb923c',
      },
      {
        id: 'body-kepler-1',
        name: 'Vulcan-B1 (Tidal Lava World)',
        systemId: 'kepler',
        bodyClass: 'terrestrial',
        massEarth: 0.78,
        radiusEarth: 0.91,
        semiMajorAxisAu: 0.34,
        eccentricity: 0.09,
        inclinationDeg: 1.8,
        meanAnomalyRad: 0.9,
        albedo: 0.16,
        greenhouseOpticalDepth: 0.5,
        atmospherePressureBar: 0.25,
        orbitalStabilityIndex: 91,
        color: '#ef4444',
      },
      {
        id: 'body-kepler-2',
        name: 'Borealis-Prime (Super-Earth)',
        systemId: 'kepler',
        bodyClass: 'terrestrial',
        massEarth: 1.65,
        radiusEarth: 1.18,
        semiMajorAxisAu: 0.76,
        eccentricity: 0.04,
        inclinationDeg: 0.6,
        meanAnomalyRad: 2.2,
        albedo: 0.27,
        greenhouseOpticalDepth: 1.15,
        atmospherePressureBar: 1.45,
        orbitalStabilityIndex: 95,
        color: '#10b981',
      },
      {
        id: 'body-kepler-3',
        name: 'Nereid-B3 (Archipelago World)',
        systemId: 'kepler',
        bodyClass: 'ocean_world',
        massEarth: 1.15,
        radiusEarth: 1.06,
        semiMajorAxisAu: 0.94,
        eccentricity: 0.06,
        inclinationDeg: 1.2,
        meanAnomalyRad: 3.7,
        albedo: 0.24,
        greenhouseOpticalDepth: 1.55,
        atmospherePressureBar: 1.8,
        orbitalStabilityIndex: 93,
        color: '#38bdf8',
      },
      {
        id: 'body-kepler-4',
        name: 'Kronos-B4 (Warm Saturn)',
        systemId: 'kepler',
        bodyClass: 'gas_giant',
        massEarth: 115,
        radiusEarth: 8.6,
        semiMajorAxisAu: 1.58,
        eccentricity: 0.11,
        inclinationDeg: 2.1,
        meanAnomalyRad: 4.9,
        albedo: 0.44,
        greenhouseOpticalDepth: 1.9,
        atmospherePressureBar: 80,
        orbitalStabilityIndex: 96,
        color: '#f59e0b',
      },
      {
        id: 'body-kepler-5',
        name: 'Caelus-B5 (Neptunian Ice Giant)',
        systemId: 'kepler',
        bodyClass: 'ice_giant',
        massEarth: 19,
        radiusEarth: 3.9,
        semiMajorAxisAu: 2.45,
        eccentricity: 0.07,
        inclinationDeg: 1.5,
        meanAnomalyRad: 5.8,
        albedo: 0.52,
        greenhouseOpticalDepth: 1.6,
        atmospherePressureBar: 50,
        orbitalStabilityIndex: 97,
        color: '#60a5fa',
      },

      // --- SYSTEM 3: TRAPPIST-CYGNUS (6 bodies) ---
      {
        id: 'body-trappist-star',
        name: 'Trappist-Cygnus (M5V Red Dwarf)',
        systemId: 'trappist',
        bodyClass: 'star',
        massEarth: 80000,
        radiusEarth: 28,
        semiMajorAxisAu: 0,
        eccentricity: 0,
        inclinationDeg: 0,
        meanAnomalyRad: 0,
        albedo: 0.01,
        greenhouseOpticalDepth: 0,
        atmospherePressureBar: 0,
        orbitalStabilityIndex: 100,
        color: '#f43f5e',
      },
      {
        id: 'body-trappist-1',
        name: 'Cygnus-b (Inner Tidal Desert)',
        systemId: 'trappist',
        bodyClass: 'terrestrial',
        massEarth: 0.88,
        radiusEarth: 0.96,
        semiMajorAxisAu: 0.16,
        eccentricity: 0.05,
        inclinationDeg: 0.5,
        meanAnomalyRad: 0.6,
        albedo: 0.19,
        greenhouseOpticalDepth: 0.6,
        atmospherePressureBar: 0.45,
        orbitalStabilityIndex: 94,
        color: '#fb7185',
      },
      {
        id: 'body-trappist-2',
        name: 'Cygnus-c (Terminator Oasis)',
        systemId: 'trappist',
        bodyClass: 'terrestrial',
        massEarth: 1.12,
        radiusEarth: 1.04,
        semiMajorAxisAu: 0.29,
        eccentricity: 0.04,
        inclinationDeg: 0.3,
        meanAnomalyRad: 1.9,
        albedo: 0.25,
        greenhouseOpticalDepth: 1.15,
        atmospherePressureBar: 1.25,
        orbitalStabilityIndex: 95,
        color: '#34d399',
      },
      {
        id: 'body-trappist-3',
        name: 'Cygnus-d (Resonant Waterworld)',
        systemId: 'trappist',
        bodyClass: 'ocean_world',
        massEarth: 0.94,
        radiusEarth: 0.99,
        semiMajorAxisAu: 0.36,
        eccentricity: 0.05,
        inclinationDeg: 0.4,
        meanAnomalyRad: 3.3,
        albedo: 0.23,
        greenhouseOpticalDepth: 1.4,
        atmospherePressureBar: 1.5,
        orbitalStabilityIndex: 94,
        color: '#2dd4bf',
      },
      {
        id: 'body-trappist-4',
        name: 'Cygnus-e (Glaciated Frontier)',
        systemId: 'trappist',
        bodyClass: 'icy_moon',
        massEarth: 0.68,
        radiusEarth: 0.87,
        semiMajorAxisAu: 0.52,
        eccentricity: 0.09,
        inclinationDeg: 0.9,
        meanAnomalyRad: 4.5,
        albedo: 0.46,
        greenhouseOpticalDepth: 1.55,
        atmospherePressureBar: 0.9,
        orbitalStabilityIndex: 91,
        color: '#a78bfa',
      },
      {
        id: 'body-trappist-5',
        name: 'Cygnus-f (Outer Mini-Neptune)',
        systemId: 'trappist',
        bodyClass: 'ice_giant',
        massEarth: 7.4,
        radiusEarth: 2.3,
        semiMajorAxisAu: 0.88,
        eccentricity: 0.06,
        inclinationDeg: 1.2,
        meanAnomalyRad: 5.5,
        albedo: 0.49,
        greenhouseOpticalDepth: 1.8,
        atmospherePressureBar: 35,
        orbitalStabilityIndex: 96,
        color: '#818cf8',
      },
    ];

    const bodies: CelestialBody[] = rawBodies.map((b) => {
      const full: CelestialBody = {
        ...b,
        orbitalPeriodYears: 1,
        trueAnomalyRad: b.meanAnomalyRad,
        currentRadiusAu: b.semiMajorAxisAu,
        orbitalVelocityKms: 25,
        x: 0,
        z: 0,
        prevX: 0,
        prevZ: 0,
        incidentFluxWm2: 1000,
        equilibriumTempK: 255,
        surfaceTempK: 288,
        tidalHeatingWm2: 0,
        habitabilityIndex: 50,
      };
      const sys = systems.find((s) => s.id === b.systemId) ?? systems[0];
      updateBodyPhysicsAndPosition(full, sys, config.greenhouseForcingMultiplier);
      full.prevX = full.x;
      full.prevZ = full.z;
      return full;
    });

    return {
      nextBodyId: 19,
      systems,
      bodies,
      activeSystemFilter: config.focusStarSystem,
      elapsedSimYears: 0,
      cumulativePerturbationEvents: 0,
      cumulativeFlareEvents: 0,
      lastFlareEventId: null,
      lastResonanceEventId: null,
    };
  },

  systems: [
    {
      id: 'cel_1_keplerian_and_secular_orbits',
      name: 'Keplerian Orbital Propagation & Secular Gravitational Perturbations',
      order: 10,
      step(ctx) {
        const { state, config, tick } = ctx;
        const dtYears = config.timeStepYearsPerTick;
        state.elapsedSimYears = roundDet(state.elapsedSimYears + dtYears, 3);

        // Advance mean anomalies and apply secular perturbations from gas giants / rogue bodies
        for (const body of state.bodies) {
          if (body.bodyClass === 'star') continue;
          body.prevX = body.x;
          body.prevZ = body.z;

          const sys = state.systems.find((s) => s.id === body.systemId) ?? state.systems[0];
          const period = Math.max(0.03, body.orbitalPeriodYears);
          const meanMotion = (2 * Math.PI) / period;
          body.meanAnomalyRad = roundDet(
            (body.meanAnomalyRad + meanMotion * dtYears) % (Math.PI * 2),
            4,
          );

          // Secular gravitational coupling with massive bodies in the same star system
          const perturbers = state.bodies.filter(
            (other) =>
              other.systemId === body.systemId &&
              other.id !== body.id &&
              other.bodyClass !== 'star' &&
              other.massEarth >= 4.0,
          );

          let secularEccPush = 0;
          for (const p of perturbers) {
            const radialSep = Math.abs(body.semiMajorAxisAu - p.semiMajorAxisAu);
            const phaseDiff = body.meanAnomalyRad - p.meanAnomalyRad;
            const coupling =
              (p.massEarth / 1000) *
              config.gravitationalCouplingStrength *
              (1 / Math.max(0.18, radialSep * radialSep));
            secularEccPush += Math.sin(phaseDiff) * coupling * 0.0022;
          }

          body.eccentricity = roundDet(
            clampDet(body.eccentricity + secularEccPush, 0.005, 0.82),
            4,
          );

          // Update orbital stability index
          body.orbitalStabilityIndex = roundDet(
            clampDet(100 - body.eccentricity * 95 - Math.abs(secularEccPush) * 800, 10, 100),
            2,
          );

          updateBodyPhysicsAndPosition(body, sys, config.greenhouseForcingMultiplier);
        }

        const highEccCount = state.bodies.filter(
          (b) => b.bodyClass !== 'star' && b.eccentricity > 0.28,
        ).length;
        if (highEccCount >= 3 && tick % 5 === 0) {
          state.cumulativePerturbationEvents += 1;
          const ev = ctx.emitEvent({
            type: 'orbital_resonance_perturbation',
            severity: highEccCount >= 6 ? 'critical' : 'warning',
            title: `Secular Orbital Excitation (${highEccCount} Eccentric Orbits)`,
            description: `Gravitational coupling excited ${highEccCount} planetary orbits above e = 0.28, inducing extreme periastron-apastron flux swings.`,
            sourceSystem: 'cel_1_keplerian_and_secular_orbits',
            affectedEntityIds: state.bodies
              .filter((b) => b.eccentricity > 0.28)
              .map((b) => b.id),
            payload: { highEccCount },
            causalLinkType: 'dependency',
            causalExplanation:
              'Secular angular momentum exchange with giant/rogue perturbers increased orbital eccentricity.',
          });
          state.lastResonanceEventId = ev.id;
        }
      },
    },
    {
      id: 'cel_2_stellar_radiation_and_energy_balance',
      name: 'Stellar Flare Cycles, Habitable Zone Envelope & Radiative Balance',
      order: 20,
      step(ctx) {
        const { state, config, rng, tick } = ctx;
        const stream = rng.stream('cel_stellar');

        for (const sys of state.systems) {
          const flareNoise = stream.nextRange(-2.5, 3.0) * config.stellarFlareFrequency;
          sys.flareActivityIndex = roundDet(
            clampDet(sys.flareActivityIndex * 0.85 + 15 * config.stellarFlareFrequency + flareNoise, 0, 100),
            2,
          );
          recomputeStarHabitableZone(sys);
        }

        // Autonomous stellar superflare event when flareActivityIndex is high
        const activeStar = state.systems.find((s) => s.flareActivityIndex > 48);
        if (activeStar && tick % 6 === 0) {
          state.cumulativeFlareEvents += 1;
          const systemPlanets = state.bodies.filter(
            (b) => b.systemId === activeStar.id && b.bodyClass !== 'star',
          );
          for (const p of systemPlanets) {
            if (p.semiMajorAxisAu < 0.6 && p.atmospherePressureBar > 0.08) {
              p.atmospherePressureBar = roundDet(
                Math.max(0.05, p.atmospherePressureBar - 0.06),
                2,
              );
            }
            updateBodyPhysicsAndPosition(p, activeStar, config.greenhouseForcingMultiplier);
          }

          const ev = ctx.emitEvent({
            type: 'stellar_radiation_surge',
            severity: activeStar.flareActivityIndex > 68 ? 'critical' : 'warning',
            title: `Coronal Superflare in ${activeStar.name}`,
            description: `Stellar flare activity (${activeStar.flareActivityIndex}) eroded upper atmospheres on close-in worlds in ${activeStar.name}.`,
            sourceSystem: 'cel_2_stellar_radiation_and_energy_balance',
            affectedEntityIds: systemPlanets.map((p) => p.id),
            payload: {
              systemId: activeStar.id,
              flareIntensity: activeStar.flareActivityIndex,
              radiationFluxMultiplier: roundDet(1 + activeStar.flareActivityIndex / 100, 2),
            },
            causalLinkType: 'direct',
            causalExplanation:
              'Magnetic reconnection in the stellar corona released a high-energy UV/X-ray and proton flux.',
          });
          state.lastFlareEventId = ev.id;
        }
      },
    },
  ],

  applyCommand(state, command: SimulationCommand, ctx) {
    const payload = command.payload ?? {};

    if (command.type === 'select_star_system') {
      const sysId = String(payload.systemId ?? 'all') as CelestialState['activeSystemFilter'];
      const before = state.activeSystemFilter;
      state.activeSystemFilter = sysId;
      for (const sys of state.systems) {
        if (sysId === 'all' || sys.id === sysId) {
          sys.flareActivityIndex = roundDet(
            clampDet(sys.flareActivityIndex + 0.75, 0, 100),
            2,
          );
        }
      }
      ctx.emitEvent({
        type: 'star_system_selected',
        severity: 'info',
        title: `Star System Focus Switched (${sysId.toUpperCase()})`,
        description: `Observatory focus changed from ${before} to ${sysId} with astrometric orbit calibration.`,
        sourceSystem: 'command_bus',
        deltas: [{ metricOrField: 'activeSystemFilter', before, after: sysId }],
        causalLinkType: 'direct',
        causalExplanation: 'Operator changed active stellar system filter.',
      });
      return;
    }

    if (command.type === 'modify_stellar_luminosity') {
      const factor = clampDet(Number(payload.luminosityFactor ?? 1.15), 0.3, 2.5);
      for (const sys of state.systems) {
        if (state.activeSystemFilter === 'all' || sys.id === state.activeSystemFilter) {
          sys.luminositySolar = roundDet(clampDet(sys.luminositySolar * factor, 0.02, 5.0), 3);
          recomputeStarHabitableZone(sys);
        }
      }
      for (const body of state.bodies) {
        const sys = state.systems.find((s) => s.id === body.systemId) ?? state.systems[0];
        updateBodyPhysicsAndPosition(body, sys, ctx.config.greenhouseForcingMultiplier);
      }
      ctx.emitEvent({
        type: 'stellar_luminosity_modified',
        severity: Math.abs(factor - 1) > 0.15 ? 'warning' : 'info',
        title: `Stellar Luminosity Scaled (${factor}x)`,
        description: `Host star radiative output scaled by ${factor}x; circumstellar habitable zones and planetary equilibrium temperatures updated.`,
        sourceSystem: 'command_bus',
        payload: { luminosityFactor: factor, radiationFluxMultiplier: factor },
        causalLinkType: 'direct',
        causalExplanation: 'Direct modification of stellar bolometric luminosity.',
      });
      return;
    }

    if (command.type === 'perturb_orbital_eccentricity') {
      const delta = Number(payload.deltaEccentricity ?? 0.18);
      for (const body of state.bodies) {
        if (body.bodyClass !== 'star') {
          body.eccentricity = roundDet(clampDet(body.eccentricity + delta, 0.005, 0.82), 4);
          const sys = state.systems.find((s) => s.id === body.systemId) ?? state.systems[0];
          updateBodyPhysicsAndPosition(body, sys, ctx.config.greenhouseForcingMultiplier);
        }
      }
      ctx.emitEvent({
        type: 'orbital_eccentricity_perturbed',
        severity: delta > 0 ? 'warning' : 'positive',
        title: `Orbital Eccentricity Perturbation (${delta > 0 ? '+' : ''}${delta})`,
        description: `Planetary eccentricities shifted by ${delta}, altering periastron/apastron distances and tidal heating.`,
        sourceSystem: 'command_bus',
        payload: { deltaEccentricity: delta },
        causalLinkType: 'direct',
        causalExplanation: 'Gravitational impulse altered orbital angular momentum.',
      });
      return;
    }

    if (command.type === 'circularize_orbits') {
      const factor = clampDet(Number(payload.dampingFactor ?? 0.35), 0.05, 0.9);
      for (const body of state.bodies) {
        if (body.bodyClass !== 'star') {
          body.eccentricity = roundDet(clampDet(body.eccentricity * factor, 0.005, 0.8), 4);
          body.orbitalStabilityIndex = roundDet(clampDet(body.orbitalStabilityIndex + 18, 0, 100), 2);
          const sys = state.systems.find((s) => s.id === body.systemId) ?? state.systems[0];
          updateBodyPhysicsAndPosition(body, sys, ctx.config.greenhouseForcingMultiplier);
        }
      }
      ctx.emitEvent({
        type: 'orbits_circularized',
        severity: 'positive',
        title: 'Planetary Orbits Circularized',
        description: `Orbital eccentricities damped to ${Math.round(factor * 100)}% of prior values, stabilizing seasonal insolation.`,
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Tidal and resonant circularization reduced orbital eccentricity.',
      });
      return;
    }

    if (command.type === 'migrate_semi_major_axis') {
      const scale = clampDet(Number(payload.scaleFactor ?? 1.12), 0.6, 1.6);
      for (const body of state.bodies) {
        if (
          body.bodyClass === 'terrestrial' ||
          body.bodyClass === 'ocean_world' ||
          body.bodyClass === 'icy_moon'
        ) {
          body.semiMajorAxisAu = roundDet(clampDet(body.semiMajorAxisAu * scale, 0.08, 6.0), 3);
          const sys = state.systems.find((s) => s.id === body.systemId) ?? state.systems[0];
          updateBodyPhysicsAndPosition(body, sys, ctx.config.greenhouseForcingMultiplier);
        }
      }
      ctx.emitEvent({
        type: 'semi_major_axis_migrated',
        severity: 'info',
        title: `Planetary Semi-Major Axes Scaled (${scale}x AU)`,
        description: `Rocky and ocean world orbits migrated by factor ${scale}x, updating orbital periods and stellar irradiance.`,
        sourceSystem: 'command_bus',
        payload: { scaleFactor: scale },
        causalLinkType: 'direct',
        causalExplanation: 'Orbital energy transfer shifted planetary semi-major axes.',
      });
      return;
    }

    if (command.type === 'introduce_celestial_body') {
      const sysId = (payload.systemId === 'kepler' || payload.systemId === 'trappist'
        ? payload.systemId
        : 'solara') as StarSystemCluster['id'];
      const name = String(payload.name ?? `Rogue Nomad-${state.nextBodyId}`);
      const a = clampDet(Number(payload.semiMajorAxisAu ?? 1.25), 0.15, 4.5);
      const e = clampDet(Number(payload.eccentricity ?? 0.42), 0.01, 0.8);
      const mass = clampDet(Number(payload.massEarth ?? 4.5), 0.1, 300);

      const sys = state.systems.find((s) => s.id === sysId) ?? state.systems[0];
      const newBody: CelestialBody = {
        id: `body-rogue-${state.nextBodyId++}`,
        name,
        systemId: sysId,
        bodyClass: 'comet_rogue',
        massEarth: mass,
        radiusEarth: roundDet(Math.pow(mass, 0.28), 2),
        semiMajorAxisAu: a,
        eccentricity: e,
        inclinationDeg: 14.5,
        orbitalPeriodYears: 1,
        meanAnomalyRad: 1.2,
        trueAnomalyRad: 1.2,
        currentRadiusAu: a,
        orbitalVelocityKms: 30,
        x: sys.centerOffset[0],
        z: sys.centerOffset[2],
        prevX: sys.centerOffset[0],
        prevZ: sys.centerOffset[2],
        albedo: 0.32,
        greenhouseOpticalDepth: 0.9,
        incidentFluxWm2: 900,
        equilibriumTempK: 250,
        surfaceTempK: 270,
        atmospherePressureBar: 0.8,
        tidalHeatingWm2: 2,
        habitabilityIndex: 40,
        orbitalStabilityIndex: 62,
        color: '#e879f9',
      };
      updateBodyPhysicsAndPosition(newBody, sys, ctx.config.greenhouseForcingMultiplier);
      state.bodies.push(newBody);

      // Perturb existing planets in that system slightly
      for (const b of state.bodies) {
        if (b.systemId === sysId && b.id !== newBody.id && b.bodyClass !== 'star') {
          b.eccentricity = roundDet(clampDet(b.eccentricity + 0.05, 0.01, 0.8), 4);
          updateBodyPhysicsAndPosition(b, sys, ctx.config.greenhouseForcingMultiplier);
        }
      }

      ctx.emitEvent({
        type: 'celestial_body_introduced',
        severity: 'warning',
        title: `${newBody.name} Entered ${sys.name}`,
        description: `Introduced ${newBody.name} (${mass} M⊕, a=${a} AU, e=${e}), perturbing neighboring planetary orbits.`,
        sourceSystem: 'command_bus',
        sourceEntityId: newBody.id,
        affectedEntityIds: [newBody.id],
        payload: { bodyId: newBody.id, systemId: sysId, semiMajorAxisAu: a, eccentricity: e },
        causalLinkType: 'direct',
        causalExplanation: 'Gravitational capture added a new perturbing body to the system.',
      });
      return;
    }

    if (command.type === 'trigger_stellar_flare') {
      const intensity = Number(payload.flareIntensity ?? 45);
      for (const sys of state.systems) {
        sys.flareActivityIndex = roundDet(clampDet(sys.flareActivityIndex + intensity, 0, 100), 2);
      }
      for (const b of state.bodies) {
        if (b.bodyClass !== 'star' && b.semiMajorAxisAu < 1.1) {
          b.atmospherePressureBar = roundDet(Math.max(0.05, b.atmospherePressureBar * 0.86), 2);
          const sys = state.systems.find((s) => s.id === b.systemId) ?? state.systems[0];
          updateBodyPhysicsAndPosition(b, sys, ctx.config.greenhouseForcingMultiplier);
        }
      }
      const ev = ctx.emitEvent({
        type: 'stellar_radiation_surge',
        severity: 'critical',
        title: `Coronal Superflare Burst (+${intensity} Flare Index)`,
        description: 'Intense stellar proton and X-ray storm eroded inner planetary atmospheres.',
        sourceSystem: 'command_bus',
        payload: { flareIntensity: intensity, radiationFluxMultiplier: 1.45 },
        causalLinkType: 'direct',
        causalExplanation: 'Triggered stellar coronal mass ejection across inner orbital zones.',
      });
      state.lastFlareEventId = ev.id;
      return;
    }

    if (command.type === 'adjust_planetary_greenhouse') {
      const delta = Number(payload.deltaOpticalDepth ?? 0.4);
      for (const b of state.bodies) {
        if (b.bodyClass !== 'star' && b.bodyClass !== 'gas_giant') {
          b.greenhouseOpticalDepth = roundDet(clampDet(b.greenhouseOpticalDepth + delta, 0, 4.0), 2);
          const sys = state.systems.find((s) => s.id === b.systemId) ?? state.systems[0];
          updateBodyPhysicsAndPosition(b, sys, ctx.config.greenhouseForcingMultiplier);
        }
      }
      ctx.emitEvent({
        type: 'planetary_greenhouse_adjusted',
        severity: 'info',
        title: `Planetary Greenhouse Optical Depth (${delta > 0 ? '+' : ''}${delta})`,
        description: 'Updated infrared optical depth and surface temperatures across terrestrial and ocean worlds.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Modified atmospheric greenhouse gas opacity.',
      });
      return;
    }

    if (command.type === 'adjust_planetary_albedo') {
      const delta = Number(payload.deltaAlbedo ?? 0.1);
      for (const b of state.bodies) {
        if (b.bodyClass !== 'star') {
          b.albedo = roundDet(clampDet(b.albedo + delta, 0.05, 0.85), 2);
          const sys = state.systems.find((s) => s.id === b.systemId) ?? state.systems[0];
          updateBodyPhysicsAndPosition(b, sys, ctx.config.greenhouseForcingMultiplier);
        }
      }
      ctx.emitEvent({
        type: 'planetary_albedo_adjusted',
        severity: 'info',
        title: `Planetary Bond Albedo Adjusted (${delta > 0 ? '+' : ''}${delta})`,
        description: 'Altered planetary reflectivity and radiative equilibrium temperatures.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Modified planetary surface/orbital mirror reflectivity.',
      });
      return;
    }

    if (command.type === 'replenish_planetary_atmosphere') {
      const deltaBar = Number(payload.deltaBar ?? 0.8);
      for (const b of state.bodies) {
        if (b.bodyClass === 'terrestrial' || b.bodyClass === 'ocean_world' || b.bodyClass === 'icy_moon') {
          b.atmospherePressureBar = roundDet(clampDet(b.atmospherePressureBar + deltaBar, 0.05, 10), 2);
          const sys = state.systems.find((s) => s.id === b.systemId) ?? state.systems[0];
          updateBodyPhysicsAndPosition(b, sys, ctx.config.greenhouseForcingMultiplier);
        }
      }
      ctx.emitEvent({
        type: 'atmosphere_volatiles_replenished',
        severity: 'positive',
        title: `Cometary Volatile Delivery (+${deltaBar} bar)`,
        description: 'Increased surface atmospheric pressure across rocky and icy worlds.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Volatile delivery restored atmospheric pressure envelope.',
      });
      return;
    }

    if (command.type === 'stabilize_orbital_resonances') {
      const boost = Number(payload.stabilityBoost ?? 24);
      for (const sys of state.systems) {
        sys.flareActivityIndex = roundDet(Math.max(5, sys.flareActivityIndex * 0.5), 2);
      }
      for (const b of state.bodies) {
        if (b.bodyClass !== 'star') {
          b.eccentricity = roundDet(clampDet(b.eccentricity * 0.65, 0.01, 0.5), 4);
          b.orbitalStabilityIndex = roundDet(clampDet(b.orbitalStabilityIndex + boost, 0, 100), 2);
          const sys = state.systems.find((s) => s.id === b.systemId) ?? state.systems[0];
          updateBodyPhysicsAndPosition(b, sys, ctx.config.greenhouseForcingMultiplier);
        }
      }
      ctx.emitEvent({
        type: 'orbital_resonances_stabilized',
        severity: 'positive',
        title: 'Mean-Motion Orbital Resonances Locked',
        description: 'Damped secular perturbations and restored high dynamical stability across all 3 star systems.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Resonant phase locking minimized eccentricity excitation.',
      });
    }
  },

  extractMetrics(state) {
    const orbiting = state.bodies.filter((b) => b.bodyClass !== 'star');
    const rockyCandidates = orbiting.filter(
      (b) => b.bodyClass !== 'gas_giant' && b.bodyClass !== 'ice_giant',
    );
    const nOrbit = Math.max(1, orbiting.length);
    const nRocky = Math.max(1, rockyCandidates.length);

    const habitableCount = rockyCandidates.filter((b) => b.habitabilityIndex >= 60).length;
    const meanHab =
      rockyCandidates.reduce((a, b) => a + b.habitabilityIndex, 0) / nRocky;
    const maxHab = Math.max(...rockyCandidates.map((b) => b.habitabilityIndex), 0);

    const meanTerrTemp =
      rockyCandidates.reduce((a, b) => a + b.surfaceTempK, 0) / nRocky;
    const meanEqTemp =
      orbiting.reduce((a, b) => a + b.equilibriumTempK, 0) / nOrbit;
    const meanFlux =
      orbiting.reduce((a, b) => a + b.incidentFluxWm2, 0) / nOrbit;

    const meanEcc = orbiting.reduce((a, b) => a + b.eccentricity, 0) / nOrbit;
    const maxEcc = Math.max(...orbiting.map((b) => b.eccentricity), 0);
    const meanVel =
      orbiting.reduce((a, b) => a + b.orbitalVelocityKms, 0) / nOrbit;
    const meanA =
      orbiting.reduce((a, b) => a + b.semiMajorAxisAu, 0) / nOrbit;

    const totalLum = state.systems.reduce((a, s) => a + s.luminositySolar, 0);
    const meanTidal =
      orbiting.reduce((a, b) => a + b.tidalHeatingWm2, 0) / nOrbit;
    const meanAtm =
      rockyCandidates.reduce((a, b) => a + b.atmospherePressureBar, 0) / nRocky;
    const meanFlare =
      state.systems.reduce((a, s) => a + s.flareActivityIndex, 0) /
      Math.max(1, state.systems.length);
    const meanStability =
      orbiting.reduce((a, b) => a + b.orbitalStabilityIndex, 0) / nOrbit;

    return {
      totalCelestialBodies: state.bodies.length,
      activeStarSystems: state.systems.length,
      habitableWorldsCount: habitableCount,
      meanHabitabilityIndex: roundDet(meanHab, 2),
      maxHabitabilityIndex: roundDet(maxHab, 2),
      meanTerrestrialTempK: roundDet(meanTerrTemp, 2),
      meanEquilibriumTempK: roundDet(meanEqTemp, 2),
      meanIncidentFluxWm2: roundDet(meanFlux, 1),
      meanEccentricity: roundDet(meanEcc, 4),
      maxEccentricity: roundDet(maxEcc, 4),
      meanOrbitalVelocityKms: roundDet(meanVel, 2),
      meanSemiMajorAxisAu: roundDet(meanA, 3),
      totalStellarLuminositySolar: roundDet(totalLum, 3),
      meanTidalHeatingWm2: roundDet(meanTidal, 2),
      meanAtmospherePressureBar: roundDet(meanAtm, 2),
      meanFlareActivityIndex: roundDet(meanFlare, 2),
      elapsedSimYears: roundDet(state.elapsedSimYears, 2),
      meanOrbitalStabilityIndex: roundDet(meanStability, 2),
    };
  },

  inspectEntities(state) {
    const list: EntityInspection[] = [];

    for (const sys of state.systems) {
      list.push({
        entityId: `sys-${sys.id}`,
        kind: 'star_system_hz',
        label: `${sys.name} (${sys.spectralType})`,
        status: sys.flareActivityIndex > 55 ? 'warning' : 'nominal',
        position: sys.centerOffset,
        summary: `Luminosity ${sys.luminositySolar} L☉ • HZ [${sys.habitableZoneInnerAu} - ${sys.habitableZoneOuterAu} AU] • Flare Index ${sys.flareActivityIndex}`,
        properties: [
          { key: 'spectralType', label: 'Spectral Class', value: sys.spectralType },
          { key: 'stellarMassSolar', label: 'Stellar Mass', value: sys.stellarMassSolar, unit: 'M☉' },
          { key: 'luminositySolar', label: 'Luminosity', value: sys.luminositySolar, unit: 'L☉' },
          { key: 'surfaceTempK', label: 'Photosphere Temp', value: sys.surfaceTempK, unit: 'K' },
          { key: 'hzInner', label: 'Habitable Zone Inner', value: sys.habitableZoneInnerAu, unit: 'AU' },
          { key: 'hzOuter', label: 'Habitable Zone Outer', value: sys.habitableZoneOuterAu, unit: 'AU' },
          { key: 'flareActivityIndex', label: 'Flare Activity', value: sys.flareActivityIndex, unit: 'idx' },
        ],
      });
    }

    for (const b of state.bodies) {
      const status =
        b.orbitalStabilityIndex < 45
          ? 'critical'
          : b.habitabilityIndex >= 65
            ? 'nominal'
            : b.eccentricity > 0.28
              ? 'warning'
              : 'nominal';

      list.push({
        entityId: b.id,
        kind: b.bodyClass,
        label: `${b.name} (${b.systemId.toUpperCase()})`,
        status,
        position: [b.x, 1.2, b.z],
        summary:
          b.bodyClass === 'star'
            ? `Host Star (${b.surfaceTempK} K)`
            : `a=${b.semiMajorAxisAu} AU • e=${b.eccentricity} • T_surf=${b.surfaceTempK} K • Habitability ${b.habitabilityIndex}%`,
        properties: [
          { key: 'systemId', label: 'Star System', value: b.systemId },
          { key: 'bodyClass', label: 'Body Class', value: b.bodyClass },
          { key: 'semiMajorAxisAu', label: 'Semi-Major Axis (a)', value: b.semiMajorAxisAu, unit: 'AU' },
          { key: 'eccentricity', label: 'Eccentricity (e)', value: b.eccentricity },
          { key: 'orbitalPeriodYears', label: 'Orbital Period', value: b.orbitalPeriodYears, unit: 'yr' },
          { key: 'orbitalVelocityKms', label: 'Orbital Velocity', value: b.orbitalVelocityKms, unit: 'km/s' },
          { key: 'incidentFluxWm2', label: 'Stellar Irradiance', value: b.incidentFluxWm2, unit: 'W/m²' },
          { key: 'equilibriumTempK', label: 'Equilibrium Temp', value: b.equilibriumTempK, unit: 'K' },
          { key: 'surfaceTempK', label: 'Surface Temp', value: b.surfaceTempK, unit: 'K' },
          { key: 'atmospherePressureBar', label: 'Atmosphere', value: b.atmospherePressureBar, unit: 'bar' },
          { key: 'habitabilityIndex', label: 'Habitability Index', value: b.habitabilityIndex, unit: '%' },
          { key: 'orbitalStabilityIndex', label: 'Orbital Stability', value: b.orbitalStabilityIndex, unit: '%' },
        ],
      });
    }

    return list;
  },

  extractRenderFrame(state, _config, runId, tick): RenderFrameData {
    const visibleSystems = state.systems.filter(
      (s) => state.activeSystemFilter === 'all' || s.id === state.activeSystemFilter,
    );

    const zones: RenderZoneVisual[] = visibleSystems.map((sys) => {
      const hzDiameter = 7 + Math.sqrt(sys.habitableZoneOuterAu) * 14;
      return {
        id: `sys-${sys.id}`,
        label: `${sys.name} Habitable Zone`,
        position: [sys.centerOffset[0], 0.1, sys.centerOffset[2]],
        size: [hzDiameter, 0.22, hzDiameter],
        value: roundDet(sys.luminositySolar, 2),
        status: sys.flareActivityIndex > 55 ? 'warning' : 'nominal',
        color: '#1e293b',
      };
    });

    const visibleBodies = state.bodies.filter(
      (b) => state.activeSystemFilter === 'all' || b.systemId === state.activeSystemFilter,
    );

    const entities: RenderEntityVisual[] = visibleBodies.map((b) => {
      const scaleVal =
        b.bodyClass === 'star'
          ? 2.8
          : b.bodyClass === 'gas_giant'
            ? 1.9
            : b.bodyClass === 'ice_giant'
              ? 1.5
              : 1.1;

      return {
        id: b.id,
        kind:
          b.bodyClass === 'star'
            ? 'star'
            : b.bodyClass === 'comet_rogue'
              ? 'predator'
              : 'herbivore',
        label: `${b.name} (${b.surfaceTempK}K)`,
        position: [b.x, b.bodyClass === 'star' ? 1.8 : 1.2, b.z],
        prevPosition: [b.prevX, b.bodyClass === 'star' ? 1.8 : 1.2, b.prevZ],
        scale: [scaleVal, scaleVal, scaleVal],
        color: b.color,
        energyOrHealth: roundDet(b.habitabilityIndex / 100, 2),
        status:
          b.orbitalStabilityIndex < 45
            ? 'critical'
            : b.eccentricity > 0.28
              ? 'warning'
              : 'nominal',
      };
    });

    // Connect each orbiting planet to its host star with a gravitational radius vector
    const connections: RenderConnectionVisual[] = [];
    for (const b of visibleBodies) {
      if (b.bodyClass === 'star') continue;
      const sys = state.systems.find((s) => s.id === b.systemId);
      if (!sys) continue;
      connections.push({
        id: `orbit-vec-${b.id}`,
        from: [sys.centerOffset[0], 0.4, sys.centerOffset[2]],
        to: [b.x, 0.4, b.z],
        status: b.habitabilityIndex >= 60 ? 'open' : b.eccentricity > 0.28 ? 'active' : 'open',
        flowRate: b.orbitalVelocityKms,
        label: `Orbit ${b.name} (a=${b.semiMajorAxisAu} AU, e=${b.eccentricity})`,
      });
    }

    const metrics = this.extractMetrics(state, _config);
    const ambientStatus =
      metrics.meanOrbitalStabilityIndex < 50 || metrics.habitableWorldsCount === 0
        ? 'critical'
        : metrics.meanEccentricity > 0.24 || metrics.meanFlareActivityIndex > 50
          ? 'warning'
          : 'nominal';

    return {
      worldId: 'celestial',
      runId,
      tick,
      ambientStatus,
      entities,
      zones,
      connections,
      hudSummary: {
        'Star Systems': state.systems.length,
        'Celestial Bodies': state.bodies.length,
        'Habitable Worlds': metrics.habitableWorldsCount,
        'Mean Eccentricity': metrics.meanEccentricity,
        'Orbital Time': `${metrics.elapsedSimYears} yr`,
      },
    };
  },
});
