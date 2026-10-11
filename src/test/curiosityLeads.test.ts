import {it,expect} from 'vitest';
import {SimulationKernel} from '../core/kernel';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {curiosityLeads} from '../exploration/leads';
it('curiosity leads hide unknown facts, expire, and follow branch-local state without mutation',()=>{
  const k=new SimulationKernel({runId:'leads',name:'leads',plugin:CORE_WORLD_PLUGINS[0],seed:1});
  const s=k.getState(),id=s.atlas.sites[0].facts.id;
  expect(curiosityLeads(s.atlas,s.exploration,0)).toEqual([]);
  k.enqueueCommand({type:'exploration.action',label:'survey',payload:{action:'survey',siteId:id}});k.flushCurrentTickCommands();
  const before=k.getStateHash(),leads=curiosityLeads(s.atlas,s.exploration,0);
  expect(leads).toHaveLength(1);expect(leads[0].confidence).toBe('survey signal only');
  expect(k.getStateHash()).toBe(before);expect(curiosityLeads(s.atlas,s.exploration,49)).toEqual([]);
  const branch=structuredClone(s.exploration);branch.sites[id].condition=100;branch.sites[id].hazard=0;
  expect(curiosityLeads(s.atlas,branch,0)).toEqual([]);expect(curiosityLeads(s.atlas,s.exploration,0)).toEqual(leads);
});
