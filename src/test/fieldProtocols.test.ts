import { describe, expect, it } from 'vitest';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { SimulationKernel } from '../core/kernel';
import { isFrontierState } from '../worlds/frontiers/frontierPlugin';
import { FIELD_PROTOCOLS, fieldProtocolStatus } from '../exploration/fieldProtocols';

describe('authored field protocols', () => {
  it('covers all fifteen worlds with distinct questions and actual simulation-native proof contracts', () => {
    expect(CORE_WORLD_PLUGINS).toHaveLength(15);
    expect(Object.keys(FIELD_PROTOCOLS).sort()).toEqual(CORE_WORLD_PLUGINS.map(plugin => plugin.id).sort());
    expect(new Set(Object.values(FIELD_PROTOCOLS).map(protocol => protocol.title)).size).toBe(15);
    expect(new Set(Object.values(FIELD_PROTOCOLS).map(protocol => protocol.question)).size).toBe(15);
    expect(new Set(Object.values(FIELD_PROTOCOLS).map(protocol => protocol.proof)).size).toBeGreaterThanOrEqual(6);
    for (const plugin of CORE_WORLD_PLUGINS) {
      const kernel = new SimulationKernel({ runId: 'field-protocol', name: 'read-only projection', plugin, seed: plugin.scenarios[0].seed, config: plugin.scenarios[0].config });
      const state = kernel.getState();
      expect(isFrontierState(state)).toBe(true);
      if (!isFrontierState(state)) return;
      const before = kernel.getStateHash();
      const status = fieldProtocolStatus(state.atlas, state.exploration);
      expect(status?.evidenceCount, plugin.id).toBe(0);
      expect(status?.complete, plugin.id).toBe(false);
      expect(status?.stages, plugin.id).toHaveLength(3);
      expect(status?.stages.every(stage => stage.collected === false), plugin.id).toBe(true);
      expect(kernel.getStateHash(), plugin.id).toBe(before);
    }
  });

  it('does not leak unknown destination identity and requires actual evidence plus action proof', () => {
    const plugin = CORE_WORLD_PLUGINS.find(candidate => candidate.id === 'station')!;
    const kernel = new SimulationKernel({ runId:'sealed', name:'secrecy', plugin, seed:plugin.scenarios[0].seed, config:plugin.scenarios[0].config });
    const state = kernel.getState();
      expect(isFrontierState(state)).toBe(true);
      if (!isFrontierState(state)) return;
    const status = fieldProtocolStatus(state.atlas, state.exploration)!;
    expect(status.nextKnown).toBe(true);
    expect(status.stages[1].label).toBe('Unlocated contact');
    expect(status.stages[2].label).toBe('Unlocated contact');
    expect(status.stages[1].sample).toBeNull();
    expect(status.complete).toBe(false);
    // The UI must not mistake three raw stage labels for completed evidence.
    const tampered = structuredClone(state.exploration);
    tampered.sites[status.stages[0].siteId].discoveryState = 'RESOLVED';
    expect(fieldProtocolStatus(state.atlas, tampered)?.evidenceCount).toBe(0);
  });

  it('reports actual completed observations without overwriting simulation state', () => {
    const plugin = CORE_WORLD_PLUGINS.find(candidate => candidate.id === 'atmosphere')!;
    const kernel = new SimulationKernel({ runId:'sampled', name:'sampled', plugin, seed:plugin.scenarios[0].seed, config:plugin.scenarios[0].config });
    const state = kernel.getState();
      expect(isFrontierState(state)).toBe(true);
      if (!isFrontierState(state)) return;
    const copy = structuredClone(state.exploration);
    const protocol = fieldProtocolStatus(state.atlas, copy)!;
    const siteId = protocol.stages[0].siteId;
    copy.sites[siteId].evidence.push({ evidenceId:state.atlas.chains[0].steps[0].evidenceId,
      tick:5, branchId:'sampled', value:978.3, unit:'hPa', classification:'OBSERVED' });
    const updated = fieldProtocolStatus(state.atlas, copy)!;
    expect(updated.evidenceCount).toBe(1);
    expect(updated.stages[0].sample).toEqual({ value:978.3, unit:'hPa', tick:5, branchId:'sampled' });
    expect(updated.complete).toBe(false);
    expect(fieldProtocolStatus(state.atlas, state.exploration)?.evidenceCount).toBe(0);
  });
});
