import { describe, expect, it } from 'vitest';
import { fieldBeaconState, fieldBearing, fieldWaypoints } from '../exploration/fieldWayfinding';
import type { ImmersiveLandmark } from '../exploration/immersiveLayout';
import { makeImmersiveLayout } from '../exploration/immersiveLayout';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { SimulationKernel } from '../core/kernel';
import { isFrontierState } from '../worlds/frontiers/frontierPlugin';

const point = (
  id: string, discovery: ImmersiveLandmark['discovery'],
  condition: number | null, hazard: number | null,
  x: number, z: number,
): ImmersiveLandmark => ({
  id, discovery, condition, hazard, x, z, regionId: 'region-1',
  height: 0, label: discovery === 'UNKNOWN' ? 'Unidentified contact' : 'Surveyed '+id,
  covered: true, visualSeed: 1,
});

describe('read-only visual field bearing and live site beacons', () => {
  it('never exposes unrecognized destinations, even if their fixture contains a hidden name', () => {
    const hidden = { ...point('secret', 'UNKNOWN', null, null, 0, -5), label: 'FORBIDDEN HIDDEN NAME' };
    const visible = point('known', 'DETECTED', null, null, 0, -8);
    const waypoints = fieldWaypoints([hidden, visible], { x:0, z:0 });
    expect(waypoints.map(item => item.id)).toEqual(['known']);
    expect(waypoints.some(item => item.label.includes('FORBIDDEN'))).toBe(false);
    expect(fieldBeaconState(hidden)).toBe('unidentified');
    expect(fieldBeaconState(visible)).toBe('signal');
  });

  it('prioritizes visited damaged installations, ongoing discovery, and safe sites over resolved or unsafe destinations', () => {
    const candidates = [
      point('resolved', 'RESOLVED', 100, 0, 2, 0),
      point('unknown', 'UNKNOWN', null, null, 1, 0),
      point('unsafe', 'SURVEYED', 30, 85, 3, 0),
      point('discovery', 'SURVEYED', 60, 15, 20, 0),
      point('repair', 'VISITED', 40, 15, 35, 0),
    ];
    const before=JSON.stringify(candidates);
    expect(fieldWaypoints(candidates, {x:0,z:0}).map(item=>item.id))
      .toEqual(['repair','discovery','unsafe','resolved']);
    expect(JSON.stringify(candidates)).toBe(before);
  });

  it('uses actual surveyed damage and safety, never concealed unsurveyed telemetry', () => {
    expect(fieldBeaconState(point('a','UNKNOWN',5,99,0,0))).toBe('unidentified');
    expect(fieldBeaconState(point('b','DETECTED',5,99,0,0))).toBe('signal');
    expect(fieldBeaconState(point('c','SURVEYED',10,5,0,0))).toBe('critical');
    expect(fieldBeaconState(point('d','VISITED',50,10,0,0))).toBe('service');
    expect(fieldBeaconState(point('e','INVESTIGATED',90,10,0,0))).toBe('stable');
    expect(fieldBeaconState(point('f','RESOLVED',90,10,0,0))).toBe('resolved');
    expect(fieldBeaconState(point('g','RESOLVED',90,90,0,0))).toBe('unsafe');
  });

  it('keeps compass cues aligned with the existing camera movement basis, even across yaw wrap', () => {
    const ahead=fieldBearing(0,0,0,0,-20);
    expect(ahead.direction).toBe('ahead');
    expect(ahead.arrow).toBe('↑');
    expect(ahead.distance).toBe(20);
    expect(fieldBearing(0,0,0,20,0).direction).toBe('right');
    expect(fieldBearing(0,0,0,-20,0).direction).toBe('left');
    expect(fieldBearing(0,0,0,0,20).direction).toBe('behind');
    expect(fieldBearing(0,0,0,0,-8).direction).toBe('here');
    expect(fieldBearing(0,0,Math.PI-.02,0,20).direction).toBe('ahead');
    expect(fieldBearing(0,0,-Math.PI+.02,0,20).direction).toBe('ahead');
  });

  it('projects exactly the already-recognized world sites in all fifteen existing worlds without state changes', () => {
    expect(CORE_WORLD_PLUGINS).toHaveLength(15);
    for (const plugin of CORE_WORLD_PLUGINS) {
      const scenario = plugin.scenarios[0];
      const kernel = new SimulationKernel({
        runId: 'bearing-'+plugin.id, name:'Known-site navigator proof',
        plugin, seed:scenario.seed, config:scenario.config,
      });
      const before=kernel.getStateHash();
      const state=kernel.getState();
      if (!isFrontierState(state))
        throw new Error('Expected real Atlas for '+plugin.id);
      const layout=makeImmersiveLayout(state.atlas,state.exploration,state.regions);
      const projected=fieldWaypoints(layout.points,layout.spawn);
      expect(projected.every(site=>site.discovery!=='UNKNOWN'),plugin.id).toBe(true);
      expect(projected.length,plugin.id).toBe(layout.points.filter(site=>site.discovery!=='UNKNOWN').length);
      expect(projected.length,plugin.id).toBeGreaterThan(0);
      expect(fieldWaypoints(layout.points,layout.spawn)).toEqual(projected);
      expect(kernel.getStateHash(),plugin.id).toBe(before);
    }
  });
});
