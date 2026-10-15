import {
  ActionExecutionReceipt,
  ActionValidationResult,
  BudgetResourceConfig,
  CostPreview,
  CourierState,
  EmergencyDefinition,
  EmergencyManager,
  FacilityDefinition,
  FacilityManager,
  FeatureCapability,
  HazardDependencyGraph,
  HazardEvaluationResult,
  HazardLink,
  HazardNode,
  LogisticsNetwork,
  LogisticsRouteEdge,
  PolicyDefinition,
  PolicyManager,
  RestorationLayerDefinition,
  ScientificBudgetLedger,
  ValidatedAction,
  VisualRestorationManager,
  WorldFeatureModule,
  NativeActionFamilyDefinition,
  NativeActionRegistry,
  ScientificInstrumentConfig,
  ScientificInstrumentManager,
  AtlasContinuumNavigator,
  RouteEdge,
  ViewScale,
  CrewManager,
  CrewMember,
  CrewRole,
  CREW_ROLE_DEFINITIONS,
  SignatureDestinationDefinition,
  SignatureDestinationManager,
  HistoricalEraDefinition,
  HistoricalEraManager,
  ActorMemoryRecord,
  ActorMemoryManager,
  MonumentRecord,
  CausalHypothesisDefinition,
  HypothesisInvestigationManager,
  DivergenceTheaterManager,
  BranchDiffSnapshot,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export function createDefaultSignatureDestination(worldId: string): SignatureDestinationDefinition {
  const capWorld = worldId.charAt(0).toUpperCase() + worldId.slice(1);
  return {
    id: `${worldId}.destination.primary`,
    worldId,
    siteId: 'site-primary',
    name: `${capWorld} Sanctuary Complex`,
    epithet: 'The Keystone Installation',
    lore: `The primary monumental expedition target on ${worldId}, requiring multi-stage survey, structural stabilization, and systemic equilibrium.`,
    stages: [
      {
        stageNumber: 1,
        title: 'Site Cartography & Baseline Profiling',
        description: 'Deploy sensor sweeps and map structural foundations to disclose primary access corridors.',
        targetProgressUnits: 100,
      },
      {
        stageNumber: 2,
        title: 'Core System Stabilization',
        description: 'Perform targeted physical interventions and establish localized logistics routing to arrest active degradation.',
        targetProgressUnits: 100,
      },
      {
        stageNumber: 3,
        title: 'Permanent Equilibrium Attainment',
        description: 'Calibrate environmental feedback loops and certify long-term survival metrics.',
        targetProgressUnits: 100,
      },
    ],
    rewards: {
      bonusMetric: { field: 'stability', delta: 15 },
      budgetGrant: { energy: 50, supplies: 30 },
      legacyLoreRecord: `Recorded historical triumph at ${capWorld} Sanctuary Complex.`,
    },
  };
}

export function createDefaultHistoricalEras(
  worldId: string,
): readonly [HistoricalEraDefinition, HistoricalEraDefinition, HistoricalEraDefinition] {
  const capWorld = worldId.charAt(0).toUpperCase() + worldId.slice(1);
  return [
    {
      eraNumber: 1,
      id: `${worldId}.era.1`,
      worldId,
      name: 'The Pristine Horizon',
      subtitle: 'Early Exploration & Nascent Settlement',
      lore: `The formative age of ${capWorld}, characterized by undiscovered frontiers and standard environmental baseline rates.`,
      catalystCondition: 'Initial historical condition.',
      transitionThreshold: { minTick: 0 },
      regimeModifiers: {
        degradationRateMultiplier: 1.0,
        consumptionMultiplier: 1.0,
        hazardEscalationMultiplier: 1.0,
        restorationEfficiencyMultiplier: 1.0,
      },
    },
    {
      eraNumber: 2,
      id: `${worldId}.era.2`,
      worldId,
      name: 'The Crucible Epoch',
      subtitle: 'Systemic Stress & Cascading Trials',
      lore: `A testing age for ${capWorld} where environmental tensions compound, demanding active intervention and physical logistics support.`,
      catalystCondition: 'Simulation reaches tick 100 or metric volatility exceeds threshold.',
      transitionThreshold: { minTick: 100 },
      regimeModifiers: {
        degradationRateMultiplier: 1.3,
        consumptionMultiplier: 1.2,
        hazardEscalationMultiplier: 1.4,
        restorationEfficiencyMultiplier: 0.9,
      },
    },
    {
      eraNumber: 3,
      id: `${worldId}.era.3`,
      worldId,
      name: 'The Ascendant Equilibrium',
      subtitle: 'Synthesis & Enduring Balance',
      lore: `The mature era of ${capWorld}, where scientific infrastructure achieves sustained harmony and enhanced restoration efficiency.`,
      catalystCondition: 'Simulation reaches tick 250 with stabilized core sectors.',
      transitionThreshold: { minTick: 250 },
      regimeModifiers: {
        degradationRateMultiplier: 0.75,
        consumptionMultiplier: 0.85,
        hazardEscalationMultiplier: 0.7,
        restorationEfficiencyMultiplier: 1.35,
      },
    },
  ];
}

export function createDefaultActorsAndMonuments(worldId: string): {
  actors: ActorMemoryRecord[];
  monuments: MonumentRecord[];
} {
  const capWorld = worldId.charAt(0).toUpperCase() + worldId.slice(1);
  return {
    actors: [
      {
        id: `actor-${worldId}-founder`,
        worldId,
        name: `Chief Explorer of ${capWorld}`,
        role: 'Expedition Commander',
        eraNumber: 1,
        achievement: `Established first verified refuge node and charted regional transit corridors on ${capWorld}.`,
        sacrificeOrCost: 'Expended baseline emergency energy caches to protect early survey teams.',
        recordedTick: 1,
        sentiment: 'heroic',
        legacyEffect: {
          metric: 'supplies',
          bonus: 10,
          description: 'Pioneer field protocols improve logistics resupply efficiency.',
        },
      },
    ],
    monuments: [
      {
        id: `monument-${worldId}-keystone`,
        worldId,
        siteId: 'site-primary',
        title: 'The Founding Keystone',
        inscription: `Dedicated to the pioneers of ${capWorld} who built when the world was uncertain.`,
        erectedTick: 1,
        dedicatedToActorId: `actor-${worldId}-founder`,
      },
    ],
  };
}

export function createDefaultHypotheses(worldId: string): readonly CausalHypothesisDefinition[] {
  const capWorld = worldId.charAt(0).toUpperCase() + worldId.slice(1);
  return [
    {
      id: `${worldId}.hypothesis.core_stabilization`,
      worldId,
      title: `${capWorld} Core Equilibrium Hypothesis`,
      premise: `Priced interventions at primary nodes will reduce active hazard drift and stabilize baseline metrics on ${capWorld}.`,
      targetActionFamily: 'P001',
      observableMetrics: ['stability'],
      prediction: {
        metric: 'stability',
        expectedDirection: 'increase',
        minimumExpectedDelta: 5.0,
      },
      confoundRisks: [
        'Concurrent external hazard spikes during survey sweeps.',
        'Resource budget starvation constraining intervention duration.',
      ],
    },
  ];
}

export function createDefaultDivergenceSnapshot(worldId: string): BranchDiffSnapshot {
  return {
    id: `diff-${worldId}-baseline-init`,
    sourceRunId: `run-${worldId}-primary`,
    originCheckpointId: `cp-${worldId}-origin`,
    worldId,
    tick: 0,
    rulesVersion: 1,
    baselineHash: '0000000000000000',
    treatmentHash: '0000000000000000',
    metricDiffs: [
      {
        metricId: 'stability',
        label: 'Stability',
        baselineValue: 50,
        treatmentValue: 50,
        absoluteDiff: 0,
        percentDiff: 0,
      },
    ],
    siteDiffs: [],
    inventoryDiffs: {},
    crewDiffs: [],
    temporalScrubbingAvailable: true,
  };
}


export const STANDARD_G2_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'logistics.ship',
    featureId: 'P004',
    name: 'Dispatch Logistics Shipment',
    description: 'Schedule and dispatch courier shipment between verified depots.',
    minRulesVersion: 1,
  },
  {
    id: 'logistics.resupply',
    featureId: 'P004',
    name: 'Local Depot Resupply',
    description: 'Extract emergency resupply from verified local depot.',
    minRulesVersion: 1,
  },
  {
    id: 'facility.build',
    featureId: 'P005',
    name: 'Construct World Facility',
    description: 'Begin construction of a native persistent facility.',
    minRulesVersion: 1,
  },
  {
    id: 'facility.maintain',
    featureId: 'P005',
    name: 'Maintain Facility',
    description: 'Perform maintenance to restore degraded facility operation.',
    minRulesVersion: 1,
  },
  {
    id: 'facility.configure',
    featureId: 'P005',
    name: 'Configure Facility',
    description: 'Adjust operating rate and resource profile.',
    minRulesVersion: 1,
  },
  {
    id: 'facility.retire',
    featureId: 'P005',
    name: 'Retire Facility',
    description: 'Decommission facility and recover partial salvage.',
    minRulesVersion: 1,
  },
];

