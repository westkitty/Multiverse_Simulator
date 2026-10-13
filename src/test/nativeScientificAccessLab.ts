import { SimulationKernel } from '../core/kernel';
import { planRoute } from '../exploration/engine';

/**
 * Existing authored restoration commands only. These are not a new maintenance
 * mechanic, economy budget, or permission to change native simulation constants.
 */
export const SCIENTIFIC_RECOVERY_COMMANDS: Record<string, string> = {
  civilization: 'civ-civic-festival-stabilization',
  industrial: 'ind-repair-all-facilities',
  megacity: 'cty-infrastructure-overhaul',
  geology: 'geo-emergency-reconstruction',
};

interface AccessSnapshot {
  tick: number;
  meanRegionHazard: number;
  unsafeRegions: number;
  unsafeSiteTargets: number;
  safelyReachableSites: number;
  routeHazardBarriers: number;
  fuelBarriers: number;
  disconnectedOrClosedSites: number;
  meanSiteCondition: number;
}

function accessible(
  atlas: any, exploration: any, regionId: string,
  maxHazard: number, maxFuel: number,
): boolean {
  try {
    planRoute(atlas, exploration.expedition.regionId,
      regionId, maxHazard, maxFuel, exploration);
    return true;
  } catch {
    return false;
  }
}

/** Classifies the specific limiting constraint, preserving the real route graph. */
export function inspectNativeRecoveryAccess(kernel: SimulationKernel<any, any>): AccessSnapshot {
  const {atlas, exploration} = kernel.getState();
  const regionHazards = Object.values(exploration.regionHazards) as number[];
  let unsafeSiteTargets = 0, safelyReachableSites = 0, routeHazardBarriers = 0;
  let fuelBarriers = 0, disconnectedOrClosedSites = 0;
  for (const site of atlas.sites) {
    const delta = exploration.sites[site.facts.id];
    if (delta.hazard > 70) {
      unsafeSiteTargets++;
      continue;
    }
    const regionId = site.facts.regionId;
    if (accessible(atlas,exploration,regionId,70,exploration.expedition.fuel)) {
      safelyReachableSites++;
    } else if (accessible(atlas,exploration,regionId,100,exploration.expedition.fuel)) {
      routeHazardBarriers++;
    } else if (accessible(atlas,exploration,regionId,100,Infinity)) {
      fuelBarriers++;
    } else {
      disconnectedOrClosedSites++;
    }
  }
  const sites = Object.values(exploration.sites) as Array<{condition:number}>;
  return {
    tick:kernel.tick,
    meanRegionHazard:regionHazards.reduce((sum,n)=>sum+n,0)/regionHazards.length,
    unsafeRegions:regionHazards.filter(n=>n>70).length,
    unsafeSiteTargets,
    safelyReachableSites,
    routeHazardBarriers,
    fuelBarriers,
    disconnectedOrClosedSites,
    meanSiteCondition:sites.reduce((sum,site)=>sum+site.condition,0)/sites.length,
  };
}

/**
 * From one genuinely exhausted (tick 2005) field expedition, fork TWO fully
 * independent owned records with the same run ID/config/RNG, apply two existing
 * native restoration commands on successive ticks only to the treatment, then
 * advance both for a fixed observation window.
 *
 * This evaluates whether native interventions reopen region access. It does
 * NOT establish an economic cost for command use or prove indefinite recovery.
 */
export function probeScientificAccessRecovery(
  exhaustedKernel: SimulationKernel<any, any>,
) {
  const plugin = exhaustedKernel.plugin;
  const interventionId = SCIENTIFIC_RECOVERY_COMMANDS[plugin.id];
  if (!interventionId) throw new Error('No scientific access recovery plan for world');
  const descriptor = plugin.quickInterventions.find(item => item.id === interventionId);
  if (!descriptor) throw new Error('Authoritative world restoration command is missing');
  const source = exhaustedKernel.exportRunRecord();
  const control = SimulationKernel.fromRunRecord(source, plugin);
  const treatment = SimulationKernel.fromRunRecord(source, plugin);
  const sourceHash = exhaustedKernel.getStateHash();
  if (control.getStateHash() !== sourceHash || treatment.getStateHash() !== sourceHash)
    throw new Error('Scientific recovery arms did not start from an identical state');
  const initial = inspectNativeRecoveryAccess(control);
  let appliedCommands = 0;
  for (let pulse = 0; pulse < 2; pulse++) {
    const queued = treatment.enqueueCommand({
      type:descriptor.commandType,
      label:descriptor.label,
      payload:descriptor.defaultPayload,
    });
    const accepted = treatment.flushCurrentTickCommands();
    if (!accepted.some(item => item.id === queued.id)) {
      throw new Error('Restoration was not accepted by the native command bus');
    }
    appliedCommands++;
    control.step();
    treatment.step();
  }
  const immediateControl = inspectNativeRecoveryAccess(control);
  const immediateTreatment = inspectNativeRecoveryAccess(treatment);
  for (let remaining = 0; remaining < 28; remaining++) {
    control.step();
    treatment.step();
  }
  const sustainedControl = inspectNativeRecoveryAccess(control);
  const sustainedTreatment = inspectNativeRecoveryAccess(treatment);

  // Restored records must remain exact authoritative snapshots. Test this
  // without changing the metric timestamps in the returned observations.
  const reloaded = SimulationKernel.fromRunRecord(treatment.exportRunRecord(), plugin);
  if (reloaded.getStateHash() !== treatment.getStateHash())
    throw new Error('Recovery treatment did not survive authoritative restore');
  for (let tick = 0; tick < 5; tick++) {
    treatment.step();
    reloaded.step();
  }
  if (reloaded.getStateHash() !== treatment.getStateHash())
    throw new Error('Recovery treatment diverged after deterministic continuation');

  return {
    world:plugin.id, seed:exhaustedKernel.seed, interventionId,
    commandType:descriptor.commandType, appliedCommands,
    initial, immediateControl, immediateTreatment,
    sustainedControl, sustainedTreatment,
    immediateHazardReduction:immediateControl.meanRegionHazard-immediateTreatment.meanRegionHazard,
    sustainedHazardReduction:sustainedControl.meanRegionHazard-sustainedTreatment.meanRegionHazard,
    sustainedAccessGain:sustainedTreatment.safelyReachableSites-sustainedControl.safelyReachableSites,
    sourceHashIdentical:true,
    saveRestoreContinuationVerified:true,
  };
}
