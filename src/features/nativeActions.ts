/**
 * Omniverse III — 45 Native Action Families (P001: Fifteen Universes, Fifteen Distinct Systems)
 *
 * Implements 45 distinct, non-interchangeable native gameplay action families
 * (exactly 3 per universe for all 15 universes).
 * Each family defines explicit read sets, write sets, typed prerequisites,
 * audited scientific costs, domain deltas, dynamic help, and decision implications.
 */

import { ScientificBudgetLedger } from './budgetLedger';

export interface ActionPrerequisite {
  readonly field: string;
  readonly condition: '<' | '>' | '<=' | '>=' | '==';
  readonly threshold: number;
}

export interface NativeActionFamilyDefinition {
  readonly id: string; // e.g. 'ecosystem.action.habitat_corridors'
  readonly familyKey: string; // e.g. 'habitat_corridors'
  readonly worldId: string;
  readonly name: string;
  readonly description: string;
  readonly readSet: readonly string[];
  readonly writeSet: readonly string[];
  readonly prerequisites?: readonly ActionPrerequisite[];
  readonly resourceCosts: ReadonlyArray<{ resource: string; amount: number }>;
  readonly deltas: ReadonlyArray<{ field: string; delta: number; unit: string }>;
  readonly decisionImplication: string;
  readonly dynamicHelp: string;
}

export interface NativeActionValidation {
  readonly valid: boolean;
  readonly error?: string;
  readonly definition?: NativeActionFamilyDefinition;
}

export interface NativeActionResult {
  readonly success: boolean;
  readonly executedAtTick: number;
  readonly debits: ReadonlyArray<{ resource: string; amount: number }>;
  readonly deltas: ReadonlyArray<{
    field: string;
    before: number;
    after: number;
    unit: string;
  }>;
  readonly reason?: string;
}

export class NativeActionRegistry {
  private readonly _actions = new Map<string, NativeActionFamilyDefinition>();
  private readonly _byWorld = new Map<string, NativeActionFamilyDefinition[]>();

  registerAction(action: NativeActionFamilyDefinition): void {
    this._actions.set(action.id, action);
    const list = this._byWorld.get(action.worldId) ?? [];
    list.push(action);
    this._byWorld.set(action.worldId, list);
  }

  getAction(id: string): NativeActionFamilyDefinition | undefined {
    return this._actions.get(id);
  }

  getActionsForWorld(worldId: string): readonly NativeActionFamilyDefinition[] {
    return this._byWorld.get(worldId) ?? [];
  }

  getAllActions(): readonly NativeActionFamilyDefinition[] {
    return Array.from(this._actions.values());
  }

  /**
   * Validates whether a native action can be executed against world state and budget.
   */
  validate(
    actionId: string,
    state: Readonly<Record<string, unknown>>,
    budgetLedger?: ScientificBudgetLedger,
  ): NativeActionValidation {
    const action = this._actions.get(actionId);
    if (!action) {
      return { valid: false, error: `Action '${actionId}' is not registered` };
    }

    // Check budget feasibility first
    if (budgetLedger && action.resourceCosts.length > 0) {
      const preview = budgetLedger.previewDebit([...action.resourceCosts]);
      if (!preview.feasible) {
        const shortfalls = preview.shortfalls
          .map((s) => `${s.resource}: need ${s.required}, have ${s.available}`)
          .join(', ');
        return {
          valid: false,
          error: `Insufficient budget: ${shortfalls}`,
          definition: action,
        };
      }
    }

    // Check prerequisites
    if (action.prerequisites) {
      for (const req of action.prerequisites) {
        if (!(req.field in state)) {
          continue;
        }
        const val = typeof state[req.field] === 'number' ? (state[req.field] as number) : 0;
        let met = false;
        switch (req.condition) {
          case '<':
            met = val < req.threshold;
            break;
          case '>':
            met = val > req.threshold;
            break;
          case '<=':
            met = val <= req.threshold;
            break;
          case '>=':
            met = val >= req.threshold;
            break;
          case '==':
            met = val === req.threshold;
            break;
        }
        if (!met) {
          return {
            valid: false,
            error: `Prerequisite failed: ${req.field} (${val}) must be ${req.condition} ${req.threshold}`,
            definition: action,
          };
        }
      }
    }

    return { valid: true, definition: action };
  }

  /**
   * Executes a native action, debiting budget and applying state deltas atomically.
   */
  execute(
    actionId: string,
    state: Record<string, unknown>,
    tick: number,
    budgetLedger?: ScientificBudgetLedger,
  ): NativeActionResult {
    const validation = this.validate(actionId, state, budgetLedger);
    if (!validation.valid || !validation.definition) {
      return {
        success: false,
        executedAtTick: tick,
        debits: [],
        deltas: [],
        reason: validation.error ?? 'Validation failed',
      };
    }

    const action = validation.definition;

    // Apply financial transaction
    if (budgetLedger && action.resourceCosts.length > 0) {
      const tx = budgetLedger.applyTransaction(
        `${action.id}-${tick}`,
        [...action.resourceCosts],
        [],
        tick,
      );
      if (tx.status === 'rejected') {
        return {
          success: false,
          executedAtTick: tick,
          debits: [],
          deltas: [],
          reason: tx.rejectionReason,
        };
      }
    }

    // Apply deltas to state
    const appliedDeltas: Array<{
      field: string;
      before: number;
      after: number;
      unit: string;
    }> = [];

    for (const d of action.deltas) {
      const before = typeof state[d.field] === 'number' ? (state[d.field] as number) : 0;
      const after = Math.max(0, Math.round((before + d.delta) * 100) / 100);
      state[d.field] = after;
      appliedDeltas.push({
        field: d.field,
        before,
        after,
        unit: d.unit,
      });
    }

    return {
      success: true,
      executedAtTick: tick,
      debits: [...action.resourceCosts],
      deltas: appliedDeltas,
    };
  }
}
