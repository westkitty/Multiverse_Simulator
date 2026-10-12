import React, { useMemo, useState } from 'react';
import { departureBriefing, nearbyInvestigations } from '../../exploration/departure';
import { planRefugeRest, refugeRoster } from '../../exploration/refuge';
import { curiosityLeads } from '../../exploration/leads';
import { compareSiteRealities, siteChronicle } from '../../exploration/forensics';
import { DISCOVERY_ORDER } from '../../exploration/contracts';
import { resupplyAvailability, siteDossier, suggestedAction } from '../../exploration/dossier';
import { useMultiverseStore } from '../../store/multiverseStore';
import { isFrontierState } from '../../worlds/frontiers/frontierPlugin';
import { applyExplorationCommand, ExplorationCommand, presentSite, surveyCoverage } from '../../exploration/engine';
import { ThreeWorldViewport } from '../../renderers/ThreeWorldViewport';
import { ImmersiveWorldView } from '../../renderers/ImmersiveWorldView';
import './atlas.css';

const facilities = ['Supply camp: transfer stocks','Sensor: survey adjacent regions','Salvage ruin: recover two units','Refuge: restore local team energy using local supplies','Extraction: convert finite reserve to salvage','Crossing: reopen a blocked route','Workshop: repair using local salvage','Processor: use fuel for local engineering','Archive: recover historical records','Relay: detect contacts two links away','Containment: reduce local hazard','Generator: convert two supplies to one fuel'];
const format = (value: number) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 3 }) : 'Unavailable';

// A run is an inspection context: do not carry messages, filters or selection into another reality.
export const AtlasView: React.FC<{ initialImmersive?: boolean }> = ({ initialImmersive = false }) => {
  const runId = useMultiverseStore(s => s.activeRunId);
  return <AtlasSession key={runId} initialImmersive={initialImmersive} />;
};

