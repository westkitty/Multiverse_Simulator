import {
  CommandExecutionContext,
  SystemExecutionContext,
} from '../core/contracts';
import type {
  HazardDependencyGraph,
  HazardEvaluationResult,
} from './hazardGraph';
import type {
  CostPreview,
  ScientificBudgetLedger,
} from './budgetLedger';
import type { LogisticsNetwork } from './logisticsWeb';
import type { FacilityManager } from './facilitySystem';
import type { EmergencyManager, EmergencyState } from './emergencySystem';
import type { VisualRestorationManager, VisualRestorationSnapshot } from './visualRestoration';
import type { PolicyDefinition, PolicyManager } from './policyTrial';
import type { ScientificInstrumentManager, SampleObservation, ScientificInstrumentConfig } from './scientificInstruments';
import type { NativeActionRegistry, NativeActionFamilyDefinition } from './nativeActions';
import type { AtlasContinuumNavigator, ViewScale } from './atlasContinuum';
import type { CrewManager, CrewMemberSummary } from './crewSpecializations';
import type { SignatureDestinationManager, DestinationMissionState } from './signatureDestinations';
import type { HistoricalEraManager, HistoricalEraDefinition } from './historicalEras';
import type { ActorMemoryManager, ActorMemoryRecord, MonumentRecord } from './actorMemory';
import type { HypothesisInvestigationManager, CausalHypothesisDefinition, HypothesisTrialExecution } from './hypothesisInvestigations';
import type { DivergenceTheaterManager, BranchDiffSnapshot } from './divergenceTheater';

export * from './hazardGraph';
export * from './budgetLedger';
export * from './logisticsWeb';
export * from './facilitySystem';
export * from './emergencySystem';
export * from './visualRestoration';
export * from './policyTrial';
export * from './scientificInstruments';
export * from './nativeActions';
export * from './atlasContinuum';
export * from './crewSpecializations';
export * from './signatureDestinations';
export * from './historicalEras';
export * from './actorMemory';
export * from './hypothesisInvestigations';
export * from './divergenceTheater';

export const ALL_FEATURE_IDS = [
  'P001',
  'P002',
  'P003',
  'P004',
  'P005',
  'P006',
  'P007',
  'P008',
  'P009',
  'P010',
  'P011',
  'P012',
  'P013',
  'P014',
  'P015',
  'P016',
  'P017',
  'P018',
  'P019',
  'P020',
] as const;

export type FeatureId = (typeof ALL_FEATURE_IDS)[number];

export function isFeatureId(id: string): id is FeatureId {
  return (ALL_FEATURE_IDS as readonly string[]).includes(id);
}

export type WorldRulesVersion = number;

export interface FeatureCapability {
  id: string;
  featureId: FeatureId;
  name: string;
  description: string;
  minRulesVersion: number;
  domainUnits?: readonly string[];
  costResource?: string;
  deterministicSystemOrder?: number;
}

export interface ValidatedAction<TPayload = Record<string, unknown>> {
  actionFamily: string;
  worldId: string;
  capabilityId: string;
  payload: TPayload;
  cost?: { resource: string; amount: number };
  targetEntityId?: string;
  targetSiteId?: string;
}

export interface ActionValidationResult<TPayload = Record<string, unknown>> {
  valid: boolean;
  action?: ValidatedAction<TPayload>;
  error?: string;
}

export interface ActionExecutionReceipt {
  actionId: string;
  worldId: string;
  tick: number;
  executedAtTick: number;
  status: 'success' | 'rejected';
  rejectionReason?: string;
  debits?: Array<{ resource: string; amount: number }>;
  deltas?: Array<{
    field: string;
    before: number | string;
    after: number | string;
    unit?: string;
  }>;
  eventsEmitted: string[];
}

export type DisclosureLevel = 'UNKNOWN' | 'DETECTED' | 'SURVEYED' | 'VISITED';

export interface DisclosureContext {
  worldId: string;
  siteDisclosures: Record<string, DisclosureLevel>;
  hasScientificObservatory?: boolean;
}

export interface VisibleEntitySummary {
  id: string;
  label: string;
  status: string;
  readings: Record<string, number>;
  disclosed: boolean;
}

export interface VisibleFeatureState {
  worldId: string;
  rulesVersion: number;
  activeCapabilities: string[];
  metrics: Record<string, number | string>;
  disclosedEntities: VisibleEntitySummary[];
  hazards?: HazardEvaluationResult;
  budgetBalances?: Record<string, number>;
  emergencies?: EmergencyState[];
  visualRestoration?: VisualRestorationSnapshot;
  activePolicies?: PolicyDefinition[];
  instruments?: readonly ScientificInstrumentConfig[];
  recentObservations?: readonly SampleObservation[];
  actionFamilies?: readonly NativeActionFamilyDefinition[];
  crewMembers?: readonly CrewMemberSummary[];
  navigationScale?: ViewScale;
  destinationMissions?: readonly DestinationMissionState[];
  currentEra?: HistoricalEraDefinition;
  memorializedActors?: readonly ActorMemoryRecord[];
  monuments?: readonly MonumentRecord[];
  hypotheses?: readonly CausalHypothesisDefinition[];
  activeInvestigations?: readonly HypothesisTrialExecution[];
  branchDiff?: BranchDiffSnapshot;
}

export interface WorldFeatureModule<
  TState = Record<string, unknown>,
  TConfig = Record<string, unknown>,
> {
  readonly worldId: string;
  readonly rulesVersion: number;
  readonly capabilities: readonly FeatureCapability[];
  readonly hazardGraph?: HazardDependencyGraph;
  readonly budgetLedger?: ScientificBudgetLedger;
  readonly logisticsNetwork?: LogisticsNetwork;
  readonly facilityManager?: FacilityManager;
  readonly emergencyManager?: EmergencyManager;
  readonly visualRestorationManager?: VisualRestorationManager;
  readonly policyManager?: PolicyManager;
  readonly instrumentManager?: ScientificInstrumentManager;
  readonly actionRegistry?: NativeActionRegistry;
  readonly continuumNavigator?: AtlasContinuumNavigator;
  readonly crewManager?: CrewManager;
  readonly destinationManager?: SignatureDestinationManager;
  readonly eraManager?: HistoricalEraManager;
  readonly actorMemoryManager?: ActorMemoryManager;
  readonly hypothesisManager?: HypothesisInvestigationManager;
  readonly divergenceManager?: DivergenceTheaterManager;

  validateAction(
    raw: unknown,
    state: Readonly<TState>,
    config?: TConfig,
  ): ActionValidationResult;

  applyAction(
    state: TState,
    action: ValidatedAction,
    ctx: CommandExecutionContext<TConfig>,
  ): ActionExecutionReceipt;

  stepOwnedSystems?(ctx: SystemExecutionContext<TState, TConfig>): void;

  evaluateHazards?(
    metrics: Record<string, number>,
    tick: number,
  ): HazardEvaluationResult;

  previewCost?(
    capabilityId: string,
    payload?: Record<string, unknown>,
  ): CostPreview;

  projectVisibleState(
    state: Readonly<TState>,
    viewer: DisclosureContext,
  ): VisibleFeatureState;
}
