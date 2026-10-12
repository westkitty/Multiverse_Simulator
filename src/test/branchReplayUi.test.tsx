import { afterEach, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useMultiverseStore } from '../store/multiverseStore';
import { TimelineView } from '../ui/views/TimelineView';
import { SimulationKernel } from '../core/kernel';
import { CORE_WORLD_PLUGINS } from '../worlds';

const startingStore = useMultiverseStore.getState();
afterEach(() => { cleanup(); useMultiverseStore.setState(startingStore, true); });

it('identifies genesis versus fork replay, distinguishes unverifiable origins from mismatches, and suppresses stale success receipts', () => {
  const original = new SimulationKernel({ runId: 'replay-ui-root', name: 'Root', plugin: CORE_WORLD_PLUGINS[9], seed: 101 });
  for (let n = 0; n < 3; n++) original.step();
  const branch = original.forkBranch({ newRunId: 'replay-ui-child', newName: 'Child' });
  for (let n = 0; n < 2; n++) branch.step();
  useMultiverseStore.setState({
    runs: { [original.runId]: original, [branch.runId]: branch },
    activeRunId: branch.runId, isRunning: false, lastReplayCheck: null,
  });
  render(<TimelineView />);
  const label = 'Verify branch replay from fork T3';
  const button = screen.getByRole('button', { name: label });
  fireEvent.click(button);
  expect(screen.getByRole('status')).toHaveTextContent('REPLAY VERIFIED FROM FORK T3');
  expect(useMultiverseStore.getState().lastReplayCheck?.passed).toBe(true);
  // A successful receipt may not survive state changes even at the same tick.
  act(() => {
    branch.enqueueCommand({ type: 'frontier.policy', label: 'Conserve', payload: { policy: 'conserve' } });
    branch.flushCurrentTickCommands();
    useMultiverseStore.setState(s => ({ uiRevision: s.uiRevision + 1 }));
  });
  expect(screen.queryByText(/REPLAY VERIFIED/)).not.toBeInTheDocument();

  // A missing origin becomes an explicit unavailable result, never a false mismatch.
  const broken = branch.exportRunRecord();
  broken.checkpoints = [];
  const unavailable = SimulationKernel.fromRunRecord(broken, CORE_WORLD_PLUGINS[9]);
  act(() => {
    useMultiverseStore.setState(s => ({
      runs: { ...s.runs, [branch.runId]: unavailable },
      uiRevision: s.uiRevision + 1,
      lastReplayCheck: null,
    }));
  });
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(screen.getByRole('status')).toHaveTextContent(/REPLAY UNVERIFIABLE.*fork checkpoint is missing/);

  act(() => useMultiverseStore.getState().selectRun(original.runId));
  expect(screen.getByRole('button', { name: /Verify deterministic replay from genesis T0/ })).toBeInTheDocument();
});
