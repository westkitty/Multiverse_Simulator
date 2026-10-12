import type { CausalEvent } from '../core/contracts';
import { DISCOVERY_ORDER, ExplorationAtlas, ExplorationState } from './contracts';

/** Derived, branch-local hints from current state and actual recorded site events.
 * Unknown places never expose names, history, event titles or site-specific telemetry.
 */
export function curiosityLeads(
  atlas: ExplorationAtlas, state: ExplorationState, tick: number,
  events: readonly CausalEvent[] = [], activeRunId?: string,
) {
  // One bounded scan of the causal journal per frame, not a full scan per POI.
  const newest = new Map<string, CausalEvent>();
  for (const event of events) {
    if (!event.sourceEntityId || (activeRunId !== undefined && event.runId !== activeRunId) ||
        event.tick > tick || tick - event.tick > 48 ||
        event.type.startsWith('exploration.') || event.type.startsWith('command:') ||
        event.type === 'command_rejected') continue;
    const prior = newest.get(event.sourceEntityId);
    if (!prior || event.tick > prior.tick || (event.tick === prior.tick && event.id > prior.id))
      newest.set(event.sourceEntityId, event);
  }
  const lastAction = new Map<string, number>();
  for (const action of state.journal)
    lastAction.set(action.siteId, Math.max(lastAction.get(action.siteId) ?? 0, action.tick));
  return atlas.sites.flatMap(site => {
    const delta = state.sites[site.facts.id];
    if (DISCOVERY_ORDER.indexOf(delta.discoveryState) < 2 || delta.discoveryState === 'RESOLVED') return [];
    // Environmental event titles can contain site identity/history. A surveyed
    // contact may generate generic state leads but not full event descriptions
    // until the expedition has actually visited the site.
    const event = DISCOVERY_ORDER.indexOf(delta.discoveryState) >=
      DISCOVERY_ORDER.indexOf('VISITED') ? newest.get(site.facts.id) : undefined;
    const lastObservation = Math.max(0, delta.firstVisitedTick ?? 0,
      ...delta.evidence.map(e => e.tick),
      lastAction.get(site.facts.id) ?? 0, event?.tick ?? 0);
    const expiresAt = lastObservation + 48;
    if (tick > expiresAt) return [];
    const stateReason = delta.condition < 45 ? 'degraded infrastructure'
      : delta.hazard > 55 ? 'elevated local hazard'
      : delta.evidence.length ? 'unfinished evidence chain' : null;
    if (!event && !stateReason) return [];
    const reason = event ? 'recorded event: ' + event.title : stateReason!;
    return [{
      siteId: site.facts.id, reason, expiresAt,
      hypothesis: event
        ? 'A simulation event was recorded at tick ' + event.tick + '. Compare this event with field measurements; its deeper cause is not established.'
        : 'Check whether the measured environment and ' + reason + ' share a cause; correlation alone is not proof.',
      evidence: delta.evidence.map(e => ({
        id: e.evidenceId, value: e.value, unit: e.unit, tick: e.tick,
        classification: e.classification,
      })),
      confidence: event ? 'recorded simulation event'
        : delta.evidence.length ? 'measurement available' : 'survey signal only',
      eventId: event?.id ?? null, observedTick: event?.tick ?? null,
      priority: 100 - delta.condition + delta.hazard + (event ? 30 : 0),
    }];
  }).sort((a, b) => b.priority - a.priority || a.siteId.localeCompare(b.siteId, 'en')).slice(0, 6);
}
