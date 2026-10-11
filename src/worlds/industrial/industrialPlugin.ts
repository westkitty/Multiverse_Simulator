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

export type CommodityType =
  | 'raw_ore_silica'
  | 'refined_alloy_wafer'
  | 'precision_components'
  | 'finished_systems';

export type FacilityRole = 'extractor' | 'refinery' | 'manufacturer' | 'warehouse_hub';

export interface IndustrialConfig extends Record<string, unknown> {
  extractionRateMultiplier: number; // 0.3 .. 2.5
  manufacturingCapacityMultiplier: number; // 0.3 .. 2.5
  transportRouteCapacityMultiplier: number; // 0.3 .. 2.5
  externalDemandPressure: number; // 0.4 .. 2.5
  equipmentReliability: number; // 0.3 .. 2.0
  energySupplyMw: number; // 300 .. 2500
}

export interface IndustrialFacilityNode {
  id: string;
  name: string;
  role: FacilityRole;
  producesCommodity: CommodityType;
  consumesCommodity: CommodityType | null;
  position: [number, number, number];
  tierIndex: 0 | 1 | 2 | 3;
  productionCapacityPerTick: number;
  lastOutputUnits: number;
  inputInventory: number;
  outputInventory: number;
  storageCapacity: number;
  energyDemandMw: number;
  energySuppliedMw: number;
  equipmentHealth: number; // 0..100
  breakdownActive: boolean;
  priorityBoost: number; // 0.5 .. 1.8
  starvedInputStreak: number;
}

export interface LogisticsRoute {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  commodity: CommodityType;
  maxCapacityPerTick: number;
  currentFlowUnits: number;
  congestionRatio: number; // 0..1.5
  deliveryDelayTicks: number;
  active: boolean;
}

export interface ActiveShipment {
  id: string;
  routeId: string;
  originNodeId: string;
  destinationNodeId: string;
  commodity: CommodityType;
  quantity: number;
  progressRatio: number; // 0..1
  remainingDelayTicks: number;
}

export interface IndustrialState {
  nextShipmentId: number;
  nodes: IndustrialFacilityNode[];
  routes: LogisticsRoute[];
  shipments: ActiveShipment[];
  gridPowerAvailableMw: number;
  productionPriority: 'balanced' | 'upstream_extraction' | 'midstream_fab' | 'downstream_fulfillment';
  unfulfilledDemandBacklog: number;
  cumulativeFinishedDelivered: number;
  cumulativeBreakdowns: number;
  cumulativeShortageEvents: number;
  lastBreakdownEventId: string | null;
  lastShortageEventId: string | null;
}

const industrialConfigSchema = z.object({
  extractionRateMultiplier: z.number().min(0.2).max(2.5),
  manufacturingCapacityMultiplier: z.number().min(0.2).max(2.5),
  transportRouteCapacityMultiplier: z.number().min(0.2).max(2.5),
  externalDemandPressure: z.number().min(0.3).max(2.5),
  equipmentReliability: z.number().min(0.2).max(2.5),
  energySupplyMw: z.number().min(200).max(3000),
});

// 18 Industrial Nodes across 4 supply-chain tiers (3x the 6-node baseline)
const NODE_SPECS: Array<{
  id: string;
  name: string;
  role: FacilityRole;
  tierIndex: 0 | 1 | 2 | 3;
  produces: CommodityType;
  consumes: CommodityType | null;
  pos: [number, number, number];
  cap: number;
  inStock: number;
  outStock: number;
  energyMw: number;
}> = [
  // Tier 0: 5 Raw Resource Extraction Nodes (West x = -36)
  { id: 'ind-mine-iron', name: 'Iron-Lithium Quarry N', role: 'extractor', tierIndex: 0, produces: 'raw_ore_silica', consumes: null, pos: [-36, 0.5, -24], cap: 34, inStock: 0, outStock: 95, energyMw: 45 },
  { id: 'ind-mine-silica', name: 'Quartz Silica Basin', role: 'extractor', tierIndex: 0, produces: 'raw_ore_silica', consumes: null, pos: [-36, 0.5, -12], cap: 32, inStock: 0, outStock: 90, energyMw: 42 },
  { id: 'ind-mine-copper', name: 'Copper-Cobalt Pit', role: 'extractor', tierIndex: 0, produces: 'raw_ore_silica', consumes: null, pos: [-36, 0.5, 0], cap: 35, inStock: 0, outStock: 100, energyMw: 48 },
  { id: 'ind-mine-bauxite', name: 'Bauxite Highland Mine', role: 'extractor', tierIndex: 0, produces: 'raw_ore_silica', consumes: null, pos: [-36, 0.5, 12], cap: 30, inStock: 0, outStock: 85, energyMw: 40 },
  { id: 'ind-mine-rare', name: 'Rare-Earth Outcrop S', role: 'extractor', tierIndex: 0, produces: 'raw_ore_silica', consumes: null, pos: [-36, 0.5, 24], cap: 28, inStock: 0, outStock: 80, energyMw: 44 },

  // Tier 1: 4 Smelting & Chemical Processing Facilities (Mid-West x = -12)
  { id: 'ind-ref-alloy', name: 'Titan Alloy Smelter', role: 'refinery', tierIndex: 1, produces: 'refined_alloy_wafer', consumes: 'raw_ore_silica', pos: [-12, 0.6, -20], cap: 36, inStock: 95, outStock: 80, energyMw: 78 },
  { id: 'ind-ref-wafer', name: 'Polysilicon Ingot Refinery', role: 'refinery', tierIndex: 1, produces: 'refined_alloy_wafer', consumes: 'raw_ore_silica', pos: [-12, 0.6, -7], cap: 34, inStock: 90, outStock: 75, energyMw: 82 },
  { id: 'ind-ref-cathode', name: 'Cathode Chemical Works', role: 'refinery', tierIndex: 1, produces: 'refined_alloy_wafer', consumes: 'raw_ore_silica', pos: [-12, 0.6, 7], cap: 34, inStock: 90, outStock: 75, energyMw: 74 },
  { id: 'ind-ref-cryo', name: 'Cryo-Metallurgy Plant', role: 'refinery', tierIndex: 1, produces: 'refined_alloy_wafer', consumes: 'raw_ore_silica', pos: [-12, 0.6, 20], cap: 32, inStock: 85, outStock: 70, energyMw: 76 },

  // Tier 2: 4 Precision Manufacturing & Subassembly Plants (Mid-East x = 12)
  { id: 'ind-fab-semi', name: 'Semiconductor Fab Alpha', role: 'manufacturer', tierIndex: 2, produces: 'precision_components', consumes: 'refined_alloy_wafer', pos: [12, 0.7, -20], cap: 32, inStock: 85, outStock: 70, energyMw: 92 },
  { id: 'ind-fab-battery', name: 'Battery Cell Gigafactory', role: 'manufacturer', tierIndex: 2, produces: 'precision_components', consumes: 'refined_alloy_wafer', pos: [12, 0.7, -7], cap: 32, inStock: 85, outStock: 70, energyMw: 88 },
  { id: 'ind-fab-actuator', name: 'Precision Actuator Forge', role: 'manufacturer', tierIndex: 2, produces: 'precision_components', consumes: 'refined_alloy_wafer', pos: [12, 0.7, 7], cap: 30, inStock: 80, outStock: 65, energyMw: 72 },
  { id: 'ind-fab-avionics', name: 'Avionics & Sensor Plant', role: 'manufacturer', tierIndex: 2, produces: 'precision_components', consumes: 'refined_alloy_wafer', pos: [12, 0.7, 20], cap: 30, inStock: 80, outStock: 65, energyMw: 70 },

  // Tier 3: 5 Regional Warehouses & Final Fulfillment Hubs (East x = 36)
  { id: 'ind-hub-north', name: 'Northern Rail Fulfillment Hub', role: 'warehouse_hub', tierIndex: 3, produces: 'finished_systems', consumes: 'precision_components', pos: [36, 0.6, -24], cap: 26, inStock: 75, outStock: 90, energyMw: 36 },
  { id: 'ind-hub-port', name: 'Pacific Container Terminal', role: 'warehouse_hub', tierIndex: 3, produces: 'finished_systems', consumes: 'precision_components', pos: [36, 0.6, -12], cap: 28, inStock: 80, outStock: 95, energyMw: 40 },
  { id: 'ind-hub-central', name: 'Central Strategic Warehouse', role: 'warehouse_hub', tierIndex: 3, produces: 'finished_systems', consumes: 'precision_components', pos: [36, 0.6, 0], cap: 30, inStock: 85, outStock: 110, energyMw: 42 },
  { id: 'ind-hub-orbital', name: 'Orbital Launch Logistics Depot', role: 'warehouse_hub', tierIndex: 3, produces: 'finished_systems', consumes: 'precision_components', pos: [36, 0.6, 12], cap: 24, inStock: 70, outStock: 85, energyMw: 38 },
  { id: 'ind-hub-south', name: 'Continental South Freight Hub', role: 'warehouse_hub', tierIndex: 3, produces: 'finished_systems', consumes: 'precision_components', pos: [36, 0.6, 24], cap: 26, inStock: 75, outStock: 90, energyMw: 36 },
];

