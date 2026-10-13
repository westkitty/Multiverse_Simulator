import {describe,expect,it} from 'vitest';
import {SimulationKernel} from '../core/kernel';
import {CORE_WORLD_PLUGINS, civilizationPlugin} from '../worlds';

describe('Civilization full-housing stability revision and legacy Atlas replay',()=>{
  it('opts only new Civilization runs into v2, preserving v1 for existing worlds',()=>{
    expect((civilizationPlugin.defaultConfig as any).atlasVersion).toBe(2);
    for(const scenario of civilizationPlugin.scenarios)
      expect((scenario.config as any).atlasVersion).toBe(2);
    const accepted=(revision:number)=>civilizationPlugin.validateConfig({
      ...civilizationPlugin.defaultConfig,atlasVersion:revision,
    });
    expect(accepted(1).valid).toBe(true);
    expect(accepted(2).valid).toBe(true);
    expect(accepted(3).valid).toBe(false);
    for(const world of CORE_WORLD_PLUGINS.filter(world=>world.id!=='civilization')){
      expect((world.defaultConfig as any).atlasVersion,world.id).toBe(1);
      expect(world.validateConfig({...world.defaultConfig,atlasVersion:2}).valid,world.id).toBe(false);
    }
  });

  it('does not penalize adequately housed full-capacity settlements in v2 or rewrite v1 history',()=>{
    const opts={runId:'civilization-housing-policy',name:'paired housing contract',
      plugin:civilizationPlugin,seed:2026};
    const v1=new SimulationKernel({...opts,config:{...civilizationPlugin.defaultConfig,atlasVersion:1}});
    const v2=new SimulationKernel({...opts,config:{...civilizationPlugin.defaultConfig,atlasVersion:2}});
    expect(v1.getStateHash()).toBe(v2.getStateHash());
    for(let tick=0;tick<350;tick++){v1.step();v2.step();}
    const old=v1.getState().settlements as any[];
    const newer=v2.getState().settlements as any[];
    const mean=(arr:any[])=>arr.reduce((sum,n)=>sum+n.stabilityIndex,0)/arr.length;
    expect(old.length).toBe(newer.length);
    expect(old.some(n=>n.population===n.housingCapacity)).toBe(true);
    expect(newer.some(n=>n.population===n.housingCapacity)).toBe(true);
    // An adequately housed settlement at exactly its capacity must not suffer
    // artificial ongoing social collapse. Real shortages/over-capacity still apply.
    expect(mean(newer)).toBeGreaterThan(mean(old)+10);
    for(const source of [v1,v2]){
      const restored=SimulationKernel.fromRunRecord(source.exportRunRecord(),civilizationPlugin);
      expect(restored.getStateHash()).toBe(source.getStateHash());
      for(let tick=0;tick<5;tick++){source.step();restored.step();}
      expect(restored.getStateHash()).toBe(source.getStateHash());
    }
  });
});
