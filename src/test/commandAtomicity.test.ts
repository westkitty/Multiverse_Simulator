import { describe, expect, it } from 'vitest';
import { SimulationKernel } from '../core/kernel';
import { ecosystemPlugin } from '../worlds';

const plugin = {
  ...ecosystemPlugin,
  applyCommand: (
    state: Parameters<typeof ecosystemPlugin.applyCommand>[0],
    command: Parameters<typeof ecosystemPlugin.applyCommand>[1],
    ctx: Parameters<typeof ecosystemPlugin.applyCommand>[2],
  ) => {
    if (!state.exploration) throw new Error('Test requires initialized Atlas state');
    if (command.type === 'injected_failure') {
      state.exploration.expedition.supplies -= 7;
      ctx.rng.stream('failed-command-test').nextFloat();
      ctx.emitEvent({
        type: 'fake_partial_success', severity: 'info', title: 'Must be rolled back',
        description: 'Test-injected intermediate event', sourceSystem: 'test',
      });
      throw new Error('injected command failure');
    }
    if (command.type === 'test_valid') {
      state.exploration.expedition.supplies -= 1;
      ctx.emitEvent({
        type: 'test_valid_effect', severity: 'positive', title: 'Valid',
        description: 'Spent one expedition supply unit', sourceSystem: 'test',
      });
      return;
    }
    ecosystemPlugin.applyCommand(state, command, ctx);
  },
};

function createRun(runId: string) {
  return new SimulationKernel({ runId, name: 'Atomic commands', plugin, seed: 20261011 });
}
function suppliesIn(run: ReturnType<typeof createRun>) {
  const exploration = run.getState().exploration;
  if (!exploration) throw new Error('Test requires initialized Atlas state');
  return exploration.expedition.supplies;
}

describe('Command execution atomicity', () => {
  it('rolls back state, RNG and emitted events after a failed plugin command; preserves later queued commands', () => {
    const run = createRun('atomic-reject-first');
    const before = run.getStateHash();
    const supplies = suppliesIn(run);
    run.enqueueCommand({ type: 'injected_failure', label: 'Fault injection', payload: {} });
    run.enqueueCommand({ type: 'test_valid', label: 'Real action', payload: {} });
    expect(() => run.flushCurrentTickCommands()).toThrow('injected command failure');
    expect(run.getStateHash()).toBe(before);
    expect(run.getExecutedCommands()).toHaveLength(0);
    expect(run.getPendingCommands().map(c => c.type)).toEqual(['test_valid']);
    expect(run.getEvents().filter(e => e.type === 'command:injected_failure' || e.type === 'fake_partial_success')).toHaveLength(0);
    expect(run.getEvents().filter(e => e.type === 'command_rejected')).toHaveLength(1);
    const completed = run.flushCurrentTickCommands();
    expect(completed.map(c => c.type)).toEqual(['test_valid']);
    expect(suppliesIn(run)).toBe(supplies - 1);
    expect(run.getExecutedCommands()).toHaveLength(1);
    expect(run.replayFromStart(run.tick).matchesAuthoritativeHash).toBe(true);
  });

  it('preserves earlier successful commands and leaves commands after a rejection queued for the next flush', () => {
    const run = createRun('atomic-reject-middle');
    const supplies = suppliesIn(run);
    run.enqueueCommand({ type: 'test_valid', label: 'First', payload: {} });
    run.enqueueCommand({ type: 'injected_failure', label: 'Fault', payload: {} });
    run.enqueueCommand({ type: 'test_valid', label: 'Third', payload: {} });
    expect(() => run.flushCurrentTickCommands()).toThrow('injected command failure');
    expect(run.getExecutedCommands()).toHaveLength(1);
    expect(run.getPendingCommands().map(c => c.type)).toEqual(['test_valid']);
    expect(suppliesIn(run)).toBe(supplies - 1);
    expect(run.getEvents().filter(e => e.type === 'command:test_valid')).toHaveLength(1);
    run.flushCurrentTickCommands();
    expect(run.getPendingCommands()).toHaveLength(0);
    expect(run.getExecutedCommands()).toHaveLength(2);
    expect(suppliesIn(run)).toBe(supplies - 2);
    expect(run.replayFromStart(run.tick).matchesAuthoritativeHash).toBe(true);
  });
});
