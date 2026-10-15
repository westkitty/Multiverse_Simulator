import { ecosystemFeatureModule } from "./ecosystem";
import { stationFeatureModule } from "./station";
import { civilizationFeatureModule } from "./civilization";
import { atmosphereFeatureModule } from "./atmosphere";
import { oceanFeatureModule } from "./ocean";
import { celestialFeatureModule } from "./celestial";
import { megacityFeatureModule } from "./megacity";
import { industrialFeatureModule } from "./industrial";
import { geologyFeatureModule } from "./geology";
import { wildMeridianFeatureModule } from "./wildMeridian";
import { hollowDeepFeatureModule } from "./hollowDeep";
import { timewornEmpireFeatureModule } from "./timewornEmpire";
import { terraformingFrontierFeatureModule } from "./terraformingFrontier";
import { machineWildernessFeatureModule } from "./machineWilderness";
import { signalExpanseFeatureModule } from "./signalExpanse";

export { ecosystemFeatureModule } from "./ecosystem";
export { stationFeatureModule } from "./station";
export { civilizationFeatureModule } from "./civilization";
export { atmosphereFeatureModule } from "./atmosphere";
export { oceanFeatureModule } from "./ocean";
export { celestialFeatureModule } from "./celestial";
export { megacityFeatureModule } from "./megacity";
export { industrialFeatureModule } from "./industrial";
export { geologyFeatureModule } from "./geology";
export { wildMeridianFeatureModule } from "./wildMeridian";
export { hollowDeepFeatureModule } from "./hollowDeep";
export { timewornEmpireFeatureModule } from "./timewornEmpire";
export { terraformingFrontierFeatureModule } from "./terraformingFrontier";
export { machineWildernessFeatureModule } from "./machineWilderness";
export { signalExpanseFeatureModule } from "./signalExpanse";

import { globalFeatureRegistry, FeatureModuleRegistry } from "../registry";
import { WorldFeatureModule } from "../contracts";

export const ALL_DOMAIN_FEATURE_MODULES: readonly WorldFeatureModule[] = [
  ecosystemFeatureModule,
  stationFeatureModule,
  civilizationFeatureModule,
  atmosphereFeatureModule,
  oceanFeatureModule,
  celestialFeatureModule,
  megacityFeatureModule,
  industrialFeatureModule,
  geologyFeatureModule,
  wildMeridianFeatureModule,
  hollowDeepFeatureModule,
  timewornEmpireFeatureModule,
  terraformingFrontierFeatureModule,
  machineWildernessFeatureModule,
  signalExpanseFeatureModule,
];

export function registerAllDomainFeatureModules(registry: FeatureModuleRegistry = globalFeatureRegistry): void {
  for (const mod of ALL_DOMAIN_FEATURE_MODULES) {
    if (!registry.has(mod.worldId, mod.rulesVersion)) {
      registry.register(mod);
    }
  }
}

// Auto-register on module load
registerAllDomainFeatureModules();
