import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const fixtureRoot = join(root, 'src/test/fixtures/atlas-compat');
const expected = JSON.parse(readFileSync(join(fixtureRoot, 'manifest.json'), 'utf8'));
mkdirSync(join(root, '.cache'), {recursive: true});
const workspace = mkdtempSync(join(root, '.cache', 'atlas-candidate-'));
const transientTest = join(root, 'src/test/__atlasCandidateGeneration.test.ts');

try {
  writeFileSync(transientTest, readFileSync(join(root, 'scripts/acceptance/atlas-generator.ts.txt')));
  execFileSync(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', 'src/test/__atlasCandidateGeneration.test.ts'], {
    cwd: root,
    stdio: 'inherit',
    env: {...process.env, HISTORICAL_FIXTURE_OUTPUT: workspace},
  });
  const actual = JSON.parse(readFileSync(join(workspace, 'manifest.json'), 'utf8'));
  const original = new Map(expected.fixtures.map(f => [f.worldId, f]));
  assert.equal(actual.fixtures.length, original.size, 'Atlas fixture count changed');
  const failures = [];
  for (const fixture of actual.fixtures) {
    const oracle = original.get(fixture.worldId);
    const candidate = readFileSync(join(workspace, fixture.file));
    const hash = createHash('sha256').update(candidate).digest('hex');
    if (!oracle || fixture.archiveStateHash !== oracle.archiveStateHash || fixture.continuationStateHash !== oracle.continuationStateHash || fixture.archiveTick !== oracle.archiveTick || fixture.continuationTick !== oracle.continuationTick) {
      failures.push(fixture.worldId + ': archive ' + hash + ' expected ' + oracle?.sha256 + ', state ' + fixture.archiveStateHash + ' expected ' + oracle?.archiveStateHash + ', continuation ' + fixture.continuationStateHash + ' expected ' + oracle?.continuationStateHash);
    }
  }
  assert.deepEqual(failures, [], 'Current-source reconstruction does not reproduce pre-refuge oracles; original historical source or binaries are required');
  mkdirSync(fixtureRoot, {recursive: true});
  for (const fixture of actual.fixtures) copyFileSync(join(workspace, fixture.file), join(fixtureRoot, fixture.file));
  const generatedManifest = {
    ...expected,
    method: 'RECONSTRUCTED STATE-EQUIVALENT FIXTURES from current source, using legacy operate commands. Original pre-refuge source commit is unavailable remotely. State and continuation oracles are independent; regenerated archive byte SHA-256 is not the SHA of the old ZIP.',
    missingHistoricalSourceCommit: expected.sourceCommit,
    fixtures: actual.fixtures.map(f => ({
      ...original.get(f.worldId),
      sha256: f.sha256,
      originalHistoricalZipSha256: original.get(f.worldId).sha256,
    })),
  };
  writeFileSync(join(fixtureRoot, 'manifest.json'), JSON.stringify(generatedManifest, null, 2) + '\n');
  console.log('Reconstructed ' + actual.fixtures.length + ' Atlas state-equivalent archives; original historical state oracles matched. Earlier ZIP byte hashes are preserved as provenance, not claimed reproduced.');
} finally {
  if (existsSync(transientTest)) rmSync(transientTest);
  rmSync(workspace, {recursive: true, force: true});
}
