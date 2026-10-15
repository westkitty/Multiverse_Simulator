import type { ScientificBudgetLedger } from './budgetLedger';
import type { LogisticsNetwork } from './logisticsWeb';

export type FacilityBuildState =
  | 'planned'
  | 'under_construction'
  | 'active'
  | 'degraded'
  | 'retired';

export interface FacilityDefinition {
  readonly typeId: string;
  readonly worldId: string;
  readonly name: string;
  readonly description: string;
  readonly buildMaterialsCost: ReadonlyArray<{ resource: string; amount: number }>;
  readonly buildTicks: number;
  readonly upkeepCost: ReadonlyArray<{ resource: string; amount: number }>;
  readonly benefitMetric: string;
  readonly benefitDeltaPerTick: number;
  readonly maxCumulativeBenefit?: number;
  readonly allowedSiteArchetypes?: readonly string[];
}

export interface FacilityState {
  readonly id: string;
  readonly worldId: string;
  readonly typeId: string;
  readonly siteId: string;
  readonly regionId: string;
  buildState: FacilityBuildState;
  constructionProgress: number; // 0 to 100
  constructionTicksRemaining: number;
  maintenanceState: number; // 0 to 100
  operatingRate: number; // 0.0 to 1.0
  cumulativeBenefitDelivered: number;
  readonly createdTick: number;
  completedTick?: number;
}

export class FacilityManager {
  readonly worldId: string;
  readonly definitions = new Map<string, FacilityDefinition>();
  readonly facilities = new Map<string, FacilityState>(); // key: siteId

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  registerDefinition(def: FacilityDefinition): void {
    this.definitions.set(def.typeId, { ...def });
  }

  getFacilityBySite(siteId: string): FacilityState | undefined {
    return this.facilities.get(siteId);
  }

  getAllFacilities(): FacilityState[] {
    return Array.from(this.facilities.values());
  }

  buildFacility(
    siteId: string,
    regionId: string,
    typeId: string,
    tick: number,
    options: {
      budgetLedger?: ScientificBudgetLedger;
      logisticsNetwork?: LogisticsNetwork;
    } = {},
  ): { success: boolean; facility?: FacilityState; reason?: string } {
    const existing = this.facilities.get(siteId);
    if (existing && existing.buildState !== 'retired') {
      return {
        success: false,
        reason: `Site ${siteId} is already occupied by active facility ${existing.id}`,
      };
    }

    const def = this.definitions.get(typeId);
    if (!def) {
      return { success: false, reason: `Unknown facility type: ${typeId}` };
    }
    if (def.worldId !== this.worldId) {
      return {
        success: false,
        reason: `Facility type ${typeId} belongs to world ${def.worldId}, not ${this.worldId}`,
      };
    }

    // Verify materials available in depot or budget
    for (const cost of def.buildMaterialsCost) {
      let available = 0;
      if (options.logisticsNetwork) {
        available += options.logisticsNetwork.getDepotAvailableStock(siteId, cost.resource);
      }
      if (options.budgetLedger) {
        available += options.budgetLedger.getBalance(cost.resource);
      }
      if (available < cost.amount) {
        return {
          success: false,
          reason: `Insufficient ${cost.resource} to build ${def.name}: have ${available}, need ${cost.amount}`,
        };
      }
    }

    // Deduct materials atomically
    for (const cost of def.buildMaterialsCost) {
      let needed = cost.amount;
      if (options.logisticsNetwork) {
        const fromDepot = Math.min(
          needed,
          options.logisticsNetwork.getDepotAvailableStock(siteId, cost.resource),
        );
        if (fromDepot > 0) {
          options.logisticsNetwork.recordConsumption(siteId, cost.resource, fromDepot);
          needed -= fromDepot;
        }
      }
      if (needed > 0 && options.budgetLedger) {
        options.budgetLedger.applyTransaction(
          `build_${typeId}`,
          [{ resource: cost.resource, amount: needed }],
          [],
          tick,
        );
      }
    }

    const facilityId = `${this.worldId}:${typeId}:${siteId}`;
    const facility: FacilityState = {
      id: facilityId,
      worldId: this.worldId,
      typeId,
      siteId,
      regionId,
      buildState: 'under_construction',
      constructionProgress: 0,
      constructionTicksRemaining: def.buildTicks,
      maintenanceState: 100,
      operatingRate: 1.0,
      cumulativeBenefitDelivered: 0,
      createdTick: tick,
    };

    this.facilities.set(siteId, facility);
    return { success: true, facility };
  }

  maintainFacility(
    siteId: string,
    tick: number,
    options: {
      budgetLedger?: ScientificBudgetLedger;
      logisticsNetwork?: LogisticsNetwork;
    } = {},
  ): { success: boolean; reason?: string } {
    const facility = this.facilities.get(siteId);
    if (!facility || facility.buildState === 'retired') {
      return { success: false, reason: `No active facility at site ${siteId}` };
    }
    const def = this.definitions.get(facility.typeId);
    if (!def) return { success: false, reason: 'Definition missing' };

    // Debit maintenance upkeep
    for (const cost of def.upkeepCost) {
      let available = 0;
      if (options.logisticsNetwork) {
        available += options.logisticsNetwork.getDepotAvailableStock(siteId, cost.resource);
      }
      if (options.budgetLedger) {
        available += options.budgetLedger.getBalance(cost.resource);
      }
      if (available < cost.amount) {
        return {
          success: false,
          reason: `Insufficient upkeep resource ${cost.resource}: need ${cost.amount}`,
        };
      }
    }

    // Apply debit
    for (const cost of def.upkeepCost) {
      let needed = cost.amount;
      if (options.logisticsNetwork) {
        const fromDepot = Math.min(
          needed,
          options.logisticsNetwork.getDepotAvailableStock(siteId, cost.resource),
        );
        if (fromDepot > 0) {
          options.logisticsNetwork.recordConsumption(siteId, cost.resource, fromDepot);
          needed -= fromDepot;
        }
      }
      if (needed > 0 && options.budgetLedger) {
        options.budgetLedger.applyTransaction(
          `maintain_${facility.typeId}`,
          [{ resource: cost.resource, amount: needed }],
          [],
          tick,
        );
      }
    }

    facility.maintenanceState = 100;
    facility.operatingRate = 1.0;
    if (facility.buildState === 'degraded') {
      facility.buildState = 'active';
    }

    return { success: true };
  }

