import { withNativeAtlas } from './atlas/nativeAtlas';
import { FRONTIER_WORLD_PLUGINS } from './frontiers/frontierPlugin';
import { WorldPlugin } from '../core/contracts';
import { globalPluginRegistry } from '../core/pluginRegistry';
import { atmospherePlugin as legacyAtmospherePlugin } from './atmosphere/atmospherePlugin';
import { celestialPlugin as legacyCelestialPlugin } from './celestial/celestialPlugin';
import { civilizationPlugin as legacyCivilizationPlugin } from './civilization/civilizationPlugin';
import { ecosystemPlugin as legacyEcosystemPlugin } from './ecosystem/ecosystemPlugin';
import { geologyPlugin as legacyGeologyPlugin } from './geology/geologyPlugin';
import { industrialPlugin as legacyIndustrialPlugin } from './industrial/industrialPlugin';
import { megacityPlugin as legacyMegacityPlugin } from './megacity/megacityPlugin';
import { oceanPlugin as legacyOceanPlugin } from './ocean/oceanPlugin';
import { stationPlugin as legacyStationPlugin } from './station/stationPlugin';

const ecosystemPlugin = withNativeAtlas(legacyEcosystemPlugin);
const stationPlugin = withNativeAtlas(legacyStationPlugin);
// New Civilization worlds use corrected full-housing stability; archived Atlas v1 remains replayable.
const civilizationPlugin = withNativeAtlas(legacyCivilizationPlugin,{defaultAtlasVersion:2});
const atmospherePlugin = withNativeAtlas(legacyAtmospherePlugin);
const oceanPlugin = withNativeAtlas(legacyOceanPlugin);
const celestialPlugin = withNativeAtlas(legacyCelestialPlugin);
const megacityPlugin = withNativeAtlas(legacyMegacityPlugin);
const industrialPlugin = withNativeAtlas(legacyIndustrialPlugin);
const geologyPlugin = withNativeAtlas(legacyGeologyPlugin);

export const LEGACY_WORLD_PLUGINS: ReadonlyArray<WorldPlugin<any, any>> = [legacyEcosystemPlugin, legacyStationPlugin, legacyCivilizationPlugin, legacyAtmospherePlugin, legacyOceanPlugin, legacyCelestialPlugin, legacyMegacityPlugin, legacyIndustrialPlugin, legacyGeologyPlugin];

export const ORIGINAL_WORLD_PLUGINS: ReadonlyArray<WorldPlugin<any, any>> = [
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

export const CORE_WORLD_PLUGINS: ReadonlyArray<WorldPlugin<any, any>> = [...ORIGINAL_WORLD_PLUGINS, ...FRONTIER_WORLD_PLUGINS];

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
