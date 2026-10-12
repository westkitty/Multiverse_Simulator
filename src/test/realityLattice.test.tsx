import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultCrossWorldRegistry } from '../core/crossWorldContract';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { useMultiverseStore } from '../store/multiverseStore';
import { WorldLibraryView } from '../ui/views/WorldLibraryView';

afterEach(() => {
  cleanup();
  useMultiverseStore.getState().setActiveTab('observatory');
});

describe('World Library reality lattice', () => {
  it('derives all world nodes and directed paths from the registered modules and contracts', () => {
    const adapters = defaultCrossWorldRegistry.listAdapters();
    render(<WorldLibraryView />);

    const lattice = screen.getByRole('region', { name: 'The realities are not isolated.' });
    expect(within(lattice).getAllByRole('button', { name: /^Select .* world$/ })).toHaveLength(CORE_WORLD_PLUGINS.length);
    expect(within(lattice).getByRole('img', {
      name: new RegExp(`${CORE_WORLD_PLUGINS.length} worlds connected by ${adapters.length} registered event adapters`),
    })).toBeInTheDocument();

    const paths = Array.from(lattice.querySelectorAll<SVGPathElement>('[data-adapter]'))
      .map(path => path.dataset.adapter);
    expect(paths).toEqual(adapters.map(adapter => adapter.id));
    expect(within(lattice).getByText(new RegExp(`${adapters.length} explicit event translators`))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All worlds (15)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Biosphere & ocean (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planetary systems (4)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orbital & signal (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Civilizations & infrastructure (5)' })).toBeInTheDocument();
  });

  it('keeps node selection keyboard-native and inspects the exact contract and its declared losses', () => {
    render(<WorldLibraryView />);
    const lattice = screen.getByRole('region', { name: 'The realities are not isolated.' });
    const stationWorld = CORE_WORLD_PLUGINS.find(world => world.id === 'station')!;
    const station = within(lattice).getByRole('button', { name: `Select ${stationWorld.name} world` });

    station.focus();
    expect(station).toHaveFocus();
    fireEvent.click(station);
    expect(station).toHaveAttribute('aria-pressed', 'true');

    const linkedAdapters = defaultCrossWorldRegistry.listAdapters().filter(adapter =>
      adapter.sourceWorldId === 'station' || adapter.targetWorldId === 'station',
    );
    expect(linkedAdapters.length).toBeGreaterThan(0);
    const firstAdapter = linkedAdapters[0];
    const transferList = within(lattice).getByRole('group', { name: 'Contracts touching the selected world' });
    const sourceName = CORE_WORLD_PLUGINS.find(world => world.id === firstAdapter.sourceWorldId)!.name;
    const targetName = CORE_WORLD_PLUGINS.find(world => world.id === firstAdapter.targetWorldId)!.name;
    const exactTransfer = within(transferList).getByRole('button', {
      name: new RegExp(`${sourceName}.*${targetName}`),
    });
    fireEvent.click(exactTransfer);

    expect(within(lattice).getByRole('heading', { name: firstAdapter.name })).toBeInTheDocument();
    expect(within(lattice).getByText(firstAdapter.description)).toBeInTheDocument();
    expect(within(lattice).getByText(firstAdapter.sourceEventTypes.join(' · '))).toBeInTheDocument();
    expect(within(lattice).getByText(firstAdapter.targetCommandType)).toBeInTheDocument();
    for (const unit of firstAdapter.requiredUnits) {
      expect(within(lattice).getByText(
        `${unit.sourceField} [${unit.sourceUnit}] → ${unit.targetField} [${unit.targetUnit}] · ${unit.formulaDescription}`,
      )).toBeInTheDocument();
    }
    for (const rule of firstAdapter.transformationRules) {
      expect(within(lattice).getByText(rule)).toBeInTheDocument();
    }
    fireEvent.click(within(lattice).getByText('Inspect information discarded by this translation'));
    for (const loss of firstAdapter.informationLoss) {
      expect(within(lattice).getByText(loss)).toBeInTheDocument();
    }

    fireEvent.click(within(lattice).getByRole('button', { name: /Open Event Observatory/ }));
    expect(useMultiverseStore.getState().activeTab).toBe('events');
  });

  it('filters registered worlds with live, accurate counts and keeps card selection separate from Quick Launch', () => {
    render(<WorldLibraryView />);

    fireEvent.click(screen.getByRole('button', { name: 'Orbital & signal (3)' }));
    expect(screen.getByRole('heading', { name: CORE_WORLD_PLUGINS.find(plugin => plugin.id === 'station')!.name })).toBeInTheDocument();
    const orbitalCards = CORE_WORLD_PLUGINS.filter(plugin =>
      screen.queryByRole('heading', { name: plugin.name }),
    );
    expect(orbitalCards).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'All worlds (15)' }));
    const visibleCards = CORE_WORLD_PLUGINS.filter(plugin =>
      screen.queryByRole('heading', { name: plugin.name }),
    );
    expect(visibleCards).toHaveLength(CORE_WORLD_PLUGINS.length);
    const machineWilderness = screen.getByRole('heading', { name: 'The Machine Wilderness' }).closest('article');
    expect(machineWilderness).not.toBeNull();
    const selectMachine = within(machineWilderness!).getByRole('button', { name: 'Inspect' });
    fireEvent.click(selectMachine);
    expect(within(machineWilderness!).getByRole('button', { name: 'Selected' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(machineWilderness!).getByRole('button', { name: 'Quick Launch Scenario' })).toBeInTheDocument();
  });
});