export const STANDARD_G3_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'emergency.mitigate',
    featureId: 'P006',
    name: 'Mitigate Cascading Emergency',
    description: 'Apply targeted intervention to contain or de-escalate an active emergency.',
    minRulesVersion: 1,
  },
  {
    id: 'policy.enact',
    featureId: 'P017',
    name: 'Enact Strategic Policy',
    description: 'Adopt an authored tradeoff policy balancing resource burn against domain stability.',
    minRulesVersion: 1,
  },
];

export const STANDARD_G4_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'instrument.sample',
    featureId: 'P010',
    name: 'Sample Scientific Instrument',
    description: 'Collect calibrated physical telemetry reading from an in-world instrument.',
    minRulesVersion: 1,
  },
  {
    id: 'instrument.calibrate',
    featureId: 'P010',
    name: 'Calibrate Instrument',
    description: 'Restore measurement precision and sensor calibration to peak accuracy.',
    minRulesVersion: 1,
  },
];

export const STANDARD_G5_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'navigation.zoom',
    featureId: 'P008',
    name: 'Continuum Navigation Zoom',
    description: 'Transition presentation view scale between universe, region, site, and field.',
    minRulesVersion: 1,
  },
  {
    id: 'navigation.transit',
    featureId: 'P008',
    name: 'Regional Route Transit',
    description: 'Dispatch physical expedition traversal along legal verified routes with fuel and tick accounting.',
    minRulesVersion: 1,
  },
  {
    id: 'crew.assign',
    featureId: 'P009',
    name: 'Assign Crew Specialist',
    description: 'Deploy certified specialist crew member to a designated site or facility task.',
    minRulesVersion: 1,
  },
  {
    id: 'crew.rest',
    featureId: 'P009',
    name: 'Rest Crew Specialist',
    description: 'Rest crew member at local refuge or depot to recover expedition energy.',
    minRulesVersion: 1,
  },
];

export const STANDARD_G6_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'destination.start',
    featureId: 'P011',
    name: 'Initiate Destination Mission',
    description: 'Begin multi-stage signature expedition at world legendary destination.',
    minRulesVersion: 1,
  },
  {
    id: 'destination.progress',
    featureId: 'P011',
    name: 'Advance Destination Mission Stage',
    description: 'Contribute certified scientific and physical intervention progress to active destination mission stage.',
    minRulesVersion: 1,
  },
  {
    id: 'era.transition',
    featureId: 'P012',
    name: 'Historical Era Transition Catalyst',
    description: 'Evaluate physical regime shifts and advance historical epoch upon satisfied catalyst conditions.',
    minRulesVersion: 1,
  },
  {
    id: 'memorial.inscribe',
    featureId: 'P015',
    name: 'Inscribe Actor Chronicle',
    description: 'Inscribe named actor achievement or civic memorial into authoritative historical record.',
    minRulesVersion: 1,
  },
  {
    id: 'monument.erect',
    featureId: 'P015',
    name: 'Erect Civic Monument',
    description: 'Construct permanent physical monument dedicated to historical achievement or sacrifice.',
    minRulesVersion: 1,
  },
];

export const STANDARD_G7_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'hypothesis.test',
    featureId: 'P013',
    name: 'Execute Hypothesis Trial',
    description: 'Conduct paired control vs treatment simulation trial to verify causal effect.',
    minRulesVersion: 1,
  },
  {
    id: 'hypothesis.evaluate',
    featureId: 'P013',
    name: 'Evaluate Causal Findings',
    description: 'Assess statistical confidence, effect size, and confound warnings for an investigation.',
    minRulesVersion: 1,
  },
  {
    id: 'divergence.compare',
    featureId: 'P014',
    name: 'Compare Divergent Realities',
    description: 'Generate synchronized spatial and metric diff between baseline and treated timeline branches.',
    minRulesVersion: 1,
  },
  {
    id: 'divergence.scrub',
    featureId: 'P014',
    name: 'Scrub Divergence Timeline',
    description: 'Temporally scrub comparison snapshot to an authenticated historical checkpoint.',
    minRulesVersion: 1,
  },
];

export interface DomainModuleConfig {
  readonly worldId: string;
  readonly capabilities: readonly FeatureCapability[];
  readonly hazardNodes: readonly HazardNode[];
  readonly hazardLinks: readonly HazardLink[];
  readonly initialBudget: Record<string, BudgetResourceConfig>;
  readonly actionCosts: Record<string, Array<{ resource: string; amount: number }>>;
  readonly actionDeltas: Record<string, Array<{ field: string; delta: number; unit: string }>>;
  readonly metricKeys: readonly string[];
  readonly facilityDefinitions?: readonly FacilityDefinition[];
  readonly initialDepots?: ReadonlyArray<{
    siteId: string;
    capacity: number;
    inventory: Record<string, number>;
  }>;
  readonly initialCouriers?: readonly CourierState[];
  readonly initialRoutes?: readonly LogisticsRouteEdge[];
  readonly emergencies?: readonly EmergencyDefinition[];
  readonly restorationLayers?: readonly RestorationLayerDefinition[];
  readonly policies?: readonly PolicyDefinition[];
  readonly instruments?: readonly ScientificInstrumentConfig[];
  readonly nativeActions?: readonly NativeActionFamilyDefinition[];
  readonly initialCrew?: readonly CrewMember[];
  readonly initialContinuumRoutes?: readonly RouteEdge[];
  readonly signatureDestination?: SignatureDestinationDefinition;
  readonly historicalEras?: readonly [HistoricalEraDefinition, HistoricalEraDefinition, HistoricalEraDefinition];
  readonly initialActors?: readonly ActorMemoryRecord[];
  readonly initialMonuments?: readonly MonumentRecord[];
  readonly hypotheses?: readonly CausalHypothesisDefinition[];
  readonly initialBranchDiff?: BranchDiffSnapshot;
}

