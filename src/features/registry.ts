import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  isFeatureId,
  ValidatedAction,
  WorldFeatureModule,
} from './contracts';
import { createBaseVisibleState } from './projections';

export class FeatureModuleRegistry {
  private modules = new Map<string, WorldFeatureModule>();

  private makeKey(worldId: string, rulesVersion: number): string {
    return `${worldId}:v${rulesVersion}`;
  }

  register(module: WorldFeatureModule): void {
    if (!module.worldId || typeof module.worldId !== 'string') {
      throw new Error('FeatureModuleRegistry: invalid worldId');
    }
    if (typeof module.rulesVersion !== 'number' || module.rulesVersion < 1) {
      throw new Error(
        `FeatureModuleRegistry: invalid rulesVersion ${module.rulesVersion}; must be >= 1`,
      );
    }
    if (!Array.isArray(module.capabilities) || module.capabilities.length === 0) {
      throw new Error(
        `FeatureModuleRegistry: module for ${module.worldId} must declare at least one capability`,
      );
    }

    // Validate capability identifiers and feature IDs
    const capIds = new Set<string>();
    for (const cap of module.capabilities) {
      if (!cap.id || typeof cap.id !== 'string') {
        throw new Error(
          `FeatureModuleRegistry: capability in ${module.worldId} missing valid id`,
        );
      }
      if (capIds.has(cap.id)) {
        throw new Error(
          `FeatureModuleRegistry: duplicate capability id ${cap.id} in ${module.worldId}`,
        );
      }
      capIds.add(cap.id);
      if (!isFeatureId(cap.featureId)) {
        throw new Error(
          `FeatureModuleRegistry: invalid featureId ${cap.featureId} in capability ${cap.id}`,
        );
      }
    }

    const key = this.makeKey(module.worldId, module.rulesVersion);
    if (this.modules.has(key)) {
      throw new Error(
        `FeatureModuleRegistry: duplicate module registration for ${key}`,
      );
    }

    this.modules.set(key, module);
  }

  get(worldId: string, rulesVersion = 1): WorldFeatureModule | undefined {
    return this.modules.get(this.makeKey(worldId, rulesVersion));
  }

  has(worldId: string, rulesVersion = 1): boolean {
    return this.modules.has(this.makeKey(worldId, rulesVersion));
  }

  getAll(): readonly WorldFeatureModule[] {
    return Array.from(this.modules.values());
  }

  getCapabilities(worldId: string, rulesVersion = 1): readonly FeatureCapability[] {
    const mod = this.get(worldId, rulesVersion);
    return mod ? mod.capabilities : [];
  }

  clear(): void {
    this.modules.clear();
  }
}

export const globalFeatureRegistry = new FeatureModuleRegistry();

/**
 * Creates a synthetic, test-only WorldFeatureModule to test the module seam
 * in complete isolation without altering or privileging any real game universe.
 */
export function createSyntheticTestModule(
  customWorldId = 'synthetic-test-domain',
  customRulesVersion = 1,
): WorldFeatureModule<{ counter: number; energy: number }, { testForcing: number }> {
  return {
    worldId: customWorldId,
    rulesVersion: customRulesVersion,
    capabilities: [
      {
        id: 'synthetic.test_action',
        featureId: 'P001',
        name: 'Synthetic Test Action',
        description: 'No-op test action used to prove module seam contracts.',
        minRulesVersion: 1,
        domainUnits: ['test-units'],
        costResource: 'energy',
      },
    ],
    validateAction(raw: unknown, state: Readonly<{ counter: number; energy: number }>): ActionValidationResult {
      if (!raw || typeof raw !== 'object') {
        return { valid: false, error: 'Malformed action payload' };
      }
      const r = raw as Record<string, unknown>;
      if (r.type !== 'synthetic.test_action') {
        return { valid: false, error: `Unknown action type: ${r.type}` };
      }
      if (typeof r.amount !== 'number' || r.amount <= 0) {
        return { valid: false, error: 'Amount must be a positive number' };
      }
      if (state.energy < r.amount) {
        return { valid: false, error: 'Insufficient energy for synthetic action' };
      }
      return {
        valid: true,
        action: {
          actionFamily: 'synthetic',
          worldId: customWorldId,
          capabilityId: 'synthetic.test_action',
          payload: { amount: r.amount },
          cost: { resource: 'energy', amount: r.amount },
        },
      };
    },
    applyAction(
      state: { counter: number; energy: number },
      action: ValidatedAction<{ amount: number }>,
      ctx,
    ): ActionExecutionReceipt {
      const amount = action.payload.amount;
      const prevEnergy = state.energy;
      const prevCounter = state.counter;
      state.energy -= amount;
      state.counter += 1;

      const event = ctx.emitEvent({
        type: 'synthetic.test_action_applied',
        severity: 'info',
        title: 'Synthetic Action Applied',
        description: `Executed synthetic action with amount ${amount}`,
        sourceSystem: 'synthetic-feature-module',
        deltas: [
          { metricOrField: 'energy', before: prevEnergy, after: state.energy, unit: 'energy' },
          { metricOrField: 'counter', before: prevCounter, after: state.counter },
        ],
      });

      return {
        actionId: 'synthetic-receipt-1',
        worldId: customWorldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [{ resource: 'energy', amount }],
        deltas: [
          { field: 'energy', before: prevEnergy, after: state.energy, unit: 'energy' },
          { field: 'counter', before: prevCounter, after: state.counter },
        ],
        eventsEmitted: [event.id],
      };
    },
    stepOwnedSystems(ctx) {
      ctx.state.energy = Math.min(100, ctx.state.energy + 1);
    },
    projectVisibleState(state, _viewer) {
      return createBaseVisibleState(
        customWorldId,
        customRulesVersion,
        ['synthetic.test_action'],
        { counter: state.counter, energy: state.energy },
        [],
      );
    },
  };
}
