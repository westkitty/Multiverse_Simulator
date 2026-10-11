import { describe, expect, it } from 'vitest';
import { defaultCrossWorldRegistry } from '../core/crossWorldContract';
import { SimulationKernel } from '../core/kernel';
import { CausalEvent } from '../core/contracts';
import { CORE_WORLD_PLUGINS, industrialPlugin } from '../worlds';

describe('Atlas cross-world contracts',()=>{
  it('previews a real industrial event without mutation, preserves provenance and applies only to target branch',()=>{
    const source=new SimulationKernel({runId:'source',name:'supply source',plugin:industrialPlugin,seed:2026});
    const intervention=industrialPlugin.quickInterventions.find(i=>i.commandType==='expand_capacity') ?? industrialPlugin.quickInterventions[0];
    source.enqueueCommand({type:intervention.commandType,label:intervention.label,payload:intervention.defaultPayload});source.flushCurrentTickCommands();
    const event=source.getEvents().find(e=>e.type==='industrial_shipment_dispatched');expect(event).toBeDefined();
    const targetPlugin=CORE_WORLD_PLUGINS.find(p=>p.id==='terraforming-frontier')!;
    const target=new SimulationKernel({runId:'target',name:'target',plugin:targetPlugin,seed:2026});
    const before=target.getStateHash(),sourceBefore=source.getStateHash();
    const preview=defaultCrossWorldRegistry.previewTransfer(event!,'industrial','terraforming-frontier');
    expect(preview.compatible).toBe(true);expect(target.getStateHash()).toBe(before);expect(source.getStateHash()).toBe(sourceBefore);
    const tx=preview.translatedCommand!;
    expect(tx.provenance.sourceEventId).toBe(event!.id);
    const branch=target.forkBranch({newRunId:'supply-treatment',newName:'supply treatment'});
    branch.enqueueCommand({type:tx.type,label:tx.label,payload:tx.payload,provenance:tx.provenance});branch.flushCurrentTickCommands();
    expect(branch.getState().exploration.sites[branch.getState().atlas.sites[0].facts.id].resources.salvage).toBeGreaterThan(target.getState().exploration.sites[target.getState().atlas.sites[0].facts.id].resources.salvage);
    expect(target.getStateHash()).toBe(before);
  });
  it('rejects malformed, wrong-version and incompatible transfers for every new adapter',()=>{
    for(const adapter of defaultCrossWorldRegistry.listAdapters().slice(-3)){
      const base={id:'e',runId:'r',tick:1,type:adapter.sourceEventTypes[0],schemaVersion:1,payload:{[adapter.requiredUnits[0].sourceField]:4}} as CausalEvent;
      expect(adapter.validateSourceEvent(base).valid).toBe(true);
      for(const value of [undefined,'4',-1,NaN,Infinity])expect(adapter.validateSourceEvent({...base,payload:{[adapter.requiredUnits[0].sourceField]:value}}).valid).toBe(false);
      expect(adapter.validateSourceEvent({...base,schemaVersion:99}).valid).toBe(false);
      expect(defaultCrossWorldRegistry.previewTransfer(base,adapter.sourceWorldId,'station',adapter.id).compatible).toBe(false);
    }
  });
});