export class StandardWorldFeatureModule implements WorldFeatureModule {
  readonly worldId: string;
  readonly rulesVersion = 1;
  readonly capabilities: readonly FeatureCapability[];
  readonly hazardGraph: HazardDependencyGraph;
  readonly budgetLedger: ScientificBudgetLedger;
  readonly logisticsNetwork: LogisticsNetwork;
  readonly facilityManager: FacilityManager;
  readonly emergencyManager: EmergencyManager;
  readonly visualRestorationManager: VisualRestorationManager;
  readonly policyManager: PolicyManager;
  readonly instrumentManager: ScientificInstrumentManager;
  readonly actionRegistry: NativeActionRegistry;
  readonly continuumNavigator: AtlasContinuumNavigator;
  readonly crewManager: CrewManager;
  readonly destinationManager: SignatureDestinationManager;
  readonly eraManager: HistoricalEraManager;
  readonly actorMemoryManager: ActorMemoryManager;
  readonly hypothesisManager: HypothesisInvestigationManager;
  readonly divergenceManager: DivergenceTheaterManager;
  private readonly config: DomainModuleConfig;

  constructor(config: DomainModuleConfig) {
    this.worldId = config.worldId;
    this.config = config;

    // Combine custom and standard G2/G3/G4/G5/G6 capabilities
    const inputCaps = config.capabilities ?? [];
    const existingCapIds = new Set(inputCaps.map((c) => c.id));
    const mergedCaps = [...inputCaps];
    for (const stdCap of [
      ...STANDARD_G2_CAPABILITIES,
      ...STANDARD_G3_CAPABILITIES,
      ...STANDARD_G4_CAPABILITIES,
      ...STANDARD_G5_CAPABILITIES,
      ...STANDARD_G6_CAPABILITIES,
      ...STANDARD_G7_CAPABILITIES,
    ]) {
      if (!existingCapIds.has(stdCap.id)) {
        mergedCaps.push(stdCap);
      }
    }
    this.capabilities = mergedCaps;

    this.hazardGraph = new HazardDependencyGraph(
      config.worldId,
      config.hazardNodes ?? [],
      config.hazardLinks ?? [],
    );
    this.budgetLedger = new ScientificBudgetLedger(config.worldId, config.initialBudget);

    // Initialize logistics network
    this.logisticsNetwork = new LogisticsNetwork(config.worldId);
    if (config.initialDepots) {
      for (const d of config.initialDepots) {
        this.logisticsNetwork.createDepot(d.siteId, d.capacity, d.inventory);
      }
    }
    if (config.initialCouriers) {
      for (const c of config.initialCouriers) {
        this.logisticsNetwork.registerCourier(c);
      }
    }
    if (config.initialRoutes) {
      for (const r of config.initialRoutes) {
        this.logisticsNetwork.addRouteEdge(r);
      }
    }

    // Initialize facility manager
    this.facilityManager = new FacilityManager(config.worldId);
    if (config.facilityDefinitions) {
      for (const f of config.facilityDefinitions) {
        this.facilityManager.registerDefinition(f);
      }
    }

    // Initialize emergency manager
    this.emergencyManager = new EmergencyManager(config.worldId);
    if (config.emergencies) {
      for (const e of config.emergencies) {
        this.emergencyManager.registerEmergency(e);
      }
    }

    // Initialize visual restoration manager
    this.visualRestorationManager = new VisualRestorationManager(config.worldId);
    if (config.restorationLayers) {
      for (const l of config.restorationLayers) {
        this.visualRestorationManager.registerLayer(l);
      }
    }

    // Initialize policy manager
    this.policyManager = new PolicyManager(config.worldId);
    if (config.policies) {
      for (const p of config.policies) {
        this.policyManager.registerPolicy(p);
      }
    }

    // Initialize scientific instrument manager
    this.instrumentManager = new ScientificInstrumentManager(config.worldId);
    if (config.instruments) {
      for (const inst of config.instruments) {
        this.instrumentManager.registerInstrument(inst);
      }
    }

    // Initialize native action registry
    this.actionRegistry = new NativeActionRegistry();
    if (config.nativeActions) {
      for (const act of config.nativeActions) {
        this.actionRegistry.registerAction(act);
      }
    }

    // Initialize continuum navigator (P008)
    this.continuumNavigator = new AtlasContinuumNavigator(config.worldId);
    if (config.initialRoutes) {
      for (const r of config.initialRoutes) {
        this.continuumNavigator.registerRoute({
          id: `route-${r.fromSiteId}-${r.toSiteId}`,
          from: r.fromSiteId,
          to: r.toSiteId,
          travelTicks: r.travelTicks,
          fuel: r.fuelCost,
          blocked: false,
        });
      }
    }
    if (config.initialContinuumRoutes) {
      for (const r of config.initialContinuumRoutes) {
        this.continuumNavigator.registerRoute(r);
      }
    }

    // Initialize crew manager (P009)
    this.crewManager = new CrewManager(config.worldId);
    if (config.initialCrew && config.initialCrew.length > 0) {
      for (const c of config.initialCrew) {
        this.crewManager.registerCrew({ ...c });
      }
    } else {
      // Register standard 6 specialist crew members per world
      const roles = [
        CrewRole.FIELD_SURVEYOR,
        CrewRole.SYSTEMS_ENGINEER,
        CrewRole.BIOSPHERE_ECOLOGIST,
        CrewRole.LOGISTICS_COURIER,
        CrewRole.HEAVY_CONSTRUCTOR,
        CrewRole.HAZARD_SPECIALIST,
      ];
      roles.forEach((role, idx) => {
        this.crewManager.registerCrew({
          id: `crew-${config.worldId}-${idx}`,
          worldId: config.worldId,
          name: `${CREW_ROLE_DEFINITIONS[role].roleName} ${idx + 1}`,
          role,
          energy: 80,
          assignedRegionId: 'region-primary',
          assignedSiteId: null,
          work: 0,
        });
      });
    }

    // Initialize P011 Destination Manager
    this.destinationManager = new SignatureDestinationManager(config.worldId);
    if (config.signatureDestination) {
      this.destinationManager.registerDestination(config.signatureDestination);
    } else {
      this.destinationManager.registerDestination(createDefaultSignatureDestination(config.worldId));
    }

    // Initialize P012 Historical Era Manager
    const defaultEras = config.historicalEras ?? createDefaultHistoricalEras(config.worldId);
    this.eraManager = new HistoricalEraManager(config.worldId, defaultEras);

    // Initialize P015 Actor Memory Manager
    const defaultMemory = createDefaultActorsAndMonuments(config.worldId);
    this.actorMemoryManager = new ActorMemoryManager(
      config.worldId,
      config.initialActors ?? defaultMemory.actors,
      config.initialMonuments ?? defaultMemory.monuments,
    );

    // Initialize P013 Hypothesis Investigation Manager
    this.hypothesisManager = new HypothesisInvestigationManager(
      config.worldId,
      config.hypotheses ?? createDefaultHypotheses(config.worldId),
    );

    // Initialize P014 Divergence Theater Manager
    this.divergenceManager = new DivergenceTheaterManager(
      config.worldId,
      config.initialBranchDiff ?? createDefaultDivergenceSnapshot(config.worldId),
    );
  }

  previewCost(capabilityId: string): CostPreview {
    const debits = this.config.actionCosts[capabilityId] ?? [];
    return this.budgetLedger.previewDebit(debits);
  }

