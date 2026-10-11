import { WorldId, WorldPlugin } from './contracts';

export class PluginRegistry {
  private plugins: Map<WorldId, WorldPlugin<any, any>> = new Map();

  register<TConfig, TState>(plugin: WorldPlugin<TConfig, TState>): void {
    if (!plugin || typeof plugin.id !== 'string' || plugin.id.trim().length === 0) {
      throw new Error('Invalid plugin registration: plugin.id must be a non-empty string');
    }
    if (!plugin.name || typeof plugin.initializeWorld !== 'function') {
      throw new Error(`Invalid plugin registration for "${plugin.id}": missing required lifecycle methods`);
    }
    if (typeof plugin.getSystems !== 'function' || typeof plugin.applyCommand !== 'function') {
      throw new Error(`Invalid plugin registration for "${plugin.id}": missing getSystems or applyCommand`);
    }
    plugin.register();
    this.plugins.set(plugin.id, plugin);
  }

  get<TConfig = Record<string, unknown>, TState = Record<string, unknown>>(
    id: WorldId,
  ): WorldPlugin<TConfig, TState> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`World plugin "${id}" is not registered in the Omniverse PluginRegistry`);
    }
    return plugin as WorldPlugin<TConfig, TState>;
  }

  has(id: WorldId): boolean {
    return this.plugins.has(id);
  }

  list(): WorldPlugin<any, any>[] {
    return Array.from(this.plugins.values());
  }

  unregister(id: WorldId): boolean {
    const existing = this.plugins.get(id);
    if (!existing) return false;
    existing.dispose();
    return this.plugins.delete(id);
  }
}

export const globalPluginRegistry = new PluginRegistry();
