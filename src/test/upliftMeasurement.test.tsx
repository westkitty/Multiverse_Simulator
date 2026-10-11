import {it,expect,vi} from 'vitest';
import {cleanup,render,fireEvent,screen} from '@testing-library/react';
import {writeFileSync} from 'node:fs';
import {AtlasView as Before} from '../../docs/uplift/AtlasView.before';
import {AtlasView as After} from '../ui/views/AtlasView';
import {useMultiverseStore} from '../store/multiverseStore';
import {SimulationKernel} from '../core/kernel';
import {CORE_WORLD_PLUGINS} from '../worlds';
vi.mock('../renderers/ThreeWorldViewport',()=>({ThreeWorldViewport:()=> <div>Viewport fixture</div>}));
it('matched extraction work across mount and two region-filter changes',()=>{
  const results=[];
  for(const [name,View] of [['before',Before],['after',After]] as const){
    const kernel=new SimulationKernel({runId:'measure',name:'measure',plugin:CORE_WORLD_PLUGINS[0],seed:2026});
    useMultiverseStore.setState({runs:{measure:kernel},activeRunId:'measure',isRunning:false});
    const spy=vi.spyOn(kernel,'extractRenderFrame');render(<View/>);
    const mount=spy.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Region filter'),{target:{value:kernel.getState().regions[1].id}});
    fireEvent.change(screen.getByLabelText('Region filter'),{target:{value:'all'}});
    results.push({version:name,mountExtractions:mount,totalExtractions:spy.mock.calls.length});
    expect(spy.mock.calls.length).toBe(name==='before'?3:1);cleanup();spy.mockRestore();
  }
  writeFileSync('docs/uplift/frame-measurement.json',JSON.stringify({method:'Same React Testing Library/jsdom mount + two region-filter changes; ecosystem seed 2026; viewport mocked equally in both. Actual kernel.extractRenderFrame spy, not elapsed-time or GPU profiling.',results},null,2)+'\n');
});
