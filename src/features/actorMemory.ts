/**
 * Civilizations That Remember People (P015)
 *
 * Implements historical memory of individual actors, civic monuments, and community
 * memorialization derived directly from simulation history and player interventions.
 */

export type MemorySentiment = 'heroic' | 'tragic' | 'revered' | 'controversial';

export interface ActorMemoryRecord {
  readonly id: string;
  readonly worldId: string;
  readonly name: string;
  readonly role: string;
  readonly eraNumber: 1 | 2 | 3;
  readonly achievement: string;
  readonly sacrificeOrCost: string;
  readonly recordedTick: number;
  readonly sentiment: MemorySentiment;
  readonly legacyEffect?: {
    readonly metric: string;
    readonly bonus: number;
    readonly description: string;
  };
}

export interface MonumentRecord {
  readonly id: string;
  readonly worldId: string;
  readonly siteId: string;
  readonly title: string;
  readonly inscription: string;
  readonly erectedTick: number;
  readonly dedicatedToActorId?: string;
}

export interface CivicChronicleEntry {
  readonly id: string;
  readonly tick: number;
  readonly title: string;
  readonly summary: string;
  readonly relatedActorId?: string;
}

export interface SerializedActorMemoryManager {
  readonly worldId: string;
  readonly actors: readonly ActorMemoryRecord[];
  readonly monuments: readonly MonumentRecord[];
  readonly chronicles: readonly CivicChronicleEntry[];
}

export class ActorMemoryManager {
  readonly worldId: string;
  private readonly actors: Map<string, ActorMemoryRecord> = new Map();
  private readonly monuments: Map<string, MonumentRecord> = new Map();
  private readonly chronicles: CivicChronicleEntry[] = [];

  constructor(
    worldId: string,
    initialActors?: readonly ActorMemoryRecord[],
    initialMonuments?: readonly MonumentRecord[],
  ) {
    this.worldId = worldId;
    if (initialActors) {
      for (const actor of initialActors) {
        this.registerActor(actor);
      }
    }
    if (initialMonuments) {
      for (const monument of initialMonuments) {
        this.erectMonument(monument);
      }
    }
  }

  registerActor(record: ActorMemoryRecord): void {
    this.actors.set(record.id, record);
    this.recordChronicle(
      record.recordedTick,
      `Memory Inscribed: ${record.name}`,
      `${record.name} (${record.role}) recorded in world lore: ${record.achievement}`,
      record.id,
    );
  }

  getActor(id: string): ActorMemoryRecord | undefined {
    return this.actors.get(id);
  }

  getAllActors(): readonly ActorMemoryRecord[] {
    return Array.from(this.actors.values());
  }

  erectMonument(monument: MonumentRecord): void {
    this.monuments.set(monument.id, monument);
    this.recordChronicle(
      monument.erectedTick,
      `Monument Erected: ${monument.title}`,
      `Erected at site ${monument.siteId}: "${monument.inscription}"`,
      monument.dedicatedToActorId,
    );
  }

  getAllMonuments(): readonly MonumentRecord[] {
    return Array.from(this.monuments.values());
  }

  recordChronicle(
    tick: number,
    title: string,
    summary: string,
    relatedActorId?: string,
  ): void {
    this.chronicles.push({
      id: `chronicle-${this.worldId}-${this.chronicles.length + 1}-${tick}`,
      tick,
      title,
      summary,
      relatedActorId,
    });
  }

  getAllChronicles(): readonly CivicChronicleEntry[] {
    return [...this.chronicles];
  }

  /**
   * Computes cumulative metric bonuses granted by historical memories.
   */
  getLegacyModifiers(): Record<string, number> {
    const modifiers: Record<string, number> = {};
    for (const actor of this.actors.values()) {
      if (actor.legacyEffect) {
        const { metric, bonus } = actor.legacyEffect;
        modifiers[metric] = (modifiers[metric] ?? 0) + bonus;
      }
    }
    return modifiers;
  }

  serialize(): SerializedActorMemoryManager {
    return {
      worldId: this.worldId,
      actors: Array.from(this.actors.values()),
      monuments: Array.from(this.monuments.values()),
      chronicles: [...this.chronicles],
    };
  }

  deserialize(data: SerializedActorMemoryManager): void {
    this.actors.clear();
    for (const actor of data.actors) {
      this.actors.set(actor.id, actor);
    }
    this.monuments.clear();
    for (const monument of data.monuments) {
      this.monuments.set(monument.id, monument);
    }
    this.chronicles.length = 0;
    this.chronicles.push(...data.chronicles);
  }
}
