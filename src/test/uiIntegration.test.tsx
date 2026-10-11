import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { useMultiverseStore } from '../store/multiverseStore';

describe('Full React UI & Accessibility Integration Journeys', () => {
  it('renders the Observatory, switches across all 3 worlds, steps simulation, dispatches commands, and toggles Accessible Table', async () => {
    render(<App />);

    expect(
      screen.getByText(/THE SIMULATION MULTIVERSE/i),
    ).toBeInTheDocument();

    // Verify Active Observatory is loaded initially with Ecosystem
    const initialTick = useMultiverseStore.getState().runs[
      useMultiverseStore.getState().activeRunId
    ].tick;

    const stepBtn = screen.getByRole('button', {
      name: /Single Step Simulation/i,
    });
    fireEvent.click(stepBtn);

    const nextTick = useMultiverseStore.getState().runs[
      useMultiverseStore.getState().activeRunId
    ].tick;
    expect(nextTick).toBe(initialTick + 1);

    // Dispatch an Ecosystem command ("Introduce Apex Predators (+6)")
    const addPredBtn = screen.getByRole('button', {
      name: /Introduce Apex Predators/i,
    });
    fireEvent.click(addPredBtn);

    const ecoMetrics = useMultiverseStore
      .getState()
      .runs[useMultiverseStore.getState().activeRunId].getLatestMetrics();
    expect(ecoMetrics.predatorCount).toBeGreaterThanOrEqual(6);

    // Toggle Accessible Tabular State Mirror and verify accessible region appears
    const tableBtn = screen.getByRole('button', { name: /Accessible Table/i });
    fireEvent.click(tableBtn);
    expect(
      screen.getByRole('region', {
        name: /Accessible World State Entity Table/i,
      }),
    ).toBeInTheDocument();

    // Quick-switch to World B: Space Station
    fireEvent.click(
      screen.getByRole('button', { name: /World B: Space Station/i }),
    );
    expect(
      useMultiverseStore.getState().runs[
        useMultiverseStore.getState().activeRunId
      ].worldId,
    ).toBe('station');

    // Quick-switch to World C: Civilization
    fireEvent.click(
      screen.getByRole('button', { name: /World C: Civilization/i }),
    );
    expect(
      useMultiverseStore.getState().runs[
        useMultiverseStore.getState().activeRunId
      ].worldId,
    ).toBe('civilization');
  });

  it('navigates across World Library, Timeline, Experiment Lab, Compare, Event Observatory, Data Vault, and Diagnostics', async () => {
    render(<App />);

    // 1. World Library: launch a new seeded world run
    fireEvent.click(screen.getByRole('tab', { name: /World Library/i }));
    expect(
      screen.getByText(/Create a world. Change its conditions/i),
    ).toBeInTheDocument();

    const runsBefore = Object.keys(useMultiverseStore.getState().runs).length;
    fireEvent.click(
      screen.getByRole('button', {
        name: /Initialize & Launch Seeded World Run/i,
      }),
    );
    expect(Object.keys(useMultiverseStore.getState().runs).length).toBe(
      runsBefore + 1,
    );

    // 2. Timeline & Branches: verify replay and fork a branch
    fireEvent.click(screen.getByRole('tab', { name: /Timeline & Branches/i }));
    fireEvent.click(
      screen.getByRole('button', {
        name: /Verify Deterministic Replay from Tick 0/i,
      }),
    );
    expect(screen.getByText(/REPLAY VERIFIED/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Create Independent Branch Reality/i,
      }),
    );
    expect(Object.keys(useMultiverseStore.getState().runs).length).toBe(
      runsBefore + 2,
    );

    // 3. Experiment Lab: execute a paired experiment
    fireEvent.click(screen.getByRole('tab', { name: /Experiment Lab/i }));
    fireEvent.click(
      screen.getByRole('button', {
        name: /Execute Controlled Experiment & Compare/i,
      }),
    );
    await waitFor(() => {
      expect(
        useMultiverseStore.getState().experiments.length,
      ).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText(/EXPERIMENT REPORT/i)).toBeInTheDocument();

    // 4. Compare Realities: step both runs simultaneously
    fireEvent.click(screen.getByRole('tab', { name: /Compare Realities/i }));
    expect(
      screen.getByText(/Compare Divergent Branches & Cross-World Runs/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Step Both Runs/i }),
    );

    // 5. Event Observatory: test incompatible cross-world rejection & compatible preview
    fireEvent.click(screen.getByRole('tab', { name: /Event Observatory/i }));
    fireEvent.click(
      screen.getByRole('button', {
        name: /Test Incompatible Rejection/i,
      }),
    );
    expect(
      screen.getByText(/CROSS-WORLD TRANSFER REJECTED BY CONTRACT/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Preview Compatible Transfer/i,
      }),
    );
    expect(
      screen.getByText(/COMPATIBLE CONTRACT PREVIEW/i),
    ).toBeInTheDocument();

    // 6. Data Vault: verify archive round-trip
    fireEvent.click(screen.getByRole('tab', { name: /Data Vault/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Verify Archive Round-Trip/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Round-Trip Archive Verification PASSED/i),
      ).toBeInTheDocument();
    });

    // 7. Diagnostics & PDK: run 4-world PDK contract verification suite
    fireEvent.click(screen.getByRole('tab', { name: /Diagnostics & PDK/i }));
    fireEvent.click(
      screen.getByRole('button', {
        name: /Run PDK Contract Verification Suite/i,
      }),
    );
    expect(
      screen.getAllByText(/ALL CONTRACTS PASS/i).length,
    ).toBe(4);
  });
});
