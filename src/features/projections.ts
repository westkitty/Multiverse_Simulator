import {
  DisclosureContext,
  DisclosureLevel,
  HazardEvaluationResult,
  VisibleEntitySummary,
  VisibleFeatureState,
} from './contracts';

/**
 * Validates whether an entity associated with a given site should be disclosed
 * under the current player exploration / scientific discovery state.
 */
export function isSiteDisclosed(
  siteId: string,
  context: DisclosureContext,
  minLevel: DisclosureLevel = 'DETECTED',
): boolean {
  const current = context.siteDisclosures[siteId] ?? 'UNKNOWN';
  const ranks: Record<DisclosureLevel, number> = {
    UNKNOWN: 0,
    DETECTED: 1,
    SURVEYED: 2,
    VISITED: 3,
  };
  return ranks[current] >= ranks[minLevel];
}

/**
 * Filters and projects raw entity telemetry according to disclosure boundaries.
 * Projections are strictly read-only and never write back to simulation state.
 */
export function projectDisclosedEntities(
  entities: Array<{
    id: string;
    siteId?: string;
    label: string;
    status: string;
    readings?: Record<string, number>;
  }>,
  context: DisclosureContext,
): VisibleEntitySummary[] {
  return entities.map((ent) => {
    const disclosed = ent.siteId
      ? isSiteDisclosed(ent.siteId, context, 'SURVEYED')
      : true;

    return {
      id: ent.id,
      label: disclosed ? ent.label : `Unidentified Signal (${ent.id})`,
      status: disclosed ? ent.status : 'unknown',
      readings: disclosed ? (ent.readings ?? {}) : {},
      disclosed,
    };
  });
}

/**
 * Builds a canonical base projection for a feature module.
 */
export function createBaseVisibleState(
  worldId: string,
  rulesVersion: number,
  activeCapabilities: string[],
  metrics: Record<string, number | string> = {},
  disclosedEntities: VisibleEntitySummary[] = [],
  hazards?: HazardEvaluationResult,
  budgetBalances?: Record<string, number>,
): VisibleFeatureState {
  return {
    worldId,
    rulesVersion,
    activeCapabilities,
    metrics,
    disclosedEntities,
    hazards,
    budgetBalances,
  };
}
