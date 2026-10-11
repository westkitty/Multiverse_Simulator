import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import manifest from './fixtures/historical/manifest.json';
import {ORIGINAL_WORLD_PLUGINS} from '../worlds';
import {SimulationKernel} from '../core/kernel';
import {inspectAndUnpackArchiveZip} from '../persistence/archive';

describe('Independent historical-source ZIP compatibility',()=>{
 for(const fixture of manifest.fixtures)it(`${fixture.worldId}: binary integrity, tick-20 restoration, historical tick-60 oracle and replay`,()=>{
  const bytes=new Uint8Array(readFileSync(`src/test/fixtures/historical/${fixture.file}`));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
  const unpacked=inspectAndUnpackArchiveZip(bytes);expect(unpacked.valid).toBe(true);
  const plugin=ORIGINAL_WORLD_PLUGINS.find(p=>p.id===fixture.worldId)!;
  const restored=SimulationKernel.fromRunRecord(unpacked.record!,plugin);
  expect(restored.tick).toBe(fixture.archiveTick);
  expect(restored.getState().atlas).toBeUndefined();
  expect(restored.getStateHash()).toBe(fixture.archiveStateHash);
  while(restored.tick<fixture.continuationTick)restored.step();
  expect(restored.getStateHash()).toBe(fixture.continuationStateHash);
  expect(restored.replayFromStart(restored.tick).matchesAuthoritativeHash).toBe(true);
 });
});
