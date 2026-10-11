// Test-only pre-uplift view fixture for matched frame-extraction measurement. Not imported by the application.
import { curiosityLeads } from '../../src/exploration/leads';
import React, { useState } from 'react';
import { useMultiverseStore } from '../../src/store/multiverseStore';
import { isFrontierState } from '../../src/worlds/frontiers/frontierPlugin';
import { applyExplorationCommand, ExplorationCommand, planRoute, presentSite, surveyCoverage } from '../../src/exploration/engine';
import { ThreeWorldViewport } from '../../src/renderers/ThreeWorldViewport';

const panel: React.CSSProperties = { background: '#0b1220', border: '1px solid #334155', borderRadius: 10, padding: 16, minWidth: 0 };
const button: React.CSSProperties = { padding: '9px 12px', background: '#173146', color: '#e2e8f0', border: '1px solid #52768f', borderRadius: 6, cursor: 'pointer' };
export const AtlasView: React.FC = () => {
  const store = useMultiverseStore();
  const kernel = store.runs[store.activeRunId];
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [filterRegion, setFilterRegion] = useState('all');
  const state = kernel?.getState();
  if (!kernel || !isFrontierState(state)) return <section style={panel}><h1>World Atlas</h1><p>This saved run predates the Atlas. Its original simulation remains available in the Observatory. Create a new run to use expanded territory, sites and expedition history.</p><button style={button} onClick={() => store.setActiveTab('library')}>Open World Library</button></section>;
  const { atlas, exploration } = state;
  const chosen = atlas.sites.find(s => s.facts.id === selected) ?? atlas.sites.find(s => exploration.sites[s.facts.id].discoveryState !== 'UNKNOWN') ?? atlas.sites[0];
  const siteId = chosen.facts.id, delta = exploration.sites[siteId], view = presentSite(atlas, exploration, siteId);
  const expedition = exploration.expedition;
  const known = atlas.sites.filter(s => exploration.sites[s.facts.id].discoveryState !== 'UNKNOWN');
  const covered=surveyCoverage(atlas,exploration);
  const contacts = atlas.sites.filter(s=>covered.has(s.facts.regionId));
  const leads = curiosityLeads(atlas,exploration,kernel.tick);
  const action = (kind: ExplorationCommand['action'], resourceId?: string) => {
    try {
      const payload: ExplorationCommand = { action: kind, siteId, ...(resourceId ? { resourceId } : {}) };
      applyExplorationCommand(atlas, exploration, payload, { tick: kernel.tick, branchId: kernel.runId });
      store.dispatchCommand('exploration.action', `Expedition: ${kind}`, payload);
      setMessage(`${kind} accepted at tick ${kernel.tick}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  let route = '';
  try { const p = planRoute(atlas, expedition.regionId, chosen.facts.regionId, 70, expedition.fuel, exploration); route = `${Math.max(1,p.ticks)} ticks · ${p.fuel} fuel · ${p.routeIds.length} passages`; }
  catch (error) { route = error instanceof Error ? error.message : String(error); }
  return <section aria-label="Living World Atlas" style={{ display: 'grid', gap: 16 }}>
    <header style={panel}>
      <div style={{ color: kernel.plugin.accentColor, letterSpacing: 2, fontSize: 12 }}>OMNIVERSE II · REGION / SITE EXPLORER</div>
      <h1 style={{ margin: '10px 0' }}>{kernel.plugin.name}</h1>
      <p>{state.regions.length} active regions · {known.length}/{atlas.sites.length} detected sites · {Object.values(exploration.sites).filter(d => d.firstVisitedTick !== null).length} visited · Tick {kernel.tick}</p>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        <button style={button} onClick={() => store.toggleRunning()}>{store.isRunning ? 'Pause atlas simulation' : 'Run atlas simulation'}</button>
        <button style={button} onClick={() => store.stepActiveRun(1)}>Advance atlas one tick</button>
        <button style={button} onClick={() => store.setActiveTab('timeline')}>History & branches</button>
        <button style={button} onClick={() => store.setActiveTab('vault')}>Save / export</button>
        <button style={button} onClick={() => store.setActiveTab('observatory')}>Scientific Observatory</button>
      </div>
      <p>Expedition: {expedition.regionId} · Fuel {expedition.fuel.toFixed(1)} · Supplies {expedition.supplies.toFixed(1)} {expedition.journey ? `· En route until tick ${expedition.journey.arrivalTick}` : '· At rest'}</p>
      <p role="status" aria-live="polite">{message}</p>
    </header>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap:16 }}>
      <div style={panel}>
        <h2>Region explorer</h2><p>Instrument detection covers four open links. Names and history remain hidden until discovery and a visit.</p>
        <ThreeWorldViewport frame={kernel.extractRenderFrame()} selectedEntityId={siteId} onSelectEntity={id => { if (id && atlas.sites.some(s => s.facts.id === id)) setSelected(id); }} reducedMotion={store.preferences.reducedMotion} simplifiedMode={store.preferences.simplified3D} />
        <label>Region filter <select style={button} value={filterRegion} onChange={e => setFilterRegion(e.target.value)}><option value="all">All surveyed contacts</option>{state.regions.map(r => <option key={r.id} value={r.id}>{r.id} · {r.biome}</option>)}</select></label>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:12 }}>
          {atlas.sites.filter(s => (known.includes(s) || contacts.includes(s)) && (filterRegion === 'all' || filterRegion === s.facts.regionId)).map(s => {
            const v = presentSite(atlas, exploration, s.facts.id);
            return <button style={button} key={s.facts.id} aria-pressed={s.facts.id === siteId} onClick={() => setSelected(s.facts.id)}>{v?.label ?? 'Unsurveyed location'} · {s.facts.regionId} · {exploration.sites[s.facts.id].discoveryState}</button>;
          })}
        </div>
      </div>
      <section style={panel} aria-label="Site investigation inspector">
        <h2>{view?.label ?? 'Unknown location'}</h2><p>{view?.description ?? 'Survey nearby territory to detect this contact.'}</p>
        <p>{delta.discoveryState} · Region {chosen.facts.regionId}</p>
        {view && view.condition !== null && <p>Condition {delta.condition.toFixed(1)}% · Hazard {delta.hazard.toFixed(1)}%</p>}
        <p>Route preview: {route}</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {(['detect','survey','discover','travel','investigate','repair','resolve','operate'] as const).map(kind => <button key={kind} style={button} disabled={!!expedition.journey} onClick={() => action(kind)}>{kind[0].toUpperCase() + kind.slice(1)}</button>)}
          <button style={button} disabled={!!expedition.journey} onClick={() => action('recover','salvage')}>Recover salvage</button>
          <button style={button} onClick={() => store.dispatchCommand('expedition.resupply','Resupply expedition',{})}>Resupply from local stocks</button>
        </div>
        <p>Facility function: {view?.history ? ['Supply camp: transfer stocks','Sensor: survey adjacent regions','Salvage ruin: recover two units','Refuge: replenish supplies','Extraction: convert finite reserve to salvage','Crossing: reopen a blocked route','Workshop: repair using local salvage','Processor: use fuel for local engineering','Archive: recover historical records','Relay: detect contacts two links away','Containment: reduce local hazard','Generator: convert two supplies to one fuel'][Number(chosen.facts.extensions.structureRole)] : 'Visit to inspect the installation’s function.'}</p>
        <p>Survey/investigation cost 1 supply; repair costs 2. Travel uses the route budget above. Rejected actions spend nothing.</p>
        {view?.history && <><h3>Generated historical record</h3><p>{view.history.origin}</p><p>{view.history.formationEpoch} · generated history, not an observed event.</p></>}
        {view && ['VISITED','INVESTIGATED','RESOLVED'].includes(delta.discoveryState) && <>
          <h3>Current readings</h3><dl>{Object.entries(delta.readings).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value.toFixed(3)}</dd></div>)}</dl>
          <h3>Inventory & evidence</h3><p>{Object.entries(delta.resources).map(([key,value]) => `${key}: ${value.toFixed(1)}`).join(' · ')}</p>
          <ul>{view.evidence.map(e => <li key={e.evidenceId}>OBSERVED · {e.evidenceId}: {e.value.toFixed(3)} {e.unit} · tick {e.tick} · {e.branchId}</li>)}</ul>
          <h3>Unanswered question</h3><p>{String(chosen.facts.extensions.evidenceQuestion ?? 'What conditions account for this site’s current state?')}</p>
        </>}
      </section>
    </div>
    <section style={panel} aria-label="Live investigation leads"><h2>Investigate next</h2><p>Branch-local hypotheses use surveyed conditions and timestamped evidence. Leads expire 48 ticks after the latest observation; resolved sites are removed. These are questions, not established causes.</p>
      {leads.length ? leads.map(lead => <article key={lead.siteId}><button style={button} onClick={() => setSelected(lead.siteId)}>{presentSite(atlas,exploration,lead.siteId)!.label}: {lead.reason}</button><p>{lead.hypothesis} · {lead.confidence} · expires tick {lead.expiresAt}</p></article>) : <p>No fresh qualifying signals. Survey nearby regions for new leads.</p>}
    </section>
    <section style={panel}><h2>Discovery journal</h2><p>Recent 128 actions; collected evidence persists across compaction. Stored branches do not advance automatically.</p><ol>{exploration.journal.slice(-20).reverse().map(e => <li key={e.id}>Tick {e.tick} · {e.branchId} · {e.action} · {presentSite(atlas,exploration,e.siteId)?.label ?? 'Unidentified site'}</li>)}</ol></section>
  </section>;
};
