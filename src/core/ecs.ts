import { EntityId } from './contracts';

export interface SerializedECSState {
  nextIdCounter: number;
  entities: EntityId[];
  components: Record<string, Record<EntityId, Record<string, unknown>>>;
}

/**
 * Deterministic Entity-Component Storage with monotonic stable IDs
 * and guaranteed sorted iteration order across all platforms.
 */
export class DeterministicECS {
  private nextIdCounter = 1;
  private entities: Set<EntityId> = new Set();
  private components: Map<string, Map<EntityId, Record<string, unknown>>> = new Map();

  createEntity(prefix = 'ent'): EntityId {
    const id = `${prefix}-${this.nextIdCounter++}`;
    this.entities.add(id);
    return id;
  }

  registerEntityWithId(id: EntityId): EntityId {
    this.entities.add(id);
    const match = /-(\d+)$/.exec(id);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed >= this.nextIdCounter) {
        this.nextIdCounter = parsed + 1;
      }
    }
    return id;
  }

  destroyEntity(id: EntityId): boolean {
    if (!this.entities.has(id)) return false;
    this.entities.delete(id);
    for (const store of this.components.values()) {
      store.delete(id);
    }
    return true;
  }

  hasEntity(id: EntityId): boolean {
    return this.entities.has(id);
  }

  setComponent<T extends Record<string, unknown>>(
    entityId: EntityId,
    componentName: string,
    data: T,
  ): void {
    if (!this.entities.has(entityId)) {
      throw new Error(`Cannot attach component "${componentName}" to non-existent entity "${entityId}"`);
    }
    let store = this.components.get(componentName);
    if (!store) {
      store = new Map();
      this.components.set(componentName, store);
    }
    store.set(entityId, { ...data });
  }

  getComponent<T extends Record<string, unknown>>(
    entityId: EntityId,
    componentName: string,
  ): T | undefined {
    const store = this.components.get(componentName);
    if (!store) return undefined;
    return store.get(entityId) as T | undefined;
  }

  removeComponent(entityId: EntityId, componentName: string): boolean {
    const store = this.components.get(componentName);
    if (!store) return false;
    return store.delete(entityId);
  }

  /**
   * Returns entity IDs in deterministic numeric-aware sorted order.
   */
  listEntities(): EntityId[] {
    return Array.from(this.entities).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  /**
   * Deterministic query returning entities that possess all requested components.
   */
  query(componentNames: string[]): EntityId[] {
    const sorted = this.listEntities();
    if (componentNames.length === 0) return sorted;
    return sorted.filter((entityId) =>
      componentNames.every((comp) => {
        const store = this.components.get(comp);
        return store ? store.has(entityId) : false;
      }),
    );
  }

  count(): number {
    return this.entities.size;
  }

  serialize(): SerializedECSState {
    const sortedEntities = this.listEntities();
    const sortedComponentNames = Array.from(this.components.keys()).sort();
    const serializedComponents: Record<string, Record<EntityId, Record<string, unknown>>> = {};

    for (const compName of sortedComponentNames) {
      const store = this.components.get(compName);
      if (!store) continue;
      const entityMap: Record<EntityId, Record<string, unknown>> = {};
      for (const entityId of sortedEntities) {
        const data = store.get(entityId);
        if (data !== undefined) {
          entityMap[entityId] = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
        }
      }
      serializedComponents[compName] = entityMap;
    }

    return {
      nextIdCounter: this.nextIdCounter,
      entities: sortedEntities,
      components: serializedComponents,
    };
  }

  restore(snapshot: SerializedECSState): void {
    this.nextIdCounter = snapshot.nextIdCounter || 1;
    this.entities = new Set(snapshot.entities || []);
    this.components.clear();

    const compNames = Object.keys(snapshot.components || {}).sort();
    for (const compName of compNames) {
      const map = new Map<EntityId, Record<string, unknown>>();
      const entityRecord = snapshot.components[compName] || {};
      const entityIds = Object.keys(entityRecord).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
      for (const id of entityIds) {
        map.set(id, JSON.parse(JSON.stringify(entityRecord[id])) as Record<string, unknown>);
      }
      this.components.set(compName, map);
    }
  }
}
