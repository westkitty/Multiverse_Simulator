/**
 * Scientific Budget Ledger (P003 - Conservation Has Teeth)
 *
 * Implements financially and physically accounted scientific interventions.
 * Enforces non-negative balances, capacity ceilings, and atomic transactions.
 * Provides cost previews before action issuance and preserves exact determinism.
 */

export interface BudgetResourceConfig {
  readonly balance: number;
  readonly capacity: number;
  readonly replenishmentRate?: number; // Added per tick
}

export interface BudgetResourceState {
  balance: number;
  readonly capacity: number;
  readonly replenishmentRate: number;
}

export interface BudgetDebit {
  readonly resource: string;
  readonly amount: number;
}

export interface BudgetCredit {
  readonly resource: string;
  readonly amount: number;
  readonly source: string;
}

export interface CostPreview {
  readonly feasible: boolean;
  readonly debits: readonly BudgetDebit[];
  readonly shortfalls: ReadonlyArray<{
    readonly resource: string;
    readonly required: number;
    readonly available: number;
  }>;
  readonly remainingBalances: Readonly<Record<string, number>>;
}

export interface BudgetTransactionReceipt {
  readonly transactionId: string;
  readonly worldId: string;
  readonly actionId: string;
  readonly tick: number;
  readonly status: 'applied' | 'rejected';
  readonly debitsApplied: readonly BudgetDebit[];
  readonly creditsApplied: readonly BudgetCredit[];
  readonly balancesAfter: Readonly<Record<string, number>>;
  readonly rejectionReason?: string;
}

export interface SerializedBudgetLedgerState {
  readonly worldId: string;
  readonly lastTick: number;
  readonly resources: Record<
    string,
    {
      balance: number;
      capacity: number;
      replenishmentRate: number;
    }
  >;
  readonly transactionCount: number;
}

export class ScientificBudgetLedger {
  readonly worldId: string;
  private lastTick: number = 0;
  private transactionCounter: number = 0;
  private readonly resources: Map<string, BudgetResourceState> = new Map();

  constructor(
    worldId: string,
    initialResources: Record<string, BudgetResourceConfig> = {},
    initialTick: number = 0,
  ) {
    this.worldId = worldId;
    this.lastTick = initialTick;
    for (const [res, cfg] of Object.entries(initialResources)) {
      const anyCfg = cfg as unknown as Record<string, unknown>;
      const cap = Math.max(1, Number(anyCfg.capacity ?? anyCfg.maxCapacity ?? 100));
      const rawBal = Number(anyCfg.balance ?? anyCfg.current ?? cap);
      const bal = Number.isFinite(rawBal) ? Math.max(0, Math.min(cap, rawBal)) : 0;
      const rep = Math.max(0, Number(anyCfg.replenishmentRate ?? anyCfg.replenishmentPerTick ?? 0));
      this.resources.set(res, { balance: bal, capacity: cap, replenishmentRate: rep });
    }
  }

  getBalance(resource: string): number {
    return this.resources.get(resource)?.balance ?? 0;
  }

  getCapacity(resource: string): number {
    return this.resources.get(resource)?.capacity ?? 0;
  }

  getAllBalances(): Record<string, number> {
    const res: Record<string, number> = {};
    for (const [k, v] of this.resources.entries()) {
      res[k] = v.balance;
    }
    return res;
  }

  getAllResources(): Record<string, { balance: number; capacity: number; replenishmentRate: number }> {
    const res: Record<string, { balance: number; capacity: number; replenishmentRate: number }> = {};
    for (const [k, v] of this.resources.entries()) {
      res[k] = { balance: v.balance, capacity: v.capacity, replenishmentRate: v.replenishmentRate };
    }
    return res;
  }

