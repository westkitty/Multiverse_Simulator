import { ExplorationAtlas, ExplorationState } from './contracts';
import { presentSite } from './engine';

/**
 * Authored field questions, attached to already-authoritative investigation
 * chains. These do not create sites, observations, history, rewards or state.
 * A protocol can be completed only by changes in the real exploration state.
 */
export type FieldProof = 'observations' | 'restoration' | 'resolution' | 'salvage' | 'archive' | 'containment';

export interface FieldProtocolDefinition {
  title: string;
  question: string;
  beats: readonly [string, string, string];
  proof: FieldProof;
  conclusion: string;
}

export const FIELD_PROTOCOLS: Record<string, FieldProtocolDefinition> = {
  ecosystem: {
    title: 'The watershed question',
    question: 'Are changes in plant biomass consistent across the wetland transect, and is the infrastructure fit to keep measuring?',
    beats: ['Establish a local biological baseline.', 'Compare a second contact before interpreting a trend.', 'Take a third reading at the signature contact.'],
    proof: 'restoration',
    conclusion: 'The transect is documented and the installation restored. The readings do not, alone, prove why the ecosystem changed.',
  },
  station: {
    title: 'The pressure ledger',
    question: 'Can pressure readings from separated compartments be reconciled with the surviving maintenance record?',
    beats: ['Sample the first habitat compartment.', 'Check pressure beyond the initial bulkhead.', 'Record a third pressure reading before consulting the archive.'],
    proof: 'archive',
    conclusion: 'Pressure samples and a carried archival record now coexist. The archived account is context, not a measured pressure history.',
  },
  civilization: {
    title: 'A river of missing supplies',
    question: 'Do surveyed water stocks support a supply-shortage hypothesis, and what salvage can an expedition actually carry away?',
    beats: ['Document the first water-stock reading.', 'Follow the route to a second civic measurement.', 'Inspect the next structure before selecting recoverable material.'],
    proof: 'salvage',
    conclusion: 'The field record includes sampled stocks and carried salvage; neither alone identifies the cause of a settlement decline.',
  },
  atmosphere: {
    title: 'Beneath the pressure front',
    question: 'Does the measured pressure field vary across the weather instrument network?',
    beats: ['Record pressure at the first contact.', 'Test whether another instrument reports the same conditions.', 'Complete the pressure transect before claiming any pattern.'],
    proof: 'observations',
    conclusion: 'Three observations are available for comparison. They describe a field, not a proven storm origin.',
  },
  ocean: {
    title: 'The reef exposure problem',
    question: 'Do the ocean chemistry samples coincide with a hazard that functioning containment equipment can reduce?',
    beats: ['Capture the first marine chemistry sample.', 'Follow the survey path to an independent reading.', 'Test the third sample before approaching containment machinery.'],
    proof: 'containment',
    conclusion: 'The samples are recorded and a local hazard was actively mitigated. A single intervention does not establish a global ocean recovery.',
  },
  celestial: {
    title: 'Three views of the transit',
    question: 'Are incident flux readings consistent across the observing network, and what does a recovered archive actually preserve?',
    beats: ['Measure flux at the first instrument.', 'Acquire a second reading from another observing site.', 'Complete the flux series before retrieving records.'],
    proof: 'archive',
    conclusion: 'Current flux readings and recovered records are available; no unobserved orbital past is presented as fact.',
  },
  megacity: {
    title: 'A district under strain',
    question: 'Do pollution measurements and repairable infrastructure support a coherent investigation of the district network?',
    beats: ['Sample the first district contact.', 'Survey the next part of the utility corridor.', 'Collect evidence at the signature destination before resolving its dossier.'],
    proof: 'resolution',
    conclusion: 'A three-contact investigation has been resolved against recorded evidence, not against a fabricated blackout explanation.',
  },
  industrial: {
    title: 'Inventory without a delivery',
    question: 'Where do measured production stocks diverge, and can the expedition recover usable material?',
    beats: ['Read inventory at the starting facility.', 'Continue to a second industrial measurement.', 'Examine a third site before loading salvage.'],
    proof: 'salvage',
    conclusion: 'The team carries real salvage and has measured the available inventory. Neither proves when deliveries stopped.',
  },
  geology: {
    title: 'The buried stress line',
    question: 'How does measured tectonic stress vary between monitoring sites, and can the damaged installation be restored?',
    beats: ['Establish a stress measurement.', 'Compare a second point along the fault transect.', 'Record the third stress value at the signature array.'],
    proof: 'restoration',
    conclusion: 'The stress transect and repaired instrument are documented. Restoring a sensor does not eliminate tectonic loading.',
  },
  'wild-meridian': {
    title: 'The valley water hypothesis',
    question: 'Can soil water, vegetation and wildlife readings support a test of the proposed drought relationship?',
    beats: ['Measure water availability before judging vegetation.', 'Record the vegetation signal at the next field site.', 'Complete the wildlife sample and compare the three different quantities.'],
    proof: 'observations',
    conclusion: 'Water, vegetation and wildlife were actually sampled. Their correlation still needs a temporal test.',
  },
  'hollow-deep': {
    title: 'The air below',
    question: 'Do flood, gas and roof-stress measurements justify operating a local hazard-control system?',
    beats: ['Record flood depth from an aquifer contact.', 'Sample the gas environment in a second chamber.', 'Take a roof-stress reading before operating containment.'],
    proof: 'containment',
    conclusion: 'The underground hazards have been sampled and local mitigation applied. The wider cave system remains active.',
  },
  'timeworn-empire': {
    title: 'Three strata, one question',
    question: 'Do burial, erosion and exposure measurements support an archaeological interpretation alongside a recovered document?',
    beats: ['Measure burial depth without assigning a historical date.', 'Record an erosion reading at the next site.', 'Observe exposure before recovering an archival record.'],
    proof: 'archive',
    conclusion: 'The measurements and carried record are available. An inferred occupation sequence remains distinct from an observed event.',
  },
  'terraforming-frontier': {
    title: 'The first viable ground',
    question: 'Can pressure, temperature and soil readings distinguish environmental improvement from an installation that merely survived?',
    beats: ['Sample the local atmospheric pressure.', 'Record temperature at a second instrument.', 'Check soil viability at the signature site.'],
    proof: 'restoration',
    conclusion: 'A three-variable field sample and restored installation are documented; planetary habitability is not certified.',
  },
  'machine-wilderness': {
    title: 'The unfinished production chain',
    question: 'Are power, backlog and wear consistent with a functioning production network, and is the civic casefile resolvable?',
    beats: ['Measure active grid power.', 'Record construction backlog in a second region.', 'Inspect equipment wear before resolving the final record.'],
    proof: 'resolution',
    conclusion: 'The three machine readings and signature casefile are resolved. No unseen machine intention is asserted.',
  },
  'signal-expanse': {
    title: 'The transmission triangulation',
    question: 'Can signal, noise and coverage readings distinguish a source from local interference?',
    beats: ['Record signal strength at the first contact.', 'Sample background noise from another location.', 'Measure sensor coverage before forming a signal hypothesis.'],
    proof: 'observations',
    conclusion: 'A measured signal/noise/coverage triad is available. The signal source is still a hypothesis.',
  },
};