  evaluateHazards(
    metrics: Record<string, number>,
    tick: number,
  ): HazardEvaluationResult {
    return this.hazardGraph.evaluate(metrics, tick);
  }

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = this.capabilities.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world ${this.worldId}`,
      };
    }

    const payload = (r.payload as Record<string, unknown>) ?? {};

    // P005: Facility Actions
    if (cap.id === 'facility.build') {
      const defaultTypeId = this.facilityManager.definitions.keys().next().value ?? 'default_facility';
      const typeId = String(payload.typeId ?? defaultTypeId);
      const siteId = String(payload.siteId ?? 'site-default');
      if (payload.typeId && !this.facilityManager.definitions.has(typeId)) {
        return { valid: false, error: `Unknown facility type: ${typeId}` };
      }
      return {
        valid: true,
        action: {
          actionFamily: 'P005',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, siteId, typeId },
          targetSiteId: siteId,
        },
      };
    }

    if (cap.id === 'facility.maintain' || cap.id === 'facility.configure' || cap.id === 'facility.retire') {
      const siteId = String(payload.siteId ?? 'site-default');
      return {
        valid: true,
        action: {
          actionFamily: 'P005',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, siteId },
          targetSiteId: siteId,
        },
      };
    }

    // P004: Logistics Actions
    if (cap.id === 'logistics.ship') {
      const sourceSiteId = String(payload.sourceSiteId ?? 'site-default-a');
      const destSiteId = String(payload.destSiteId ?? 'site-default-b');
      return {
        valid: true,
        action: {
          actionFamily: 'P004',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, sourceSiteId, destSiteId },
        },
      };
    }

    if (cap.id === 'logistics.resupply') {
      const siteId = String(payload.siteId ?? 'site-default');
      const resource = String(payload.resource ?? 'supplies');
      return {
        valid: true,
        action: {
          actionFamily: 'P004',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, siteId, resource },
          targetSiteId: siteId,
        },
      };
    }

    // P006: Emergency Mitigation
    if (cap.id === 'emergency.mitigate') {
      const emergencyId = String(
        payload.emergencyId ?? this.emergencyManager.getAllDefinitions()[0]?.id ?? 'default_emergency',
      );
      return {
        valid: true,
        action: {
          actionFamily: 'P006',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, emergencyId },
        },
      };
    }

    // P017: Policy Enactment
    if (cap.id === 'policy.enact') {
      const policyId = String(
        payload.policyId ?? this.policyManager.getAllPolicies()[0]?.id ?? 'default_policy',
      );
      return {
        valid: true,
        action: {
          actionFamily: 'P017',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, policyId },
        },
      };
    }

    // P010: Scientific Instrument Actions
    if (cap.id === 'instrument.sample') {
      const defaultInst = this.instrumentManager.getAllInstruments()[0];
      const instrumentId = String(payload.instrumentId ?? defaultInst?.id ?? 'default_instrument');
      const inst = this.instrumentManager.getInstrument(instrumentId);
      if (payload.instrumentId && !inst) {
        return { valid: false, error: `Instrument ${instrumentId} not found on world ${this.worldId}` };
      }
      const defaultChannel = inst ? (inst.channels.keys().next().value ?? 'default_channel') : 'default_channel';
      const channelId = String(payload.channelId ?? defaultChannel);
      if (inst && payload.channelId && !inst.hasChannel(channelId)) {
        return { valid: false, error: `Channel ${channelId} not available on instrument ${instrumentId}` };
      }
      const siteId = String(payload.siteId ?? 'site-default');
      return {
        valid: true,
        action: {
          actionFamily: 'P010',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, instrumentId, channelId, siteId },
          targetSiteId: siteId,
        },
      };
    }

    if (cap.id === 'instrument.calibrate') {
      const defaultInst = this.instrumentManager.getAllInstruments()[0];
      const instrumentId = String(payload.instrumentId ?? defaultInst?.id ?? 'default_instrument');
      if (payload.instrumentId && !this.instrumentManager.getInstrument(instrumentId)) {
        return { valid: false, error: `Instrument ${instrumentId} not found on world ${this.worldId}` };
      }
      return {
        valid: true,
        action: {
          actionFamily: 'P010',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, instrumentId },
        },
      };
    }

    // P008: Continuum Navigation Actions
    if (cap.id === 'navigation.zoom') {
      const scale = payload.scale as ViewScale | undefined;
      const direction = payload.direction as 'in' | 'out' | undefined;
      return {
        valid: true,
        action: {
          actionFamily: 'P008',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { scale, direction },
        },
      };
    }

    if (cap.id === 'navigation.transit') {
      const fromRegionId = String(payload.fromRegionId ?? 'region-primary');
      if (payload.toRegionId) {
        const toRegionId = String(payload.toRegionId);
        const fuelAvailable = Number(payload.fuelAvailable ?? 10);
        const check = this.continuumNavigator.verifyTransit(fromRegionId, toRegionId, fuelAvailable);
        if (!check.legal) {
          return { valid: false, error: check.reason };
        }
        return {
          valid: true,
          action: {
            actionFamily: 'P008',
            worldId: this.worldId,
            capabilityId: cap.id,
            payload: { fromRegionId, toRegionId, fuelCost: check.fuelCost, travelTicks: check.travelTicks },
          },
        };
      }
      return {
        valid: true,
        action: {
          actionFamily: 'P008',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { fromRegionId, toRegionId: fromRegionId, fuelCost: 0, travelTicks: 0 },
        },
      };
    }

    // P009: Crew Specialization Actions
    if (cap.id === 'crew.assign') {
      const defaultCrewId = this.crewManager.getAllCrew()[0]?.id ?? 'crew-01';
      const crewId = String(payload.crewId ?? defaultCrewId);
      if (payload.crewId) {
        const requiredRole = typeof payload.requiredRole === 'number' ? (payload.requiredRole as CrewRole) : undefined;
        const legality = this.crewManager.checkExpeditionLegality([crewId], requiredRole);
        if (!legality.legal) {
          return { valid: false, error: legality.reason };
        }
      }
      return {
        valid: true,
        action: {
          actionFamily: 'P009',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { crewId, targetSiteId: payload.targetSiteId ? String(payload.targetSiteId) : undefined },
        },
      };
    }

    if (cap.id === 'crew.rest') {
      const defaultCrewId = this.crewManager.getAllCrew()[0]?.id ?? 'crew-01';
      const crewId = String(payload.crewId ?? defaultCrewId);
      if (payload.crewId) {
        const member = this.crewManager.getCrew(crewId);
        if (!member) {
          return { valid: false, error: `Crew member ${crewId} not found on world ${this.worldId}` };
        }
      }
      return {
        valid: true,
        action: {
          actionFamily: 'P009',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { crewId, amount: Number(payload.amount ?? 25) },
        },
      };
    }

    // P011: Destination Mission Actions
    if (cap.id === 'destination.start') {
      const defaultDest = this.destinationManager.getAllDefinitions()[0];
      const destinationId = String(payload.destinationId ?? defaultDest?.id ?? `${this.worldId}.destination.primary`);
      const def = this.destinationManager.getDestination(destinationId);
      if (payload.destinationId && !def) {
        return { valid: false, error: `Destination ${destinationId} not found on world ${this.worldId}` };
      }
      return {
        valid: true,
        action: {
          actionFamily: 'P011',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { destinationId },
        },
      };
    }

    if (cap.id === 'destination.progress') {
      const defaultDest = this.destinationManager.getAllDefinitions()[0];
      const destinationId = String(payload.destinationId ?? defaultDest?.id ?? `${this.worldId}.destination.primary`);
      const delta = Number(payload.delta ?? 25);
      return {
        valid: true,
        action: {
          actionFamily: 'P011',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { destinationId, delta },
        },
      };
    }

    // P012: Historical Era Actions
    if (cap.id === 'era.transition') {
      const targetEra = typeof payload.targetEra === 'number' ? (payload.targetEra as 1 | 2 | 3) : undefined;
      return {
        valid: true,
        action: {
          actionFamily: 'P012',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { targetEra },
        },
      };
    }

    // P015: Actor Memory Actions
    if (cap.id === 'memorial.inscribe') {
      const name = String(payload.name ?? 'Honored Pioneer');
      const role = String(payload.role ?? 'Expedition Specialist');
      const achievement = String(payload.achievement ?? 'Stabilized crucial sector perimeter');
      return {
        valid: true,
        action: {
          actionFamily: 'P015',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { name, role, achievement },
        },
      };
    }

    if (cap.id === 'monument.erect') {
      const title = String(payload.title ?? 'Monument to Resilience');
      const siteId = String(payload.siteId ?? 'site-primary');
      const inscription = String(payload.inscription ?? 'In honor of enduring courage across the trials.');
      return {
        valid: true,
        action: {
          actionFamily: 'P015',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { title, siteId, inscription },
        },
      };
    }

    // P013: Hypothesis Actions
    if (cap.id === 'hypothesis.test') {
      const defaultHypo = this.hypothesisManager.getAllHypotheses()[0];
      const hypothesisId = String(payload.hypothesisId ?? defaultHypo?.id ?? `${this.worldId}.hypothesis.core_stabilization`);
      const seed = Number(payload.seed ?? 42);
      const startTick = Number(payload.startTick ?? 0);
      const durationTicks = Number(payload.durationTicks ?? 50);
      const baselineFinalHash = String(payload.baselineFinalHash ?? 'hash-base-0');
      const treatmentFinalHash = String(payload.treatmentFinalHash ?? 'hash-treat-0');
      const baselineStartVal = Number(payload.baselineStartVal ?? 50);
      const baselineEndVal = Number(payload.baselineEndVal ?? 48);
      const treatmentStartVal = Number(payload.treatmentStartVal ?? 50);
      const treatmentEndVal = Number(payload.treatmentEndVal ?? 62);
      return {
        valid: true,
        action: {
          actionFamily: 'P013',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: {
            hypothesisId,
            seed,
            startTick,
            durationTicks,
            baselineFinalHash,
            treatmentFinalHash,
            baselineStartVal,
            baselineEndVal,
            treatmentStartVal,
            treatmentEndVal,
            externalHazardSpikeDetected: Boolean(payload.externalHazardSpikeDetected),
            resourceExhaustionDetected: Boolean(payload.resourceExhaustionDetected),
          },
        },
      };
    }

    if (cap.id === 'hypothesis.evaluate') {
      const defaultHypo = this.hypothesisManager.getAllHypotheses()[0];
      const hypothesisId = String(payload.hypothesisId ?? defaultHypo?.id ?? `${this.worldId}.hypothesis.core_stabilization`);
      return {
        valid: true,
        action: {
          actionFamily: 'P013',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { hypothesisId },
        },
      };
    }

    // P014: Divergence Actions
    if (cap.id === 'divergence.compare') {
      const originCheckpointId = String(payload.originCheckpointId ?? `cp-${this.worldId}-origin`);
      const baselineHash = String(payload.baselineHash ?? 'hash-base-0');
      const treatmentHash = String(payload.treatmentHash ?? 'hash-treat-0');
      const baselineMetrics = (payload.baselineMetrics as Record<string, number>) ?? { stability: 50 };
      const treatmentMetrics = (payload.treatmentMetrics as Record<string, number>) ?? { stability: 65 };
      return {
        valid: true,
        action: {
          actionFamily: 'P014',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: {
            originCheckpointId,
            baselineHash,
            treatmentHash,
            baselineMetrics,
            treatmentMetrics,
            baselineSites: payload.baselineSites,
            treatmentSites: payload.treatmentSites,
            mismatchedOrigin: Boolean(payload.mismatchedOrigin),
            mismatchedTick: Boolean(payload.mismatchedTick),
          },
        },
      };
    }

    if (cap.id === 'divergence.scrub') {
      const targetTick = Number(payload.targetTick ?? 0);
      return {
        valid: true,
        action: {
          actionFamily: 'P014',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { targetTick },
        },
      };
    }

    // P001: Native Action Registry Validation
    const nativeDef = this.actionRegistry.getAction(cap.id);
    if (nativeDef) {
      const res = this.actionRegistry.validate(cap.id, _state, this.budgetLedger);
      if (!res.valid) {
        return { valid: false, error: res.error };
      }
      return {
        valid: true,
        action: {
          actionFamily: 'P001',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload,
        },
      };
    }

    // Standard Priced Actions
    const preview = this.previewCost(cap.id);
    if (!preview.feasible) {
      const shortfallMsg = preview.shortfalls
        .map((s) => `${s.resource}: need ${s.required}, have ${s.available}`)
        .join(', ');
      return {
        valid: false,
        error: `Insufficient budget for ${cap.id}: ${shortfallMsg}`,
      };
    }

    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: this.worldId,
        capabilityId: cap.id,
        payload,
        cost: cap.costResource ? { resource: cap.costResource, amount: 2 } : undefined,
      },
    };
  }

  applyAction(
    state: Record<string, unknown>,
    action: ValidatedAction,
    ctx: { tick: number; emitEvent: (e: any) => any },
  ): ActionExecutionReceipt {
    const payload = action.payload as Record<string, unknown>;

    // Handle P005 Facility Commands
    if (action.capabilityId === 'facility.build') {
      const siteId = String(payload.siteId);
      const regionId = String(payload.regionId ?? 'region-default');
      const typeId = String(payload.typeId);
      const res = this.facilityManager.buildFacility(siteId, regionId, typeId, ctx.tick, {
        budgetLedger: this.budgetLedger,
        logisticsNetwork: this.logisticsNetwork,
      });

      if (!res.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: res.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.facility_built`,
        severity: 'info',
        title: `Facility Built: ${typeId}`,
        description: `Initiated construction of ${typeId} at ${siteId} on ${this.worldId}.`,
        sourceSystem: 'facility-manager',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'facility.maintain') {
      const siteId = String(payload.siteId);
      const res = this.facilityManager.maintainFacility(siteId, ctx.tick, {
        budgetLedger: this.budgetLedger,
        logisticsNetwork: this.logisticsNetwork,
      });

      if (!res.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: res.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.facility_maintained`,
        severity: 'info',
        title: `Facility Maintained at ${siteId}`,
        description: `Performed maintenance at ${siteId} on ${this.worldId}.`,
        sourceSystem: 'facility-manager',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'facility.configure') {
      const siteId = String(payload.siteId);
      const rate = Number(payload.operatingRate ?? 1.0);
      const res = this.facilityManager.configureFacility(siteId, rate);

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: res.success ? 'success' : 'rejected',
        rejectionReason: res.reason,
        debits: [],
        deltas: [],
        eventsEmitted: [],
      };
    }

    if (action.capabilityId === 'facility.retire') {
      const siteId = String(payload.siteId);
      const res = this.facilityManager.retireFacility(siteId, {
        logisticsNetwork: this.logisticsNetwork,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: res.success ? 'success' : 'rejected',
        rejectionReason: res.reason,
        debits: [],
        deltas: [],
        eventsEmitted: [],
      };
    }

    // Handle P004 Logistics Commands
    if (action.capabilityId === 'logistics.ship') {
      const orderId = String(payload.orderId ?? `ord-${ctx.tick}`);
      const sourceSiteId = String(payload.sourceSiteId);
      const destSiteId = String(payload.destSiteId);
      const cargo = (payload.cargo as Record<string, number>) ?? {};
      const courierId = payload.courierId ? String(payload.courierId) : undefined;
      const route = Array.isArray(payload.route) ? (payload.route as string[]) : [];

      const orderRes = this.logisticsNetwork.createShipmentOrder(
        orderId,
        sourceSiteId,
        destSiteId,
        cargo,
        route,
      );

      if (!orderRes.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: orderRes.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      if (courierId) {
        const dispatchRes = this.logisticsNetwork.dispatchOrder(orderId, courierId, ctx.tick);
        if (!dispatchRes.success) {
          return {
            actionId: `${action.capabilityId}-${ctx.tick}`,
            worldId: this.worldId,
            tick: ctx.tick,
            executedAtTick: ctx.tick,
            status: 'rejected',
            rejectionReason: dispatchRes.reason,
            debits: [],
            deltas: [],
            eventsEmitted: [],
          };
        }
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.shipment_created`,
        severity: 'info',
        title: `Shipment ${orderId} Created`,
        description: `Shipment ${orderId} scheduled from ${sourceSiteId} to ${destSiteId}.`,
        sourceSystem: 'logistics-network',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'logistics.resupply') {
      const siteId = String(payload.siteId);
      const resource = String(payload.resource);
      const amount = Number(payload.amount ?? 1);

      const res = this.logisticsNetwork.localResupply(siteId, resource, amount);
      if (!res.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: res.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.resupply_extracted`,
        severity: 'info',
        title: `Local Resupply: ${res.amountSupplied} ${resource}`,
        description: `Extracted ${res.amountSupplied} ${resource} from depot at ${siteId}.`,
        sourceSystem: 'logistics-network',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [{ resource, amount: res.amountSupplied }],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P006 Emergency Mitigation
    if (action.capabilityId === 'emergency.mitigate') {
      const emergencyId = String(payload.emergencyId);
      const effectiveness = typeof payload.effectiveness === 'number' ? payload.effectiveness : 1.0;
      const res = this.emergencyManager.mitigateEmergency(emergencyId, ctx.tick, effectiveness);

      if (!res.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: res.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.emergency_mitigated`,
        severity: 'info',
        title: `Emergency Mitigated: ${emergencyId}`,
        description: `Applied targeted mitigation to ${emergencyId} on ${this.worldId} (stage: ${res.newStage}).`,
        sourceSystem: 'emergency-manager',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P017 Policy Enactment
    if (action.capabilityId === 'policy.enact') {
      const policyId = String(payload.policyId);
      const policy = this.policyManager.getPolicy(policyId);
      const policyName = policy ? policy.name : policyId;

      const event = ctx.emitEvent({
        type: `${this.worldId}.policy_enacted`,
        severity: 'info',
        title: `Policy Enacted: ${policyName}`,
        description: `Enacted strategic policy ${policyName} on ${this.worldId}.`,
        sourceSystem: 'policy-manager',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P010 Scientific Instrument Actions
    if (action.capabilityId === 'instrument.sample') {
      const instrumentId = String(payload.instrumentId);
      const channelId = String(payload.channelId);
      const siteId = String(payload.siteId);
      const rawVal = typeof state[channelId] === 'number' ? (state[channelId] as number) : 50;
      const res = this.instrumentManager.sample(
        instrumentId,
        {
          channelId,
          siteId,
          tick: ctx.tick,
          rawMetricValue: rawVal,
          distanceMeters: typeof payload.distanceMeters === 'number' ? payload.distanceMeters : 10,
          isDisclosed: payload.isDisclosed !== false,
        },
        this.budgetLedger,
      );

      if (!res.success || !res.observation) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: res.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.instrument_sampled`,
        severity: 'info',
        title: `Instrument Sampled: ${channelId}`,
        description: `Sampled ${channelId} (${res.observation.calibratedValue} ${res.observation.unit}) at ${siteId} via ${instrumentId}.`,
        sourceSystem: 'scientific-instruments',
        payload: {
          observationId: res.observation.id,
          instrumentId,
          channelId,
          calibratedValue: res.observation.calibratedValue,
          unit: res.observation.unit,
          confidence: res.observation.confidence,
        },
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: res.observation.provenance.costPaid ? [...res.observation.provenance.costPaid] : [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'instrument.calibrate') {
      const instrumentId = String(payload.instrumentId);
      const res = this.instrumentManager.calibrate(instrumentId, ctx.tick, this.budgetLedger);

      if (!res.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: res.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.instrument_calibrated`,
        severity: 'info',
        title: `Instrument Calibrated: ${instrumentId}`,
        description: `Calibrated ${instrumentId} from ${res.previousLevel} to ${res.newLevel}.`,
        sourceSystem: 'scientific-instruments',
        payload: { instrumentId, previousLevel: res.previousLevel, newLevel: res.newLevel },
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P008 Navigation Commands
    if (action.capabilityId === 'navigation.zoom') {
      const scale = payload.scale as ViewScale | undefined;
      const direction = payload.direction as 'in' | 'out' | undefined;
      if (scale) {
        this.continuumNavigator.setScale(scale);
      } else if (direction === 'in') {
        this.continuumNavigator.zoomIn();
      } else if (direction === 'out') {
        this.continuumNavigator.zoomOut();
      }
      const newScale = this.continuumNavigator.getCurrentScale();

      const event = ctx.emitEvent({
        type: `${this.worldId}.navigation_zoomed`,
        severity: 'info',
        title: `Navigation Zoom: ${newScale}`,
        description: `Adjusted continuum viewport scale to ${newScale} on ${this.worldId}.`,
        sourceSystem: 'atlas-continuum',
        payload: { scale: newScale },
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'navigation.transit') {
      const toRegionId = String(payload.toRegionId);
      const fuelCost = Number(payload.fuelCost ?? 0);
      this.continuumNavigator.selectRegion(toRegionId);

      const event = ctx.emitEvent({
        type: `${this.worldId}.expedition_transited`,
        severity: 'info',
        title: `Expedition Transited to ${toRegionId}`,
        description: `Traversed regional route to ${toRegionId} on ${this.worldId} (fuel cost: ${fuelCost}).`,
        sourceSystem: 'atlas-continuum',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: fuelCost > 0 ? [{ resource: 'fuel', amount: fuelCost }] : [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P009 Crew Commands
    if (action.capabilityId === 'crew.assign') {
      const crewId = String(payload.crewId);
      const targetSiteId = payload.targetSiteId ? String(payload.targetSiteId) : null;
      const member = this.crewManager.getCrew(crewId);
      if (member) {
        member.assignedSiteId = targetSiteId;
        this.crewManager.debitEnergy(crewId, 10);
        this.crewManager.incrementWork(crewId, 1);
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.crew_assigned`,
        severity: 'info',
        title: `Crew Assigned: ${crewId}`,
        description: `Assigned specialist ${crewId} to site ${targetSiteId ?? 'field'} on ${this.worldId}.`,
        sourceSystem: 'crew-manager',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'crew.rest') {
      const crewId = String(payload.crewId);
      const amount = Number(payload.amount ?? 25);
      this.crewManager.restCrew(crewId, amount);

      const event = ctx.emitEvent({
        type: `${this.worldId}.crew_rested`,
        severity: 'info',
        title: `Crew Rested: ${crewId}`,
        description: `Rested crew member ${crewId} to restore ${amount}% energy on ${this.worldId}.`,
        sourceSystem: 'crew-manager',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P011 Destination Commands
    if (action.capabilityId === 'destination.start') {
      const destinationId = String(payload.destinationId);
      const success = this.destinationManager.startMission(destinationId, ctx.tick);
      const event = ctx.emitEvent({
        type: `${this.worldId}.destination_started`,
        severity: 'info',
        title: `Destination Mission Started: ${destinationId}`,
        description: `Initiated signature expedition at ${destinationId} on ${this.worldId}.`,
        sourceSystem: 'signature-destinations',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: success ? 'success' : 'rejected',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'destination.progress') {
      const destinationId = String(payload.destinationId);
      const delta = Number(payload.delta ?? 25);
      const res = this.destinationManager.advanceStageProgress(destinationId, delta, ctx.tick);

      const event = ctx.emitEvent({
        type: `${this.worldId}.destination_progressed`,
        severity: 'info',
        title: `Destination Progress: ${res.progress} units`,
        description: `Advanced stage ${res.currentStage} of ${destinationId} (completed: ${res.stageCompleted}).`,
        sourceSystem: 'signature-destinations',
        payload: { destinationId, ...res },
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: res.success ? 'success' : 'rejected',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P012 Era Commands
    if (action.capabilityId === 'era.transition') {
      let transitioned = false;
      if (typeof payload.targetEra === 'number') {
        this.eraManager.forceEra(payload.targetEra as 1 | 2 | 3, ctx.tick);
        transitioned = true;
      } else {
        const numericMetrics: Record<string, number> = {};
        for (const [k, v] of Object.entries(state)) {
          if (typeof v === 'number') numericMetrics[k] = v;
        }
        const check = this.eraManager.evaluateTransition(ctx.tick, numericMetrics);
        transitioned = check.transitioned;
      }

      const currentEra = this.eraManager.getCurrentEra();
      const event = ctx.emitEvent({
        type: `${this.worldId}.era_transitioned`,
        severity: 'info',
        title: `Historical Era: ${currentEra.name}`,
        description: `World ${this.worldId} active era: ${currentEra.name} (${currentEra.subtitle}).`,
        sourceSystem: 'historical-eras',
        payload: { era: currentEra, transitioned },
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P015 Actor Memory Commands
    if (action.capabilityId === 'memorial.inscribe') {
      const name = String(payload.name);
      const role = String(payload.role);
      const achievement = String(payload.achievement);
      this.actorMemoryManager.registerActor({
        id: `actor-${this.worldId}-${ctx.tick}`,
        worldId: this.worldId,
        name,
        role,
        eraNumber: this.eraManager.getCurrentEraNumber(),
        achievement,
        sacrificeOrCost: 'Dedicated personal endurance to civic survival',
        recordedTick: ctx.tick,
        sentiment: 'revered',
      });

      const event = ctx.emitEvent({
        type: `${this.worldId}.actor_inscribed`,
        severity: 'info',
        title: `Memory Inscribed: ${name}`,
        description: `Inscribed ${name} (${role}) in civic chronicle.`,
        sourceSystem: 'actor-memory',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'monument.erect') {
      const title = String(payload.title);
      const siteId = String(payload.siteId);
      const inscription = String(payload.inscription);
      this.actorMemoryManager.erectMonument({
        id: `monument-${this.worldId}-${ctx.tick}`,
        worldId: this.worldId,
        siteId,
        title,
        inscription,
        erectedTick: ctx.tick,
      });

      const event = ctx.emitEvent({
        type: `${this.worldId}.monument_erected`,
        severity: 'info',
        title: `Monument Erected: ${title}`,
        description: `Erected ${title} at ${siteId}: "${inscription}"`,
        sourceSystem: 'actor-memory',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P013 Hypothesis Commands
    if (action.capabilityId === 'hypothesis.test') {
      const hypothesisId = String(payload.hypothesisId);
      const trial = this.hypothesisManager.recordTrialResult(hypothesisId, {
        seed: Number(payload.seed ?? 42),
        startTick: Number(payload.startTick ?? 0),
        durationTicks: Number(payload.durationTicks ?? 50),
        baselineFinalHash: String(payload.baselineFinalHash ?? 'hash-base-0'),
        treatmentFinalHash: String(payload.treatmentFinalHash ?? 'hash-treat-0'),
        baselineStartVal: Number(payload.baselineStartVal ?? 50),
        baselineEndVal: Number(payload.baselineEndVal ?? 48),
        treatmentStartVal: Number(payload.treatmentStartVal ?? 50),
        treatmentEndVal: Number(payload.treatmentEndVal ?? 62),
        externalHazardSpikeDetected: Boolean(payload.externalHazardSpikeDetected),
        resourceExhaustionDetected: Boolean(payload.resourceExhaustionDetected),
        tick: ctx.tick,
      });

      const event = ctx.emitEvent({
        type: `${this.worldId}.hypothesis_tested`,
        severity: 'info',
        title: `Hypothesis Trial: ${hypothesisId}`,
        description: `Conducted paired trial for ${hypothesisId} on ${this.worldId}. Outcome: ${trial.outcome} (effect: ${trial.causalEffectSize}).`,
        sourceSystem: 'hypothesis-investigation',
        payload: { trial },
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'hypothesis.evaluate') {
      const hypothesisId = String(payload.hypothesisId);
      const status = this.hypothesisManager.getStatus(hypothesisId);
      const trials = this.hypothesisManager.getTrialHistory(hypothesisId);

      const event = ctx.emitEvent({
        type: `${this.worldId}.hypothesis_evaluated`,
        severity: 'info',
        title: `Hypothesis Evaluated: ${hypothesisId}`,
        description: `Evaluated ${hypothesisId} findings on ${this.worldId}: Status=${status}, Trials=${trials.length}.`,
        sourceSystem: 'hypothesis-investigation',
        payload: { hypothesisId, status, trialsCount: trials.length },
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P014 Divergence Commands
    if (action.capabilityId === 'divergence.compare') {
      const snapshot = this.divergenceManager.computeBranchDiff({
        sourceRunId: `run-${this.worldId}-${ctx.tick}`,
        originCheckpointId: String(payload.originCheckpointId ?? `cp-${this.worldId}-origin`),
        tick: ctx.tick,
        baselineHash: String(payload.baselineHash ?? 'hash-base-0'),
        treatmentHash: String(payload.treatmentHash ?? 'hash-treat-0'),
        baselineMetrics: (payload.baselineMetrics as Record<string, number>) ?? { stability: 50 },
        treatmentMetrics: (payload.treatmentMetrics as Record<string, number>) ?? { stability: 65 },
        baselineSites: payload.baselineSites as Record<string, string> | undefined,
        treatmentSites: payload.treatmentSites as Record<string, string> | undefined,
        mismatchedOrigin: Boolean(payload.mismatchedOrigin),
        mismatchedTick: Boolean(payload.mismatchedTick),
      });

      const event = ctx.emitEvent({
        type: `${this.worldId}.divergence_compared`,
        severity: 'info',
        title: `Divergence Compared at Tick ${ctx.tick}`,
        description: `Computed branch diff with ${snapshot.metricDiffs.length} metric diffs and ${snapshot.siteDiffs.length} site diffs on ${this.worldId}.`,
        sourceSystem: 'divergence-theater',
        payload: { snapshotId: snapshot.id },
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'divergence.scrub') {
      const targetTick = Number(payload.targetTick ?? 0);
      const res = this.divergenceManager.scrubTimeline(targetTick);

      const event = ctx.emitEvent({
        type: `${this.worldId}.divergence_scrubbed`,
        severity: res.success ? 'info' : 'warning',
        title: `Divergence Scrubbed to Tick ${targetTick}`,
        description: res.success
          ? `Successfully scrubbed comparison timeline to tick ${targetTick}.`
          : `Failed timeline scrub: ${res.error}`,
        sourceSystem: 'divergence-theater',
        payload: { targetTick, success: res.success },
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: res.success ? 'success' : 'rejected',
        rejectionReason: res.error,
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Handle P001 Native Action Execution
    const nativeDef = this.actionRegistry.getAction(action.capabilityId);
    if (nativeDef) {
      const res = this.actionRegistry.execute(action.capabilityId, state, ctx.tick, this.budgetLedger);
      if (!res.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: res.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.action_executed`,
        severity: 'info',
        title: `${nativeDef.name} Executed`,
        description: `Executed ${nativeDef.name} on ${this.worldId} at tick ${ctx.tick}. Decision: ${nativeDef.decisionImplication}`,
        sourceSystem: 'native-actions',
        payload: action.payload,
        deltas: res.deltas.map((ed) => ({
          metricOrField: ed.field,
          before: ed.before,
          after: ed.after,
          unit: ed.unit,
        })),
        causalLinkType: 'direct',
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [...res.debits],
        deltas: res.deltas.map((d) => ({
          field: d.field,
          before: d.before,
          after: d.after,
          unit: d.unit,
        })),
        eventsEmitted: [event.id],
      };
    }

    // Standard priced action execution
    const debits = this.config.actionCosts?.[action.capabilityId] ?? [];
    const tx = this.budgetLedger.applyTransaction(action.capabilityId, debits, [], ctx.tick);

    if (tx.status === 'rejected') {
      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'rejected',
        rejectionReason: tx.rejectionReason,
        debits: [],
        deltas: [],
        eventsEmitted: [],
      };
    }

    // Apply native deltas to state
    const plannedDeltas = this.config.actionDeltas?.[action.capabilityId] ?? [];
    const executedDeltas: Array<{
      field: string;
      before: number | string;
      after: number | string;
      unit?: string;
    }> = [];

    for (const d of plannedDeltas) {
      const before = typeof state[d.field] === 'number' ? (state[d.field] as number) : 0;
      const after = Math.max(0, Math.round((before + d.delta) * 100) / 100);
      state[d.field] = after;
      executedDeltas.push({ field: d.field, before, after, unit: d.unit });
    }

    const event = ctx.emitEvent({
      type: `${this.worldId}.action_executed`,
      severity: 'info',
      title: `${action.capabilityId} Executed`,
      description: `Executed ${action.capabilityId} on ${this.worldId} at tick ${ctx.tick}.`,
      sourceSystem: 'feature-module',
      payload: action.payload,
      deltas: executedDeltas.map((ed) => ({
        metricOrField: ed.field,
        before: ed.before as number,
        after: ed.after as number,
        unit: ed.unit,
      })),
      causalLinkType: 'direct',
      causalExplanation: `Applied priced intervention ${action.capabilityId}`,
    });

    return {
      actionId: `${action.capabilityId}-${ctx.tick}`,
      worldId: this.worldId,
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: [...tx.debitsApplied],
      deltas: executedDeltas,
      eventsEmitted: [event.id],
    };
  }

  stepOwnedSystems(ctx: { tick: number; state: Record<string, unknown> }): void {
    // Step logistics network
    this.logisticsNetwork.stepNetwork(ctx.tick);

    // Step facilities and apply metric benefits to world state
    this.facilityManager.stepFacilities(ctx.tick, {
      budgetLedger: this.budgetLedger,
      logisticsNetwork: this.logisticsNetwork,
      applyBenefit: (metric, delta) => {
        if (typeof ctx.state[metric] === 'number') {
          ctx.state[metric] = Math.max(
            0,
            Math.round(((ctx.state[metric] as number) + delta) * 100) / 100,
          );
        }
      },
    });

    // Step emergencies
    const numericMetrics: Record<string, number> = {};
    for (const [k, v] of Object.entries(ctx.state)) {
      if (typeof v === 'number') {
        numericMetrics[k] = v;
      }
    }
    this.emergencyManager.stepEmergencies(ctx.tick, numericMetrics, {
      applyMetricDelta: (metric, delta) => {
        if (typeof ctx.state[metric] === 'number') {
          ctx.state[metric] = Math.max(
            0,
            Math.round(((ctx.state[metric] as number) + delta) * 100) / 100,
          );
        }
      },
      budgetLedger: this.budgetLedger,
      hazardGraph: this.hazardGraph,
    });

    // Step historical era transitions
    this.eraManager.evaluateTransition(ctx.tick, numericMetrics);
  }

  projectVisibleState(
    state: Readonly<Record<string, unknown>>,
    _viewer: unknown,
  ) {
    const metrics: Record<string, number | string> = {};
    const numericMetrics: Record<string, number> = {};
    for (const k of this.config.metricKeys) {
      if (k in state && typeof state[k] === 'number') {
        metrics[k] = state[k] as number;
        numericMetrics[k] = state[k] as number;
      }
    }
    const hazards = this.evaluateHazards(numericMetrics, 0);
    const budgetBalances = this.budgetLedger.getAllBalances();
    const emergencies = this.emergencyManager.getAllStates();
    const visualRestoration = this.visualRestorationManager.evaluate(numericMetrics);
    const activePolicies = this.policyManager.getAllPolicies();
    const instruments = this.instrumentManager.getAllInstruments().map((inst) => ({
      id: inst.id,
      worldId: inst.worldId,
      name: inst.name,
      description: inst.description,
      deviceClass: inst.deviceClass,
      channels: Array.from(inst.channels.values()),
      sampleCost: [...inst.sampleCost],
      calibrationCost: [...inst.calibrationCost],
      maxRangeMeters: inst.maxRangeMeters,
    }));
    const recentObservations = this.instrumentManager.getRecentObservations();
    const actionFamilies = this.actionRegistry.getAllActions();
    const crewMembers = this.crewManager.getCrewSummaries();
    const navigationScale = this.continuumNavigator.getCurrentScale();
    const destinationMissions = this.destinationManager.getAllMissionStates();
    const currentEra = this.eraManager.getCurrentEra();
    const memorializedActors = this.actorMemoryManager.getAllActors();
    const monuments = this.actorMemoryManager.getAllMonuments();
    const hypotheses = this.hypothesisManager.getAllHypotheses();
    const activeInvestigations = this.hypothesisManager.getTrialHistory();
    const branchDiff = this.divergenceManager.getActiveSnapshot();

    return createBaseVisibleState(
      this.worldId,
      1,
      this.capabilities.map((c) => c.id),
      metrics,
      [],
      hazards,
      budgetBalances,
      emergencies,
      visualRestoration,
      activePolicies,
      instruments,
      recentObservations,
      actionFamilies,
      crewMembers,
      navigationScale,
      destinationMissions,
      currentEra,
      memorializedActors,
      monuments,
      hypotheses,
      activeInvestigations,
      branchDiff,
    );
  }
}
