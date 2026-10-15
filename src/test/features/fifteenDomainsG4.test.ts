import { describe, it, expect } from 'vitest';
import '../../features/domainModules';
import { globalFeatureRegistry } from '../../features/registry';

describe('Omniverse III Fifteen-World Native Actions and Instruments (Gate G4 Checkpoint B)', () => {
  const all15WorldIds = [
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
  ] as const;

  it('registers all 15 worlds in globalFeatureRegistry with rulesVersion=1', () => {
    expect(all15WorldIds.length).toBe(15);
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId);
      expect(mod).toBeDefined();
      expect(mod?.worldId).toBe(worldId);
      expect(mod?.rulesVersion).toBe(1);
    }
  });

  it('verifies all 15 universes define exactly 3 native action families (45 total)', () => {
    let totalActions = 0;
    const seenActionIds = new Set<string>();

    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId);
      expect(mod).toBeDefined();
      expect(mod?.actionRegistry).toBeDefined();

      const actions = mod!.actionRegistry!.getAllActions();
      expect(actions.length).toBe(3);

      for (const act of actions) {
        expect(seenActionIds.has(act.id)).toBe(false);
        seenActionIds.add(act.id);
        expect(act.worldId).toBe(worldId);
        expect(act.familyKey).toBeTruthy();
        expect(act.name).toBeTruthy();
        expect(act.description).toBeTruthy();
        expect(act.readSet.length).toBeGreaterThanOrEqual(1);
        expect(act.writeSet.length).toBeGreaterThanOrEqual(1);
        expect(act.resourceCosts.length).toBeGreaterThanOrEqual(1);
        expect(act.deltas.length).toBeGreaterThanOrEqual(1);
        expect(act.decisionImplication).toBeTruthy();
        expect(act.dynamicHelp).toBeTruthy();
        totalActions++;
      }
    }

    expect(totalActions).toBe(45);
    expect(seenActionIds.size).toBe(45);
  });

  function createMockContext(tick: number, events: any[] = []) {
    return {
      tick,
      emitEvent: (e: any) => {
        events.push(e);
        return { id: `evt-${tick}`, type: e.type, ...e } as any;
      },
    } as any;
  }

  it('executes positive controls for all 45 native action families across all 15 worlds', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId);
      expect(mod).toBeDefined();

      const actions = mod!.actionRegistry!.getAllActions();
      for (const act of actions) {
        // Construct state that satisfies prerequisites
        const state: Record<string, number> = {};
        if (act.prerequisites) {
          for (const req of act.prerequisites) {
            if (req.condition === '<') {
              state[req.field] = req.threshold - 10;
            } else if (req.condition === '>') {
              state[req.field] = req.threshold + 10;
            } else {
              state[req.field] = req.threshold;
            }
          }
        }
        for (const f of [...act.readSet, ...act.writeSet]) {
          if (!(f in state)) state[f] = 50;
        }

        // Top up budget so cost is feasible
        for (const cost of act.resourceCosts) {
          mod!.budgetLedger?.applyTransaction(
            'test-topup',
            [],
            [{ resource: cost.resource, amount: cost.amount * 5, source: 'test-seed' }],
            0,
          );
        }

        const events: any[] = [];
        const receipt = mod!.applyAction(
          state,
          {
            actionFamily: 'P001',
            worldId,
            capabilityId: act.id,
            payload: {},
          },
          createMockContext(10, events),
        );

        expect(receipt.status).toBe('success');
        expect(receipt.deltas?.length).toBe(act.deltas.length);
        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(receipt.debits?.length).toBe(act.resourceCosts.length);
      }
    }
  });

  it('enforces negative controls for all 45 native action families when prerequisites are violated', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId);
      expect(mod).toBeDefined();

      const actions = mod!.actionRegistry!.getAllActions();
      for (const act of actions) {
        if (!act.prerequisites || act.prerequisites.length === 0) continue;

        // Construct state that violates the first prerequisite
        const req = act.prerequisites[0];
        const state: Record<string, number> = {};
        if (req.condition === '<') {
          state[req.field] = req.threshold + 10; // Violates '<'
        } else if (req.condition === '>') {
          state[req.field] = req.threshold - 10; // Violates '>'
        } else {
          state[req.field] = req.threshold + 5;
        }

        const validation = mod!.validateAction(
          {
            capabilityId: act.id,
            payload: {},
          },
          state,
        );

        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('Prerequisite failed');
      }
    }
  });

  it('verifies all 15 universes define calibrated scientific instruments with 3 channels matching coverage', () => {
    let totalInstruments = 0;
    let totalChannels = 0;

    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId);
      expect(mod).toBeDefined();
      expect(mod?.instrumentManager).toBeDefined();

      const instruments = mod!.instrumentManager!.getAllInstruments();
      expect(instruments.length).toBeGreaterThanOrEqual(1);
      totalInstruments += instruments.length;

      const primary = instruments[0];
      expect(primary.worldId).toBe(worldId);
      expect(primary.name).toBeTruthy();
      expect(primary.description).toBeTruthy();
      expect(primary.channels.size).toBe(3);
      totalChannels += primary.channels.size;

      // Verify each channel has valid bounds and precision
      for (const ch of primary.channels.values()) {
        expect(ch.id).toBeTruthy();
        expect(ch.unit).toBeTruthy();
        expect(ch.maxValid).toBeGreaterThan(ch.minValid);
        expect(ch.basePrecision).toBeGreaterThan(0);
      }
    }

    expect(totalInstruments).toBe(15);
    expect(totalChannels).toBe(45);
  });

  it('samples all 3 channels on each world instrument returning calibrated observations with provenance', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId);
      expect(mod).toBeDefined();

      const inst = mod!.instrumentManager!.getAllInstruments()[0];
      expect(inst).toBeDefined();

      for (const ch of inst.channels.values()) {
        const events: any[] = [];
        const receipt = mod!.applyAction(
          { [ch.id]: 50 },
          {
            actionFamily: 'P010',
            worldId,
            capabilityId: 'instrument.sample',
            payload: {
              instrumentId: inst.id,
              channelId: ch.id,
              siteId: 'site-primary',
            },
          },
          createMockContext(5, events),
        );

        expect(receipt.status).toBe('success');
        expect(events.length).toBe(1);
        expect(events[0].type).toBe(`${worldId}.instrument_sampled`);
        expect(events[0].payload.channelId).toBe(ch.id);
        expect(events[0].payload.calibratedValue).toBeGreaterThan(0);
        expect(events[0].payload.confidence).toBeGreaterThan(0);
      }

      // Check observation history
      const recent = mod!.instrumentManager!.getRecentObservations();
      expect(recent.length).toBe(3);
      expect(recent[0].worldId).toBe(worldId);
      expect(recent[0].provenance.rulesVersion).toBe(1);
    }
  });

  it('calibrates instrument across all 15 universes restoring peak precision', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId);
      expect(mod).toBeDefined();

      const inst = mod!.instrumentManager!.getAllInstruments()[0];
      expect(inst).toBeDefined();

      const events: any[] = [];
      const receipt = mod!.applyAction(
        {},
        {
          actionFamily: 'P010',
          worldId,
          capabilityId: 'instrument.calibrate',
          payload: {
            instrumentId: inst.id,
          },
        },
        createMockContext(20, events),
      );

      expect(receipt.status).toBe('success');
      expect(events.length).toBe(1);
      expect(events[0].type).toBe(`${worldId}.instrument_calibrated`);
      expect(inst.calibrationLevel).toBe(1.0);
    }
  });

  it('projects action families, instruments, and recent observations in visible feature state across all 15 universes', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId);
      expect(mod).toBeDefined();

      const visible = mod!.projectVisibleState({}, {
        worldId,
        siteDisclosures: {},
      });

      expect(visible.worldId).toBe(worldId);
      expect(visible.rulesVersion).toBe(1);
      expect(visible.actionFamilies?.length).toBe(3);
      expect(visible.instruments?.length).toBe(1);
      expect(visible.instruments![0].channels.length).toBe(3);
      expect(visible.recentObservations).toBeDefined();
    }
  });
});
