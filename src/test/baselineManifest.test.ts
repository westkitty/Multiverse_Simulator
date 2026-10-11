import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SimulationKernel } from '../core/kernel';
import { LEGACY_WORLD_PLUGINS } from '../worlds';
import { createPortableArchiveZip } from '../persistence/archive';

const expectedZones = [48, 18, 9, 48, 48, 3, 18, 18, 48];
const targets = [144, 54, 45, 144, 144, 9, 54, 54, 144];

describe('OMNIVERSE II intake evidence (not expansion acceptance)', () => {
  it('measures actual initialized state and records the unchanged baseline separately from targets', () => {
    const worlds = LEGACY_WORLD_PLUGINS.map((plugin, index) => {
      const kernel = new SimulationKernel({ runId: `intake-${plugin.id}`, name: 'Intake', plugin, seed: 424242 });
      const frame = kernel.extractRenderFrame();
      expect(frame.zones.length).toBe(expectedZones[index]);
      const state = kernel.getState();
      const collections = Object.fromEntries(Object.entries(state).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]));
      const times: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        kernel.stepMany(1);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const record = kernel.exportRunRecord();
      const archive = createPortableArchiveZip(record);
      return {
        id: plugin.id, schemaVersion: plugin.schemaVersion,
        baseline: { seed: 424242, collections, renderZones: frame.zones.length, renderEntities: frame.entities.length, renderLinks: frame.connections.length,
          scenarios: plugin.scenarios.length, interventions: plugin.quickInterventions.length, metrics: plugin.metricDefinitions.length,
          scaleMetadata: plugin.scaleMetadata },
        target: { spatialUnits: targets[index], pois: 36, poiArchetypes: 12, actorArchetypes: 6, structureArchetypes: 6, discoveryChains: 3 },
        observed: { spatialUnits: frame.zones.length, normalizedPois: 0, linkedDiscoveryChains: 0 },
        contentAudit: 'No normalized persistent POI/discovery contract exists. Existing simulated entities are not counted as POIs. Structure/actor archetypes require a domain inventory; UNVERIFIED.',
        proofStatus: { baseline: 'PASS', expansion: 'FAIL' },
        benchmark: { ticks: 100, p50StepMs: times[49], p95StepMs: times[94], archiveBytesAtTick100: archive.byteLength },
      };
    });
    expect(worlds.reduce((n, w) => n + w.baseline.scenarios, 0)).toBe(81);
    expect(worlds.reduce((n, w) => n + w.baseline.interventions, 0)).toBe(174);
    expect(worlds.reduce((n, w) => n + w.baseline.metrics, 0)).toBe(162);
    if (process.env.RECORD_BASELINE === '1') {
      writeFileSync('docs/expansion-manifest.json', JSON.stringify({
        schemaVersion: 1, measuredAt: new Date().toISOString(),
        startingCommit: 'b4e57734873df0af4f0bd760a9283557b0e8c977',
        implementationBranch: 'arena/1b370858-multiverse-simulator',
        implementationCommit: '632e7503fa00b7698f77a0a973d990a2a2b8c410',
        workingBranch: 'arena/37f107b8-multiverse-simulator',
        environment: { node: process.version, platform: process.platform, runner: 'Vitest/jsdom; headless CPU, not browser FPS' },
        versions: { engine: '1.0.0', stateSchema: 1, archive: 1, indexedDb: 1 },
        baselineChecks: 'typecheck, lint, 24 existing tests, build PASS before changes',
        initialPages: { siteGet: 404, workflows: 0, activationPost: 403, status: 'BLOCKED' },
        measurementNotes: ['Default config, fixed seed; collections are disjoint field counts, not summed content.', 'Civilization has 9 initialized settlements plus 6 predefined founding sites (15 baseline regional sites); target is 45 sites and 27 settlements.', 'Ocean render zones are horizontal sectors; each contains 3 depth layers.', 'Original scaleMetadata describes an earlier expansion, NOT progress against OMNIVERSE II targets.'],
        worlds,
        unimplementedWorlds: [
          { id: 'wild-meridian', baselineTarget: 16, finalTarget: 48 },
          { id: 'hollow-deep', baselineTarget: 16, finalTarget: 48 },
          { id: 'timeworn-empire', baselineTarget: 12, finalTarget: 36 },
          { id: 'terraforming-frontier', baselineTarget: 16, finalTarget: 48 },
          { id: 'machine-wilderness', baselineTarget: 16, finalTarget: 48 },
          { id: 'signal-expanse', baselineTarget: 12, finalTarget: 36 },
        ].map(w => ({ ...w, observed: 0, proofStatus: 'FAIL', note: 'Proposed IDs, not registered plugins or functional baselines' })),
      }, null, 2) + '\n');
    }
  });
});
