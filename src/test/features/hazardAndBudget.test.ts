import { describe, expect, it } from 'vitest';
import {
  HazardDependencyGraph,
  HazardLink,
  HazardNode,
} from '../../features/hazardGraph';
import {
  ScientificBudgetLedger,
} from '../../features/budgetLedger';

describe('HazardDependencyGraph (P002)', () => {
  const sampleNodes: HazardNode[] = [
    {
      id: 'drought',
      label: 'Watershed Drought',
      worldId: 'ecosystem',
      sourceMetric: 'moisture',
      targetMetric: 'moisture',
      threshold: 30,
      operator: '<',
      severity: 'warning',
      upstreamNodeIds: [],
      mitigationActionFamily: 'ecosystem.action.habitat_corridors',
      description: 'Soil moisture falls below critical threshold',
      observedTriggerTemplate: 'moisture ({value}) dropped below {threshold}',
      hypothesizedExplanation: 'Prolonged lack of precipitation leading to dry soil bed',
    },
    {
      id: 'nutrient_runaway',
      label: 'Nutrient Runaway',
      worldId: 'ecosystem',
      sourceMetric: 'nutrients',
      targetMetric: 'nutrients',
      threshold: 80,
      operator: '>',
      severity: 'critical',
      upstreamNodeIds: ['drought'],
      mitigationActionFamily: 'ecosystem.action.nutrient_balancing',
      description: 'Nutrient concentration exceeds tolerable bounds due to lack of dilution',
      observedTriggerTemplate: 'nutrients ({value}) exceeded {threshold}',
      hypothesizedExplanation: 'Stagnant water causes toxic mineralization and nutrient accumulation',
    },
    {
      id: 'canopy_dieback',
      label: 'Canopy Dieback',
      worldId: 'ecosystem',
      sourceMetric: 'biomass',
      targetMetric: 'biomass',
      threshold: 20,
      operator: '<',
      severity: 'catastrophic',
      upstreamNodeIds: ['nutrient_runaway'],
      mitigationActionFamily: 'ecosystem.action.targeted_firebreaks',
      description: 'Forest canopy fails irreversibly',
      observedTriggerTemplate: 'biomass ({value}) dropped below {threshold}',
      hypothesizedExplanation: 'Combined water stress and toxic mineralization kill root systems',
    },
  ];

  const sampleLinks: HazardLink[] = [
    {
      fromNodeId: 'drought',
      toNodeId: 'nutrient_runaway',
      causalLinkType: 'direct',
      description: 'Drought accelerates nutrient crystallization',
    },
    {
      fromNodeId: 'nutrient_runaway',
      toNodeId: 'canopy_dieback',
      causalLinkType: 'dependency',
      description: 'Nutrient imbalance starves plant roots',
    },
  ];

  it('constructs a valid DAG and validates successfully', () => {
    const graph = new HazardDependencyGraph('ecosystem', sampleNodes, sampleLinks);
    const validation = graph.validateGraph();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(graph.getNodes()).toHaveLength(3);
    expect(graph.getLinks()).toHaveLength(2);
  });

  it('detects cycles and invalid references during validation', () => {
    const cyclicLinks: HazardLink[] = [
      ...sampleLinks,
      {
        fromNodeId: 'canopy_dieback',
        toNodeId: 'drought',
        causalLinkType: 'inferred',
        description: 'Cycle',
      },
    ];
    const cyclicGraph = new HazardDependencyGraph('ecosystem', sampleNodes, cyclicLinks);
    const validation = cyclicGraph.validateGraph();
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('cycle'))).toBe(true);

    const badRefNodes: HazardNode[] = [
      {
        ...sampleNodes[0],
        upstreamNodeIds: ['nonexistent_node'],
      },
    ];
    const badRefGraph = new HazardDependencyGraph('ecosystem', badRefNodes, []);
    const badRefValidation = badRefGraph.validateGraph();
    expect(badRefValidation.valid).toBe(false);
    expect(badRefValidation.errors.some((e) => e.includes('nonexistent_node'))).toBe(true);
  });

  it('finds upstream causes and downstream risks correctly', () => {
    const graph = new HazardDependencyGraph('ecosystem', sampleNodes, sampleLinks);

    const upstreamOfDieback = graph.findUpstreamCauses('canopy_dieback');
    const upstreamIds = upstreamOfDieback.map((n) => n.id);
    expect(upstreamIds).toContain('nutrient_runaway');
    expect(upstreamIds).toContain('drought');

    const downstreamOfDrought = graph.findDownstreamRisks('drought');
    const downstreamIds = downstreamOfDrought.map((n) => n.id);
    expect(downstreamIds).toContain('nutrient_runaway');
    expect(downstreamIds).toContain('canopy_dieback');
  });

  it('evaluates metrics to dormant when conditions are normal', () => {
    const graph = new HazardDependencyGraph('ecosystem', sampleNodes, sampleLinks);
    const normalMetrics = { moisture: 50, nutrients: 40, biomass: 75 };
    const result = graph.evaluate(normalMetrics, 10);

    expect(result.worldId).toBe('ecosystem');
    expect(result.tick).toBe(10);
    expect(result.activeHazards).toHaveLength(0);
    expect(result.hazardLevel).toBe(0);
    expect(result.unmitigatedCascadeActive).toBe(false);
    expect(result.recommendedMitigations).toHaveLength(0);
  });

  it('evaluates active hazards with accurate trigger descriptions and severity', () => {
    const graph = new HazardDependencyGraph('ecosystem', sampleNodes, sampleLinks);
    // Drought active (moisture < 30) and nutrient runaway active (nutrients > 80)
    const stressedMetrics = { moisture: 22.5, nutrients: 88.0, biomass: 55 };
    const result = graph.evaluate(stressedMetrics, 25);

    expect(result.activeHazards).toHaveLength(2);
    const drought = result.activeHazards.find((h) => h.nodeId === 'drought');
    expect(drought).toBeDefined();
    expect(drought?.status).toBe('active');
    expect(drought?.observedTrigger).toBe('moisture (22.50) dropped below 30');
    expect(drought?.hypothesizedExplanation).toBe(
      'Prolonged lack of precipitation leading to dry soil bed',
    );

    const nutrient = result.activeHazards.find((h) => h.nodeId === 'nutrient_runaway');
    expect(nutrient).toBeDefined();
    expect(nutrient?.severity).toBe('critical');
    expect(nutrient?.upstreamCauses).toContain('drought');

    expect(result.hazardLevel).toBeGreaterThan(0);
    expect(result.unmitigatedCascadeActive).toBe(true);
    expect(result.recommendedMitigations).toContain('ecosystem.action.habitat_corridors');
    expect(result.recommendedMitigations).toContain('ecosystem.action.nutrient_balancing');
  });

  it('marks mitigated hazards when explicit mitigation set is supplied', () => {
    const graph = new HazardDependencyGraph('ecosystem', sampleNodes, sampleLinks);
    const stressedMetrics = { moisture: 20, nutrients: 90, biomass: 15 };
    const mitigatedSet = new Set(['drought', 'nutrient_runaway']);

    const result = graph.evaluate(stressedMetrics, 30, mitigatedSet);
    const drought = result.allHazards.find((h) => h.nodeId === 'drought');
    const nutrient = result.allHazards.find((h) => h.nodeId === 'nutrient_runaway');
    const dieback = result.allHazards.find((h) => h.nodeId === 'canopy_dieback');

    expect(drought?.status).toBe('mitigated');
    expect(nutrient?.status).toBe('mitigated');
    expect(dieback?.status).toBe('active');
    expect(result.activeHazards).toHaveLength(1);
    expect(result.activeHazards[0].nodeId).toBe('canopy_dieback');
  });
});

