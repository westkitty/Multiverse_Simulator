import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import manifest from './fixtures/atlas-compat/manifest.json';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {SimulationKernel} from '../core/kernel';
import {inspectAndUnpackArchiveZip} from '../persistence/archive';
for(const fixture of manifest.fixtures)it(`${fixture.worldId}: pre-refuge Atlas archive, legacy operate and historical replay remain exact`,()=>{
 const bytes=new Uint8Array(readFileSync(`src/test/fixtures/atlas-compat/${fixture.file}`));
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
 const archive=inspectAndUnpackArchiveZip(bytes);expect(archive.valid).toBe(true);
 const k=SimulationKernel.fromRunRecord(archive.record!,CORE_WORLD_PLUGINS.find(p=>p.id===fixture.worldId)!);
 expect(k.getStateHash()).toBe(fixture.archiveStateHash);
 while(k.tick<fixture.continuationTick)k.step();
 expect(k.getStateHash()).toBe(fixture.continuationStateHash);
 expect(k.replayFromStart(k.tick).matchesAuthoritativeHash).toBe(true);
});