function evidenceCountForSite(state: ExplorationState, siteId: string, evidenceId: string) {
  return state.sites[siteId]?.evidence.find(observation => observation.evidenceId === evidenceId) ?? null;
}

/** Read-only, privacy-safe player projection. No generated history is treated as observation. */
export function fieldProtocolStatus(atlas: ExplorationAtlas, state: ExplorationState) {
  const script = FIELD_PROTOCOLS[atlas.worldId];
  const chain = atlas.chains[0];
  if (!script || !chain || chain.steps.length !== 3) return null;
  if (chain.steps.some(step => !state.sites[step.siteId] || !atlas.sites.some(site => site.facts.id === step.siteId))) return null;

  const steps = chain.steps.map((step, index) => {
    const observation = evidenceCountForSite(state, step.siteId, step.evidenceId);
    const view = presentSite(atlas, state, step.siteId);
    return {
      siteId: step.siteId,
      label: view?.label ?? 'Unlocated contact',
      discovery: state.sites[step.siteId].discoveryState,
      beat: script.beats[index],
      collected: !!observation,
      sample: observation ? { value: observation.value, unit: observation.unit, tick: observation.tick, branchId: observation.branchId } : null,
    };
  });
  const evidenceCount = steps.filter(step => step.collected).length;
  const signatureId = chain.steps[2].siteId;
  const signature = state.sites[signatureId];
  const roleSite = (role: number) => atlas.sites.find(site => Number(site.facts.extensions.structureRole) === role)?.facts.id ?? null;
  let proofSiteId: string | null = signatureId;
  let proofMet = false;
  let proofInstruction = '';
  switch (script.proof) {
    case 'observations':
      proofSiteId = null;
      proofMet = true;
      proofInstruction = 'Complete the three verified observations.';
      break;
    case 'restoration':
      proofMet = signature.firstVisitedTick !== null && signature.condition >= 75;
      proofInstruction = 'Restore the visited signature installation to at least 75% integrity.';
      break;
    case 'resolution':
      proofMet = signature.discoveryState === 'RESOLVED';
      proofInstruction = 'Investigate every required sample, then resolve the signature dossier.';
      break;
    case 'salvage':
      proofMet = (state.expedition.cargo.salvage ?? 0) >= 1;
      proofInstruction = 'Recover at least one unit of salvage into expedition cargo at a visited site.';
      proofSiteId = atlas.sites.find(site => site.facts.regionId === state.expedition.regionId &&
        state.sites[site.facts.id].firstVisitedTick !== null && (state.sites[site.facts.id].resources.salvage ?? 0) >= 1)?.facts.id ?? signatureId;
      break;
    case 'archive':
      proofMet = (state.expedition.cargo.records ?? 0) >= 1;
      proofInstruction = 'Visit and operate a local archive to carry one record in expedition cargo.';
      proofSiteId = roleSite(8);
      break;
    case 'containment':
      proofSiteId = roleSite(10);
      proofMet = !!proofSiteId && state.sites[proofSiteId].firstVisitedTick !== null && state.sites[proofSiteId].mitigation >= 1;
      proofInstruction = 'Visit and operate a containment facility to produce measured local hazard mitigation.';
      break;
  }
  const pending = steps.find(step => !step.collected);
  const complete = evidenceCount === 3 && proofMet;
  const nextSiteId = complete ? null : pending?.siteId ?? proofSiteId;
  const visibleNext = nextSiteId ? presentSite(atlas, state, nextSiteId) : null;
  const nextInstruction = complete
    ? script.conclusion
    : state.expedition.journey
      ? 'Expedition in transit. Advance simulation ticks to reach the committed destination.'
      : pending
        ? (visibleNext ? 'Approach ' + visibleNext.label + ', inspect it, then collect its recorded measurement.' : 'The next contact is not localized. Survey coverage first; its identity and location remain sealed.')
        : proofInstruction;
  return {
    title: script.title,
    question: script.question,
    proofMode: script.proof,
    proofInstruction,
    proofMet,
    evidenceCount,
    complete,
    stages: steps,
    nextSiteId,
    nextKnown: !!visibleNext,
    nextLabel: visibleNext?.label ?? 'Unlocated contact',
    nextInstruction,
    conclusion: script.conclusion,
  };
}