  configureFacility(
    siteId: string,
    operatingRate: number,
  ): { success: boolean; reason?: string } {
    const facility = this.facilities.get(siteId);
    if (!facility || facility.buildState === 'retired') {
      return { success: false, reason: `No active facility at site ${siteId}` };
    }
    facility.operatingRate = Math.max(0, Math.min(1.0, operatingRate));
    return { success: true };
  }

  retireFacility(
    siteId: string,
    options: {
      logisticsNetwork?: LogisticsNetwork;
    } = {},
  ): { success: boolean; salvageRecovered: Record<string, number>; reason?: string } {
    const facility = this.facilities.get(siteId);
    if (!facility || facility.buildState === 'retired') {
      return { success: false, salvageRecovered: {}, reason: `No active facility at site ${siteId}` };
    }
    const def = this.definitions.get(facility.typeId);
    const salvageRecovered: Record<string, number> = {};

    if (def && options.logisticsNetwork) {
      // 50% salvage return
      for (const cost of def.buildMaterialsCost) {
        const salvage = Math.floor(cost.amount * 0.5);
        if (salvage > 0) {
          options.logisticsNetwork.recordProduction(siteId, cost.resource, salvage);
          salvageRecovered[cost.resource] = salvage;
        }
      }
    }

    facility.buildState = 'retired';
    facility.operatingRate = 0;
    this.facilities.delete(siteId);

    return { success: true, salvageRecovered };
  }

  stepFacilities(
    tick: number,
    options: {
      budgetLedger?: ScientificBudgetLedger;
      logisticsNetwork?: LogisticsNetwork;
      applyBenefit?: (metric: string, delta: number) => void;
    } = {},
  ): {
    completedFacilities: string[];
    degradedFacilities: string[];
    benefitsApplied: Array<{ metric: string; delta: number }>;
  } {
    const completedFacilities: string[] = [];
    const degradedFacilities: string[] = [];
    const benefitsApplied: Array<{ metric: string; delta: number }> = [];

    for (const facility of this.facilities.values()) {
      const def = this.definitions.get(facility.typeId);
      if (!def) continue;

      // Handle construction
      if (facility.buildState === 'under_construction') {
        facility.constructionTicksRemaining = Math.max(
          0,
          facility.constructionTicksRemaining - 1,
        );
        const progress = Math.round(
          ((def.buildTicks - facility.constructionTicksRemaining) / def.buildTicks) * 100,
        );
        facility.constructionProgress = progress;

        if (facility.constructionTicksRemaining <= 0) {
          facility.buildState = 'active';
          facility.completedTick = tick;
          completedFacilities.push(facility.id);
        }
        continue;
      }

      // Handle active / degraded operation & upkeep
      if (facility.buildState === 'active' || facility.buildState === 'degraded') {
        // Attempt upkeep debit
        let upkeepPaid = true;
        for (const cost of def.upkeepCost) {
          let available = 0;
          if (options.logisticsNetwork) {
            available += options.logisticsNetwork.getDepotAvailableStock(
              facility.siteId,
              cost.resource,
            );
          }
          if (options.budgetLedger) {
            available += options.budgetLedger.getBalance(cost.resource);
          }
          if (available < cost.amount) {
            upkeepPaid = false;
            break;
          }
        }

        if (upkeepPaid) {
          for (const cost of def.upkeepCost) {
            let needed = cost.amount;
            if (options.logisticsNetwork) {
              const fromDepot = Math.min(
                needed,
                options.logisticsNetwork.getDepotAvailableStock(
                  facility.siteId,
                  cost.resource,
                ),
              );
              if (fromDepot > 0) {
                options.logisticsNetwork.recordConsumption(
                  facility.siteId,
                  cost.resource,
                  fromDepot,
                );
                needed -= fromDepot;
              }
            }
            if (needed > 0 && options.budgetLedger) {
              options.budgetLedger.applyTransaction(
                `upkeep_${facility.typeId}`,
                [{ resource: cost.resource, amount: needed }],
                [],
                tick,
              );
            }
          }
          facility.maintenanceState = Math.min(100, facility.maintenanceState + 1);
        } else {
          // Upkeep unpaid: degrade maintenance
          facility.maintenanceState = Math.max(0, facility.maintenanceState - 5);
          if (facility.maintenanceState < 25) {
            facility.buildState = 'degraded';
            facility.operatingRate = Math.max(0.1, facility.maintenanceState / 100);
            degradedFacilities.push(facility.id);
          }
        }

        // Apply domain benefit proportional to operating rate
        if (facility.operatingRate > 0) {
          const delta = Math.round(def.benefitDeltaPerTick * facility.operatingRate * 100) / 100;
          facility.cumulativeBenefitDelivered += delta;
          if (options.applyBenefit) {
            options.applyBenefit(def.benefitMetric, delta);
          }
          benefitsApplied.push({ metric: def.benefitMetric, delta });
        }
      }
    }

    return { completedFacilities, degradedFacilities, benefitsApplied };
  }
}
