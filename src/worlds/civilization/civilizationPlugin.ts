import { z } from 'zod';
import {
  clampDet,
  EntityInspection,
  RenderConnectionVisual,
  RenderEntityVisual,
  RenderFrameData,
  RenderZoneVisual,
  roundDet,
  RunId,
  SimulationCommand,
  Tick,
} from '../../core/contracts';
import { defineWorldPlugin } from '../../core/pdk';

export interface CivilizationConfig extends Record<string, unknown> {
  initialPopulationMultiplier: number;
  arableFertility: number;
  aquiferAbundance: number;
  constructionEfficiency: number;
  perCapitaConsumption: number;
  tradeEfficiency: number;
}

export interface LaborAllocation {
  farming: number; // 0..1
  waterworks: number; // 0..1
  construction: number; // 0..1
  logistics: number; // 0..1
}

export interface SettlementInfrastructure {
  farmsLevel: number;
  waterworksLevel: number;
  housingLevel: number;
  storageLevel: number;
}

export interface Settlement {
  id: string;
  name: string;
  regionType: 'basin' | 'mesa' | 'delta' | 'highland';
  position: [number, number, number];
  population: number;
  housingCapacity: number;
  foodStock: number;
  waterStock: number;
  materialsStock: number;
  storageCapacity: number;
  lastFoodProduction: number;
  lastFoodConsumption: number;
  lastWaterProduction: number;
  lastWaterConsumption: number;
  lastMaterialsProduction: number;
  arableQuality: number;
  aquiferYield: number;
  mineralYield: number;
  labor: LaborAllocation;
  infrastructure: SettlementInfrastructure;
  activeConstructionProject: 'housing' | 'farms' | 'waterworks' | 'storage' | null;
  constructionProgress: number; // 0..100
  shortageStreakTicks: number;
  stabilityIndex: number; // 0..100
}

export interface TransportRoute {
  id: string;
  fromSettlementId: string;
  toSettlementId: string;
  capacityPerTick: number;
  lastTransferredAmount: number;
  active: boolean;
}

export interface CivilizationState {
  settlements: Settlement[];
  routes: TransportRoute[];
  regionalDroughtTicks: number;
  regionalDroughtSeverity: number;
  developmentPriority: 'balanced' | 'water_security' | 'agrarian_growth' | 'infrastructure_expansion';
  cumulativeInfrastructureBuilt: number;
  cumulativeShortageEvents: number;
  lastDroughtEventId: string | null;
  lastShortageEventId: string | null;
}

const civilizationConfigSchema = z.object({
  initialPopulationMultiplier: z.number().min(0.4).max(2.5),
  arableFertility: z.number().min(0.3).max(2.5),
  aquiferAbundance: z.number().min(0.3).max(2.5),
  constructionEfficiency: z.number().min(0.3).max(2.5),
  perCapitaConsumption: z.number().min(0.4).max(2.0),
  tradeEfficiency: z.number().min(0.2).max(2.5),
});

function normalizeLabor(labor: LaborAllocation): LaborAllocation {
  const sum =
    Math.max(0.05, labor.farming) +
    Math.max(0.05, labor.waterworks) +
    Math.max(0.05, labor.construction) +
    Math.max(0.05, labor.logistics);
  return {
    farming: roundDet(Math.max(0.05, labor.farming) / sum, 3),
    waterworks: roundDet(Math.max(0.05, labor.waterworks) / sum, 3),
    construction: roundDet(Math.max(0.05, labor.construction) / sum, 3),
    logistics: roundDet(Math.max(0.05, labor.logistics) / sum, 3),
  };
}

const FRONTIER_SITES: Array<{
  id: string;
  name: string;
  regionType: Settlement['regionType'];
  position: [number, number, number];
  arableQuality: number;
  aquiferYield: number;
  mineralYield: number;
}> = [
  {
    id: 'stl-vanguard',
    name: 'Vanguard Highland',
    regionType: 'highland',
    position: [-16, 1.5, 16],
    arableQuality: 0.85,
    aquiferYield: 0.9,
    mineralYield: 1.45,
  },
  {
    id: 'stl-kestrel',
    name: 'Kestrel Oasis',
    regionType: 'basin',
    position: [18, 0.7, -15],
    arableQuality: 1.15,
    aquiferYield: 1.25,
    mineralYield: 0.95,
  },
];

export const civilizationPlugin = defineWorldPlugin<
  CivilizationConfig,
  CivilizationState
