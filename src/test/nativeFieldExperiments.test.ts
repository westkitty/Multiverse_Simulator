import { describe, expect, it } from 'vitest';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { SimulationKernel } from '../core/kernel';
import { fieldAccessStatus, fieldEmergencyRecovery, fieldInterventions, fieldTelemetry, FIELD_EMERGENCY_RECOVERY_IDS, NATIVE_FIELD_PLANS } from '../exploration/nativeFieldExperiments';

describe('native world field experiment projection', () => {
  it('selects two real command descriptors and three real numeric gauges for each world', () => {
    expect(CORE_WORLD_PLUGINS).toHaveLength(15);
    expect(Object.keys(NATIVE_FIELD_PLANS).sort()).toEqual(CORE_WORLD_PLUGINS.map(plugin => plugin.id).sort());
    for (const plugin of CORE_WORLD_PLUGINS) {
      const controls = fieldInterventions(plugin.id, plugin.quickInterventions);
      expect(controls, plugin.id).toHaveLength(2);
      expect(controls[0].commandType.startsWith('select_'), plugin.id).toBe(false);
      expect(controls[0].id, plugin.id).not.toBe(controls[1].id);
      const planned = NATIVE_FIELD_PLANS[plugin.id].metricIds;
      for (const metricId of planned) expect(plugin.metricDefinitions.some(metric => metric.id === metricId), plugin.id + ' ' + metricId).toBe(true);
      const fakeNumbers = Object.fromEntries(planned.map((id, index) => [id, index + 5]));
      const gauges = fieldTelemetry(plugin.id, plugin.metricDefinitions, fakeNumbers);
      expect(gauges.map(gauge => gauge.id), plugin.id).toEqual([...planned]);
      expect(gauges.every(gauge => gauge.delta === null), plugin.id).toBe(true);
      const compared = fieldTelemetry(plugin.id, plugin.metricDefinitions, fakeNumbers,
        Object.fromEntries(planned.map(id => [id, 1])));
      expect(compared.map(gauge => gauge.delta), plugin.id).toEqual([4, 5, 6]);
    }
  });

  it('offers only the three evidenced emergency native restoration commands, never substitutes an unknown action', () => {
    const exact = {
      industrial: 'ind-repair-all-facilities',
      megacity: 'cty-infrastructure-overhaul',
      geology: 'geo-emergency-reconstruction',
    };
    expect(FIELD_EMERGENCY_RECOVERY_IDS).toEqual(exact);
    for (const plugin of CORE_WORLD_PLUGINS) {
      const selected = fieldEmergencyRecovery(plugin.id, plugin.quickInterventions);
      if (Object.hasOwn(exact, plugin.id)) {
        expect(selected?.id, plugin.id).toBe(exact[plugin.id as keyof typeof exact]);
        expect(selected?.category).toBe('restoration');
        expect(selected?.commandType).toBeTruthy();
        expect(fieldEmergencyRecovery(plugin.id, [])).toBeNull();
        expect(fieldInterventions(plugin.id, plugin.quickInterventions)).toHaveLength(2);
      } else {
        expect(selected, plugin.id).toBeNull();
      }
    }
  });

  it('measures immutable fuel-bounded field route status against real Atlas state', () => {
    for (const worldId of Object.keys(FIELD_EMERGENCY_RECOVERY_IDS)) {
      const plugin = CORE_WORLD_PLUGINS.find(item => item.id === worldId)!;
      const kernel = new SimulationKernel({ runId:'field-emergency-'+worldId, name:'Route status', plugin, seed:1 });
      const state = kernel.getState();
      const hash = kernel.getStateHash();
      const status = fieldAccessStatus(state.atlas, state.exploration);
      expect(status.totalSites).toBe(36);
      expect(status.safelyReachableSites + status.unsafeDestinations + status.routeOrFuelBarriers).toBe(36);
      expect(status.safelyReachableSites).toBeGreaterThanOrEqual(0);
      expect(fieldAccessStatus(state.atlas, state.exploration)).toEqual(status);
      expect(kernel.getStateHash()).toBe(hash);
    }
  });

  it('does not fabricate commands or display telemetry without valid measurements', () => {
    const plugin = CORE_WORLD_PLUGINS[0];
    expect(fieldInterventions('unknown-world', plugin.quickInterventions)).toEqual([]);
    expect(fieldInterventions(plugin.id, [])).toEqual([]);
    expect(fieldTelemetry(plugin.id, plugin.metricDefinitions, {})).toEqual([]);
    expect(fieldTelemetry(plugin.id, plugin.metricDefinitions, { meanSoilNutrients: Number.NaN })).toEqual([]);
  });
});
