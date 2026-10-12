import type { CausalEvent } from '../core/contracts';
import { DISCOVERY_ORDER, ExplorationAtlas, ExplorationState } from './contracts';

/** Derived, branch-local hints from current state and actual recorded site events.
 * Unknown places never expose names, history, event titles or site-specific telemetry.
 */
export function curiosityLeads(
  atlas: ExplorationAtlas, state: ExplorationState, tick: number,
  events: readonly CausalEvent[] = [], activeRunId?: string,
) {
  return atlas.sites.flatMap(site => {
    const delta = state.sites[site.facts.id];
    if (DISCOVERY_ORDER.indexOf(delta.discoveryState) < 2 || delta.discoveryState === 'RESOLVED') return [];
    const event = events.filter(e => e.sourceEntityId === site.facts.id &&
      (activeRunId === undefined || e.runId === activeRunId) &&
      e.tick <= tick && tick - e.tick <= 48 &&
      !e.type.startsWith('exploration.') && !e.type.startsWith('command:') &&
      e.type !== 'command_rejected'
    ).sort((a, b) => b.tick - a.tick || b.id.localeCompare(a.id, 'en'))[0];
    const lastObservation = Math.max(0, delta.firstVisitedTick ?? 0,
      ...delta.evidence.map(e => e.tick),
      ...state.journal.filter(e => e.siteId === site.facts.id).map(e => e.tick),
      event?.tick ?? 0);
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