export const industrialPlugin = defineWorldPlugin<IndustrialConfig, IndustrialState>({
  id: 'industrial',
  name: 'World H — The Industrial Network',
  subtitle: '18-Node Multi-Tier Production, Traceable Commodities & Supply-Chain Cascades',
  version: '2.0.0',
  schemaVersion: 1,
  accentColor: '#f59e0b',
  description:
    'Global industrial production and logistics laboratory modeling 18 facilities across 4 commodity tiers (Raw Ore/Silica -> Refined Alloy/Wafers -> Precision Components -> Finished Systems) linked by 24 freight routes. Simulates input starvation, warehouse buffers, route congestion, delivery lead-time delays, equipment breakdowns, and cascading supply-chain bullwhip shocks.',
  physicalModelDocumentation: [
    '18 Interconnected Industrial Nodes (3x the 6-node baseline) spanning 5 Extractive Mines, 4 Refineries/Smelters, 4 Precision Fabs, and 5 Fulfillment Warehouses across 24 freight corridors.',
    'Strict Material Conservation & Transformation: Every commodity unit has a traceable origin, transit route, and stoichiometric conversion ratio (Raw Ore -> Refined Alloy -> Precision Components -> Finished Systems).',
    'Bullwhip & Bottleneck Propagation: An upstream mine shortage, refinery breakdown, or congested freight corridor starves downstream fabs of input stock, increasing unfulfilled order backlogs.',
  ],
  simplifiedMechanicsNote:
    'Models discrete multi-tier material balances, route capacity queues, and facility reliability rather than individual SKU financial pricing.',
  scaleMetadata: {
    areaUnitLabel: 'interconnected production & distribution nodes (24 logistics corridors)',
    baselinePlayableArea: 6,
    expandedPlayableArea: 18,
    baselineTerritoryScalar: 8,
    expandedTerritoryScalar: 24,
    baselineScenarioCount: 3,
    baselineInterventionCount: 6,
    baselineMetricCount: 6,
  },
  configSchema: industrialConfigSchema,
  defaultConfig: {
    extractionRateMultiplier: 1.0,
    manufacturingCapacityMultiplier: 1.0,
    transportRouteCapacityMultiplier: 1.0,
    externalDemandPressure: 1.0,
    equipmentReliability: 1.0,
    energySupplyMw: 1150,
  },
  scenarios: [
    {
      id: 'ind-semiconductor-bottleneck-cascade',
      name: 'Midstream Wafer & Fab Bottleneck Crisis',
      subtitle: 'Refinery Breakdown -> Fab Input Starvation -> Order Backlog Surge',
      description:
        'At Tick 4, a primary polysilicon refinery and semiconductor fab suffer equipment breakdowns while external demand surges, threatening downstream fulfillment.',
      hypothesis:
        'Dispatching preventive maintenance crews and rerouting buffer inventory prevents downstream warehouse stockouts.',
      seed: 80111,
      config: {
        extractionRateMultiplier: 1.05,
        manufacturingCapacityMultiplier: 0.9,
        transportRouteCapacityMultiplier: 1.0,
        externalDemandPressure: 1.25,
        equipmentReliability: 0.65,
        energySupplyMw: 1100,
      },
      scheduledCommands: [
        {
          tick: 4,
          type: 'induce_supply_shortage',
          label: 'Polysilicon & Fab Equipment Breakdown',
          payload: { targetTier: 1, breakdownCount: 2, inventoryLossFraction: 0.45 },
        },
      ],
    },
    {
      id: 'ind-freight-corridor-gridlock',
      name: 'Logistics Corridor Congestion & Bullwhip Delay',
      subtitle: 'High Production Volume vs. Constrained Freight Routes',
      description:
        'Mines and refineries produce at high capacity, but constrained freight corridors bottleneck transit, causing upstream warehouse overflow and downstream starvation.',
      hypothesis:
        'Expanding freight rail capacity and rerouting shipments cuts average delivery delay by over 50%.',
      seed: 80222,
      config: {
        extractionRateMultiplier: 1.35,
        manufacturingCapacityMultiplier: 1.25,
        transportRouteCapacityMultiplier: 0.52,
        externalDemandPressure: 1.15,
        equipmentReliability: 1.0,
        energySupplyMw: 1200,
      },
    },
    {
      id: 'ind-raw-mineral-embargo',
      name: 'Upstream Raw Mineral & Silica Shortage',
      subtitle: 'Mine Depletion -> Multi-Tier Supply Starvation',
      description:
        'Low raw extraction rates starve smelters and chemical plants of feedstock, propagating a supply shock through all 4 tiers.',
      hypothesis:
        'Prioritizing upstream extraction and commissioning high-yield mining expansions restores full pipeline flow.',
      seed: 80333,
      config: {
        extractionRateMultiplier: 0.48,
        manufacturingCapacityMultiplier: 1.1,
        transportRouteCapacityMultiplier: 1.05,
        externalDemandPressure: 1.1,
        equipmentReliability: 0.95,
        energySupplyMw: 1150,
      },
    },
    {
      id: 'ind-industrial-power-curtailment',
      name: 'Industrial Power Grid Curtailment & Smelter Throttle',
      subtitle: 'Energy Deficit -> High-Load Smelter & Fab Brownout',
      description:
        'Insufficient industrial megawatt supply forces energy-intensive smelters and gigafactories to throttle output.',
      hypothesis:
        'Adding +350 MW industrial cogeneration restores 100% facility utilization.',
      seed: 80444,
      config: {
        extractionRateMultiplier: 1.0,
        manufacturingCapacityMultiplier: 1.1,
        transportRouteCapacityMultiplier: 1.0,
        externalDemandPressure: 1.05,
        equipmentReliability: 1.0,
        energySupplyMw: 680,
      },
    },
    {
      id: 'ind-just-in-time-fragility',
      name: 'Lean Just-In-Time (JIT) Demand Surge Stress Test',
      subtitle: '1.65x Global Order Surge Against Lean Buffers',
      description:
        'Global demand for finished systems jumps by 65%, rapidly draining Eastern fulfillment warehouses.',
      hypothesis:
        'Expanding warehouse strategic reserves and boosting midstream fab capacity eliminates order backlogs.',
      seed: 80555,
      config: {
        extractionRateMultiplier: 1.1,
        manufacturingCapacityMultiplier: 1.0,
        transportRouteCapacityMultiplier: 1.0,
        externalDemandPressure: 1.65,
        equipmentReliability: 0.9,
        energySupplyMw: 1200,
      },
    },
    {
      id: 'ind-aging-machinery-cascade',
      name: 'Deferred Maintenance & Multi-Plant Breakdown Wave',
      subtitle: 'Low Equipment Reliability (0.42x) -> Unplanned Downtime',
      description:
        'Accelerated mechanical wear triggers frequent unplanned outages across mines, refineries, and fabs.',
      hypothesis:
        'Deploying predictive maintenance and robotic overhaul teams keeps active breakdowns at zero.',
      seed: 80666,
      config: {
        extractionRateMultiplier: 1.0,
        manufacturingCapacityMultiplier: 1.0,
        transportRouteCapacityMultiplier: 1.0,
        externalDemandPressure: 1.0,
        equipmentReliability: 0.42,
        energySupplyMw: 1150,
      },
    },
    {
      id: 'ind-port-strike-reroute',
      name: 'Eastern Terminal Bottleneck & Shipment Rerouting',
      subtitle: 'Fulfillment Hub Congestion vs. Alternative Rail Corridors',
      description:
        'Tests logistics resilience when primary fulfillment routes operate near saturation.',
      hypothesis:
        'Activating redundant cross-tier freight routes maintains >90% order fulfillment.',
      seed: 80777,
      config: {
        extractionRateMultiplier: 1.15,
        manufacturingCapacityMultiplier: 1.15,
        transportRouteCapacityMultiplier: 0.68,
        externalDemandPressure: 1.3,
        equipmentReliability: 1.0,
        energySupplyMw: 1250,
      },
    },
    {
      id: 'ind-high-throughput-automation',
      name: 'Automated Lights-Out Megafactory Network',
      subtitle: 'High Capacity + High Energy Demand Balancing',
      description:
        'All 18 facilities run at 1.5x automated throughput, requiring matching power and logistics scaling.',
      hypothesis:
        'Synchronized power and freight expansion achieves record finished-system output without congestion.',
      seed: 80888,
      config: {
        extractionRateMultiplier: 1.45,
        manufacturingCapacityMultiplier: 1.5,
        transportRouteCapacityMultiplier: 1.35,
        externalDemandPressure: 1.4,
        equipmentReliability: 1.15,
        energySupplyMw: 1350,
      },
    },
    {
      id: 'ind-balanced-supply-chain',
      name: 'Balanced 18-Node Global Supply Chain Baseline',
      subtitle: 'Nominal 4-Tier Production & Logistics Equilibrium',
      description:
        'Reference 18-node, 24-route industrial network for controlled supply-chain counterfactual experiments.',
      hypothesis:
        'Balanced tier capacities keep warehouse inventories stable and order backlog near zero.',
      seed: 80999,
      config: {
        extractionRateMultiplier: 1.0,
        manufacturingCapacityMultiplier: 1.0,
        transportRouteCapacityMultiplier: 1.0,
        externalDemandPressure: 1.0,
        equipmentReliability: 1.0,
        energySupplyMw: 1150,
      },
    },
  ],
  quickInterventions: [
    {
      id: 'ind-expand-extraction',
      label: 'Expand Raw Mining & Quarry Capacity (+28%)',
      description: 'Upgrades all 5 Tier-0 extraction mines and injects +120 units of raw ore/silica.',
      category: 'structure',
      commandType: 'construct_facility_upgrade',
      defaultPayload: { targetTier: 0, capacityBoostPct: 28, inventoryBonus: 24 },
    },
    {
      id: 'ind-expand-refineries',
      label: 'Construct Refinery & Smelter Expansion (+28%)',
      description: 'Upgrades all 4 Tier-1 smelters/refineries and adds +90 units of refined alloy/wafers.',
      category: 'structure',
      commandType: 'construct_facility_upgrade',
      defaultPayload: { targetTier: 1, capacityBoostPct: 28, inventoryBonus: 22 },
    },
    {
      id: 'ind-expand-fabs',
      label: 'Expand Semiconductor & Battery Fabs (+28%)',
      description: 'Upgrades all 4 Tier-2 precision manufacturing plants and adds +80 component units.',
      category: 'structure',
      commandType: 'construct_facility_upgrade',
      defaultPayload: { targetTier: 2, capacityBoostPct: 28, inventoryBonus: 20 },
    },
    {
      id: 'ind-expand-warehouses',
      label: 'Expand Regional Fulfillment Warehouses (+35% Storage)',
      description: 'Increases storage buffer capacity and assembly throughput at all 5 Tier-3 hubs.',
      category: 'structure',
      commandType: 'expand_warehouse_buffers',
      defaultPayload: { storageBoostUnits: 90, finishedBonus: 18 },
    },
    {
      id: 'ind-reroute-shipments',
      label: 'Reroute Freight & Balance Corridor Loads',
      description: 'Activates all backup transport corridors, clears route congestion, and expedites in-transit shipments.',
      category: 'policy',
      commandType: 'reroute_logistics_network',
      defaultPayload: { capacityBoostPct: 32 },
    },
    {
      id: 'ind-repair-all-facilities',
      label: 'Dispatch Robotic Overhaul Teams (Clear Breakdowns)',
      description: 'Repairs all broken-down machinery and restores equipment health to 100% across all 18 nodes.',
      category: 'restoration',
      commandType: 'repair_facility_breakdowns',
      defaultPayload: { healthBoost: 45 },
    },
    {
      id: 'ind-add-industrial-power',
      label: 'Commission Industrial Cogeneration Plant (+340 MW)',
      description: 'Increases industrial grid power supply by +340 MW, eliminating energy throttling.',
      category: 'structure',
      commandType: 'upgrade_industrial_power',
      defaultPayload: { addedMw: 340 },
    },
    {
      id: 'ind-priority-upstream',
      label: 'Priority Policy: Upstream Raw & Refinery Surge',
      description: 'Directs energy and priority boosts (+30%) to mines and smelters.',
      category: 'policy',
      commandType: 'set_production_priority',
      defaultPayload: { priority: 'upstream_extraction' },
    },
    {
      id: 'ind-priority-midstream',
      label: 'Priority Policy: Midstream Precision Fab Surge',
      description: 'Directs priority boosts (+30%) to semiconductor, battery, and actuator fabs.',
      category: 'policy',
      commandType: 'set_production_priority',
      defaultPayload: { priority: 'midstream_fab' },
    },
    {
      id: 'ind-priority-downstream',
      label: 'Priority Policy: Downstream Order Fulfillment',
      description: 'Accelerates final assembly and order backlog clearance at Eastern warehouse hubs.',
      category: 'policy',
      commandType: 'set_production_priority',
      defaultPayload: { priority: 'downstream_fulfillment' },
    },
    {
      id: 'ind-release-strategic-reserve',
      label: 'Release Strategic Component Reserve (+35 Units/Node)',
      description: 'Injects emergency buffer stock into starved refineries, fabs, and warehouses.',
      category: 'restoration',
      commandType: 'release_strategic_inventory',
      defaultPayload: { unitsPerNode: 35 },
    },
    {
      id: 'ind-expedite-airlift',
      label: 'Emergency Freight Airlift (Clear Backlog -90)',
      description: 'Immediately fulfills 90 units of backlogged external demand and clears transit delays.',
      category: 'restoration',
      commandType: 'expedite_emergency_shipments',
      defaultPayload: { backlogClearance: 90 },
    },
    {
      id: 'ind-shortage-raw',
      label: 'Simulate Raw Ore & Silica Embargo (-60% Mine Stock)',
      description: 'Triggers an acute upstream raw material shortage and mine breakdown.',
      category: 'crisis',
      commandType: 'induce_supply_shortage',
      defaultPayload: { targetTier: 0, breakdownCount: 2, inventoryLossFraction: 0.6 },
    },
    {
      id: 'ind-shortage-wafer',
      label: 'Simulate Refinery & Wafer Contamination (-55% Stock)',
      description: 'Halts 2 midstream refineries and scraps contaminated alloy/wafer inventory.',
      category: 'crisis',
      commandType: 'induce_supply_shortage',
      defaultPayload: { targetTier: 1, breakdownCount: 2, inventoryLossFraction: 0.55 },
    },
    {
      id: 'ind-shortage-fab',
      label: 'Simulate Precision Fab Equipment Outage',
      description: 'Triggers unplanned downtime at 2 semiconductor/battery fabs.',
      category: 'crisis',
      commandType: 'induce_supply_shortage',
      defaultPayload: { targetTier: 2, breakdownCount: 2, inventoryLossFraction: 0.45 },
    },
    {
      id: 'ind-corridor-blockade',
      label: 'Simulate Freight Rail & Port Congestion Shock',
      description: 'Reduces transport route capacities by 40% and adds +3 ticks delivery delay.',
      category: 'crisis',
      commandType: 'disrupt_transport_routes',
      defaultPayload: { capacityReductionFactor: 0.6, delaySpikeTicks: 3 },
    },
    {
      id: 'ind-demand-shock-spike',
      label: 'Simulate Global Order Demand Spike (+110 Backlog)',
      description: 'Injects an urgent wave of external customer orders across all 5 fulfillment hubs.',
      category: 'crisis',
      commandType: 'spike_external_demand',
      defaultPayload: { addedBacklog: 110 },
    },
    {
      id: 'ind-energy-grid-drop',
      label: 'Simulate Industrial Grid Brownout (-320 MW)',
      description: 'Cuts available industrial electrical power by 320 MW.',
      category: 'crisis',
      commandType: 'upgrade_industrial_power',
      defaultPayload: { addedMw: -320 },
    },
  ],
  metricDefinitions: [
    {
      id: 'totalRawOreStock',
      label: 'Tier-0 Raw Ore & Silica Stock',
      unit: 'tons',
      category: 'Inventory',
      description: 'Total extracted raw mineral and silica feedstock across mines and refinery inputs.',
      warningThreshold: 180,
      criticalThreshold: 90,
      higherIsBetter: true,
    },
    {
      id: 'totalRefinedAlloyStock',
      label: 'Tier-1 Refined Alloy & Wafer Stock',
      unit: 'tons',
      category: 'Inventory',
      description: 'Total refined alloys, polysilicon wafers, and cathode chemicals in buffers.',
      warningThreshold: 150,
      criticalThreshold: 75,
      higherIsBetter: true,
    },
    {
      id: 'totalPrecisionComponentsStock',
      label: 'Tier-2 Precision Components Stock',
      unit: 'units',
      category: 'Inventory',
      description: 'Total manufactured chips, battery cells, and actuators ready for final assembly.',
      warningThreshold: 140,
      criticalThreshold: 70,
      higherIsBetter: true,
    },
    {
      id: 'totalFinishedSystemsStock',
      label: 'Tier-3 Finished Systems Inventory',
      unit: 'units',
      category: 'Inventory',
      description: 'Assembled industrial and life-support systems stored at regional fulfillment hubs.',
      warningThreshold: 160,
      criticalThreshold: 80,
      higherIsBetter: true,
    },
    {
      id: 'extractionOutputRate',
      label: 'Raw Resource Extraction Rate',
      unit: 'tons/tick',
      category: 'Production',
      description: 'Combined per-tick output of all 5 Tier-0 extractive mines.',
      higherIsBetter: true,
    },
    {
      id: 'refiningOutputRate',
      label: 'Refining & Smelting Rate',
      unit: 'tons/tick',
      category: 'Production',
      description: 'Combined per-tick output of all 4 Tier-1 refineries and chemical works.',
      higherIsBetter: true,
    },
    {
      id: 'manufacturingOutputRate',
      label: 'Precision Fab Output Rate',
      unit: 'units/tick',
      category: 'Production',
      description: 'Combined per-tick output of all 4 Tier-2 precision manufacturing fabs.',
      higherIsBetter: true,
    },
    {
      id: 'finishedFulfillmentRate',
      label: 'Finished Systems Fulfillment Rate',
      unit: 'units/tick',
      category: 'Production',
      description: 'Per-tick final assembly and customer shipment rate across all 5 hubs.',
      higherIsBetter: true,
    },
    {
      id: 'unfulfilledDemandBacklog',
      label: 'Unfulfilled Order Backlog',
      unit: 'units',
      category: 'Fulfillment',
      description: 'Accumulated customer demand orders delayed by supply shortages.',
      warningThreshold: 85,
      criticalThreshold: 180,
      higherIsBetter: false,
    },
    {
      id: 'cumulativeFinishedDelivered',
      label: 'Cumulative Systems Delivered',
      unit: 'units',
      category: 'Fulfillment',
      description: 'Total finished systems shipped to external demand since Genesis.',
      higherIsBetter: true,
    },
    {
      id: 'activeBreakdownsCount',
      label: 'Facilities in Breakdown Outage',
      unit: 'nodes',
      category: 'Reliability',
      description: 'Number of industrial facilities currently halted or severely degraded by equipment failure.',
      warningThreshold: 2,
      criticalThreshold: 4,
      higherIsBetter: false,
    },
    {
      id: 'starvedFacilitiesCount',
      label: 'Input-Starved Facilities',
      unit: 'nodes',
      category: 'Logistics',
      description: 'Number of downstream facilities throttled by empty input commodity buffers.',
      warningThreshold: 2,
      criticalThreshold: 5,
      higherIsBetter: false,
    },
    {
      id: 'meanEquipmentHealth',
      label: 'Mean Equipment Reliability Index',
      unit: '%',
      category: 'Reliability',
      description: 'Average mechanical condition across all 18 production and warehouse nodes.',
      warningThreshold: 65,
      criticalThreshold: 45,
      higherIsBetter: true,
    },
    {
      id: 'meanRouteCongestionPct',
      label: 'Mean Freight Corridor Congestion',
      unit: '%',
      category: 'Logistics',
      description: 'Average utilization/congestion across the 24 logistics routes.',
      warningThreshold: 75,
      criticalThreshold: 92,
      higherIsBetter: false,
    },
    {
      id: 'meanDeliveryDelayTicks',
      label: 'Mean Transit Lead-Time Delay',
      unit: 'ticks',
      category: 'Logistics',
      description: 'Average shipment transit delay across active freight corridors.',
      warningThreshold: 2.2,
      criticalThreshold: 3.5,
      higherIsBetter: false,
    },
    {
      id: 'activeShipmentsInTransit',
      label: 'Active Shipments in Transit',
      unit: 'convoys',
      category: 'Logistics',
      description: 'Number of active freight convoys moving commodities between tiers.',
    },
    {
      id: 'energySupplyAdequacyPct',
      label: 'Industrial Power Adequacy',
      unit: '%',
      category: 'Energy',
      comparableDimension: 'power_reserve_ratio',
      description: 'Percentage of industrial electrical demand satisfied by available grid megawatts.',
      warningThreshold: 92,
      criticalThreshold: 78,
      higherIsBetter: true,
    },
    {
      id: 'supplyChainHealthIndex',
      label: 'Supply-Chain Resilience Index',
      unit: '%',
      category: 'Stability',
      comparableDimension: 'system_stability_ratio',
      description: 'Composite industrial health score (on-time fulfillment, equipment health, low starvation & congestion).',
      warningThreshold: 64,
      criticalThreshold: 42,
      higherIsBetter: true,
    },
  ],

  initializeWorld(config) {
    const nodes: IndustrialFacilityNode[] = NODE_SPECS.map((s) => {
      const capMult =
        s.tierIndex === 0
          ? config.extractionRateMultiplier
          : config.manufacturingCapacityMultiplier;
      return {
        id: s.id,
        name: s.name,
        role: s.role,
        producesCommodity: s.produces,
        consumesCommodity: s.consumes,
        position: [...s.pos],
        tierIndex: s.tierIndex,
        productionCapacityPerTick: roundDet(s.cap * capMult, 1),
        lastOutputUnits: roundDet(s.cap * capMult * 0.85, 1),
        inputInventory: s.inStock,
        outputInventory: s.outStock,
        storageCapacity: 280,
        energyDemandMw: s.energyMw,
        energySuppliedMw: s.energyMw,
        equipmentHealth: roundDet(clampDet(82 + config.equipmentReliability * 12, 45, 100), 1),
        breakdownActive: false,
        priorityBoost: 1.0,
        starvedInputStreak: 0,
      };
    });

    // Build 24 directed freight routes linking Tier 0 -> Tier 1 -> Tier 2 -> Tier 3
    const tier0 = nodes.filter((n) => n.tierIndex === 0);
    const tier1 = nodes.filter((n) => n.tierIndex === 1);
    const tier2 = nodes.filter((n) => n.tierIndex === 2);
    const tier3 = nodes.filter((n) => n.tierIndex === 3);

    const routes: LogisticsRoute[] = [];
    const routeCap = roundDet(28 * config.transportRouteCapacityMultiplier, 1);

    // 8 routes from Tier 0 (5 mines) -> Tier 1 (4 refineries)
    const pairs01 = [
      [0, 0], [0, 1], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [4, 3],
    ];
    for (const [a, b] of pairs01) {
      routes.push({
        id: `rt-${tier0[a].id}-${tier1[b].id}`,
        fromNodeId: tier0[a].id,
        toNodeId: tier1[b].id,
        commodity: 'raw_ore_silica',
        maxCapacityPerTick: routeCap,
        currentFlowUnits: 16,
        congestionRatio: 0.45,
        deliveryDelayTicks: 1,
        active: true,
      });
    }

    // 8 routes from Tier 1 (4 refineries) -> Tier 2 (4 fabs)
    const pairs12 = [
      [0, 0], [0, 1], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3],
    ];
    for (const [a, b] of pairs12) {
      routes.push({
        id: `rt-${tier1[a].id}-${tier2[b].id}`,
        fromNodeId: tier1[a].id,
        toNodeId: tier2[b].id,
        commodity: 'refined_alloy_wafer',
        maxCapacityPerTick: routeCap,
        currentFlowUnits: 15,
        congestionRatio: 0.42,
        deliveryDelayTicks: 1,
        active: true,
      });
    }

    // 8 routes from Tier 2 (4 fabs) -> Tier 3 (5 warehouse hubs)
    const pairs23 = [
      [0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4],
    ];
    for (const [a, b] of pairs23) {
      routes.push({
        id: `rt-${tier2[a].id}-${tier3[b].id}`,
        fromNodeId: tier2[a].id,
        toNodeId: tier3[b].id,
        commodity: 'precision_components',
        maxCapacityPerTick: routeCap,
        currentFlowUnits: 14,
        congestionRatio: 0.4,
        deliveryDelayTicks: 1,
        active: true,
      });
    }

    return {
      nextShipmentId: 1,
      nodes,
      routes,
      shipments: [],
      gridPowerAvailableMw: config.energySupplyMw,
      productionPriority: 'balanced',
      unfulfilledDemandBacklog: 0,
      cumulativeFinishedDelivered: 0,
      cumulativeBreakdowns: 0,
      cumulativeShortageEvents: 0,
      lastBreakdownEventId: null,
      lastShortageEventId: null,
    };
  },

  systems: [
    {
      id: 'ind_1_extraction_and_transformation',
      name: 'Multi-Tier Commodity Extraction, Stoichiometric Transformation & Breakdowns',
      order: 10,
      step(ctx) {
        const { state, config, rng, tick } = ctx;
        const stream = rng.stream('ind_prod');

        // 1. Allocate electrical power across all 18 facilities
        const totalEnergyDemand = state.nodes.reduce(
          (a, n) => a + n.energyDemandMw * n.priorityBoost,
          0,
        );
        const powerRatio = clampDet(
          state.gridPowerAvailableMw / Math.max(1, totalEnergyDemand),
          0.25,
          1.0,
        );

        let newBreakdowns = 0;

        for (const node of state.nodes) {
          node.energySuppliedMw = roundDet(node.energyDemandMw * powerRatio, 1);

          // Mechanical wear & stochastic breakdown check governed by equipmentReliability
          const wear = (0.75 * node.priorityBoost) / Math.max(0.25, config.equipmentReliability);
          const autoMaintenance = 0.45 * config.equipmentReliability;
          node.equipmentHealth = roundDet(
            clampDet(node.equipmentHealth + autoMaintenance - wear, 10, 100),
            1,
          );

          if (
            !node.breakdownActive &&
            node.equipmentHealth < 46 &&
            stream.nextBoolean(0.32 / config.equipmentReliability)
          ) {
            node.breakdownActive = true;
            state.cumulativeBreakdowns += 1;
            newBreakdowns += 1;
          } else if (node.breakdownActive && node.equipmentHealth > 68) {
            node.breakdownActive = false;
          }

          const healthFactor = node.breakdownActive
            ? 0.18
            : clampDet(node.equipmentHealth / 90, 0.35, 1.1);
          const desiredOutput =
            node.productionCapacityPerTick *
            node.priorityBoost *
            powerRatio *
            healthFactor;

          const storageHeadroom = Math.max(0, node.storageCapacity - node.outputInventory);

          if (node.consumesCommodity === null) {
            // Tier 0: Raw resource extraction
            const actualOut = roundDet(Math.min(desiredOutput, storageHeadroom), 1);
            node.outputInventory = roundDet(node.outputInventory + actualOut, 1);
            node.lastOutputUnits = actualOut;
            node.starvedInputStreak = 0;
          } else {
            // Tiers 1, 2, 3: Transform inputInventory -> outputInventory
            const inputRatio =
              node.tierIndex === 1 ? 1.15 : node.tierIndex === 2 ? 1.08 : 1.0;
            const maxByInput = node.inputInventory / inputRatio;
            const actualOut = roundDet(
              Math.min(desiredOutput, maxByInput, storageHeadroom),
              1,
            );

            const consumed = roundDet(actualOut * inputRatio, 1);
            node.inputInventory = roundDet(Math.max(0, node.inputInventory - consumed), 1);
            node.outputInventory = roundDet(node.outputInventory + actualOut, 1);
            node.lastOutputUnits = actualOut;

            if (node.inputInventory < 8) {
              node.starvedInputStreak += 1;
            } else {
              node.starvedInputStreak = 0;
            }
          }
        }

        if (newBreakdowns > 0 && tick % 2 === 0) {
          const brokenNodes = state.nodes.filter((n) => n.breakdownActive);
          const ev = ctx.emitEvent({
            type: 'equipment_breakdown_outage',
            severity: brokenNodes.length >= 3 ? 'critical' : 'warning',
            title: `Industrial Equipment Breakdown (${brokenNodes.map((b) => b.name).slice(0, 2).join(', ')})`,
            description: `${brokenNodes.length} facilities are operating at 18% emergency capacity due to mechanical failure.`,
            sourceSystem: 'ind_1_extraction_and_transformation',
            affectedEntityIds: brokenNodes.map((b) => b.id),
            payload: { brokenCount: brokenNodes.length },
            causalLinkType: 'direct',
            causalExplanation: 'Cumulative thermal and mechanical wear exceeded maintenance thresholds.',
          });
          state.lastBreakdownEventId = ev.id;
        }
      },
    },
    {
      id: 'ind_2_logistics_routing_and_shipments',
      name: 'Inter-Tier Freight Dispatch, Route Congestion & Lead-Time Delivery',
      order: 20,
      step(ctx) {
        const { state } = ctx;
        const byId = new Map(state.nodes.map((n) => [n.id, n]));

        // 1. Advance existing shipments in transit and deliver arrived batches
        const remainingShipments: ActiveShipment[] = [];
        for (const sh of state.shipments) {
          sh.remainingDelayTicks -= 1;
          sh.progressRatio = roundDet(
            clampDet(1 - sh.remainingDelayTicks / 3, 0.25, 1),
            2,
          );
          if (sh.remainingDelayTicks <= 0) {
            const dest = byId.get(sh.destinationNodeId);
            if (dest) {
              dest.inputInventory = roundDet(
                Math.min(dest.storageCapacity, dest.inputInventory + sh.quantity),
                1,
              );
            }
          } else {
            remainingShipments.push(sh);
          }
        }
        state.shipments = remainingShipments;

        // 2. Dispatch new shipments along active routes from upstream outputInventory to downstream inputInventory
        for (const rt of state.routes) {
          if (!rt.active) {
            rt.currentFlowUnits = 0;
            rt.congestionRatio = 0;
            continue;
          }
          const src = byId.get(rt.fromNodeId);
          const dst = byId.get(rt.toNodeId);
          if (!src || !dst) continue;

          const dstNeed = Math.max(0, dst.storageCapacity - dst.inputInventory - 15);
          const available = Math.max(0, src.outputInventory - 6);
          const desiredFlow = Math.min(available * 0.48, dstNeed * 0.55);
          const dispatched = roundDet(
            clampDet(Math.min(desiredFlow, rt.maxCapacityPerTick), 0, rt.maxCapacityPerTick),
            1,
          );

          src.outputInventory = roundDet(Math.max(0, src.outputInventory - dispatched), 1);
          rt.currentFlowUnits = dispatched;
          rt.congestionRatio = roundDet(
            clampDet(desiredFlow / Math.max(1, rt.maxCapacityPerTick), 0.05, 1.45),
            2,
          );

          const delay = rt.congestionRatio > 0.92 ? 2 : 1;
          rt.deliveryDelayTicks = delay;

          if (dispatched >= 2.0) {
            if (delay <= 1) {
              // Fast 1-tick delivery + visual convoy record
              dst.inputInventory = roundDet(
                Math.min(dst.storageCapacity, dst.inputInventory + dispatched * 0.7),
                1,
              );
              state.shipments.push({
                id: `ship-${state.nextShipmentId++}`,
                routeId: rt.id,
                originNodeId: src.id,
                destinationNodeId: dst.id,
                commodity: rt.commodity,
                quantity: roundDet(dispatched * 0.3, 1),
                progressRatio: 0.65,
                remainingDelayTicks: 1,
              });
            } else {
              // Congested multi-tick shipment
              state.shipments.push({
                id: `ship-${state.nextShipmentId++}`,
                routeId: rt.id,
                originNodeId: src.id,
                destinationNodeId: dst.id,
                commodity: rt.commodity,
                quantity: dispatched,
                progressRatio: 0.35,
                remainingDelayTicks: delay,
              });
            }
          }
        }
      },
    },
    {
      id: 'ind_3_demand_fulfillment_and_shortages',
      name: 'Customer Order Fulfillment, Backlog Accounting & Supply Shortage Alerts',
      order: 30,
      step(ctx) {
        const { state, config, tick } = ctx;
        const hubs = state.nodes.filter((n) => n.tierIndex === 3);

        // External demand arrives at each of the 5 Tier-3 warehouse hubs
        const demandPerHub = roundDet(19.5 * config.externalDemandPressure, 1);
        let totalDeliveredThisTick = 0;

        for (const hub of hubs) {
          const targetShip = demandPerHub + state.unfulfilledDemandBacklog / hubs.length;
          const shipped = roundDet(Math.min(hub.outputInventory, targetShip), 1);
          hub.outputInventory = roundDet(Math.max(0, hub.outputInventory - shipped), 1);
          totalDeliveredThisTick += shipped;
        }

        const totalNewDemand = demandPerHub * hubs.length;
        state.cumulativeFinishedDelivered = roundDet(
          state.cumulativeFinishedDelivered + totalDeliveredThisTick,
          1,
        );
        state.unfulfilledDemandBacklog = roundDet(
          clampDet(
            state.unfulfilledDemandBacklog + totalNewDemand - totalDeliveredThisTick,
            0,
            1500,
          ),
          1,
        );

        const starvedNodes = state.nodes.filter((n) => n.starvedInputStreak >= 2);
        if ((starvedNodes.length >= 3 || state.unfulfilledDemandBacklog > 95) && tick % 4 === 0) {
          state.cumulativeShortageEvents += 1;
          const ev = ctx.emitEvent({
            type: 'supply_chain_shortage',
            severity: state.unfulfilledDemandBacklog > 160 ? 'critical' : 'warning',
            title: `Supply-Chain Shortage (Backlog ${state.unfulfilledDemandBacklog} Units)`,
            description: `${starvedNodes.length} facilities are input-starved and unfulfilled order backlog reached ${state.unfulfilledDemandBacklog} units.`,
            sourceSystem: 'ind_3_demand_fulfillment_and_shortages',
            affectedEntityIds: starvedNodes.map((n) => n.id),
            payload: {
              starvedCount: starvedNodes.length,
              unfulfilledBacklog: state.unfulfilledDemandBacklog,
              deliveredUnits: totalDeliveredThisTick,
            },
            causalLinkType: 'dependency',
            causedByEventId: state.lastBreakdownEventId,
            causalExplanation:
              'Upstream feedstock deficits or transit bottlenecks starved downstream manufacturing and fulfillment hubs.',
          });
          state.lastShortageEventId = ev.id;
        }
      },
    },
  ],

  applyCommand(state, command: SimulationCommand, ctx) {
    const payload = command.payload ?? {};

    if (command.type === 'construct_facility_upgrade') {
      const tier = Number(payload.targetTier ?? 0);
      const boostPct = Number(payload.capacityBoostPct ?? 28);
      const bonus = Number(payload.inventoryBonus ?? 22);
      const targets = state.nodes.filter((n) => n.tierIndex === tier);
      for (const n of targets) {
        n.productionCapacityPerTick = roundDet(
          n.productionCapacityPerTick * (1 + boostPct / 100),
          1,
        );
        n.outputInventory = roundDet(
          Math.min(n.storageCapacity, n.outputInventory + bonus),
          1,
        );
        n.equipmentHealth = roundDet(clampDet(n.equipmentHealth + 10, 20, 100), 1);
      }
      ctx.emitEvent({
        type: 'industrial_shipment_dispatched',
        severity: 'positive',
        title: `Tier-${tier} Facility Capacity Expanded (+${boostPct}%)`,
        description: `Upgraded ${targets.length} Tier-${tier} facilities and added +${bonus} units/node to output buffers.`,
        sourceSystem: 'command_bus',
        affectedEntityIds: targets.map((t) => t.id),
        payload: {
          targetTier: tier,
          capacityBoostPct: boostPct,
          surplusUnits: bonus * targets.length,
        },
        causalLinkType: 'direct',
        causalExplanation: 'Capital expansion increased facility throughput and output inventory.',
      });
      return;
    }

    if (command.type === 'expand_warehouse_buffers') {
      const storageBoost = Number(payload.storageBoostUnits ?? 90);
      const finishedBonus = Number(payload.finishedBonus ?? 18);
      const hubs = state.nodes.filter((n) => n.tierIndex === 3);
      for (const h of hubs) {
        h.storageCapacity = roundDet(h.storageCapacity + storageBoost, 1);
        h.outputInventory = roundDet(h.outputInventory + finishedBonus, 1);
        h.productionCapacityPerTick = roundDet(h.productionCapacityPerTick + 5, 1);
      }
      state.unfulfilledDemandBacklog = roundDet(
        Math.max(0, state.unfulfilledDemandBacklog - finishedBonus * hubs.length),
        1,
      );
      ctx.emitEvent({
        type: 'warehouse_buffers_expanded',
        severity: 'positive',
        title: `Regional Fulfillment Warehouses Expanded (+${storageBoost} Cap)`,
        description: 'Expanded storage capacity and finished system buffers across all 5 fulfillment hubs.',
        sourceSystem: 'command_bus',
        affectedEntityIds: hubs.map((h) => h.id),
        payload: { surplusUnits: finishedBonus * hubs.length },
        causalLinkType: 'direct',
        causalExplanation: 'Expanded automated racking and buffer stock at distribution hubs.',
      });
      return;
    }

    if (command.type === 'reroute_logistics_network') {
      const boostPct = Number(payload.capacityBoostPct ?? 32);
      for (const r of state.routes) {
        r.active = true;
        r.maxCapacityPerTick = roundDet(r.maxCapacityPerTick * (1 + boostPct / 100), 1);
        r.congestionRatio = roundDet(r.congestionRatio * 0.65, 2);
        r.deliveryDelayTicks = 1;
      }
      for (const n of state.nodes) {
        if (n.consumesCommodity !== null) {
          n.inputInventory = roundDet(Math.min(n.storageCapacity, n.inputInventory + 16), 1);
          n.starvedInputStreak = 0;
        }
      }
      ctx.emitEvent({
        type: 'logistics_routes_rebalanced',
        severity: 'positive',
        title: `Freight Logistics Rerouted (+${boostPct}% Corridor Capacity)`,
        description: 'Cleared route bottlenecks and expedited commodity shipments across all 24 corridors.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Dynamic freight routing balanced load across multi-tier corridors.',
      });
      return;
    }

    if (command.type === 'repair_facility_breakdowns') {
      const boost = Number(payload.healthBoost ?? 45);
      for (const n of state.nodes) {
        n.breakdownActive = false;
        n.equipmentHealth = roundDet(clampDet(n.equipmentHealth + boost, 50, 100), 1);
      }
      ctx.emitEvent({
        type: 'facility_breakdowns_repaired',
        severity: 'positive',
        title: 'Robotic Overhaul Teams Restored All 18 Facilities',
        description: 'Cleared all unplanned equipment breakdowns and restored mechanical reliability.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Preventive and corrective maintenance restored full machine availability.',
      });
      return;
    }

    if (command.type === 'upgrade_industrial_power') {
      const addedMw = Number(payload.addedMw ?? 340);
      const before = state.gridPowerAvailableMw;
      state.gridPowerAvailableMw = roundDet(clampDet(before + addedMw, 250, 3500), 1);
      ctx.emitEvent({
        type: 'industrial_power_updated',
        severity: addedMw > 0 ? 'positive' : 'warning',
        title: `Industrial Grid Power (${before} MW -> ${state.gridPowerAvailableMw} MW)`,
        description: `Available industrial megawatt supply changed by ${addedMw > 0 ? '+' : ''}${addedMw} MW.`,
        sourceSystem: 'command_bus',
        deltas: [
          { metricOrField: 'gridPowerAvailableMw', before, after: state.gridPowerAvailableMw, unit: 'MW' },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'Adjusted industrial power generation capacity.',
      });
      return;
    }

    if (command.type === 'set_production_priority') {
      const priority = String(
        payload.priority ?? 'balanced',
      ) as IndustrialState['productionPriority'];
      state.productionPriority = priority;
      for (const n of state.nodes) {
        if (priority === 'upstream_extraction') {
          n.priorityBoost = n.tierIndex <= 1 ? 1.3 : 0.95;
        } else if (priority === 'midstream_fab') {
          n.priorityBoost = n.tierIndex === 2 ? 1.35 : 1.0;
        } else if (priority === 'downstream_fulfillment') {
          n.priorityBoost = n.tierIndex === 3 ? 1.35 : 1.05;
        } else {
          n.priorityBoost = 1.0;
        }
      }
      ctx.emitEvent({
        type: 'production_priority_changed',
        severity: 'info',
        title: `Industrial Priority: ${priority.toUpperCase()}`,
        description: `Updated facility scheduling weights to ${priority}.`,
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Operator reallocated production scheduling priority.',
      });
      return;
    }

    if (command.type === 'release_strategic_inventory') {
      const units = Number(payload.unitsPerNode ?? 35);
      for (const n of state.nodes) {
        if (n.consumesCommodity !== null) {
          n.inputInventory = roundDet(Math.min(n.storageCapacity, n.inputInventory + units), 1);
        }
        n.outputInventory = roundDet(Math.min(n.storageCapacity, n.outputInventory + units * 0.7), 1);
        n.starvedInputStreak = 0;
      }
      ctx.emitEvent({
        type: 'industrial_shipment_dispatched',
        severity: 'positive',
        title: `Strategic Reserve Released (+${units} Units/Node)`,
        description: 'Replenished input and output commodity buffers across all 18 industrial nodes.',
        sourceSystem: 'command_bus',
        payload: { surplusUnits: units * 5 },
        causalLinkType: 'direct',
        causalExplanation: 'Released strategic stockpile buffers to prevent downstream starvation.',
      });
      return;
    }

    if (command.type === 'expedite_emergency_shipments') {
      const clear = Number(payload.backlogClearance ?? 90);
      const before = state.unfulfilledDemandBacklog;
      state.unfulfilledDemandBacklog = roundDet(Math.max(0, before - clear), 1);
      state.cumulativeFinishedDelivered = roundDet(state.cumulativeFinishedDelivered + clear, 1);
      ctx.emitEvent({
        type: 'industrial_shipment_dispatched',
        severity: 'positive',
        title: `Emergency Freight Airlift Dispatched (-${clear} Backlog)`,
        description: `Reduced unfulfilled order backlog from ${before} to ${state.unfulfilledDemandBacklog} units.`,
        sourceSystem: 'command_bus',
        payload: { surplusUnits: clear },
        deltas: [
          { metricOrField: 'unfulfilledDemandBacklog', before, after: state.unfulfilledDemandBacklog, unit: 'units' },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'Emergency airlift bypassed congested surface corridors.',
      });
      return;
    }

    if (command.type === 'induce_supply_shortage') {
      const tier = Number(payload.targetTier ?? 0);
      const breakCount = Number(payload.breakdownCount ?? 2);
      const lossFrac = clampDet(Number(payload.inventoryLossFraction ?? 0.5), 0.1, 0.9);
      const targets = state.nodes.filter((n) => n.tierIndex === tier);
      for (let i = 0; i < targets.length; i++) {
        targets[i].outputInventory = roundDet(targets[i].outputInventory * (1 - lossFrac), 1);
        targets[i].inputInventory = roundDet(targets[i].inputInventory * (1 - lossFrac), 1);
        if (i < breakCount) {
          targets[i].breakdownActive = true;
          targets[i].equipmentHealth = 32;
        }
      }
      state.cumulativeShortageEvents += 1;
      const ev = ctx.emitEvent({
        type: 'supply_chain_shortage',
        severity: 'critical',
        title: `Tier-${tier} Supply Shortage & Outage`,
        description: `Tier-${tier} inventory dropped by ${Math.round(lossFrac * 100)}% with ${breakCount} facility breakdowns.`,
        sourceSystem: 'command_bus',
        affectedEntityIds: targets.map((t) => t.id),
        payload: { targetTier: tier, lossFraction: lossFrac, severity: lossFrac },
        causalLinkType: 'direct',
        causalExplanation: 'Injected upstream feedstock shortage and equipment outage.',
      });
      state.lastShortageEventId = ev.id;
      return;
    }

    if (command.type === 'disrupt_transport_routes') {
      const factor = clampDet(Number(payload.capacityReductionFactor ?? 0.6), 0.3, 0.9);
      const delaySpike = Number(payload.delaySpikeTicks ?? 3);
      for (const r of state.routes) {
        r.maxCapacityPerTick = roundDet(Math.max(6, r.maxCapacityPerTick * factor), 1);
        r.congestionRatio = roundDet(clampDet(r.congestionRatio + 0.4, 0.2, 1.45), 2);
        r.deliveryDelayTicks = delaySpike;
      }
      ctx.emitEvent({
        type: 'transport_routes_disrupted',
        severity: 'warning',
        title: `Freight Corridor Bottleneck (+${delaySpike} Ticks Delay)`,
        description: `Reduced logistics route capacity to ${Math.round(factor * 100)}%, increasing lead-time delays.`,
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Corridor capacity constriction induced transit queue delays.',
      });
      return;
    }

    if (command.type === 'spike_external_demand') {
      const added = Number(payload.addedBacklog ?? 110);
      const before = state.unfulfilledDemandBacklog;
      state.unfulfilledDemandBacklog = roundDet(before + added, 1);
      ctx.emitEvent({
        type: 'external_demand_spiked',
        severity: 'warning',
        title: `Global Order Demand Surge (+${added} Units)`,
        description: `Unfulfilled order backlog jumped from ${before} to ${state.unfulfilledDemandBacklog} units.`,
        sourceSystem: 'command_bus',
        deltas: [
          { metricOrField: 'unfulfilledDemandBacklog', before, after: state.unfulfilledDemandBacklog, unit: 'units' },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'Sudden external order wave strained fulfillment buffers.',
      });
    }
  },

  extractMetrics(state) {
    const rawStock = state.nodes
      .filter((n) => n.tierIndex === 0)
      .reduce((a, n) => a + n.outputInventory, 0) +
      state.nodes
        .filter((n) => n.tierIndex === 1)
        .reduce((a, n) => a + n.inputInventory, 0);

    const alloyStock = state.nodes
      .filter((n) => n.tierIndex === 1)
      .reduce((a, n) => a + n.outputInventory, 0) +
      state.nodes
        .filter((n) => n.tierIndex === 2)
        .reduce((a, n) => a + n.inputInventory, 0);

    const compStock = state.nodes
      .filter((n) => n.tierIndex === 2)
      .reduce((a, n) => a + n.outputInventory, 0) +
      state.nodes
        .filter((n) => n.tierIndex === 3)
        .reduce((a, n) => a + n.inputInventory, 0);

    const finishedStock = state.nodes
      .filter((n) => n.tierIndex === 3)
      .reduce((a, n) => a + n.outputInventory, 0);

    const extRate = state.nodes
      .filter((n) => n.tierIndex === 0)
      .reduce((a, n) => a + n.lastOutputUnits, 0);
    const refRate = state.nodes
      .filter((n) => n.tierIndex === 1)
      .reduce((a, n) => a + n.lastOutputUnits, 0);
    const fabRate = state.nodes
      .filter((n) => n.tierIndex === 2)
      .reduce((a, n) => a + n.lastOutputUnits, 0);
    const hubRate = state.nodes
      .filter((n) => n.tierIndex === 3)
      .reduce((a, n) => a + n.lastOutputUnits, 0);

    const breakdowns = state.nodes.filter((n) => n.breakdownActive).length;
    const starved = state.nodes.filter(
      (n) => n.consumesCommodity !== null && n.inputInventory < 10,
    ).length;

    const meanHealth =
      state.nodes.reduce((a, n) => a + n.equipmentHealth, 0) /
      Math.max(1, state.nodes.length);

    const meanCongestion =
      (state.routes.reduce((a, r) => a + r.congestionRatio, 0) /
        Math.max(1, state.routes.length)) *
      100;

    const meanDelay =
      state.routes.reduce((a, r) => a + r.deliveryDelayTicks, 0) /
      Math.max(1, state.routes.length);

    const totalEnergyDem = state.nodes.reduce((a, n) => a + n.energyDemandMw, 0);
    const totalEnergySup = state.nodes.reduce((a, n) => a + n.energySuppliedMw, 0);
    const energyAdequacy = (totalEnergySup / Math.max(1, totalEnergyDem)) * 100;

    const healthIdx = clampDet(
      meanHealth * 0.45 +
        energyAdequacy * 0.35 +
        25 -
        breakdowns * 7 -
        starved * 5 -
        state.unfulfilledDemandBacklog * 0.14 -
        Math.max(0, meanCongestion - 65) * 0.3,
      5,
      100,
    );

    return {
      totalRawOreStock: roundDet(rawStock, 1),
      totalRefinedAlloyStock: roundDet(alloyStock, 1),
      totalPrecisionComponentsStock: roundDet(compStock, 1),
      totalFinishedSystemsStock: roundDet(finishedStock, 1),
      extractionOutputRate: roundDet(extRate, 1),
      refiningOutputRate: roundDet(refRate, 1),
      manufacturingOutputRate: roundDet(fabRate, 1),
      finishedFulfillmentRate: roundDet(hubRate, 1),
      unfulfilledDemandBacklog: roundDet(state.unfulfilledDemandBacklog, 1),
      cumulativeFinishedDelivered: roundDet(state.cumulativeFinishedDelivered, 1),
      activeBreakdownsCount: breakdowns,
      starvedFacilitiesCount: starved,
      meanEquipmentHealth: roundDet(meanHealth, 1),
      meanRouteCongestionPct: roundDet(meanCongestion, 1),
      meanDeliveryDelayTicks: roundDet(meanDelay, 2),
      activeShipmentsInTransit: state.shipments.length,
      energySupplyAdequacyPct: roundDet(energyAdequacy, 1),
      supplyChainHealthIndex: roundDet(healthIdx, 2),
    };
  },

  inspectEntities(state) {
    const list: EntityInspection[] = [];

    for (const n of state.nodes) {
      const status =
        n.breakdownActive
          ? 'critical'
          : n.consumesCommodity !== null && n.inputInventory < 12
            ? 'warning'
            : 'nominal';

      list.push({
        entityId: n.id,
        kind: `facility_${n.role}`,
        label: `${n.name} (Tier ${n.tierIndex} ${n.role.toUpperCase()})`,
        status,
        position: n.position,
        summary: `Produces ${n.producesCommodity} (${n.lastOutputUnits}/t) • In/Out Stock: ${n.inputInventory}/${n.outputInventory} • Health ${n.equipmentHealth}%`,
        properties: [
          { key: 'role', label: 'Facility Role', value: n.role },
          { key: 'tierIndex', label: 'Supply Tier', value: `Tier ${n.tierIndex}` },
          { key: 'producesCommodity', label: 'Output Commodity', value: n.producesCommodity },
          { key: 'consumesCommodity', label: 'Input Commodity', value: n.consumesCommodity ?? 'Primary Extraction' },
          { key: 'lastOutputUnits', label: 'Output Rate', value: n.lastOutputUnits, unit: 'units/t' },
          { key: 'inputInventory', label: 'Input Buffer', value: n.inputInventory, unit: 'units' },
          { key: 'outputInventory', label: 'Output Buffer', value: n.outputInventory, unit: 'units' },
          { key: 'energySuppliedMw', label: 'Power Supplied', value: `${n.energySuppliedMw}/${n.energyDemandMw}`, unit: 'MW' },
          { key: 'equipmentHealth', label: 'Equipment Health', value: n.equipmentHealth, unit: '%' },
          { key: 'breakdownActive', label: 'Breakdown Status', value: n.breakdownActive ? 'OUTAGE' : 'ONLINE' },
        ],
      });
    }

    for (const r of state.routes) {
      list.push({
        entityId: r.id,
        kind: 'logistics_route',
        label: `Route ${r.fromNodeId} -> ${r.toNodeId} (${r.commodity})`,
        status: r.congestionRatio > 0.95 ? 'critical' : r.congestionRatio > 0.75 ? 'warning' : 'nominal',
        summary: `Flow ${r.currentFlowUnits}/${r.maxCapacityPerTick} units • Delay ${r.deliveryDelayTicks}t • Load ${Math.round(r.congestionRatio * 100)}%`,
        properties: [
          { key: 'commodity', label: 'Commodity', value: r.commodity },
          { key: 'currentFlowUnits', label: 'Current Flow', value: r.currentFlowUnits, unit: 'units/t' },
          { key: 'maxCapacityPerTick', label: 'Route Capacity', value: r.maxCapacityPerTick, unit: 'units/t' },
          { key: 'deliveryDelayTicks', label: 'Delivery Lead Time', value: r.deliveryDelayTicks, unit: 'ticks' },
        ],
      });
    }

    return list;
  },

  extractRenderFrame(state, _config, runId, tick): RenderFrameData {
    const byId = new Map(state.nodes.map((n) => [n.id, n]));

    const zones: RenderZoneVisual[] = state.nodes.map((n) => {
      const color =
        n.breakdownActive
          ? '#ef4444'
          : n.tierIndex === 0
            ? '#d97706'
            : n.tierIndex === 1
              ? '#0284c7'
              : n.tierIndex === 2
                ? '#7c3aed'
                : '#10b981';

      return {
        id: n.id,
        label: n.name,
        position: [n.position[0], 0.4, n.position[2]],
        size: [9.5, 0.85, 8.5],
        value: roundDet(n.outputInventory / n.storageCapacity, 2),
        secondaryValue: n.lastOutputUnits,
        status:
          n.breakdownActive
            ? 'critical'
            : n.consumesCommodity !== null && n.inputInventory < 12
              ? 'warning'
              : 'nominal',
        color,
      };
    });

    // Facility towers + moving shipment convoys
    const entities: RenderEntityVisual[] = state.nodes.map((n) => ({
      id: `fac-${n.id}`,
      kind: 'industrial_facility',
      label: `${n.name} (${n.lastOutputUnits}/t)`,
      position: [n.position[0], 1.6, n.position[2]],
      scale: [2.0, clampDet(1.1 + n.lastOutputUnits * 0.06, 1.0, 3.8), 2.0],
      color: n.breakdownActive ? '#ff3d57' : '#fbbf24',
      energyOrHealth: roundDet(n.equipmentHealth / 100, 2),
      status: n.breakdownActive ? 'critical' : 'nominal',
    }));

    for (const sh of state.shipments.slice(0, 24)) {
      const src = byId.get(sh.originNodeId);
      const dst = byId.get(sh.destinationNodeId);
      if (src && dst) {
        const x = roundDet(
          src.position[0] + (dst.position[0] - src.position[0]) * sh.progressRatio,
          2,
        );
        const z = roundDet(
          src.position[2] + (dst.position[2] - src.position[2]) * sh.progressRatio,
          2,
        );
        entities.push({
          id: sh.id,
          kind: 'herbivore',
          label: `Convoy ${sh.commodity} (${sh.quantity}u)`,
          position: [x, 1.05, z],
          scale: [0.95, 0.95, 0.95],
          color: '#00e5ff',
          energyOrHealth: 1,
          status: 'nominal',
        });
      }
    }

    const connections: RenderConnectionVisual[] = state.routes.map((r) => {
      const nA = byId.get(r.fromNodeId);
      const nB = byId.get(r.toNodeId);
      return {
        id: r.id,
        from: nA ? [nA.position[0], 0.6, nA.position[2]] : [0, 0, 0],
        to: nB ? [nB.position[0], 0.6, nB.position[2]] : [0, 0, 0],
        status:
          r.congestionRatio > 0.95
            ? 'closed'
            : r.congestionRatio > 0.72
              ? 'active'
              : 'open',
        flowRate: r.currentFlowUnits,
        label: `${r.fromNodeId} -> ${r.toNodeId} (${r.currentFlowUnits}u ${r.commodity})`,
      };
    });

    const metrics = this.extractMetrics(state, _config);
    const ambientStatus =
      metrics.supplyChainHealthIndex < 45 || metrics.activeBreakdownsCount >= 4
        ? 'critical'
        : metrics.supplyChainHealthIndex < 68 || metrics.unfulfilledDemandBacklog > 90
          ? 'warning'
          : 'nominal';

    return {
      worldId: 'industrial',
      runId,
      tick,
      ambientStatus,
      entities,
      zones,
      connections,
      hudSummary: {
        Facilities: state.nodes.length,
        Routes: state.routes.length,
        'Fulfillment': `${metrics.finishedFulfillmentRate} u/t`,
        Backlog: metrics.unfulfilledDemandBacklog,
        Resilience: `${metrics.supplyChainHealthIndex}%`,
      },
    };
  },
});
