import type { CausalEvent } from '../core/contracts';
import { DISCOVERY_ORDER, type ExplorationAtlas, type ExplorationState } from './contracts';

/** Read-only records. Rejected actions, unobserved history and screen-only motion are not effects. */
export interface SiteChange {
  field: string;
  before: string | number;
  after: string | number;
}
export interface SiteChronicleEntry {
  id: string;
  tick: number;
  branchId: string;
  kind: 'ACTION' | 'SIMULATION';
  title: string;
  detail: string;
  changes: SiteChange[];
  causalEventId: string | null;
  causedByEventId: string | null;
}
const STAGE_VISITED = DISCOVERY_ORDER.indexOf('VISITED');
const STAGE_SURVEYED = DISCOVERY_ORDER.indexOf('SURVEYED');

function snapshot(raw: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
function scalarChanges(before: string, after: string): SiteChange[] {
  const a = snapshot(before), b = snapshot(after);
  if (!a || !b) return before === after ? [] : [{ field: 'discovery state', before, after }];
  const changes: SiteChange[] = [];
  const append = (field: string, oldValue: unknown, newValue: unknown) => {
    if ((typeof oldValue === 'string' || typeof oldValue === 'number') &&
        (typeof newValue === 'string' || typeof newValue === 'number') &&
        oldValue !== newValue) changes.push({ field, before: oldValue, after: newValue });
  };
  for (const field of ['stage', 'condition', 'hazard', 'evidenceCount', 'contacts', 'fuel', 'supplies', 'blockedRoutes', 'inTransit'])
    append(field, a[field], b[field]);
  for (const collection of ['resources', 'cargo']) {
    const oldValues = a[collection], newValues = b[collection];
    if (!oldValues || !newValues || typeof oldValues !== 'object' || typeof newValues !== 'object' ||
        Array.isArray(oldValues) || Array.isArray(newValues)) continue;
    const oldRecord = oldValues as Record<string, unknown>, newRecord = newValues as Record<string, unknown>;
    for (const field of Object.keys({ ...oldRecord, ...newRecord }).sort())
      append(collection + '.' + field, oldRecord[field] ?? 0, newRecord[field] ?? 0);
  }
  return changes;
}

/** The original action journal is the authority for exploration command summaries.
 * The causal journal adds simulation events, excluding duplicate exploration action echoes.
 * A site must actually be visited before any of its historical record is projected.
 */
export function siteChronicle(
  atlas: ExplorationAtlas, state: ExplorationState, siteId: string,
  events: readonly CausalEvent[], activeRunId: string, limit = 12,
): SiteChronicleEntry[] {
  if (!atlas.sites.some(site => site.facts.id === siteId)) throw new Error('Unknown site');
  const site = state.sites[siteId];
  if (!site || DISCOVERY_ORDER.indexOf(site.discoveryState) < STAGE_VISITED) return [];
  const actions: SiteChronicleEntry[] = state.journal.filter(event => event.siteId === siteId).map(event => ({
    id: event.id, tick: event.tick, branchId: event.branchId, kind: 'ACTION',
    title: event.action, detail: 'Validated expedition action and its recorded state transition.',
    changes: scalarChanges(event.before, event.after),
    causalEventId: null, causedByEventId: null,
  }));
  const physical: SiteChronicleEntry[] = events.filter(event =>
    event.runId === activeRunId && event.sourceEntityId === siteId &&
    !event.type.startsWith('exploration.') && !event.type.startsWith('command:') &&
    event.type !== 'command_rejected'
  ).map(event => ({
    id: event.id, tick: event.tick, branchId: event.runId, kind: 'SIMULATION',
    title: event.title, detail: event.description,
    changes: event.deltas.map(delta => ({
      field: delta.metricOrField, before: delta.before, after: delta.after,
    })),
    causalEventId: event.id, causedByEventId: event.causedByEventId,
  }));
  return [...actions, ...physical].sort((a, b) => b.tick - a.tick ||
    a.id.localeCompare(b.id, 'en')).slice(0, Math.max(0, Math.min(24, limit)));
}

export interface SiteParallelComparison {
  targetStage: string;
  targetVisible: boolean;
  currentCondition: number;
  targetCondition: number | null;
  conditionDifference: number | null;
  currentHazard: number;
  targetHazard: number | null;
  hazardDifference: number | null;
  currentEvidence: number;
  targetEvidence: number | null;
  resourceChanges: SiteChange[];
}

/** Compare corresponding sites only when world, genesis seed and immutable site identity match.
 * This is a difference report, not a claim that any one intervention caused a change.
 */
export function compareSiteRealities(
  currentAtlas: ExplorationAtlas, current: ExplorationState, currentSeed: number,
  otherAtlas: ExplorationAtlas, other: ExplorationState, otherSeed: number,
  siteId: string,
): SiteParallelComparison | null {
  const first = currentAtlas.sites.find(site => site.facts.id === siteId);
  const second = otherAtlas.sites.find(site => site.facts.id === siteId);
  const a = current.sites[siteId], b = other.sites[siteId];
  if (!first || !second || !a || !b || currentSeed !== otherSeed ||
      currentAtlas.worldId !== otherAtlas.worldId ||
      first.facts.archetypeId !== second.facts.archetypeId ||
      first.facts.seed !== second.facts.seed ||
      JSON.stringify(first.facts.coordinates) !== JSON.stringify(second.facts.coordinates) ||
      DISCOVERY_ORDER.indexOf(a.discoveryState) < STAGE_VISITED) return null;
  const targetRank = DISCOVERY_ORDER.indexOf(b.discoveryState);
  const surveyed = targetRank >= STAGE_SURVEYED;
  const visited = targetRank >= STAGE_VISITED;
  const changes: SiteChange[] = [];
  if (visited) for (const field of Object.keys(a.resources).sort()) {
    const from = a.resources[field] ?? 0, to = b.resources[field] ?? 0;
    if (from !== to) changes.push({ field, before: from, after: to });
  }
  return {
    targetStage: surveyed ? b.discoveryState : 'UNSURVEYED',
    targetVisible: surveyed,
    currentCondition: a.condition, targetCondition: surveyed ? b.condition : null,
    conditionDifference: surveyed ? b.condition - a.condition : null,
    currentHazard: a.hazard, targetHazard: surveyed ? b.hazard : null,
    hazardDifference: surveyed ? b.hazard - a.hazard : null,
    currentEvidence: a.evidence.length, targetEvidence: visited ? b.evidence.length : null,
    resourceChanges: changes,
  };
}
