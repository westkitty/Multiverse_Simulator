import { describe, expect, it } from 'vitest';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { fieldInterventions, fieldTelemetry, NATIVE_FIELD_PLANS } from '../exploration/nativeFieldExperiments';

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

  it('does not fabricate commands or display telemetry without valid measurements', () => {
    const plugin = CORE_WORLD_PLUGINS[0];
    expect(fieldInterventions('unknown-world', plugin.quickInterventions)).toEqual([]);
    expect(fieldInterventions(plugin.id, [])).toEqual([]);
    expect(fieldTelemetry(plugin.id, plugin.metricDefinitions, {})).toEqual([]);
    expect(fieldTelemetry(plugin.id, plugin.metricDefinitions, { meanSoilNutrients: Number.NaN })).toEqual([]);
  });
});
