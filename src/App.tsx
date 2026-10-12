import './ui/navigation.css';
import { defaultCrossWorldRegistry } from './core/crossWorldContract';
import { AtlasView } from './ui/views/AtlasView';
import React, { useEffect } from 'react';
import { ENGINE_VERSION, WorldId } from './core/contracts';
import { MultiverseTab, useMultiverseStore } from './store/multiverseStore';
import { CompareView } from './ui/views/CompareView';
import { DataVaultView } from './ui/views/DataVaultView';
import { DiagnosticsView } from './ui/views/DiagnosticsView';
import { EventObservatoryView } from './ui/views/EventObservatoryView';
import { ExperimentLabView } from './ui/views/ExperimentLabView';
import { ObservatoryView } from './ui/views/ObservatoryView';
import { TimelineView } from './ui/views/TimelineView';
import { WorldLibraryView } from './ui/views/WorldLibraryView';
import { CORE_WORLD_PLUGINS } from './worlds';

const NAV_TABS: Array<{ id: MultiverseTab; label: string }> = [
  { id: 'explore', label: 'Explore in 3D' },
  { id: 'atlas', label: 'Living World Atlas' },
  { id: 'library', label: `World Library (${CORE_WORLD_PLUGINS.length})` },
  { id: 'observatory', label: 'Active Observatory' },
  { id: 'timeline', label: 'Timeline & Branches' },
  { id: 'lab', label: 'Experiment Lab' },
  { id: 'compare', label: 'Compare Realities' },
  { id: 'events', label: 'Event Observatory' },
  { id: 'vault', label: 'Data Vault' },
  { id: 'diagnostics', label: 'Diagnostics & PDK' },
];

const SHORT_WORLD_BUTTON_LABELS: Record<string, string> = {
  ecosystem: 'World A: Ecosystem',
  station: 'World B: Space Station',
  civilization: 'World C: Civilization',
  atmosphere: 'World D: Atmosphere',
  ocean: 'World E: Abyssal Ocean',
  celestial: 'World F: Celestial',
  megacity: 'World G: Megacity',
  industrial: 'World H: Industrial',
  geology: 'World I: Restless Planet',
  'wild-meridian': 'World J: Wild Meridian', 'hollow-deep': 'World K: Hollow Deep',
  'timeworn-empire': 'World L: Timeworn Empire', 'terraforming-frontier': 'World M: Terraforming Frontier',
  'machine-wilderness': 'World N: Machine Wilderness', 'signal-expanse': 'World O: Signal Expanse',
};