describe('ScientificBudgetLedger (P003)', () => {
  it('initializes finite non-negative balances capped at capacity', () => {
    const ledger = new ScientificBudgetLedger('ecosystem', {
      supplies: { balance: 50, capacity: 100, replenishmentRate: 1 },
      energy: { balance: 150, capacity: 100 }, // Balance exceeds capacity -> capped at capacity
      water: { balance: -20, capacity: 50 }, // Negative balance -> clamped to 0
    });

    expect(ledger.getBalance('supplies')).toBe(50);
    expect(ledger.getBalance('energy')).toBe(100);
    expect(ledger.getBalance('water')).toBe(0);
    expect(ledger.getCapacity('supplies')).toBe(100);
  });

  it('previews debit feasibility without mutating state', () => {
    const ledger = new ScientificBudgetLedger('station', {
      scrubbers: { balance: 5, capacity: 10 },
      power: { balance: 20, capacity: 50 },
    });

    // Feasible debit
    const preview1 = ledger.previewDebit([
      { resource: 'scrubbers', amount: 2 },
      { resource: 'power', amount: 10 },
    ]);
    expect(preview1.feasible).toBe(true);
    expect(preview1.shortfalls).toHaveLength(0);
    expect(preview1.remainingBalances['scrubbers']).toBe(3);
    expect(preview1.remainingBalances['power']).toBe(10);
    // Original balance must NOT change
    expect(ledger.getBalance('scrubbers')).toBe(5);

    // Infeasible debit (shortfall on scrubbers)
    const preview2 = ledger.previewDebit([
      { resource: 'scrubbers', amount: 10 },
      { resource: 'power', amount: 5 },
    ]);
    expect(preview2.feasible).toBe(false);
    expect(preview2.shortfalls).toHaveLength(1);
    expect(preview2.shortfalls[0].resource).toBe('scrubbers');
    expect(preview2.shortfalls[0].required).toBe(10);
    expect(preview2.shortfalls[0].available).toBe(5);
  });

  it('rejects negative debits to prevent minting phantom funds', () => {
    const ledger = new ScientificBudgetLedger('station', {
      power: { balance: 10, capacity: 50 },
    });
    const preview = ledger.previewDebit([{ resource: 'power', amount: -5 }]);
    expect(preview.feasible).toBe(false);
  });

  it('applies transactions atomically and preserves balance on rejection', () => {
    const ledger = new ScientificBudgetLedger('civilization', {
      grain: { balance: 30, capacity: 100 },
      cistern: { balance: 15, capacity: 50 },
    });

    // Success transaction
    const tx1 = ledger.applyTransaction(
      'civ-rationing',
      [
        { resource: 'grain', amount: 10 },
        { resource: 'cistern', amount: 5 },
      ],
      [{ resource: 'grain', amount: 2, source: 'gleaning' }],
      10,
    );
    expect(tx1.status).toBe('applied');
    expect(tx1.balancesAfter['grain']).toBe(22); // 30 - 10 + 2
    expect(tx1.balancesAfter['cistern']).toBe(10); // 15 - 5
    expect(ledger.getBalance('grain')).toBe(22);
    expect(ledger.getBalance('cistern')).toBe(10);

    // Failing transaction (cistern needs 25, only 10 available)
    const tx2 = ledger.applyTransaction(
      'civ-large-canal',
      [
        { resource: 'grain', amount: 5 },
        { resource: 'cistern', amount: 25 },
      ],
      [],
      15,
    );
    expect(tx2.status).toBe('rejected');
    expect(tx2.rejectionReason).toContain('cistern');
    // Atomic rollback: grain must NOT have been debited!
    expect(ledger.getBalance('grain')).toBe(22);
    expect(ledger.getBalance('cistern')).toBe(10);
  });

  it('replenishes balances up to capacity over elapsed ticks', () => {
    const ledger = new ScientificBudgetLedger(
      'ocean',
      {
        power: { balance: 10, capacity: 50, replenishmentRate: 2 },
      },
      5,
    );

    ledger.replenish(10); // 5 ticks elapsed * 2 per tick = +10
    expect(ledger.getBalance('power')).toBe(20);

    ledger.replenish(50); // 40 ticks * 2 = +80 -> capped at 50 capacity
    expect(ledger.getBalance('power')).toBe(50);
  });

  it('clones and serializes deterministically', () => {
    const original = new ScientificBudgetLedger(
      'geology',
      {
        sensors: { balance: 8, capacity: 20, replenishmentRate: 0.5 },
        reinforcement: { balance: 15, capacity: 30 },
      },
      12,
    );

    const clone = original.clone();
    expect(clone.getAllBalances()).toEqual(original.getAllBalances());

    // Mutating clone does not mutate original
    clone.applyTransaction('test-action', [{ resource: 'sensors', amount: 3 }], [], 13);
    expect(clone.getBalance('sensors')).toBe(5);
    expect(original.getBalance('sensors')).toBe(8);

    // Serialization and deserialization
    const serialized = original.serialize();
    const restored = ScientificBudgetLedger.deserialize(serialized);
    expect(restored.getAllBalances()).toEqual(original.getAllBalances());
    expect(restored.worldId).toBe('geology');
  });
});
