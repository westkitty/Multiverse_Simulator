import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AtlasView } from '../ui/views/AtlasView';
import { useMultiverseStore } from '../store/multiverseStore';
import { SimulationKernel } from '../core/kernel';
import { CORE_WORLD_PLUGINS } from '../worlds';
vi.mock('../renderers/ThreeWorldViewport',()=>({ThreeWorldViewport:()=> <div>Viewport fixture</div>}));
const original=useMultiverseStore.getState();
afterEach(()=>{cleanup();useMultiverseStore.setState(original,true);vi.restoreAllMocks();});
it('memoizes the world frame for filter/message changes, reports failed resupply, and resets inspection on run switch',()=>{
  const a=new SimulationKernel({runId:'a',name:'a',plugin:CORE_WORLD_PLUGINS[0],seed:1});
  const b=new SimulationKernel({runId:'b',name:'b',plugin:CORE_WORLD_PLUGINS[9],seed:1});
  useMultiverseStore.setState({runs:{a,b},activeRunId:'a',isRunning:false});
  const extract=vi.spyOn(a,'extractRenderFrame');const dispatch=vi.spyOn(useMultiverseStore.getState(),'dispatchCommand');
  render(<AtlasView/>);
  expect(extract).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Region filter'),{target:{value:a.getState().regions[1].id}});
  expect(extract).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Resupply from local stocks'}));
  expect(screen.getByRole('status')).toHaveTextContent('Visit a local site before resupplying');
  expect(dispatch).not.toHaveBeenCalled();
  expect(extract).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Survey'}));
  expect(extract).toHaveBeenCalledTimes(2);
  // Actual store notification, not a remount performed by the test.
  act(()=>useMultiverseStore.getState().selectRun('b'));
  expect(screen.getByLabelText('Region filter')).toHaveValue('all');
  expect(screen.getByRole('status')).not.toHaveTextContent('accepted');
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent(b.plugin.name);
});

it('does not offer departure when a discovered destination is already unsafe',()=>{
 const k=new SimulationKernel({runId:'unsafe',name:'unsafe',plugin:CORE_WORLD_PLUGINS[0],seed:1});
 const s=k.getState(),id=s.atlas.sites[0].facts.id;
 s.exploration.sites[id].discoveryState='DISCOVERED';s.exploration.sites[id].hazard=71;
 useMultiverseStore.setState({runs:{unsafe:k},activeRunId:'unsafe',isRunning:false});
 render(<AtlasView/>);
 expect(screen.getByRole('button',{name:'Travel'})).toBeDisabled();
 expect(screen.getByRole('region',{name:'Departure briefing'})).toHaveTextContent('safe-access limit of 70');
});