export const App: React.FC = () => {
  const activeTab = useMultiverseStore((s) => s.activeTab);
  const runs = useMultiverseStore((s) => s.runs);
  const activeRunId = useMultiverseStore((s) => s.activeRunId);
  const isRunning = useMultiverseStore((s) => s.isRunning);
  const simulationSpeed = useMultiverseStore((s) => s.simulationSpeed);
  const preferences = useMultiverseStore((s) => s.preferences);
  const systemAlerts = useMultiverseStore((s) => s.systemAlerts);

  const initializeStoreFromDb = useMultiverseStore((s) => s.initializeStoreFromDb);
  const setActiveTab = useMultiverseStore((s) => s.setActiveTab);
  const selectRun = useMultiverseStore((s) => s.selectRun);
  const createNewRun = useMultiverseStore((s) => s.createNewRun);
  const stepActiveRun = useMultiverseStore((s) => s.stepActiveRun);
  const clearAlerts = useMultiverseStore((s) => s.clearAlerts);

  useEffect(() => {
    initializeStoreFromDb();
  }, []);

  // Hash URLs work on static project hosting without a server-side rewrite.
  useEffect(() => {
    const readRoute = () => {
      const tab = NAV_TABS.find((entry) => `#/${entry.id}` === window.location.hash);
      useMultiverseStore.getState().setActiveTab(tab?.id ?? 'observatory');
    };
    readRoute();
    // Canonicalize the first history entry so Back also restores the initial view.
    window.history.replaceState(null, '', `#/${useMultiverseStore.getState().activeTab}`);
    const unsubscribe = useMultiverseStore.subscribe((state, previous) => {
      if (state.activeTab !== previous.activeTab && window.location.hash !== `#/${state.activeTab}`) {
        window.history.pushState(null, '', `#/${state.activeTab}`);
      }
    });
    window.addEventListener('popstate', readRoute);
    window.addEventListener('hashchange', readRoute);
    return () => {
      unsubscribe();
      window.removeEventListener('popstate', readRoute);
      window.removeEventListener('hashchange', readRoute);
    };
  }, []);

  // Fixed-timestep scheduler loop decoupled from render frame rate
  useEffect(() => {
    if (!isRunning) return;
    const intervalMs = Math.max(60, Math.round(480 / simulationSpeed));
    const timer = setInterval(() => {
      stepActiveRun(1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isRunning, simulationSpeed, stepActiveRun]);

  const activeKernel = runs[activeRunId] ?? Object.values(runs)[0];

  const handleQuickSwitchWorld = (worldId: WorldId) => {
    const existing = Object.values(runs).find((r) => r.worldId === worldId);
    if (existing) {
      selectRun(existing.runId);
      setActiveTab(activeTab === 'explore' ? 'explore' : 'observatory');
    } else {
      const runId = createNewRun({
        worldId,
        switchToObservatory: activeTab !== 'explore',
      });
      const created = useMultiverseStore.getState().runs[runId];
      if (created && created.tick === 0) {
        useMultiverseStore.getState().stepActiveRun(3);
      }
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: preferences.highContrast ? '#000000' : '#07090e',
        color: '#e6edf3',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Observatory Command Header */}
      <header
        style={{
          backgroundColor: '#0b0f17',
          borderBottom: '1px solid #1e293b',
          padding: '10px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: isRunning ? '#00e676' : '#00e5ff',
                boxShadow: `0 0 8px ${isRunning ? '#00e676' : '#00e5ff'}`,
              }}
            />
            <div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  color: '#f8fafc',
                }}
              >
                THE SIMULATION MULTIVERSE{' '}
                <span
                  style={{
                    color: '#00e5ff',
                    fontWeight: 500,
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  }}
                >
                  // OMNIVERSE ENGINE v{ENGINE_VERSION} · DEVELOPMENT · {CORE_WORLD_PLUGINS.length} WORLDS · {__RELEASE_COMMIT__.slice(0, 7)}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                {CORE_WORLD_PLUGINS.length}-World Deterministic Causal Laboratory • Seeded PRNG • Copy-on-Write Branching • {defaultCrossWorldRegistry.listAdapters().length} Cross-World Contracts
              </div>
            </div>
          </div>

          {/* Registry-Driven 9-World Quick Switcher Pills */}
          <div
            className="multiverse-worlds"
            role="group"
            aria-label="Quick World Switcher"
            style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}
          >
            {CORE_WORLD_PLUGINS.map((plugin) => {
              const isSelected = activeKernel?.worldId === plugin.id;
              const btnLabel =
                SHORT_WORLD_BUTTON_LABELS[plugin.id] ?? plugin.name;
              return (
                <button
                  key={plugin.id}
                  aria-pressed={isSelected}
                  type="button"
                  onClick={() => handleQuickSwitchWorld(plugin.id)}
                  style={{
                    backgroundColor: isSelected ? plugin.accentColor : '#0f172a',
                    color: isSelected ? '#05080f' : '#cbd5e1',
                    border: `1px solid ${plugin.accentColor}`,
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {btnLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Workbench Navigation */}
        <nav aria-label="Multiverse Workbenches">
        <div className="multiverse-tabs" role="tablist" aria-label="Multiverse workbench tabs"
          onKeyDown={event => {
            if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
            const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
            const index = tabs.indexOf(event.target as HTMLButtonElement);
            if (index < 0) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next].focus();
            setActiveTab(NAV_TABS[next].id);
          }}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            borderTop: '1px solid #151e2e',
            paddingTop: '8px',
          }}
        >
          {NAV_TABS.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                tabIndex={isSelected ? 0 : -1}
                aria-selected={isSelected}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  backgroundColor: isSelected ? '#00e5ff' : '#111827',
                  color: isSelected ? '#05080f' : '#cbd5e1',
                  border: `1px solid ${isSelected ? '#00e5ff' : '#1e293b'}`,
                  borderRadius: '5px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  minHeight: '34px',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        </nav>
      </header>

      <div style={{ padding: '8px 18px', borderBottom: '1px solid #1e293b', background: '#0b1119', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setActiveTab('explore')} style={{ background: '#8be1d9', color: '#081219', border: 'none', borderRadius: 5, padding: '10px 15px', cursor: 'pointer', fontWeight: 750 }}>Enter this universe in 3D →</button>
        <span style={{ fontSize: 12, color: '#a9bac7' }}>WASD / arrows to move · drag to look · explore all fifteen simulated worlds</span>
      </div>
      {/* Alert Notification Strip */}
      {systemAlerts.length > 0 && (
        <div
          role="status"
          style={{
            backgroundColor: '#111827',
            borderBottom: '1px solid #334155',
            padding: '6px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
          }}
        >
          <div>
            <strong
              style={{
                color:
                  systemAlerts[0].severity === 'error'
                    ? '#ff3d57'
                    : systemAlerts[0].severity === 'recovered'
                      ? '#00e676'
                      : '#ffb300',
              }}
            >
              [{systemAlerts[0].severity.toUpperCase()}] {systemAlerts[0].title}:
            </strong>{' '}
            <span style={{ color: '#cbd5e1' }}>{systemAlerts[0].message}</span>
          </div>
          <button
            type="button"
            onClick={clearAlerts}
            style={{
              backgroundColor: 'transparent',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          padding: '16px 18px',
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {activeTab === 'explore' && <AtlasView key={`explore:${activeRunId}`} initialImmersive />}
        {activeTab === 'atlas' && <AtlasView key={`atlas:${activeRunId}`} />}
        {activeTab === 'library' && <WorldLibraryView />}
        {activeTab === 'observatory' && <ObservatoryView />}
        {activeTab === 'timeline' && <TimelineView />}
        {activeTab === 'lab' && <ExperimentLabView />}
        {activeTab === 'compare' && <CompareView />}
        {activeTab === 'events' && <EventObservatoryView />}
        {activeTab === 'vault' && <DataVaultView />}
        {activeTab === 'diagnostics' && <DiagnosticsView />}
      </main>
    </div>
  );
};
