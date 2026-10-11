import React, { useEffect } from 'react';
import { MultiverseTab, useMultiverseStore } from './store/multiverseStore';
import { CompareView } from './ui/views/CompareView';
import { DataVaultView } from './ui/views/DataVaultView';
import { DiagnosticsView } from './ui/views/DiagnosticsView';
import { EventObservatoryView } from './ui/views/EventObservatoryView';
import { ExperimentLabView } from './ui/views/ExperimentLabView';
import { ObservatoryView } from './ui/views/ObservatoryView';
import { TimelineView } from './ui/views/TimelineView';
import { WorldLibraryView } from './ui/views/WorldLibraryView';

const NAV_TABS: Array<{ id: MultiverseTab; label: string }> = [
  { id: 'library', label: 'World Library' },
  { id: 'observatory', label: 'Active Observatory' },
  { id: 'timeline', label: 'Timeline & Branches' },
  { id: 'lab', label: 'Experiment Lab' },
  { id: 'compare', label: 'Compare Realities' },
  { id: 'events', label: 'Event Observatory' },
  { id: 'vault', label: 'Data Vault' },
  { id: 'diagnostics', label: 'Diagnostics & PDK' },
];

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
  const stepActiveRun = useMultiverseStore((s) => s.stepActiveRun);
  const clearAlerts = useMultiverseStore((s) => s.clearAlerts);

  useEffect(() => {
    initializeStoreFromDb();
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

  const handleQuickSwitchWorld = (worldId: 'ecosystem' | 'station' | 'civilization') => {
    const existing = Object.values(runs).find((r) => r.worldId === worldId);
    if (existing) {
      selectRun(existing.runId);
      setActiveTab('observatory');
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
                <span style={{ color: '#00e5ff', fontWeight: 500, fontSize: '11px', fontFamily: 'monospace' }}>
                  // OMNIVERSE ENGINE v1.0
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                Deterministic Causal Laboratory • Seeded PRNG • Copy-on-Write Branching
              </div>
            </div>
          </div>

          {/* 1-Click World Switcher Pills */}
          <div
            role="group"
            aria-label="Quick World Switcher"
            style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}
          >
            <button
              type="button"
              onClick={() => handleQuickSwitchWorld('ecosystem')}
              style={{
                backgroundColor:
                  activeKernel?.worldId === 'ecosystem' ? '#00e676' : '#0f172a',
                color: activeKernel?.worldId === 'ecosystem' ? '#000' : '#cbd5e1',
                border: '1px solid #00e676',
                borderRadius: '4px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              World A: Ecosystem
            </button>

            <button
              type="button"
              onClick={() => handleQuickSwitchWorld('station')}
              style={{
                backgroundColor:
                  activeKernel?.worldId === 'station' ? '#00e5ff' : '#0f172a',
                color: activeKernel?.worldId === 'station' ? '#000' : '#cbd5e1',
                border: '1px solid #00e5ff',
                borderRadius: '4px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              World B: Space Station
            </button>

            <button
              type="button"
              onClick={() => handleQuickSwitchWorld('civilization')}
              style={{
                backgroundColor:
                  activeKernel?.worldId === 'civilization' ? '#ffb300' : '#0f172a',
                color: activeKernel?.worldId === 'civilization' ? '#000' : '#cbd5e1',
                border: '1px solid #ffb300',
                borderRadius: '4px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              World C: Civilization
            </button>
          </div>
        </div>

        {/* Primary Workbench Navigation */}
        <nav
          aria-label="Multiverse Workbenches"
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
        </nav>
      </header>

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
