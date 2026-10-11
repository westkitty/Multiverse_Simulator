import { WorldPlugin } from '../core/contracts';
import { globalPluginRegistry } from '../core/pluginRegistry';
import { atmospherePlugin } from './atmosphere/atmospherePlugin';
import { celestialPlugin } from './celestial/celestialPlugin';
import { civilizationPlugin } from './civilization/civilizationPlugin';
import { ecosystemPlugin } from './ecosystem/ecosystemPlugin';
import { geologyPlugin } from './geology/geologyPlugin';
import { industrialPlugin } from './industrial/industrialPlugin';
import { megacityPlugin } from './megacity/megacityPlugin';
import { oceanPlugin } from './ocean/oceanPlugin';
import { stationPlugin } from './station/stationPlugin';

export const CORE_WORLD_PLUGINS: ReadonlyArray<WorldPlugin<any, any>> = [
  ecosystemPlugin,
  stationPlugin,
  civilizationPlugin,
  atmospherePlugin,
  oceanPlugin,
  celestialPlugin,
  megacityPlugin,
  industrialPlugin,
  geologyPlugin,
];

export function registerBuiltInWorlds(): void {
  for (const plugin of CORE_WORLD_PLUGINS) {
    if (!globalPluginRegistry.has(plugin.id)) {
      globalPluginRegistry.register(plugin);
    }
  }
}

registerBuiltInWorlds();

export {
  ecosystemPlugin,
  stationPlugin,
  civilizationPlugin,
  atmospherePlugin,
  oceanPlugin,
  celestialPlugin,
  megacityPlugin,
  industrialPlugin,
  geologyPlugin,
};