const AtlasSession: React.FC<{ initialImmersive: boolean }> = ({ initialImmersive }) => {
  const store = useMultiverseStore();
  const kernel = store.runs[store.activeRunId];
  const [selected, setSelected] = useState('');
  const [immersive, setImmersive] = useState(initialImmersive);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [filterRegion, setFilterRegion] = useState('all');
  const [planning, setPlanning] = useState(false);
  const [compareRunId, setCompareRunId] = useState('');
  // Selection and filters don't change the world. Keep its frame stable on those renders.
  const frame = useMemo(() => kernel?.extractRenderFrame(), [kernel, kernel?.tick, store.uiRevision]);
  const state = kernel?.getState();
  if (!kernel || !isFrontierState(state) || !frame) return <section className="atlas-workbench"><div className="atlas-panel"><h1>World Atlas</h1><p>This saved run predates the Atlas. Its original simulation remains available in the Observatory. Create a new run to use expanded territory, sites and expedition history.</p><button onClick={() => store.setActiveTab('library')}>Open World Library</button></div></section>;
  const { atlas, exploration } = state;
  const chosen = atlas.sites.find(s => s.facts.id === selected) ?? atlas.sites.find(s => exploration.sites[s.facts.id].discoveryState !== 'UNKNOWN') ?? atlas.sites[0];
  const siteId = chosen.facts.id, delta = exploration.sites[siteId];
  const dossier = siteDossier(atlas, exploration, siteId), view = dossier.view;
  const next = suggestedAction(atlas, exploration, siteId);
  const expedition = exploration.expedition;
  const known = atlas.sites.filter(s => exploration.sites[s.facts.id].discoveryState !== 'UNKNOWN');
  const covered = surveyCoverage(atlas, exploration);
  const events = kernel.getEvents();
  const leads = curiosityLeads(atlas, exploration, kernel.tick, events, kernel.runId);
  const rank = DISCOVERY_ORDER.indexOf(delta.discoveryState);
  const briefing = departureBriefing(atlas, exploration, siteId, kernel.tick);
  const recommendations = planning ? nearbyInvestigations(atlas, exploration, kernel.tick) : [];
  // These views are projections only; neither may advance time or reveal another
  // run's undiscovered site data. A parallel site must share seed and identity.
  const casefile = dossier.visited ? siteChronicle(atlas, exploration, siteId, events, kernel.runId) : [];
  const relatedRuns = Object.values(store.runs).filter(other =>
    other.runId !== kernel.runId && other.plugin.id === kernel.plugin.id &&
    other.seed === kernel.seed && isFrontierState(other.getState()) &&
    other.getState().atlas.sites.some((site: (typeof atlas.sites)[number]) =>
      site.facts.id === siteId && site.facts.seed === chosen.facts.seed &&
      site.facts.archetypeId === chosen.facts.archetypeId &&
      JSON.stringify(site.facts.coordinates) === JSON.stringify(chosen.facts.coordinates))
  );
  const compareRun = relatedRuns.find(other => other.runId === compareRunId);
  const otherState = compareRun?.getState();
  const parallel = compareRun && isFrontierState(otherState)
    ? compareSiteRealities(atlas, exploration, kernel.seed, otherState.atlas,
        otherState.exploration, compareRun.seed, siteId) : null;
  const isRefuge = Number(chosen.facts.extensions.structureRole) === 3;
  const localCrew = dossier.visited && isRefuge ? refugeRoster(state).filter(a => a.regionId === chosen.facts.regionId) : [];
  let refugeReason = '', refugePreview: ReturnType<typeof planRefugeRest> | null = null;
  if (isRefuge && dossier.visited) {
    try { refugePreview = planRefugeRest(state, siteId); }
    catch (error) { refugeReason = error instanceof Error ? error.message : String(error); }
  }
  const selectSite = (id: string) => { setSelected(id); setMessage(''); setFailed(false); };
  const action = (kind: ExplorationCommand['action'], resourceId?: string, targetSiteId = siteId): string => {
    try {
      const target = atlas.sites.find(s => s.facts.id === targetSiteId);
      if (!target) throw new Error('Unknown site');
      if (kind === 'operate' && Number(target.facts.extensions.structureRole) === 3) {
        const plan = planRefugeRest(state, targetSiteId);
        store.dispatchCommand('expedition.rest', 'Service local teams at refuge', {siteId:targetSiteId});
        const confirmation = `Restored ${format(plan.restored)} total team energy using ${format(plan.cost)} local supplies. Recorded in History & branches.`;
        setFailed(false); setMessage(confirmation);
        return confirmation;
      }
      const payload: ExplorationCommand = { action: kind, siteId: targetSiteId, ...(resourceId ? { resourceId } : {}) };
      applyExplorationCommand(atlas, exploration, payload, { tick: kernel.tick, branchId: kernel.runId });
      store.dispatchCommand('exploration.action', `Expedition: ${kind}`, payload);
      const confirmation = `${kind} accepted at tick ${kernel.tick}.`;
      setFailed(false); setMessage(confirmation);
      return confirmation;
    } catch (error) { const reason = error instanceof Error ? error.message : String(error); setFailed(true); setMessage(reason); return reason; }
  };
  const resupply = () => {
    try {
      const reason = resupplyAvailability(atlas, exploration);
      if (reason) throw new Error(reason);
      store.dispatchCommand('expedition.resupply', 'Resupply expedition', {});
      setFailed(false); setMessage(`Resupply accepted at tick ${kernel.tick}. Stocks transferred from the first visited site in the expedition’s current region.`);
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const local = dossier.visited && expedition.regionId === chosen.facts.regionId;
  const unavailable = (kind: string) => {
    if (expedition.journey) return true;
    if (kind === 'detect') return rank !== 0;
    if (kind === 'survey') return rank !== 1;
    if (kind === 'discover') return rank !== 2;
    if (kind === 'travel') return local || !briefing.ready;
    if (!local) return true;
    if (kind === 'operate' && isRefuge) return !refugePreview;
    if (kind === 'investigate') return ![4,5].includes(rank);
    if (kind === 'resolve') return rank !== 5;
    return false;
  };
  return <section className="atlas-workbench" aria-label="Living World Atlas" style={{ '--atlas-accent': kernel.plugin.accentColor } as React.CSSProperties}>
    <header className="atlas-panel atlas-heading">
      <div><p className="atlas-kicker">OMNIVERSE II / FIELD OBSERVATORY</p><h1>{kernel.plugin.name}</h1><p className="atlas-muted">A record of what is known. Not a promise of what is safe.</p></div>
      <div className="atlas-extent" aria-label="Survey extent"><strong>{known.length}<span> / {atlas.sites.length}</span></strong><span>signals localized</span><span>{state.regions.length} active regions · {Object.values(exploration.sites).filter(d => d.firstVisitedTick !== null).length} visited</span></div>
      <div className="atlas-toolbar">
        <button className="atlas-primary" onClick={() => store.toggleRunning()}>{store.isRunning ? 'Pause atlas simulation' : 'Run atlas simulation'}</button>
        <button onClick={() => store.stepActiveRun(1)}>Advance atlas one tick</button>
        <button onClick={() => store.setActiveTab('timeline')}>History & branches</button>
        <button onClick={() => store.setActiveTab('vault')}>Save / export</button>
        <button onClick={() => store.setActiveTab('observatory')}>Scientific Observatory</button>
      </div>
      <div className="atlas-expedition"><span><b>TICK {kernel.tick}</b> · {store.isRunning ? 'Advancing' : 'Paused'}</span><span>Position / {expedition.regionId}</span><span>Fuel / {format(expedition.fuel)}</span><span>Supplies / {format(expedition.supplies)}</span><span>{expedition.journey ? `IN TRANSIT · arrival ${expedition.journey.arrivalTick}` : 'AT REST'}</span></div>
    </header>
    <div className={immersive ? 'atlas-columns immersive-world' : 'atlas-columns'}>
      <div className="atlas-panel atlas-map">
        <div className="atlas-explore-mode" role="group" aria-label="Exploration view mode">
          <button type="button" aria-pressed={!immersive} onClick={() => setImmersive(false)}>Atlas overview</button>
          <button type="button" aria-pressed={immersive} onClick={() => setImmersive(true)}>Enter 3D world</button>
        </div>
        <div className="atlas-section-heading"><div><p className="atlas-kicker">01 / SURVEY VOLUME</p><h2>Region explorer</h2></div><span className="atlas-badge">{store.preferences.simplified3D ? 'SCHEMATIC' : 'LIVE MODEL'}</span></div>
        {immersive ? <ImmersiveWorldView atlas={atlas} exploration={exploration} runId={kernel.runId} onSelectSite={selectSite} onSiteAction={(id, kind) => action(kind, undefined, id)} onAdvanceTime={() => store.stepActiveRun(1)} onReturnToAtlas={() => { setImmersive(false); store.setActiveTab('atlas'); }} reducedMotion={store.preferences.reducedMotion} /> : <ThreeWorldViewport frame={frame} selectedEntityId={siteId} onSelectEntity={id => { if (id && atlas.sites.some(s => s.facts.id === id)) selectSite(id); }} reducedMotion={store.preferences.reducedMotion} simplifiedMode={store.preferences.simplified3D} />}
        <p className="atlas-muted">3D reconnaissance is a visual space for free movement and examining landmarks. Travel, surveying, and repairs still use authoritative simulation actions. A signal is not yet a place.</p>
        <label className="atlas-filter">Region filter <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)}><option value="all">All surveyed contacts</option>{state.regions.map(r => <option key={r.id} value={r.id}>{r.id} · {r.biome}</option>)}</select></label>
        <div className="atlas-contacts" aria-label="Survey contacts">
          {atlas.sites.filter(s => (known.includes(s) || covered.has(s.facts.regionId)) && (filterRegion === 'all' || filterRegion === s.facts.regionId)).map(s => {
            const v = presentSite(atlas, exploration, s.facts.id);
            return <button key={s.facts.id} aria-pressed={s.facts.id === siteId} onClick={() => selectSite(s.facts.id)}><span>{v?.label ?? 'Unsurveyed location'}</span><small>{s.facts.regionId} / {exploration.sites[s.facts.id].discoveryState}</small></button>;
          })}
          {!atlas.sites.some(s => (known.includes(s) || covered.has(s.facts.regionId)) && (filterRegion === 'all' || filterRegion === s.facts.regionId)) && <p className="atlas-muted">No localized contacts in this region. Choose another region or return to all contacts.</p>}
        </div>
      </div>
      <section className="atlas-panel atlas-inspector" aria-label="Site investigation inspector">
        <p className="atlas-kicker">02 / FIELD DOSSIER · {chosen.facts.regionId}</p>
        <h2>{view?.label ?? 'Unknown location'}</h2><p className="atlas-badge">{delta.discoveryState}</p><p className="atlas-description">{view?.description ?? 'Survey nearby territory to detect this contact.'}</p>
        <ol className="atlas-stages" aria-label="Discovery progression">{DISCOVERY_ORDER.map((stage,index) => <li key={stage} aria-current={index === rank ? 'step' : undefined} data-reached={index <= rank}><span>{String(index + 1).padStart(2,'0')}</span>{stage.toLowerCase()}</li>)}</ol>
        {view && view.condition !== null && <div className="atlas-condition"><div><span>Installation integrity</span><strong>{delta.condition.toFixed(1)}%</strong><meter min={0} max={100} value={delta.condition} aria-label="Installation integrity" /></div><div><span>Local hazard</span><strong>{delta.hazard.toFixed(1)}%</strong><meter min={0} max={100} value={delta.hazard} aria-label="Local hazard" /></div></div>}
        <div className="atlas-guidance"><span className="atlas-kicker">{expedition.journey ? 'EXPEDITION COMMITTED' : 'NEXT OBSERVATION'}</span><p>{next.action === 'travel' && !briefing.ready ? briefing.reason : next.instruction}</p></div>
        <section className="atlas-departure" aria-label="Departure briefing">
          <p className="atlas-kicker">DEPARTURE / PRESENT CONDITIONS</p>
          {local ? <p className="atlas-route">The expedition is already here. Local work needs no departure; surrounding hazards still apply.</p> : briefing.ready ? <><p className="atlas-route"><strong>Arrival at tick {briefing.arrivalTick}</strong> · {briefing.ticks} ticks · {briefing.fuel} fuel · {briefing.passages} passages</p><p className="atlas-muted">Fuel is charged at departure. The world keeps evolving during transit. These conditions are not a forecast of safe arrival.</p></> : <p className="atlas-route">{briefing.reason}</p>}
          <details onToggle={e => setPlanning(e.currentTarget.open)}><summary>Plan nearby investigations</summary>
            {planning && <><p className="atlas-muted">Known destinations only. Shortest travel first, then higher current hazard. Missing chain evidence and unsafe routes are excluded—not resolved.</p>
              {recommendations.length ? <ol>{recommendations.map(option => <li key={option.siteId}><button onClick={() => selectSite(option.siteId)} aria-current={siteId === option.siteId ? 'location' : undefined}>{option.label}<small>{option.onSite ? 'Local work · no travel' : `${option.ticks} ticks · ${option.fuel} fuel`} · local hazard {format(option.hazard)}</small></button></li>)}</ol> : <p>No ready, reachable investigations. Discover nearby contacts or review route and evidence constraints.</p>}</>}
          </details>
        </section>
        <div className="atlas-actions">
          {(['detect','survey','discover','travel','investigate','repair','resolve','operate'] as const).map(kind => <button key={kind} className={next.action === kind ? 'atlas-primary' : undefined} disabled={unavailable(kind)} onClick={() => action(kind)}>{kind === 'operate' && isRefuge && dossier.visited ? 'Rest local teams' : kind[0].toUpperCase() + kind.slice(1)}</button>)}
          <button disabled={!!expedition.journey || !local} onClick={() => action('recover','salvage')}>Recover salvage</button>
          <button disabled={!!expedition.journey} onClick={resupply}>Resupply from local stocks</button>
        </div>
        <p role="status" aria-live="polite" className={`atlas-feedback ${failed ? 'atlas-error' : ''}`}>{message || 'Survey and investigate: 1 supply. Repair: 2 supplies. Invalid actions spend nothing.'}</p>
        {dossier.visited && <>
          <p>{delta.evidence.length > 0 ? `OBSERVED · ${delta.evidence.length} recorded measurements. Compare the sample with the model below.` : 'No field sample recorded yet.'}</p>
          {isRefuge && <section className="atlas-crew" aria-label="Refuge teams"><p className="atlas-kicker">REFUGE / LOCAL PRESENCE</p><h3>{localCrew.length ? `${localCrew.length} teams present` : 'No teams present'}</h3><p className="atlas-muted">Only teams here receive service. One local supply restores 20 total energy, up to 40 per action. Expedition stocks are not replenished.</p><ul>{localCrew.map(a => <li key={a.id}><span>{a.id}</span><strong>{format(a.energy)} / 100</strong><meter min={0} max={100} value={a.energy} aria-label={`${a.id} energy`} /></li>)}</ul><p>{refugePreview ? `${format(refugePreview.cost)} local supplies → ${format(refugePreview.restored)} total energy` : refugeReason}</p></section>}
          <p className="atlas-facility">{facilities[Number(chosen.facts.extensions.structureRole)] ?? 'No classified facility function.'}</p>
          {!!dossier.missingEvidence.length && <div className="atlas-requirements"><h3>Evidence still required</h3><ul>{dossier.missingEvidence.map(e => <li key={e.id}>{e.label}: {e.requirement} · {e.satisfied ? 'ready to record' : 'condition not met'}</li>)}</ul></div>}
        </>}
        {!!dossier.chains.length && <div className="atlas-chain"><h3>Follow the evidence</h3><p className="atlas-muted">Earlier measurements unlock later investigations. A complete measurement sequence is not the same as resolving every site.</p>{dossier.chains.map((chain,index) => <ol key={chain.id} aria-label={`Evidence sequence ${index + 1}`}>{chain.steps.map((step,i) => <li key={step.siteId} data-recorded={step.collected}><span className="atlas-chain-number">{String(i + 1).padStart(2,'0')}</span><button disabled={!step.located} aria-current={step.siteId === siteId ? 'location' : undefined} onClick={() => selectSite(step.siteId)}>{step.label}<small>{step.resolved ? 'Resolved' : step.collected ? 'Measurement recorded' : step.located ? 'Observation required' : 'Identity withheld'}</small></button></li>)}</ol>)}</div>}
      </section>
    </div>
    {dossier.visited && <section className="atlas-panel atlas-evidence" aria-label="Evidence comparison">
      <div className="atlas-section-heading"><div><p className="atlas-kicker">03 / THE RECORD AND THE WORLD</p><h2>What changed after the observation?</h2></div><span className="atlas-badge">DERIVED COMPARISON</span></div>
      <p className="atlas-muted">The sample stays fixed. The model does not. Current values below are simulation telemetry, not new field observations; a difference does not establish its cause.</p>
      <div className="atlas-table-scroll"><table><caption>Recorded field sample compared with current model state at tick {kernel.tick}</caption><thead><tr><th scope="col">Measurement</th><th scope="col">Recorded sample</th><th scope="col">Current model</th><th scope="col">Difference</th></tr></thead><tbody>{dossier.readings.map(reading => <tr key={reading.field}><th scope="row">{reading.label}<small>{reading.unit || 'Native model field'}</small></th><td>{reading.sample ? <>{format(reading.sample.value)} {reading.sample.unit}<small>OBSERVED · tick {reading.sample.tick} · {reading.sample.branchId}</small></> : <span className="atlas-muted">Not sampled</span>}</td><td>{format(reading.current)} {reading.unit}<small>MODEL · tick {kernel.tick}</small></td><td>{reading.difference === null ? '—' : `${reading.difference > 0 ? '+' : ''}${format(reading.difference)}`}<small>{reading.difference === null ? 'No comparison yet' : 'Since recorded sample'}</small></td></tr>)}</tbody></table></div>
      <div className="atlas-records"><article><p className="atlas-kicker">GENERATED HISTORY / NOT AN OBSERVED EVENT</p><h3>{view?.history?.formationEpoch}</h3><p>{view?.history?.origin}</p><p className="atlas-muted">This account belongs to the generated setting. Field measurements can support a hypothesis, but do not independently verify this history.</p></article><article><p className="atlas-kicker">OPEN QUESTION</p><h3>{String(chosen.facts.extensions.evidenceQuestion ?? 'What conditions account for this site’s current state?')}</h3><h4>Inventory & evidence</h4><p className="atlas-inventory">{Object.entries(delta.resources).map(([key,value]) => `${key}: ${format(value)}`).join(' · ')}</p><ul>{view?.evidence.map(e => <li key={e.evidenceId}>OBSERVED · {e.evidenceId}: {format(e.value)} {e.unit} · tick {e.tick} · {e.branchId}</li>)}</ul></article></div>
    </section>}
    {dossier.visited && <section className="atlas-panel atlas-chronicles" aria-label="Site causal casefile">
      <div className="atlas-section-heading"><div><p className="atlas-kicker">04 / SITE MEMORY</p><h2>This place has a history that continues</h2></div><span className="atlas-badge">RECORDED, NOT INVENTED</span></div>
      <p className="atlas-muted">These entries come from this branch’s actual expedition actions and simulation event journal. State differences describe what changed; they do not independently establish why. No prior generated history has been rewritten.</p>
      {casefile.length ? <ol className="atlas-chronicle-list" aria-label="Recorded site changes">
        {casefile.map(entry => <li key={entry.kind + entry.id}>
          <div className="atlas-chronicle-meta"><span>T{entry.tick}</span><span>{entry.kind === 'ACTION' ? 'EXPEDITION' : 'SIMULATION'}</span><small>{entry.branchId}</small></div>
          <div><h3>{entry.title}</h3><p>{entry.detail}</p>
            {!!entry.changes.length && <ul aria-label="Recorded state differences">{entry.changes.slice(0, 6).map(change => <li key={change.field}><b>{change.field}</b> {String(change.before)} → {String(change.after)}</li>)}</ul>}
            {entry.changes.length > 6 && <small>{entry.changes.length - 6} further state differences omitted from this compact view.</small>}
            {entry.causalEventId && <small>Event {entry.causalEventId}{entry.causedByEventId ? ' · recorded upstream ' + entry.causedByEventId : ''}</small>}
          </div>
        </li>)}
      </ol> : <p>No retained site-specific actions or simulation events. Bounded journal history may have been compacted; absence is not proof that nothing happened.</p>}
      <div className="atlas-parallel" aria-label="Parallel site comparison">
        <p className="atlas-kicker">COUNTERFACTUAL LAB / LOADED SAME-GENESIS RUNS</p><h3>What happened to this place elsewhere?</h3>
        {relatedRuns.length ? <>
          <label>Compare with loaded parallel run
            <select value={compareRunId} onChange={event => setCompareRunId(event.target.value)}>
              <option value="">Select another same-seed run</option>
              {relatedRuns.map(other => <option key={other.runId} value={other.runId}>{other.name} · T{other.tick}</option>)}
            </select>
          </label>
          {parallel && <div className="atlas-parallel-results" role="status">
            <p>Other run: {compareRun?.name} · tick {compareRun?.tick}. This is a difference, not proof that an intervention caused it. Ticks may differ.</p>
            {parallel.targetVisible ? <dl>
              <div><dt>Discovery</dt><dd>{delta.discoveryState} / {parallel.targetStage}</dd></div>
              <div><dt>Integrity · current / other</dt><dd>{format(parallel.currentCondition)}% / {format(parallel.targetCondition!)}% · difference {format(parallel.conditionDifference!)} points</dd></div>
              <div><dt>Hazard · current / other</dt><dd>{format(parallel.currentHazard)}% / {format(parallel.targetHazard!)}% · difference {format(parallel.hazardDifference!)} points</dd></div>
              <div><dt>Evidence records</dt><dd>{parallel.currentEvidence} / {parallel.targetEvidence === null ? 'not visited' : parallel.targetEvidence}</dd></div>
            </dl> : <p>This location is unsurveyed in the other run. Its readings, resources and history are withheld.</p>}
            {parallel.resourceChanges.length > 0 && <details><summary>Compare visited site stocks</summary><ul>{parallel.resourceChanges.map(change => <li key={change.field}>{change.field}: {String(change.before)} → {String(change.after)}</li>)}</ul></details>}
          </div>}
        </> : <p className="atlas-muted">No other loaded run shares this world, seed and exact site identity. Fork this run in History & branches to compare local consequences.</p>}
      </div>
    </section>}
    <div className="atlas-bottom">
      <section className="atlas-panel" aria-label="Live investigation leads"><p className="atlas-kicker">UNRESOLVED / HYPOTHESES</p><h2>Investigate next</h2><p className="atlas-muted">Branch-local leads expire 48 ticks after the latest observation. These are questions, not established causes.</p>
        {leads.length ? leads.map(lead => <article className="atlas-lead" key={lead.siteId}><button onClick={() => selectSite(lead.siteId)}>{presentSite(atlas,exploration,lead.siteId)!.label}: {lead.reason}</button><p>{lead.hypothesis}</p><small>{lead.confidence}{lead.observedTick === null ? '' : ' · event tick ' + lead.observedTick} · expires tick {lead.expiresAt}</small></article>) : <p>No fresh qualifying signals. Survey nearby regions for new leads.</p>}
      </section>
      <section className="atlas-panel atlas-journal"><p className="atlas-kicker">BRANCH / CHRONOLOGY</p><h2>Discovery journal</h2><p className="atlas-muted">Latest 128 actions retained; evidence persists. Paused and closed-browser simulations do not advance.</p><ol>{exploration.journal.slice(-20).reverse().map(e => <li key={e.id}><span>T{e.tick}</span><div><b>{e.action}</b> · {presentSite(atlas,exploration,e.siteId)?.label ?? 'Unidentified site'}<small>{e.branchId}</small></div></li>)}</ol></section>
    </div>
  </section>;
};
