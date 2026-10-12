import { describe, expect, it } from 'vitest';
import { SimulationKernel } from '../core/kernel';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { createPortableArchiveZip, inspectAndUnpackArchiveZip } from '../persistence/archive';

const plugin = CORE_WORLD_PLUGINS[9];
function root(id: string, maxCheckpoints = 8) {
  return new SimulationKernel({
    runId: id, name: id, plugin, seed: 16237,
    budget: { maxCheckpoints, autoCheckpointIntervalTicks: 2 },
  });
}
function command(run: SimulationKernel, type: string, payload: Record<string, unknown>) {
  run.enqueueCommand({ type, label: type, payload });
  run.flushCurrentTickCommands();
}
function advance(run: SimulationKernel, ticks: number) {
  for (let i = 0; i < ticks; i++) run.step();
}

describe('Replay proof for counterfactual branches', () => {
  it('starts at the actual fork origin, ignores inherited commands, preserves original and child hashes, and pins the origin under checkpoint pressure', () => {
    const source = root('origin-parent', 3);
    advance(source, 4);
    command(source, 'frontier.forcing', { delta: 0.25 });
    const checkpoint = source.createCheckpoint('Approved departure state');
    advance(source, 3);
    const originalParentHash = source.getStateHash();
    const fork = source.forkBranch({
      newRunId: 'origin-child', newName: 'Origin Child',
      checkpointId: checkpoint.id,
      configPatch: { forcing: 1.5 },
      initialCommand: { type: 'frontier.policy', label: 'Conserve', payload: { policy: 'conserve' } },
    });
    const origin = fork.listCheckpoints()[0];
    expect(origin.tick).toBe(checkpoint.tick);
    expect(origin.replayJournal?.events.some(e => e.type === 'reality_branched')).toBe(true);
    expect(origin.stateHash).not.toBe('');
    advance(fork, 14);
    command(fork, 'frontier.forcing', { delta: -0.1 });
    expect(fork.listCheckpoints()[0].id).toBe(origin.id);
    const before = fork.getStateHash();
    const replay = fork.replayFromStart();
    expect(replay.verificationBasis).toBe('fork_checkpoint');
    expect(replay.originTick).toBe(checkpoint.tick);
    expect(replay.matchesAuthoritativeHash).toBe(true);
    expect(replay.replayedKernel.getStateHash()).toBe(before);
    expect(fork.getStateHash()).toBe(before);
    expect(source.getStateHash()).toBe(originalParentHash);
    expect(source.replayFromStart().matchesAuthoritativeHash).toBe(true);
  });

  it('round-trips a branch snapshot and retained journal through the existing portable ZIP format', () => {
    const source = root('zip-source');
    advance(source, 5);
    const child = source.forkBranch({ newRunId: 'zip-child', newName: 'Zip Child' });
    command(child, 'frontier.policy', { policy: 'restore' });
    advance(child, 3);
    const before = child.getStateHash();
    const zip = createPortableArchiveZip(child.exportRunRecord());
    const parsed = inspectAndUnpackArchiveZip(zip);
    expect(parsed.valid).toBe(true);
    expect(parsed.record?.checkpoints[0].replayJournal).toBeDefined();
    const restored = SimulationKernel.fromRunRecord(parsed.record!, plugin);
    expect(restored.getStateHash()).toBe(before);
    expect(restored.replayFromStart().matchesAuthoritativeHash).toBe(true);
    advance(restored, 2);
    advance(child, 2);
    expect(restored.getStateHash()).toBe(child.getStateHash());
  });

  it('supports nested fork origins without replaying either ancestor intervention history', () => {
    const source = root('nested-source');
    advance(source, 4);
    command(source, 'frontier.forcing', { delta: 0.2 });
    const child = source.forkBranch({ newRunId: 'nested-child', newName: 'Nested child' });
    command(child, 'frontier.policy', { policy: 'conserve' });
    advance(child, 3);
    const grandchild = child.forkBranch({
      newRunId: 'nested-grandchild', newName: 'Nested grandchild',
      initialCommand: { type: 'frontier.policy', label: 'Restore', payload: { policy: 'restore' } },
    });
    advance(grandchild, 5);
    expect(grandchild.replayFromStart().matchesAuthoritativeHash).toBe(true);
    expect(child.replayFromStart().matchesAuthoritativeHash).toBe(true);
  });

  it('recovers older saved forks from their retained branch event, without retroactively changing the archive schema', () => {
    const source = root('legacy-source');
    advance(source, 4);
    const child = source.forkBranch({ newRunId: 'legacy-child', newName: 'Old branch' });
    command(child, 'frontier.forcing', { delta: 0.15 });
    advance(child, 4);
    const legacy = child.exportRunRecord();
    delete legacy.checkpoints[0].replayJournal;
    const restored = SimulationKernel.fromRunRecord(legacy, plugin);
    const replay = restored.replayFromStart();
    expect(replay.verificationBasis).toBe('legacy_fork_journal');
    expect(replay.matchesAuthoritativeHash).toBe(true);
  });

  it('refuses a false PASS when historical proof, origin checkpoint or causal history is absent', () => {
    const source = root('unverified-root');
    advance(source, 5);
    expect(() => source.replayFromStart(3)).toThrow(/no authoritative checkpoint/);
    const cp = source.createCheckpoint('Measured state at T5');
    advance(source, 2);
    const historical = source.replayFromStart(cp.tick);
    expect(historical.matchesAuthoritativeHash).toBe(true);
    expect(historical.verificationBasis).toBe('genesis');

    const child = source.forkBranch({ newRunId: 'unverified-child', newName: 'Child' });
    const record = child.exportRunRecord();
    const tampered = structuredClone(record);
    tampered.checkpoints[0].serializedState.schemaVersion = 999;
    expect(() => SimulationKernel.fromRunRecord(tampered, plugin).replayFromStart())
      .toThrow(/checkpoint hash does not match/);

    const missing = structuredClone(record);
    missing.checkpoints = [];
    expect(() => SimulationKernel.fromRunRecord(missing, plugin).replayFromStart())
      .toThrow(/fork checkpoint is missing/);

    const evicted = structuredClone(record);
    delete evicted.checkpoints[0].replayJournal;
    evicted.eventJournal.events = [];
    expect(() => SimulationKernel.fromRunRecord(evicted, plugin).replayFromStart())
      .toThrow(/legacy fork-origin event history has expired/);
    expect(() => child.replayFromStart(child.getLineage().forkedAtTick - 1))
      .toThrow(/before its fork-origin/);
  });
});