>({
  id: 'civilization',
  name: 'World C — Civilization Network',
  subtitle: 'Settlement Resource Accounting, Labor, Infrastructure & Trade Convoys',
  version: '1.0.0',
  schemaVersion: 1,
  accentColor: '#ffb300',
  description:
    'Regional multi-settlement laboratory modeling food & water stockpiles, labor allocation, housing & storage constraints, infrastructure construction inputs, and inter-settlement convoy logistics.',
  physicalModelDocumentation: [
    'Conservation of stockpiles: For every settlement, Stock(t+1) = clamp(Stock(t) + Production - Consumption + ConvoyImports - ConvoyExports, 0, StorageCapacity).',
    'Production functions: Food and Water output depend on active population, labor share, regional fertility/aquifer yield, and built infrastructure levels.',
    'Demographic constraints: Population growth requires surplus food, surplus water, and available housing capacity. Resource deficits trigger immediate stability loss and population decline.',
  ],
  simplifiedMechanicsNote:
    'Explicitly models aggregate settlement resource accounting, infrastructure capital, and convoy transport rather than individual citizen politics, warfare, or speculative currency markets.',
  configSchema: civilizationConfigSchema,
  defaultConfig: {
    initialPopulationMultiplier: 1.0,
    arableFertility: 1.0,
    aquiferAbundance: 1.0,
    constructionEfficiency: 1.0,
    perCapitaConsumption: 1.0,
    tradeEfficiency: 1.0,
  },
  scenarios: [
    {
      id: 'civ-arid-frontier-crisis',
      name: 'The Arid Frontier Infrastructure Crisis',
      subtitle: 'Aqueduct Investment vs. Hydrological Scarcity',
      description:
        'Three settlements share a semi-arid region. At Tick 8, a prolonged dry cycle strikes Solis Mesa and Aethelgard Basin. Without early water infrastructure construction and trade route activation, Solis Mesa suffers severe water shortages and population decline.',
      hypothesis:
        'Building water infrastructure and prioritizing waterworks labor before Tick 8 prevents shortage collapse and yields >35% higher regional population by Tick 40.',
      seed: 60412,
      config: {
        initialPopulationMultiplier: 1.0,
        arableFertility: 1.0,
        aquiferAbundance: 0.82,
        constructionEfficiency: 1.05,
        perCapitaConsumption: 1.0,
        tradeEfficiency: 1.1,
      },
      scheduledCommands: [
        {
          tick: 8,
          type: 'trigger_regional_drought',
          label: 'Scheduled Regional Aquifer Dry Cycle',
          payload: { severity: 0.42, durationTicks: 26 },
        },
      ],
    },
    {
      id: 'civ-river-confederation',
      name: 'River Basin Expansion & New Frontier',
      subtitle: 'Multi-Settlement Growth & Colonization',
      description:
        'Abundant initial stockpiles allow founding a fourth highland settlement, expanding housing blocks, and linking all settlements into an integrated transport network.',
      hypothesis:
        'Expanding housing capacity alongside agrarian irrigation unlocks sustained demographic growth without triggering storage bottlenecks.',
      seed: 24680,
      config: {
        initialPopulationMultiplier: 1.05,
        arableFertility: 1.15,
        aquiferAbundance: 1.15,
        constructionEfficiency: 1.15,
        perCapitaConsumption: 0.95,
        tradeEfficiency: 1.2,
      },
    },
    {
      id: 'civ-scarcity-stabilization',
      name: 'Overpopulated Scarcity Recovery',
      subtitle: 'High Consumption vs. Infrastructure Bottleneck',
      description:
        'Settlements begin near housing capacity with tight food and water margins. Requires immediate labor reallocation and emergency convoy redistribution.',
      hypothesis:
        'Reallocating labor toward waterworks & farming while constructing aqueducts stabilizes all three settlements.',
      seed: 13579,
      config: {
        initialPopulationMultiplier: 1.35,
        arableFertility: 0.88,
        aquiferAbundance: 0.85,
        constructionEfficiency: 1.0,
        perCapitaConsumption: 1.1,
        tradeEfficiency: 1.0,
      },
    },
  ],
  quickInterventions: [
    {
      id: 'civ-build-water',
      label: 'Build Water Aqueducts (+1 Level All)',
      description: 'Invests materials to upgrade water infrastructure across settlements, permanently boosting aquifer extraction.',
      category: 'structure',
      commandType: 'build_water_infrastructure',
      defaultPayload: { targetSettlementId: 'all' },
    },
    {
      id: 'civ-expand-food',
      label: 'Expand Food Production (Irrigation)',
      description: 'Constructs terraced irrigation farms to boost agricultural output.',
      category: 'structure',
      commandType: 'expand_food_production',
      defaultPayload: { targetSettlementId: 'all' },
    },
    {
      id: 'civ-build-housing',
      label: 'Construct Housing Blocks (+65 Cap)',
      description: 'Expands settlement housing capacity using construction materials.',
      category: 'structure',
      commandType: 'construct_housing',
      defaultPayload: { targetSettlementId: 'all' },
    },
    {
      id: 'civ-establish-routes',
      label: 'Establish Full Transport Network',
      description: 'Completes high-capacity road links between all settlements for automatic surplus sharing.',
      category: 'policy',
      commandType: 'establish_route',
      defaultPayload: { upgradeAll: true },
    },
    {
      id: 'civ-redistribute',
      label: 'Redistribute Emergency Reserves',
      description: 'Dispatches immediate relief convoys from surplus settlements to shortage zones.',
      category: 'restoration',
      commandType: 'redistribute_resources',
      defaultPayload: { amount: 45 },
    },
    {
      id: 'civ-found-settlement',
      label: 'Found Frontier Settlement',
      description: 'Charters a new settlement at Vanguard Highland or Kestrel Oasis with pioneer colonists.',
      category: 'structure',
      commandType: 'found_settlement',
      defaultPayload: {},
    },
    {
      id: 'civ-priority-water',
      label: 'Prioritize Water & Agrarian Labor',
      description: 'Reallocates settlement workforce toward waterworks (38%) and farming (38%).',
      category: 'policy',
      commandType: 'change_development_priority',
      defaultPayload: { priority: 'water_security' },
    },
    {
      id: 'civ-trigger-drought',
      label: 'Trigger Regional Drought (-45% Water)',
      description: 'Reduces regional aquifer recharge by 45% for 25 ticks.',
      category: 'crisis',
      commandType: 'trigger_regional_drought',
      defaultPayload: { severity: 0.45, durationTicks: 25 },
    },
  ],
  metricDefinitions: [
    {
      id: 'totalPopulation',
      label: 'Total Regional Population',
      unit: 'citizens',
      category: 'Demographics',
      description: 'Combined population across all active settlements.',
      warningThreshold: 220,
      criticalThreshold: 140,
      higherIsBetter: true,
    },
    {
      id: 'totalHousingCapacity',
      label: 'Total Housing Capacity',
      unit: 'citizens',
      category: 'Infrastructure',
      description: 'Maximum population supported by built residential infrastructure.',
      higherIsBetter: true,
    },
    {
      id: 'totalFoodStock',
      label: 'Regional Food Stockpile',
      unit: 'tons',
      category: 'Resources',
      description: 'Aggregate stored grain and provisions across settlement granaries.',
      warningThreshold: 120,
      criticalThreshold: 55,
      higherIsBetter: true,
    },
    {
      id: 'totalWaterStock',
      label: 'Regional Water Reserve',
      unit: 'kL',
      category: 'Resources',
      description: 'Aggregate potable water stored in reservoirs and cisterns.',
      warningThreshold: 120,
      criticalThreshold: 55,
      higherIsBetter: true,
    },
    {
      id: 'infrastructureIndex',
      label: 'Infrastructure Capital Index',
      unit: 'levels',
      category: 'Infrastructure',
      description: 'Sum of built farm, aqueduct, housing, and storage infrastructure tiers.',
      higherIsBetter: true,
    },
    {
      id: 'meanStabilityIndex',
      label: 'Civilization Stability Index',
      unit: '%',
      category: 'Stability',
      comparableDimension: 'system_stability_ratio',
      description: 'Population-weighted settlement stability and resource adequacy score (0-100%).',
      warningThreshold: 60,
      criticalThreshold: 35,
      higherIsBetter: true,
    },
  ],

  initializeWorld(config) {
    const popMult = config.initialPopulationMultiplier;
    const settlements: Settlement[] = [
      {
        id: 'stl-aethelgard',
        name: 'Aethelgard Basin',
        regionType: 'basin',
        position: [-14, 0.6, -10],
        population: Math.round(145 * popMult),
        housingCapacity: 210,
        foodStock: 165,
        waterStock: 160,
        materialsStock: 110,
        storageCapacity: 320,
        lastFoodProduction: 22,
        lastFoodConsumption: 19,
        lastWaterProduction: 22,
        lastWaterConsumption: 19,
        lastMaterialsProduction: 10,
        arableQuality: 1.15,
        aquiferYield: 1.05,
        mineralYield: 1.0,
        labor: { farming: 0.36, waterworks: 0.28, construction: 0.22, logistics: 0.14 },
        infrastructure: {
          farmsLevel: 2,
          waterworksLevel: 2,
          housingLevel: 2,
          storageLevel: 2,
        },
        activeConstructionProject: 'farms',
        constructionProgress: 20,
        shortageStreakTicks: 0,
        stabilityIndex: 88,
      },
      {
        id: 'stl-solis',
        name: 'Solis Mesa',
        regionType: 'mesa',
        position: [15, 1.8, -4],
        population: Math.round(110 * popMult),
        housingCapacity: 160,
        foodStock: 105,
        waterStock: 88,
        materialsStock: 135,
        storageCapacity: 260,
        lastFoodProduction: 14,
        lastFoodConsumption: 14,
        lastWaterProduction: 13,
        lastWaterConsumption: 14,
        lastMaterialsProduction: 14,
        arableQuality: 0.82,
        aquiferYield: 0.72,
        mineralYield: 1.35,
        labor: { farming: 0.34, waterworks: 0.3, construction: 0.24, logistics: 0.12 },
        infrastructure: {
          farmsLevel: 1,
          waterworksLevel: 1,
          housingLevel: 2,
          storageLevel: 1,
        },
        activeConstructionProject: 'waterworks',
        constructionProgress: 15,
        shortageStreakTicks: 0,
        stabilityIndex: 78,
      },
      {
        id: 'stl-meridian',
        name: 'Meridian Delta',
        regionType: 'delta',
        position: [-2, 0.3, 15],
        population: Math.round(130 * popMult),
        housingCapacity: 190,
        foodStock: 155,
        waterStock: 175,
        materialsStock: 90,
        storageCapacity: 300,
        lastFoodProduction: 20,
        lastFoodConsumption: 17,
        lastWaterProduction: 24,
        lastWaterConsumption: 17,
        lastMaterialsProduction: 8,
        arableQuality: 1.1,
        aquiferYield: 1.25,
        mineralYield: 0.85,
        labor: { farming: 0.35, waterworks: 0.31, construction: 0.2, logistics: 0.14 },
        infrastructure: {
          farmsLevel: 2,
          waterworksLevel: 2,
          housingLevel: 2,
          storageLevel: 2,
        },
        activeConstructionProject: 'housing',
        constructionProgress: 10,
        shortageStreakTicks: 0,
        stabilityIndex: 90,
      },
    ];

    const routes: TransportRoute[] = [
      {
        id: 'route-aethel-solis',
        fromSettlementId: 'stl-aethelgard',
        toSettlementId: 'stl-solis',
        capacityPerTick: 14,
        lastTransferredAmount: 0,
        active: true,
      },
      {
        id: 'route-aethel-meridian',
        fromSettlementId: 'stl-aethelgard',
        toSettlementId: 'stl-meridian',
        capacityPerTick: 16,
        lastTransferredAmount: 0,
        active: true,
      },
      {
        id: 'route-meridian-solis',
        fromSettlementId: 'stl-meridian',
        toSettlementId: 'stl-solis',
        capacityPerTick: 12,
        lastTransferredAmount: 0,
        active: false, // Can be activated by user or infrastructure command
      },
    ];

    return {
      settlements,
      routes,
      regionalDroughtTicks: 0,
      regionalDroughtSeverity: 0,
      developmentPriority: 'balanced',
      cumulativeInfrastructureBuilt: 0,
      cumulativeShortageEvents: 0,
      lastDroughtEventId: null,
      lastShortageEventId: null,
    };
  },

  systems: [
    {
      id: 'civ_1_production_and_construction',
      name: 'Labor Production, Resource Extraction & Infrastructure Construction',
      order: 10,
      step(ctx) {
        const { state, config } = ctx;

        const isDrought = state.regionalDroughtTicks > 0;
        if (isDrought) {
          state.regionalDroughtTicks -= 1;
        }
        const droughtMultiplier = isDrought
          ? Math.max(0.25, 1 - state.regionalDroughtSeverity)
          : 1.0;

        for (const stl of state.settlements) {
          stl.labor = normalizeLabor(stl.labor);
          const workforce = stl.population * 0.62;

          // Food production: workforce * farming share * arableQuality * farm infrastructure bonus
          const farmBonus = 1 + stl.infrastructure.farmsLevel * 0.26;
          const rainEffect = 0.65 + 0.35 * droughtMultiplier;
          const foodProduced = roundDet(
            workforce *
              stl.labor.farming *
              0.44 *
              stl.arableQuality *
              config.arableFertility *
              farmBonus *
              rainEffect,
            2,
          );

          // Water extraction: workforce * waterworks share * aquiferYield * aqueduct infrastructure bonus
          // Note: High waterworks infrastructure mitigates surface drought by tapping deep aquifers!
          const deepAquiferResilience = Math.min(
            0.95,
            droughtMultiplier + stl.infrastructure.waterworksLevel * 0.11,
          );
          const waterBonus = 1 + stl.infrastructure.waterworksLevel * 0.3;
          const waterProduced = roundDet(
            workforce *
              stl.labor.waterworks *
              0.52 *
              stl.aquiferYield *
              config.aquiferAbundance *
              waterBonus *
              deepAquiferResilience,
            2,
          );

          // Materials production: workforce * construction share * mineralYield
          const matProduced = roundDet(
            workforce *
              stl.labor.construction *
              0.32 *
              stl.mineralYield *
              config.constructionEfficiency,
            2,
          );

          stl.lastFoodProduction = foodProduced;
          stl.lastWaterProduction = waterProduced;
          stl.lastMaterialsProduction = matProduced;

          stl.foodStock = roundDet(
            clampDet(stl.foodStock + foodProduced, 0, stl.storageCapacity),
            2,
          );
          stl.waterStock = roundDet(
            clampDet(stl.waterStock + waterProduced, 0, stl.storageCapacity),
            2,
          );
          stl.materialsStock = roundDet(
            clampDet(stl.materialsStock + matProduced, 0, stl.storageCapacity),
            2,
          );

          //Ongoing Construction Project progress
          if (stl.activeConstructionProject && stl.materialsStock >= 6) {
            const buildEffort = roundDet(
              workforce *
                stl.labor.construction *
                0.55 *
                config.constructionEfficiency,
              2,
            );
            const matUsed = roundDet(Math.min(stl.materialsStock, buildEffort * 0.45), 2);
            stl.materialsStock = roundDet(stl.materialsStock - matUsed, 2);
            stl.constructionProgress = roundDet(
              stl.constructionProgress + buildEffort * 1.15,
              1,
            );

            if (stl.constructionProgress >= 100) {
              stl.constructionProgress = 0;
              const completed = stl.activeConstructionProject;
              state.cumulativeInfrastructureBuilt += 1;

              if (completed === 'waterworks') {
                stl.infrastructure.waterworksLevel += 1;
                stl.activeConstructionProject = 'farms';
              } else if (completed === 'farms') {
                stl.infrastructure.farmsLevel += 1;
                stl.activeConstructionProject = 'housing';
              } else if (completed === 'housing') {
                stl.infrastructure.housingLevel += 1;
                stl.housingCapacity += 55;
                stl.activeConstructionProject = 'storage';
              } else {
                stl.infrastructure.storageLevel += 1;
                stl.storageCapacity += 70;
                stl.activeConstructionProject = 'waterworks';
              }

              ctx.emitEvent({
                type: 'infrastructure_completed',
                severity: 'positive',
                title: `${stl.name} Completed ${completed.toUpperCase()} Upgrade`,
                description: `${stl.name} finished constructing ${completed} infrastructure utilizing local labor and materials.`,
                sourceSystem: 'civ_1_production_and_construction',
                sourceEntityId: stl.id,
                affectedEntityIds: [stl.id],
                payload: {
                  settlementId: stl.id,
                  project: completed,
                  materialsInvested: 35,
                  amount: 35,
                },
              });
            }
          }
        }
      },
    },
    {
      id: 'civ_2_convoy_logistics_and_exchange',
      name: 'Inter-Settlement Transport & Surplus Exchange',
      order: 20,
      step(ctx) {
        const { state, config } = ctx;

        for (const route of state.routes) {
          if (!route.active) {
            route.lastTransferredAmount = 0;
            continue;
          }
          const stlA = state.settlements.find((s) => s.id === route.fromSettlementId);
          const stlB = state.settlements.find((s) => s.id === route.toSettlementId);
          if (!stlA || !stlB) continue;

          const logisticsBoost =
            1 + (stlA.labor.logistics + stlB.labor.logistics) * 1.4;
          const maxCap = route.capacityPerTick * config.tradeEfficiency * logisticsBoost;
          let movedTotal = 0;

          // Exchange Water from high-per-capita to low-per-capita settlement
          const waterPerCapA = stlA.waterStock / Math.max(1, stlA.population);
          const waterPerCapB = stlB.waterStock / Math.max(1, stlB.population);
          if (Math.abs(waterPerCapA - waterPerCapB) > 0.25) {
            const donor = waterPerCapA > waterPerCapB ? stlA : stlB;
            const receiver = waterPerCapA > waterPerCapB ? stlB : stlA;
            if (donor.waterStock > 45) {
              const amount = roundDet(
                Math.min(
                  maxCap * 0.55,
                  (donor.waterStock - receiver.waterStock) * 0.22,
                  receiver.storageCapacity - receiver.waterStock,
                ),
                2,
              );
              if (amount > 0.5) {
                donor.waterStock = roundDet(donor.waterStock - amount, 2);
                receiver.waterStock = roundDet(receiver.waterStock + amount, 2);
                movedTotal += amount;
              }
            }
          }

          // Exchange Food from high-per-capita to low-per-capita settlement
          const foodPerCapA = stlA.foodStock / Math.max(1, stlA.population);
          const foodPerCapB = stlB.foodStock / Math.max(1, stlB.population);
          if (Math.abs(foodPerCapA - foodPerCapB) > 0.25) {
            const donor = foodPerCapA > foodPerCapB ? stlA : stlB;
            const receiver = foodPerCapA > foodPerCapB ? stlB : stlA;
            if (donor.foodStock > 45) {
              const amount = roundDet(
                Math.min(
                  maxCap * 0.55,
                  (donor.foodStock - receiver.foodStock) * 0.22,
                  receiver.storageCapacity - receiver.foodStock,
                ),
                2,
              );
              if (amount > 0.5) {
                donor.foodStock = roundDet(donor.foodStock - amount, 2);
                receiver.foodStock = roundDet(receiver.foodStock + amount, 2);
                movedTotal += amount;
              }
            }
          }

          route.lastTransferredAmount = roundDet(movedTotal, 2);
        }
      },
    },
    {
      id: 'civ_3_consumption_demographics_and_shortages',
      name: 'Resource Consumption, Shortages & Demographic Dynamics',
      order: 30,
      step(ctx) {
        const { state, config } = ctx;

        for (const stl of state.settlements) {
          const prevPop = stl.population;
          const foodNeeded = roundDet(
            stl.population * 0.135 * config.perCapitaConsumption,
            2,
          );
          const waterNeeded = roundDet(
            stl.population * 0.145 * config.perCapitaConsumption,
            2,
          );

          stl.lastFoodConsumption = foodNeeded;
          stl.lastWaterConsumption = waterNeeded;

          const foodFulfilled =
            foodNeeded > 0 ? clampDet(stl.foodStock / foodNeeded, 0, 1) : 1;
          const waterFulfilled =
            waterNeeded > 0 ? clampDet(stl.waterStock / waterNeeded, 0, 1) : 1;

          stl.foodStock = roundDet(Math.max(0, stl.foodStock - foodNeeded), 2);
          stl.waterStock = roundDet(Math.max(0, stl.waterStock - waterNeeded), 2);

          const minFulfillment = Math.min(foodFulfilled, waterFulfilled);

          if (minFulfillment < 0.92) {
            // Genuine scarcity consequence: shortage streak, stability drop, population loss
            stl.shortageStreakTicks += 1;
            state.cumulativeShortageEvents += 1;

            const deficitSeverity = 1 - minFulfillment;
            const popLoss = Math.max(
              2,
              Math.round(stl.population * (0.035 + deficitSeverity * 0.065)),
            );
            stl.population = Math.max(18, stl.population - popLoss);
            stl.stabilityIndex = roundDet(
              clampDet(stl.stabilityIndex - (6 + deficitSeverity * 12), 5, 100),
              1,
            );

            if (stl.shortageStreakTicks === 1 || stl.shortageStreakTicks % 5 === 0) {
              const limitingResource =
                waterFulfilled <= foodFulfilled ? 'Water' : 'Food';
              const ev = ctx.emitEvent({
                type: 'settlement_shortage',
                severity: 'critical',
                title: `${stl.name} ${limitingResource} Shortage (-${popLoss} Citizens)`,
                description: `${stl.name} ${limitingResource.toLowerCase()} reserves could only meet ${Math.round(minFulfillment * 100)}% of demand. Population fell from ${prevPop} to ${stl.population}.`,
                sourceSystem: 'civ_3_consumption_demographics_and_shortages',
                sourceEntityId: stl.id,
                affectedEntityIds: [stl.id],
                causedByEventId: state.lastDroughtEventId ?? undefined,
                causalLinkType: state.lastDroughtEventId ? 'dependency' : 'direct',
                causalExplanation: state.lastDroughtEventId
                  ? `Regional drought reduced ${stl.name} aquifer extraction below per-capita consumption while reserves exhausted.`
                  : `${stl.name} consumption exceeded local production and trade convoy imports.`,
                payload: {
                  settlementId: stl.id,
                  limitingResource,
                  fulfillmentRatio: roundDet(minFulfillment, 2),
                  populationLost: popLoss,
                },
                deltas: [
                  {
                    metricOrField: `${stl.id}.population`,
                    before: prevPop,
                    after: stl.population,
                    unit: 'citizens',
                  },
                ],
              });
              state.lastShortageEventId = ev.id;
            }
          } else {
            stl.shortageStreakTicks = 0;
            // Surplus enables growth if housing capacity permits
            const housingRoom = Math.max(0, stl.housingCapacity - stl.population);
            const foodBufferRatio = stl.foodStock / Math.max(1, foodNeeded * 3);
            const waterBufferRatio = stl.waterStock / Math.max(1, waterNeeded * 3);

            if (
              housingRoom > 0 &&
              foodBufferRatio >= 1.0 &&
              waterBufferRatio >= 1.0
            ) {
              const growth = Math.max(
                1,
                Math.min(
                  housingRoom,
                  Math.round(
                    stl.population *
                      0.028 *
                      Math.min(1.6, (foodBufferRatio + waterBufferRatio) * 0.5),
                  ),
                ),
              );
              stl.population += growth;
            }

            const crowdingPenalty =
              stl.population >= stl.housingCapacity ? -1.5 : 1.8;
            stl.stabilityIndex = roundDet(
              clampDet(stl.stabilityIndex + crowdingPenalty, 10, 100),
              1,
            );
          }
        }
      },
    },
  ],

  applyCommand(state, command: SimulationCommand, ctx) {
    switch (command.type) {
      case 'build_water_infrastructure': {
        const targetId = String(command.payload.targetSettlementId ?? 'all');
        const targets =
          targetId === 'all'
            ? state.settlements
            : state.settlements.filter((s) => s.id === targetId);

        for (const stl of targets) {
          stl.infrastructure.waterworksLevel += 1;
          stl.materialsStock = roundDet(Math.max(0, stl.materialsStock - 22), 2);
          stl.waterStock = roundDet(
            clampDet(stl.waterStock + 35, 0, stl.storageCapacity),
            2,
          );
          state.cumulativeInfrastructureBuilt += 1;
        }
        ctx.emitEvent({
          type: 'infrastructure_completed',
          severity: 'positive',
          title: `Constructed Deep-Aquifer Water Infrastructure (${targets.map((t) => t.name).join(', ')})`,
          description:
            'Expanded aqueducts and deep-well reservoirs, increasing water extraction and drought resilience.',
          sourceSystem: 'civilization_command',
          affectedEntityIds: targets.map((t) => t.id),
          payload: {
            targetSettlementId: targetId,
            materialsInvested: targets.length * 22,
            amount: targets.length * 25,
          },
        });
        break;
      }

      case 'expand_food_production': {
        const targetId = String(command.payload.targetSettlementId ?? 'all');
        const targets =
          targetId === 'all'
            ? state.settlements
            : state.settlements.filter((s) => s.id === targetId);

        for (const stl of targets) {
          stl.infrastructure.farmsLevel += 1;
          stl.materialsStock = roundDet(Math.max(0, stl.materialsStock - 20), 2);
          stl.foodStock = roundDet(
            clampDet(stl.foodStock + 30, 0, stl.storageCapacity),
            2,
          );
          state.cumulativeInfrastructureBuilt += 1;
        }
        ctx.emitEvent({
          type: 'infrastructure_completed',
          severity: 'positive',
          title: `Expanded Terraced Irrigation Farms (${targets.map((t) => t.name).join(', ')})`,
          description: 'Increased agricultural production capacity across target settlements.',
          sourceSystem: 'civilization_command',
          affectedEntityIds: targets.map((t) => t.id),
          payload: {
            targetSettlementId: targetId,
            materialsInvested: targets.length * 20,
            amount: targets.length * 20,
          },
        });
        break;
      }

      case 'construct_housing': {
        const targetId = String(command.payload.targetSettlementId ?? 'all');
        const targets =
          targetId === 'all'
            ? state.settlements
            : state.settlements.filter((s) => s.id === targetId);
        const beforeCap = state.settlements.reduce(
          (acc, s) => acc + s.housingCapacity,
          0,
        );
        for (const stl of targets) {
          stl.infrastructure.housingLevel += 1;
          stl.housingCapacity += 65;
          stl.materialsStock = roundDet(Math.max(0, stl.materialsStock - 24), 2);
          state.cumulativeInfrastructureBuilt += 1;
        }
        const afterCap = state.settlements.reduce(
          (acc, s) => acc + s.housingCapacity,
          0,
        );
        ctx.emitEvent({
          type: 'infrastructure_completed',
          severity: 'positive',
          title: 'Constructed Settlement Housing Blocks',
          description: `Regional housing capacity expanded from ${beforeCap} to ${afterCap} citizens.`,
          sourceSystem: 'civilization_command',
          affectedEntityIds: targets.map((t) => t.id),
          payload: {
            targetSettlementId: targetId,
            amount: afterCap - beforeCap,
          },
          deltas: [
            {
              metricOrField: 'totalHousingCapacity',
              before: beforeCap,
              after: afterCap,
              unit: 'citizens',
            },
          ],
        });
        break;
      }

      case 'establish_route': {
        for (const route of state.routes) {
          route.active = true;
          route.capacityPerTick = roundDet(route.capacityPerTick + 10, 1);
        }
        // Also ensure any newly founded settlement is linked
        if (state.settlements.length > 3) {
          for (let i = 3; i < state.settlements.length; i++) {
            const extra = state.settlements[i];
            const routeId = `route-aethel-${extra.id}`;
            if (!state.routes.some((r) => r.id === routeId)) {
              state.routes.push({
                id: routeId,
                fromSettlementId: 'stl-aethelgard',
                toSettlementId: extra.id,
                capacityPerTick: 18,
                lastTransferredAmount: 0,
                active: true,
              });
            }
          }
        }
        ctx.emitEvent({
          type: 'transport_network_expanded',
          severity: 'positive',
          title: 'Inter-Settlement Transport Network Upgraded',
          description: `All ${state.routes.length} trade routes are now active with +10 tons/tick convoy capacity.`,
          sourceSystem: 'civilization_command',
          affectedEntityIds: state.settlements.map((s) => s.id),
          payload: { routeCount: state.routes.length },
        });
        break;
      }

      case 'redistribute_resources': {
        const boostAmount = clampDet(Number(command.payload.amount ?? 45), 10, 150);
        for (const stl of state.settlements) {
          stl.foodStock = roundDet(
            clampDet(stl.foodStock + boostAmount, 0, stl.storageCapacity),
            2,
          );
          stl.waterStock = roundDet(
            clampDet(stl.waterStock + boostAmount, 0, stl.storageCapacity),
            2,
          );
          stl.stabilityIndex = roundDet(clampDet(stl.stabilityIndex + 8, 0, 100), 1);
        }
        ctx.emitEvent({
          type: 'resource_redistributed',
          severity: 'positive',
          title: `Emergency Resource Convoy Dispatched (+${boostAmount} Food & Water)`,
          description: `Distributed emergency food and water reserves across all ${state.settlements.length} settlements.`,
          sourceSystem: 'civilization_command',
          affectedEntityIds: state.settlements.map((s) => s.id),
          payload: { amount: boostAmount },
        });
        break;
      }

      case 'found_settlement': {
        const existingIds = new Set(state.settlements.map((s) => s.id));
        const candidate = FRONTIER_SITES.find((f) => !existingIds.has(f.id));
        const newIndex = state.settlements.length + 1;
        const newStl: Settlement = {
          id: candidate ? candidate.id : `stl-colony-${newIndex}`,
          name: candidate ? candidate.name : `Frontier Colony #${newIndex}`,
          regionType: candidate ? candidate.regionType : 'highland',
          position: candidate
            ? candidate.position
            : [((newIndex * 11) % 30) - 15, 1.2, ((newIndex * 17) % 30) - 15],
          population: 65,
          housingCapacity: 130,
          foodStock: 110,
          waterStock: 110,
          materialsStock: 95,
          storageCapacity: 240,
          lastFoodProduction: 10,
          lastFoodConsumption: 8,
          lastWaterProduction: 10,
          lastWaterConsumption: 8,
          lastMaterialsProduction: 8,
          arableQuality: candidate ? candidate.arableQuality : 1.0,
          aquiferYield: candidate ? candidate.aquiferYield : 1.0,
          mineralYield: candidate ? candidate.mineralYield : 1.1,
          labor: {
            farming: 0.35,
            waterworks: 0.32,
            construction: 0.21,
            logistics: 0.12,
          },
          infrastructure: {
            farmsLevel: 1,
            waterworksLevel: 1,
            housingLevel: 2,
            storageLevel: 1,
          },
          activeConstructionProject: 'waterworks',
          constructionProgress: 0,
          shortageStreakTicks: 0,
          stabilityIndex: 85,
        };

        state.settlements.push(newStl);
        state.routes.push({
          id: `route-aethel-${newStl.id}`,
          fromSettlementId: 'stl-aethelgard',
          toSettlementId: newStl.id,
          capacityPerTick: 15,
          lastTransferredAmount: 0,
          active: true,
        });

        ctx.emitEvent({
          type: 'settlement_founded',
          severity: 'positive',
          title: `Founded New Settlement: ${newStl.name}`,
          description: `Chartered ${newStl.name} with 65 pioneer citizens and established an active convoy route to Aethelgard Basin.`,
          sourceSystem: 'civilization_command',
          sourceEntityId: newStl.id,
          affectedEntityIds: [newStl.id, 'stl-aethelgard'],
          payload: { settlementId: newStl.id, name: newStl.name },
        });
        break;
      }

      case 'allocate_labor': {
        const targetId = String(command.payload.settlementId ?? 'all');
        const targets =
          targetId === 'all'
            ? state.settlements
            : state.settlements.filter((s) => s.id === targetId);
        for (const stl of targets) {
          stl.labor = normalizeLabor({
            farming: Number(command.payload.farming ?? stl.labor.farming),
            waterworks: Number(command.payload.waterworks ?? stl.labor.waterworks),
            construction: Number(command.payload.construction ?? stl.labor.construction),
            logistics: Number(command.payload.logistics ?? stl.labor.logistics),
          });
        }
        ctx.emitEvent({
          type: 'labor_reallocated',
          severity: 'info',
          title: 'Settlement Labor Allocation Updated',
          description: `Adjusted workforce distribution across ${targets.map((t) => t.name).join(', ')}.`,
          sourceSystem: 'civilization_command',
          affectedEntityIds: targets.map((t) => t.id),
          payload: { ...command.payload },
        });
        break;
      }

      case 'change_development_priority': {
        const priority = String(
          command.payload.priority ?? 'water_security',
        ) as CivilizationState['developmentPriority'];
        state.developmentPriority = priority;

        for (const stl of state.settlements) {
          if (priority === 'water_security') {
            stl.labor = normalizeLabor({
              farming: 0.32,
              waterworks: 0.36,
              construction: 0.22,
              logistics: 0.1,
            });
            stl.activeConstructionProject = 'waterworks';
          } else if (priority === 'agrarian_growth') {
            stl.labor = normalizeLabor({
              farming: 0.45,
              waterworks: 0.28,
              construction: 0.15,
              logistics: 0.12,
            });
            stl.activeConstructionProject = 'farms';
          } else if (priority === 'infrastructure_expansion') {
            stl.labor = normalizeLabor({
              farming: 0.28,
              waterworks: 0.26,
              construction: 0.32,
              logistics: 0.14,
            });
            stl.activeConstructionProject = 'housing';
          } else {
            stl.labor = normalizeLabor({
              farming: 0.34,
              waterworks: 0.3,
              construction: 0.22,
              logistics: 0.14,
            });
          }
        }

        ctx.emitEvent({
          type: 'development_priority_changed',
          severity: 'info',
          title: `Development Doctrine: ${priority.replace(/_/g, ' ').toUpperCase()}`,
          description: `Realigned regional labor allocation and construction queues toward ${priority.replace(/_/g, ' ')}.`,
          sourceSystem: 'civilization_command',
          affectedEntityIds: state.settlements.map((s) => s.id),
          payload: { priority },
        });
        break;
      }

      case 'trigger_regional_drought': {
        const severity = clampDet(Number(command.payload.severity ?? 0.42), 0.15, 0.85);
        const durationTicks = clampDet(
          Number(command.payload.durationTicks ?? 25),
          5,
          100,
        );
        const beforeWater = roundDet(
          state.settlements.reduce((acc, s) => acc + s.waterStock, 0),
          1,
        );
        state.regionalDroughtSeverity = severity;
        state.regionalDroughtTicks = durationTicks;
        for (const stl of state.settlements) {
          stl.waterStock = roundDet(stl.waterStock * (1 - severity * 0.35), 2);
        }
        const afterWater = roundDet(
          state.settlements.reduce((acc, s) => acc + s.waterStock, 0),
          1,
        );
        const ev = ctx.emitEvent({
          type: 'regional_drought_onset',
          severity: 'critical',
          title: `Regional Aquifer Dry Cycle (-${Math.round(severity * 100)}% Yield)`,
          description: `Regional water tables dropped for ${durationTicks} ticks. Reservoir stocks fell from ${beforeWater} kL to ${afterWater} kL.`,
          sourceSystem: 'civilization_command',
          affectedEntityIds: state.settlements.map((s) => s.id),
          payload: { severity, durationTicks },
          deltas: [
            {
              metricOrField: 'totalWaterStock',
              before: beforeWater,
              after: afterWater,
              unit: 'kL',
            },
          ],
        });
        state.lastDroughtEventId = ev.id;
        break;
      }
    }
  },

  extractMetrics(state) {
    const totalPopulation = state.settlements.reduce(
      (acc, s) => acc + s.population,
      0,
    );
    const totalHousingCapacity = state.settlements.reduce(
      (acc, s) => acc + s.housingCapacity,
      0,
    );
    const totalFoodStock = roundDet(
      state.settlements.reduce((acc, s) => acc + s.foodStock, 0),
      1,
    );
    const totalWaterStock = roundDet(
      state.settlements.reduce((acc, s) => acc + s.waterStock, 0),
      1,
    );
    const infrastructureIndex = state.settlements.reduce(
      (acc, s) =>
        acc +
        s.infrastructure.farmsLevel +
        s.infrastructure.waterworksLevel +
        s.infrastructure.housingLevel +
        s.infrastructure.storageLevel,
      0,
    );
    const meanStabilityIndex = roundDet(
      state.settlements.reduce((acc, s) => acc + s.stabilityIndex * s.population, 0) /
        Math.max(1, totalPopulation),
      1,
    );

    return {
      totalPopulation,
      totalHousingCapacity,
      totalFoodStock,
      totalWaterStock,
      infrastructureIndex,
      meanStabilityIndex,
    };
  },

  inspectEntities(state) {
    const list: EntityInspection[] = [];

    for (const stl of state.settlements) {
      const status =
        stl.shortageStreakTicks > 0 || stl.stabilityIndex < 45
          ? 'critical'
          : stl.waterStock < 45 || stl.foodStock < 45 || stl.stabilityIndex < 70
            ? 'warning'
            : 'nominal';

      list.push({
        entityId: stl.id,
        kind: 'settlement',
        label: stl.name,
        status,
        position: stl.position,
        summary: `Pop ${stl.population}/${stl.housingCapacity} | Food ${stl.foodStock}t | Water ${stl.waterStock}kL | Stability ${stl.stabilityIndex}%`,
        properties: [
          {
            key: 'population',
            label: 'Population / Housing',
            value: `${stl.population} / ${stl.housingCapacity}`,
            unit: 'citizens',
          },
          {
            key: 'foodStock',
            label: 'Food Stockpile (Net/t)',
            value: `${stl.foodStock} (${roundDet(stl.lastFoodProduction - stl.lastFoodConsumption, 1)}/t)`,
            unit: 'tons',
          },
          {
            key: 'waterStock',
            label: 'Water Reserve (Net/t)',
            value: `${stl.waterStock} (${roundDet(stl.lastWaterProduction - stl.lastWaterConsumption, 1)}/t)`,
            unit: 'kL',
          },
          {
            key: 'materialsStock',
            label: 'Construction Materials',
            value: stl.materialsStock,
            unit: 'tons',
          },
          {
            key: 'infrastructure',
            label: 'Infrastructure (F/W/H/S)',
            value: `L${stl.infrastructure.farmsLevel} / L${stl.infrastructure.waterworksLevel} / L${stl.infrastructure.housingLevel} / L${stl.infrastructure.storageLevel}`,
          },
          {
            key: 'labor',
            label: 'Labor (Farm/Water/Build/Trade)',
            value: `${Math.round(stl.labor.farming * 100)}% / ${Math.round(stl.labor.waterworks * 100)}% / ${Math.round(stl.labor.construction * 100)}% / ${Math.round(stl.labor.logistics * 100)}%`,
          },
          {
            key: 'activeConstructionProject',
            label: 'Active Build Queue',
            value: `${stl.activeConstructionProject ?? 'idle'} (${stl.constructionProgress}%)`,
          },
          {
            key: 'stabilityIndex',
            label: 'Settlement Stability',
            value: stl.stabilityIndex,
            unit: '%',
          },
        ],
      });
    }

    for (const route of state.routes) {
      list.push({
        entityId: route.id,
        kind: 'transport_route',
        label: `Convoy Route: ${route.fromSettlementId.replace('stl-', '')} <-> ${route.toSettlementId.replace('stl-', '')}`,
        status: route.active ? 'nominal' : 'inactive',
        summary: `${route.active ? 'ACTIVE' : 'INACTIVE'} | Last Transfer ${route.lastTransferredAmount} units | Cap ${route.capacityPerTick}/t`,
        properties: [
          { key: 'active', label: 'Route Status', value: route.active ? 'ACTIVE' : 'UNBUILT' },
          { key: 'capacityPerTick', label: 'Convoy Capacity', value: route.capacityPerTick, unit: 'tons/t' },
          {
            key: 'lastTransferredAmount',
            label: 'Last Resource Flow',
            value: route.lastTransferredAmount,
            unit: 'units/t',
          },
        ],
      });
    }

    return list;
  },

  extractRenderFrame(state, config, runId: RunId, tick: Tick): RenderFrameData {
    const metrics = this.extractMetrics(state, config);
    const anyShortage = state.settlements.some((s) => s.shortageStreakTicks > 0);
    const ambientStatus = anyShortage
      ? 'critical'
      : state.regionalDroughtTicks > 0 || metrics.meanStabilityIndex < 68
        ? 'warning'
        : 'nominal';

    const zones: RenderZoneVisual[] = state.settlements.map((stl) => {
      const status =
        stl.shortageStreakTicks > 0 || stl.stabilityIndex < 45
          ? 'critical'
          : stl.waterStock < 45 || stl.foodStock < 45
            ? 'warning'
            : 'nominal';
      return {
        id: stl.id,
        label: stl.name,
        position: stl.position,
        size: [9.5, Math.max(0.8, stl.position[1] + 0.8), 9.5],
        value: clampDet(stl.population / Math.max(1, stl.housingCapacity), 0.1, 1.2),
        secondaryValue: clampDet(stl.waterStock / 200, 0, 1),
        status,
        color:
          status === 'critical'
            ? '#ff3d57'
            : status === 'warning'
              ? '#ffb300'
              : '#10b981',
        metadata: {
          population: stl.population,
          housingCapacity: stl.housingCapacity,
          foodStock: stl.foodStock,
          waterStock: stl.waterStock,
          farmsLevel: stl.infrastructure.farmsLevel,
          waterworksLevel: stl.infrastructure.waterworksLevel,
        },
      };
    });

    const connections: RenderConnectionVisual[] = state.routes.map((route) => {
      const fromStl =
        state.settlements.find((s) => s.id === route.fromSettlementId) ??
        state.settlements[0];
      const toStl =
        state.settlements.find((s) => s.id === route.toSettlementId) ??
        state.settlements[1] ??
        state.settlements[0];
      return {
        id: route.id,
        from: fromStl.position,
        to: toStl.position,
        status: !route.active
          ? 'closed'
          : route.lastTransferredAmount > 0.5
            ? 'active'
            : 'open',
        flowRate: route.lastTransferredAmount,
        label: `${fromStl.name} <-> ${toStl.name}`,
      };
    });

    const entities: RenderEntityVisual[] = state.settlements.map((stl) => ({
      id: stl.id,
      kind: 'settlement_citadel',
      label: `${stl.name} (${stl.population} pop)`,
      position: [stl.position[0], stl.position[1] + 1.2, stl.position[2]],
      scale: [
        1.4 + stl.infrastructure.housingLevel * 0.25,
        1.2 + (stl.population / 120) * 1.1,
        1.4 + stl.infrastructure.waterworksLevel * 0.25,
      ],
      color:
        stl.shortageStreakTicks > 0
          ? '#ff3d57'
          : stl.stabilityIndex < 70
            ? '#ffb300'
            : '#00e5ff',
      secondaryColor: '#ffb300',
      energyOrHealth: clampDet(stl.stabilityIndex / 100, 0.1, 1),
      status:
        stl.shortageStreakTicks > 0
          ? 'critical'
          : stl.stabilityIndex < 70
            ? 'warning'
            : 'nominal',
      metadata: {
        population: stl.population,
        waterStock: stl.waterStock,
        foodStock: stl.foodStock,
      },
    }));

    return {
      worldId: 'civilization',
      runId,
      tick,
      ambientStatus,
      entities,
      zones,
      connections,
      hudSummary: {
        Settlements: state.settlements.length,
        Population: `${metrics.totalPopulation} / ${metrics.totalHousingCapacity}`,
        'Food Stock': `${metrics.totalFoodStock} t`,
        'Water Stock': `${metrics.totalWaterStock} kL`,
        'Infra Tiers': metrics.infrastructureIndex,
        Stability: `${metrics.meanStabilityIndex}%`,
      },
    };
  },
});
