import {
  CausalChainInspection,
  CausalEvent,
  EmitEventInput,
  EntityId,
  EventId,
  RunId,
  SCHEMA_VERSION,
  Tick,
} from './contracts';

export interface EventFilterOptions {
  type?: string;
  severity?: CausalEvent['severity'];
  entityId?: EntityId;
  sourceSystem?: string;
  causalLinkType?: CausalEvent['causalLinkType'];
  minTick?: Tick;
  maxTick?: Tick;
  searchQuery?: string;
}

export class CausalEventJournal {
  private events: CausalEvent[] = [];
  private byId: Map<EventId, CausalEvent> = new Map();
  private sequenceCounter = 1;
  private maxEvents: number;

  constructor(maxEvents = 1500) {
    this.maxEvents = Math.max(50, maxEvents);
  }

  setMaxEvents(maxEvents: number): void {
    this.maxEvents = Math.max(50, maxEvents);
    this.enforceBound();
  }

  append(runId: RunId, tick: Tick, input: EmitEventInput): CausalEvent {
    const seq = this.sequenceCounter++;
    const id: EventId = `evt-t${tick}-${seq}`;
    const correlationId =
      input.correlationId ??
      (input.causedByEventId ? this.byId.get(input.causedByEventId)?.correlationId : undefined) ??
      `corr-t${tick}-${seq}`;

    const linkType = input.causalLinkType ?? (input.causedByEventId ? 'direct' : 'unknown');
    const defaultExplanation =
      input.causalExplanation ??
      (linkType === 'direct'
        ? 'Directly triggered by recorded upstream simulation event or user command.'
        : linkType === 'dependency'
          ? 'Propagated through a documented subsystem dependency constraint.'
          : linkType === 'inferred'
            ? 'Inferred temporal correlation within the same subsystem window; not a proven direct trigger.'
            : 'Autonomous state transition or unrecorded root condition.');

    const event: CausalEvent = {
      id,
      runId,
      tick,
      type: input.type,
      severity: input.severity,
      title: input.title,
      description: input.description,
      sourceSystem: input.sourceSystem,
      sourceEntityId: input.sourceEntityId ?? null,
      affectedEntityIds: input.affectedEntityIds ? [...input.affectedEntityIds] : [],
      payload: input.payload ? { ...input.payload } : {},
      deltas: input.deltas ? [...input.deltas] : [],
      causedByEventId: input.causedByEventId ?? null,
      causalLinkType: linkType,
      causalExplanation: defaultExplanation,
      correlationId,
      schemaVersion: SCHEMA_VERSION,
    };

    this.events.push(event);
    this.byId.set(event.id, event);
    this.enforceBound();
    return event;
  }

  private enforceBound(): void {
    while (this.events.length > this.maxEvents) {
      const removed = this.events.shift();
      if (removed) {
        this.byId.delete(removed.id);
      }
    }
  }

  getAll(): CausalEvent[] {
    return [...this.events];
  }

  getById(id: EventId): CausalEvent | undefined {
    return this.byId.get(id);
  }

  count(): number {
    return this.events.length;
  }

