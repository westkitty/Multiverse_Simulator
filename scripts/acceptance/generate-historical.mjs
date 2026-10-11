import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../..');
const revision='cb6bc9b4456f2cb45b7610c0df6d3325bd67a5eb';
const expected=JSON.parse(readFileSync(join(root,'src/test/fixtures/historical/manifest.json'),'utf8'));
assert.equal(expected.sourceCommit,revision,'Historical manifest source does not match pinned source revision');
mkdirSync(join(root,'.cache'),{recursive:true});
const workspace=mkdtempSync(join(root,'.cache','historical-fixtures-'));
const archived=execFileSync('git',['archive',revision],{cwd:root,maxBuffer:32*1024*1024});
execFileSync('tar',['-x','-C',workspace],{input:archived});
assert.deepEqual(readFileSync(join(workspace,'package-lock.json')),readFileSync(join(root,'package-lock.json')),'Historical/current lockfiles differ; install historical dependencies separately before generating oracles.');
symlinkSync(join(root,'node_modules'),join(workspace,'node_modules'),'dir');
writeFileSync(join(workspace,'src/test/historicalFixtureGeneration.test.ts'),readFileSync(join(root,'scripts/acceptance/historical-generator.ts.txt')));
execFileSync(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','--root',workspace,'src/test/historicalFixtureGeneration.test.ts'],{cwd:root,stdio:'inherit',env:{...process.env,HISTORICAL_FIXTURE_OUTPUT:join(root,'src/test/fixtures/historical')}});
const observed=JSON.parse(readFileSync(join(root,'src/test/fixtures/historical/manifest.json'),'utf8'));

assert.equal(observed.fixtures.length,expected.fixtures.length,'Historical fixture count changed');
for (let i=0;i<expected.fixtures.length;i++) {
  const original=expected.fixtures[i], regenerated=observed.fixtures[i];
  for (const key of ['worldId','pluginVersion','seed','archiveTick','archiveStateHash','continuationTick','continuationStateHash']) {
    assert.deepEqual(regenerated[key],original[key],original.worldId+' historical state oracle mismatch: '+key);
  }
  assert.deepEqual(regenerated.command,original.command,original.worldId+' historical command mismatch');
}
console.log('Historical ZIP byte digests differ from their earlier exports because the format embeds exportedAtIso; the original state/continuation oracle values were preserved and verified.');
console.log(`Recovered ${observed.fixtures.length} historical archives from pinned commit ${revision}; manifest oracles all match.`);
