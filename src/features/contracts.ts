import {
  CommandExecutionContext,
  SystemExecutionContext,
} from '../core/contracts';

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
}

export interface WorldFeatureModule<
  TState = Record<string, unknown>,
  TConfig = Record<string, unknown>,
> {
  readonly worldId: string;
  readonly rulesVersion: number;
  readonly capabilities: readonly FeatureCapability[];

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

  projectVisibleState(
    state: Readonly<TState>,
    viewer: DisclosureContext,
  ): VisibleFeatureState;
}