  findRecentByType(type: string, currentTick: Tick, maxTickAge = 15): CausalEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];
      if (currentTick - ev.tick > maxTickAge) {
        break;
      }
      if (ev.type === type) {
        return ev;
      }
    }
    return undefined;
  }

  filter(options: EventFilterOptions): CausalEvent[] {
    const query = options.searchQuery?.trim().toLowerCase();
    return this.events.filter((ev) => {
      if (options.type && ev.type !== options.type) return false;
      if (options.severity && ev.severity !== options.severity) return false;
      if (options.sourceSystem && ev.sourceSystem !== options.sourceSystem) return false;
      if (options.causalLinkType && ev.causalLinkType !== options.causalLinkType) return false;
      if (options.minTick !== undefined && ev.tick < options.minTick) return false;
      if (options.maxTick !== undefined && ev.tick > options.maxTick) return false;
      if (options.entityId) {
        const linked =
          ev.sourceEntityId === options.entityId ||
          ev.affectedEntityIds.includes(options.entityId);
        if (!linked) return false;
      }
      if (query) {
        const hay = `${ev.title} ${ev.description} ${ev.type} ${ev.sourceSystem} ${ev.causalExplanation}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }

  getEntityHistory(entityId: EntityId): CausalEvent[] {
    return this.filter({ entityId });
  }

  /**
   * Builds a complete structured causal explanation for any event in the journal:
   * - WHAT HAPPENED?
   * - WHAT CHANGED?
   * - WHAT CAUSED IT? (upstream chain + explicit link classification)
   * - WHAT WAS AFFECTED?
   * - WHAT HAPPENED NEXT? (downstream consequences)
   */
  inspectCausalChain(eventId: EventId): CausalChainInspection | null {
    const event = this.byId.get(eventId);
    if (!event) return null;

    const upstreamChain: CausalEvent[] = [];
    const visitedUpstream = new Set<EventId>();
    let cursorId = event.causedByEventId;
    while (cursorId && !visitedUpstream.has(cursorId)) {
      visitedUpstream.add(cursorId);
      const parent = this.byId.get(cursorId);
      if (!parent) break;
      upstreamChain.unshift(parent);
      cursorId = parent.causedByEventId;
    }

    const downstream: CausalEvent[] = [];
    const downstreamQueue: EventId[] = [event.id];
    const visitedDownstream = new Set<EventId>([event.id]);

    while (downstreamQueue.length > 0 && downstream.length < 25) {
      const currentId = downstreamQueue.shift()!;
      for (const candidate of this.events) {
        if (
          candidate.causedByEventId === currentId &&
          !visitedDownstream.has(candidate.id)
        ) {
          visitedDownstream.add(candidate.id);
          downstream.push(candidate);
          downstreamQueue.push(candidate.id);
        }
      }
    }

    const affectedSet = new Set<EntityId>();
    if (event.sourceEntityId) affectedSet.add(event.sourceEntityId);
    for (const id of event.affectedEntityIds) {
      affectedSet.add(id);
    }
    const affectedList = Array.from(affectedSet);

    return {
      event,
      whatHappened: `[Tick ${event.tick}] ${event.title} — ${event.description}`,
      whatChanged: event.deltas,
      whatCausedIt: {
        linkType: event.causalLinkType,
        explanation: event.causalExplanation,
        upstreamChain,
      },
      whatWasAffected: {
        entityIds: affectedList,
        description:
          affectedList.length > 0
            ? `Involved ${affectedList.length} simulation entity/subsystem target(s): ${affectedList.join(', ')}.`
            : `System-wide event in ${event.sourceSystem}.`,
      },
      whatHappenedNext: downstream,
    };
  }

  serialize(): { sequenceCounter: number; events: CausalEvent[] } {
    return {
      sequenceCounter: this.sequenceCounter,
      events: JSON.parse(JSON.stringify(this.events)) as CausalEvent[],
    };
  }

  restore(data: { sequenceCounter: number; events: CausalEvent[] }): void {
    this.sequenceCounter = data.sequenceCounter || 1;
    this.events = (data.events || []).map((e) => ({ ...e }));
    this.byId.clear();
    for (const ev of this.events) {
      this.byId.set(ev.id, ev);
    }
    this.enforceBound();
  }

  cloneUpToTick(maxTick: Tick, newRunId?: RunId): CausalEventJournal {
    const copy = new CausalEventJournal(this.maxEvents);
    const filtered = this.events
      .filter((ev) => ev.tick <= maxTick)
      .map((ev) => ({
        ...JSON.parse(JSON.stringify(ev)),
        runId: newRunId ?? ev.runId,
      })) as CausalEvent[];
    copy.restore({
      sequenceCounter: this.sequenceCounter,
      events: filtered,
    });
    return copy;
  }
}