  previewDebit(debits: readonly BudgetDebit[]): CostPreview {
    const shortfalls: Array<{ resource: string; required: number; available: number }> = [];
    const remaining: Record<string, number> = {};

    for (const [res, st] of this.resources.entries()) {
      remaining[res] = st.balance;
    }

    for (const debit of debits) {
      if (debit.amount < 0) {
        // Negative debit is invalid (cannot mint funds through negative debits)
        shortfalls.push({
          resource: debit.resource,
          required: debit.amount,
          available: remaining[debit.resource] ?? 0,
        });
        continue;
      }
      const current = remaining[debit.resource] ?? 0;
      if (current < debit.amount) {
        shortfalls.push({
          resource: debit.resource,
          required: debit.amount,
          available: current,
        });
      } else {
        remaining[debit.resource] = Math.round((current - debit.amount) * 1_000_000) / 1_000_000;
      }
    }

    return {
      feasible: shortfalls.length === 0,
      debits: [...debits],
      shortfalls,
      remainingBalances: Object.freeze(remaining),
    };
  }

  applyTransaction(
    actionId: string,
    debits: readonly BudgetDebit[],
    credits: readonly BudgetCredit[] = [],
    tick: number = this.lastTick,
  ): BudgetTransactionReceipt {
    this.lastTick = tick;
    this.transactionCounter++;
    const txId = `tx-${this.worldId}-t${tick}-${this.transactionCounter}`;

    const preview = this.previewDebit(debits);
    if (!preview.feasible) {
      const reasons = preview.shortfalls
        .map((s) => `${s.resource}: need ${s.required}, have ${s.available}`)
        .join('; ');
      return {
        transactionId: txId,
        worldId: this.worldId,
        actionId,
        tick,
        status: 'rejected',
        debitsApplied: [],
        creditsApplied: [],
        balancesAfter: this.getAllBalances(),
        rejectionReason: `Insufficient budget for ${actionId}: ${reasons}`,
      };
    }

    // Atomic debit
    for (const debit of debits) {
      const st = this.resources.get(debit.resource);
      if (st) {
        st.balance = Math.max(0, Math.round((st.balance - debit.amount) * 1_000_000) / 1_000_000);
      }
    }

    // Apply credits (capped at capacity)
    const appliedCredits: BudgetCredit[] = [];
    for (const credit of credits) {
      if (credit.amount <= 0) continue;
      let st = this.resources.get(credit.resource);
      if (!st) {
        // Create resource if credited for the first time
        st = { balance: 0, capacity: Math.max(100, credit.amount * 2), replenishmentRate: 0 };
        this.resources.set(credit.resource, st);
      }
      const before = st.balance;
      st.balance = Math.min(st.capacity, Math.round((st.balance + credit.amount) * 1_000_000) / 1_000_000);
      const actualAdded = st.balance - before;
      appliedCredits.push({
        resource: credit.resource,
        amount: actualAdded,
        source: credit.source,
      });
    }

    return {
      transactionId: txId,
      worldId: this.worldId,
      actionId,
      tick,
      status: 'applied',
      debitsApplied: [...debits],
      creditsApplied: appliedCredits,
      balancesAfter: this.getAllBalances(),
    };
  }

  replenish(tick: number): void {
    const elapsed = Math.max(0, tick - this.lastTick);
    this.lastTick = tick;
    if (elapsed === 0) return;

    for (const st of this.resources.values()) {
      if (st.replenishmentRate > 0) {
        const added = st.replenishmentRate * elapsed;
        st.balance = Math.min(st.capacity, Math.round((st.balance + added) * 1_000_000) / 1_000_000);
      }
    }
  }

  clone(): ScientificBudgetLedger {
    const copy = new ScientificBudgetLedger(this.worldId, {}, this.lastTick);
    copy.transactionCounter = this.transactionCounter;
    for (const [k, v] of this.resources.entries()) {
      copy.resources.set(k, { balance: v.balance, capacity: v.capacity, replenishmentRate: v.replenishmentRate });
    }
    return copy;
  }

  serialize(): SerializedBudgetLedgerState {
    const res: SerializedBudgetLedgerState['resources'] = {};
    for (const [k, v] of this.resources.entries()) {
      res[k] = { balance: v.balance, capacity: v.capacity, replenishmentRate: v.replenishmentRate };
    }
    return {
      worldId: this.worldId,
      lastTick: this.lastTick,
      resources: res,
      transactionCount: this.transactionCounter,
    };
  }

  static deserialize(state: SerializedBudgetLedgerState): ScientificBudgetLedger {
    const ledger = new ScientificBudgetLedger(state.worldId, state.resources, state.lastTick);
    ledger.transactionCounter = state.transactionCount;
    return ledger;
  }
}
