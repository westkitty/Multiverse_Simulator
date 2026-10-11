import { DISCOVERY_ORDER, ExplorationAtlas, ExplorationState, SiteDefinition } from './contracts';
import { presentSite } from './engine';

/** Read-only field dossier. No RNG, new observations, history rewriting or hidden names. */
export function siteDossier(atlas: ExplorationAtlas, state: ExplorationState, siteId: string) {
  const site = atlas.sites.find(candidate => candidate.facts.id === siteId);
  if (!site) throw new Error('Unknown site');
  const delta = state.sites[siteId];
  const view = presentSite(atlas, state, siteId);
  const visited = DISCOVERY_ORDER.indexOf(delta.discoveryState) >= 4;
  const chains = atlas.chains.filter(chain => chain.steps.some(step => step.siteId === siteId)).map(chain => ({
    id: chain.id,
    steps: chain.steps.map(step => {
      const projected = presentSite(atlas, state, step.siteId);
      return {
        siteId: step.siteId,
        label: projected?.label ?? 'Unlocated record',
        located: !!projected,
        collected: state.sites[step.siteId].evidence.some(e => e.evidenceId === step.evidenceId),
        resolved: state.sites[step.siteId].discoveryState === 'RESOLVED',
      };
    }),
  }));
  const prerequisite = chains.flatMap(chain => {
    const index = chain.steps.findIndex(step => step.siteId === siteId);
    return chain.steps.slice(0, index).filter(step => !step.collected);
  })[0] ?? null;
  const missingEvidence = visited ? site.evidence.filter(rule => !delta.evidence.some(e => e.evidenceId === rule.id)).map(rule => ({
    id: rule.id, label: rule.label,
    requirement: `${rule.comparison === 'atLeast' ? '≥' : '≤'} ${rule.threshold} ${rule.unit ?? rule.resourceId ?? '%'}`,
    satisfied: evidenceMatches(rule, delta),
  })) : [];
  const readings = visited ? Object.entries(delta.readings).map(([field, value]) => {
    const rule = site.evidence.find(e => e.source === 'reading' && e.resourceId === field);
    const sample = rule ? delta.evidence.find(e => e.evidenceId === rule.id) : undefined;
    return { field, label: rule?.label ?? field, unit: rule?.unit ?? '', current: value,
      sample: sample ? { value: sample.value, tick: sample.tick, branchId: sample.branchId, unit: sample.unit } : null,
      difference: sample ? value - sample.value : null };
  }) : [];
  return { view, visited, readings, chains, prerequisite, missingEvidence };
}

function evidenceMatches(rule: SiteDefinition['evidence'][number], delta: ExplorationState['sites'][string]) {
  const value = rule.source === 'reading' ? delta.readings[rule.resourceId!]
    : rule.source === 'resource' ? delta.resources[rule.resourceId!] : delta[rule.source];
  return Number.isFinite(value) && (rule.comparison === 'atLeast' ? value >= rule.threshold : value <= rule.threshold);
}

/** Useful guidance only. The command engine remains the validator for every actual action. */
export function suggestedAction(atlas: ExplorationAtlas, state: ExplorationState, siteId: string) {
  const site = atlas.sites.find(s => s.facts.id === siteId)!;
  const delta = state.sites[siteId];
  const dossier = siteDossier(atlas, state, siteId);
  if (state.expedition.journey) return { action: null, instruction: `In transit. Arrival is scheduled for tick ${state.expedition.journey.arrivalTick}. Advance the simulation to continue.` };
  const instructions = {
    UNKNOWN: { action: 'detect', instruction: 'Localize this signal before interpreting it. Its identity is still unknown.' },
    DETECTED: { action: 'survey', instruction: 'Survey the contact. One supply buys a first assessment, not an explanation.' },
    SURVEYED: { action: 'discover', instruction: 'Identify the surveyed location. Its history remains sealed until a visit.' },
    DISCOVERED: { action: 'travel', instruction: 'Commit an expedition to this site. Route costs are charged at departure.' },
  } as const;
  if (delta.discoveryState in instructions) return instructions[delta.discoveryState as keyof typeof instructions];
  if (state.expedition.regionId !== site.facts.regionId) return { action: 'travel', instruction: 'Return to this site before performing local work.' };
  if (delta.discoveryState === 'RESOLVED') return { action: null, instruction: 'This record is resolved, not frozen. The environment and its inhabitants can still change.' };
  if (dossier.prerequisite) return { action: null, instruction: 'An earlier observation is missing. Follow the evidence sequence below; later records cannot substitute for it.' };
  if (dossier.missingEvidence.some(e => e.satisfied)) return { action: 'investigate', instruction: 'Record the available evidence. The sample will retain this value, tick and branch even as the world changes.' };
  if (dossier.missingEvidence.length) return { action: null, instruction: 'The evidence is incomplete. Meet the conditions below, then investigate again. Repairing an installation does not establish the cause of its failure.' };
  return { action: 'resolve', instruction: 'All required evidence is recorded. Resolve the dossier without treating correlation as proof of causation.' };
}

/** Shares the existing first-visited-local-stock selection; callers can reject before enqueueing. */
export function resupplyAvailability(atlas: ExplorationAtlas, state: ExplorationState) {
  if (state.expedition.journey) return 'Cannot resupply in transit';
  const local = atlas.sites.find(site => site.facts.regionId === state.expedition.regionId && state.sites[site.facts.id].firstVisitedTick !== null);
  if (!local) return 'Visit a local site before resupplying';
  const stocks = state.sites[local.facts.id].resources;
  if ((stocks.supplies ?? 0) + (stocks.fuel ?? 0) <= 0) return 'Local stocks depleted';
  return null;
}
