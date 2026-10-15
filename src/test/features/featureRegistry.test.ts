import { describe, expect, it } from 'vitest';
import {
  isFeatureId,
  WorldFeatureModule,
} from '../../features/contracts';
import {
  getRulesVersion,
  isOmniverseIIIRules,
  LEGACY_RULES_VERSION,
  OMNIVERSE_III_RULES_VERSION,
} from '../../features/featureVersions';
import {
  createBaseVisibleState,
  isSiteDisclosed,
  projectDisclosedEntities,
} from '../../features/projections';
import {
  createSyntheticTestModule,
  FeatureModuleRegistry,
} from '../../features/registry';
import { SeededRng } from '../../core/rng';
import coverageData from '../../../docs/omniverse-iii/COVERAGE_EVIDENCE.json';

describe('Omniverse III Feature Registry & Seam Architecture (Gate G0 Checkpoint A)', () => {
  it('registers a valid feature module and retrieves capabilities', () => {
    const registry = new FeatureModuleRegistry();
    const testModule = createSyntheticTestModule('test-world', 1);

    expect(registry.has('test-world', 1)).toBe(false);
    registry.register(testModule);
    expect(registry.has('test-world', 1)).toBe(true);

    const retrieved = registry.get('test-world', 1);
    expect(retrieved).toBeDefined();
    expect(retrieved?.worldId).toBe('test-world');
    expect(retrieved?.rulesVersion).toBe(1);

    const caps = registry.getCapabilities('test-world', 1);
    expect(caps).toHaveLength(1);
    expect(caps[0].id).toBe('synthetic.test_action');
    expect(caps[0].featureId).toBe('P001');
  });

  it('rejects duplicate module registration for the same world and rulesVersion', () => {
    const registry = new FeatureModuleRegistry();
    const mod1 = createSyntheticTestModule('dupe-world', 1);
    const mod2 = createSyntheticTestModule('dupe-world', 1);

    registry.register(mod1);
    expect(() => registry.register(mod2)).toThrow(/duplicate module registration/i);
  });

  it('rejects modules with invalid worldId or rulesVersion < 1', () => {
    const registry = new FeatureModuleRegistry();
    const badWorld = createSyntheticTestModule('', 1);
    expect(() => registry.register(badWorld)).toThrow(/invalid worldId/i);

    const badRules = createSyntheticTestModule('valid-world', 0);
    expect(() => registry.register(badRules)).toThrow(/invalid rulesVersion/i);
  });

  it('rejects modules with duplicate capability IDs or invalid feature IDs', () => {
    const registry = new FeatureModuleRegistry();
    const badCapsModule: WorldFeatureModule = {
      worldId: 'bad-caps-world',
      rulesVersion: 1,
      capabilities: [
        {
          id: 'action.duplicate',
          featureId: 'P001',
          name: 'Action 1',
          description: 'Desc',
          minRulesVersion: 1,
        },
        {
          id: 'action.duplicate',
          featureId: 'P002',
          name: 'Action 2',
          description: 'Desc',
          minRulesVersion: 1,
        },
      ],
      validateAction: () => ({ valid: false }),
      applyAction: () => ({
        actionId: 'none',
        worldId: 'bad-caps-world',
        tick: 0,
        executedAtTick: 0,
        status: 'rejected',
        eventsEmitted: [],
      }),
      projectVisibleState: () => createBaseVisibleState('bad-caps-world', 1, []),
    };

    expect(() => registry.register(badCapsModule)).toThrow(/duplicate capability id/i);

    const invalidFeatureIdModule: WorldFeatureModule = {
      worldId: 'invalid-p-world',
      rulesVersion: 1,
      capabilities: [
        {
          id: 'action.invalid',
          featureId: 'P999' as any,
          name: 'Invalid P',
          description: 'Desc',
          minRulesVersion: 1,
        },
      ],
      validateAction: () => ({ valid: false }),
      applyAction: () => ({
        actionId: 'none',
        worldId: 'invalid-p-world',
        tick: 0,
        executedAtTick: 0,
        status: 'rejected',
        eventsEmitted: [],
      }),
      projectVisibleState: () => createBaseVisibleState('invalid-p-world', 1, []),
    };

    expect(() => registry.register(invalidFeatureIdModule)).toThrow(/invalid featureId/i);
  });

  it('verifies synthetic test fixture validates actions and emits causal receipts with atomic balance checks', () => {
    const module = createSyntheticTestModule('seam-test', 1);
    const state = { counter: 0, energy: 10 };

    // Negative: malformed payload
    const resMalformed = module.validateAction(null, state);
    expect(resMalformed.valid).toBe(false);

    // Negative: insufficient energy
    const resTooExpensive = module.validateAction(
      { type: 'synthetic.test_action', amount: 50 },
      state,
    );
    expect(resTooExpensive.valid).toBe(false);
    expect(resTooExpensive.error).toMatch(/insufficient energy/i);

    // Positive: valid action
    const resValid = module.validateAction(
      { type: 'synthetic.test_action', amount: 4 },
      state,
    );
    expect(resValid.valid).toBe(true);
    expect(resValid.action).toBeDefined();

    const emittedEvents: any[] = [];
    const mockCtx = {
      runId: 'test-run',
      tick: 42,
      config: { testForcing: 1 },
      rng: new SeededRng(12345),
      emitEvent: (input: any) => {
        const evt = { id: `evt-${emittedEvents.length + 1}`, ...input };
        emittedEvents.push(evt);
        return evt;
      },
    };

    const receipt = module.applyAction(state, resValid.action!, mockCtx as any);
    expect(receipt.status).toBe('success');
    expect(receipt.debits).toEqual([{ resource: 'energy', amount: 4 }]);
    expect(state.energy).toBe(6);
    expect(state.counter).toBe(1);
    expect(receipt.eventsEmitted).toHaveLength(1);
    expect(emittedEvents[0].deltas[0].before).toBe(10);
    expect(emittedEvents[0].deltas[0].after).toBe(6);
  });

  it('strictly enforces legacy rules version boundaries (rulesVersion=0 has no feature actions)', () => {
    expect(isOmniverseIIIRules({})).toBe(false);
    expect(isOmniverseIIIRules({ worldRulesVersion: 0 })).toBe(false);
    expect(isOmniverseIIIRules({ worldRulesVersion: 1 })).toBe(true);
    expect(isOmniverseIIIRules({ rulesVersion: 1 })).toBe(true);

    expect(getRulesVersion({})).toBe(LEGACY_RULES_VERSION);
    expect(getRulesVersion({ worldRulesVersion: 0 })).toBe(LEGACY_RULES_VERSION);
    expect(getRulesVersion({ worldRulesVersion: 1 })).toBe(OMNIVERSE_III_RULES_VERSION);
    expect(getRulesVersion({ worldRulesVersion: -5 })).toBe(LEGACY_RULES_VERSION);
  });

  it('respects disclosure boundaries during read-only entity and state projection', () => {
    const disclosureContext = {
      worldId: 'test-world',
      siteDisclosures: {
        'site-alpha': 'UNKNOWN' as const,
        'site-beta': 'DETECTED' as const,
        'site-gamma': 'SURVEYED' as const,
        'site-delta': 'VISITED' as const,
      },
    };

    expect(isSiteDisclosed('site-alpha', disclosureContext, 'DETECTED')).toBe(false);
    expect(isSiteDisclosed('site-beta', disclosureContext, 'DETECTED')).toBe(true);
    expect(isSiteDisclosed('site-beta', disclosureContext, 'SURVEYED')).toBe(false);
    expect(isSiteDisclosed('site-gamma', disclosureContext, 'SURVEYED')).toBe(true);
    expect(isSiteDisclosed('site-delta', disclosureContext, 'VISITED')).toBe(true);

    const entities = [
      { id: 'ent-1', siteId: 'site-alpha', label: 'Secret Facility', status: 'critical', readings: { radiation: 90 } },
      { id: 'ent-2', siteId: 'site-gamma', label: 'Surveyed Station', status: 'nominal', readings: { radiation: 10 } },
    ];

    const projections = projectDisclosedEntities(entities, disclosureContext);
    expect(projections).toHaveLength(2);

    // site-alpha is UNKNOWN: label redacted, readings hidden
    expect(projections[0].disclosed).toBe(false);
    expect(projections[0].label).toContain('Unidentified');
    expect(projections[0].readings).toEqual({});

    // site-gamma is SURVEYED: full label and readings disclosed
    expect(projections[1].disclosed).toBe(true);
    expect(projections[1].label).toBe('Surveyed Station');
    expect(projections[1].readings).toEqual({ radiation: 10 });
  });

  it('validates the stable 15-world, 20-feature, 300-cell coverage schema in COVERAGE_EVIDENCE.json', () => {
    expect(coverageData.artifactKind).toBe('OMNIVERSE_III_COVERAGE_EVIDENCE');
    expect(coverageData.worldCount).toBe(15);
    expect(coverageData.featureCount).toBe(20);
    expect(coverageData.totalCells).toBe(300);

    const expectedWorlds = [
      'ecosystem',
      'station',
      'civilization',
      'atmosphere',
      'ocean',
      'celestial',
      'megacity',
      'industrial',
      'geology',
      'wild-meridian',
      'hollow-deep',
      'timeworn-empire',
      'terraforming-frontier',
      'machine-wilderness',
      'signal-expanse',
    ];

    expect(Object.keys(coverageData.cells).sort()).toEqual(expectedWorlds.sort());

    let count = 0;
    for (const worldId of expectedWorlds) {
      const worldCells = (coverageData.cells as any)[worldId];
      expect(worldCells).toBeDefined();
      expect(Object.keys(worldCells)).toHaveLength(20);

      for (let i = 1; i <= 20; i++) {
        const featId = `P${String(i).padStart(3, '0')}`;
        expect(isFeatureId(featId)).toBe(true);
        const cell = worldCells[featId];
        expect(cell).toBeDefined();
        expect(cell.status).toBe('PLANNED');
        count++;
      }
    }
    expect(count).toBe(300);
  });
});
