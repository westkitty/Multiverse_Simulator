import { globalPluginRegistry } from '../core/pluginRegistry';
import { civilizationPlugin } from './civilization/civilizationPlugin';
import { ecosystemPlugin } from './ecosystem/ecosystemPlugin';
import { stationPlugin } from './station/stationPlugin';

export function registerBuiltInWorlds(): void {
  if (!globalPluginRegistry.has('ecosystem')) {
    globalPluginRegistry.register(ecosystemPlugin);
  }
  if (!globalPluginRegistry.has('station')) {
    globalPluginRegistry.register(stationPlugin);
  }
  if (!globalPluginRegistry.has('civilization')) {
    globalPluginRegistry.register(civilizationPlugin);
  }
}

registerBuiltInWorlds();

export { ecosystemPlugin, stationPlugin, civilizationPlugin };
export const CORE_WORLD_PLUGINS = [
  ecosystemPlugin,
  stationPlugin,
  civilizationPlugin,
] as const;
