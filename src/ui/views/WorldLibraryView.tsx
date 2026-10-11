import React, { useState } from 'react';
import { WorldId } from '../../core/contracts';
import { useMultiverseStore } from '../../store/multiverseStore';
import { CORE_WORLD_PLUGINS } from '../../worlds';

export const WorldLibraryView: React.FC = () => {
  const createNewRun = useMultiverseStore((s) => s.createNewRun);
  const runs = useMultiverseStore((s) => s.runs);
  const selectRun = useMultiverseStore((s) => s.selectRun);
  const setActiveTab = useMultiverseStore((s) => s.setActiveTab);

  const [selectedWorldId, setSelectedWorldId] = useState<WorldId>('ecosystem');
  const activePlugin =
    CORE_WORLD_PLUGINS.find((p) => p.id === selectedWorldId) ??
    CORE_WORLD_PLUGINS[0];

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    activePlugin.scenarios[0].id,
  );
  const activeScenario =
    activePlugin.scenarios.find((s) => s.id === selectedScenarioId) ??
    activePlugin.scenarios[0];

  const [customName, setCustomName] = useState<string>('');
  const [customSeed, setCustomSeed] = useState<number>(activeScenario.seed);
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({
    ...activeScenario.config,
  });

  const handleSelectWorld = (worldId: WorldId) => {
    setSelectedWorldId(worldId);
    const plugin =
      CORE_WORLD_PLUGINS.find((p) => p.id === worldId) ?? CORE_WORLD_PLUGINS[0];
    const firstSc = plugin.scenarios[0];
    setSelectedScenarioId(firstSc.id);
    setCustomSeed(firstSc.seed);
    setConfigDraft({ ...firstSc.config });
  };

  const handleSelectScenario = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    const sc =
      activePlugin.scenarios.find((s) => s.id === scenarioId) ??
      activePlugin.scenarios[0];
    setCustomSeed(sc.seed);
    setConfigDraft({ ...sc.config });
  };

  const handleLaunchRun = (e: React.FormEvent) => {
    e.preventDefault();
    createNewRun({
      worldId: activePlugin.id,
      scenarioId: activeScenario.id,
      customName: customName.trim() || undefined,
      customSeed: Number(customSeed) || 1337,
      configOverrides: configDraft,
      switchToObservatory: true,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Hero Banner */}
      <div
        style={{
          backgroundColor: '#0c111b',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#00e5ff',
            letterSpacing: '0.08em',
          }}
        >
          OMNIVERSE ENGINE // DETERMINISTIC MULTIVERSE SIMULATION LABORATORY
        </div>
        <h1 style={{ margin: 0, fontSize: '22px', color: '#f8fafc' }}>
          Create a world. Change its conditions. Watch consequences unfold.
        </h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', maxWidth: '860px' }}>
          All three world modules execute on a shared fixed-timestep deterministic kernel with
          seeded PRNG streams, append-only causal event journals, copy-on-write checkpoints,
          and side-by-side branch comparison.
        </p>
      </div>

      {/* Three World Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '14px',
        }}
      >
        {CORE_WORLD_PLUGINS.map((plugin) => {
          const isSelected = plugin.id === activePlugin.id;
          return (
            <div
              key={plugin.id}
              onClick={() => handleSelectWorld(plugin.id)}
              style={{
                backgroundColor: isSelected ? '#111927' : '#0b0f17',
                border: `2px solid ${isSelected ? plugin.accentColor : '#1e293b'}`,
                borderRadius: '8px',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: plugin.accentColor,
                      fontWeight: 700,
                    }}
                  >
                    MODULE // {plugin.id.toUpperCase()} v{plugin.version}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      backgroundColor: isSelected ? plugin.accentColor : '#1e293b',
                      color: isSelected ? '#000' : '#cbd5e1',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    {isSelected ? 'Selected' : 'Select World'}
                  </span>
                </div>

                <h2 style={{ margin: '0 0 4px 0', fontSize: '17px', color: '#f8fafc' }}>
                  {plugin.name}
                </h2>
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '8px' }}>
                  {plugin.subtitle}
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                  {plugin.description}
                </p>
              </div>

              <div
                style={{
                  borderTop: '1px solid #1e293b',
                  paddingTop: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {plugin.scenarios.length} Scenarios • {plugin.metricDefinitions.length} Metrics
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    createNewRun({
                      worldId: plugin.id,
                      scenarioId: plugin.scenarios[0].id,
                      switchToObservatory: true,
                    });
                  }}
                  style={{
                    backgroundColor: plugin.accentColor,
                    color: '#05080f',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Quick Launch Scenario
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* New Simulation Configurator & Physical Model Documentation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        <form
          onSubmit={handleLaunchRun}
          style={{
            backgroundColor: '#0b0f17',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>
            Configure & Launch New Seeded Simulation ({activePlugin.name})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
              Scenario Preset:
              <select
                aria-label="Scenario Preset"
                value={selectedScenarioId}
                onChange={(e) => handleSelectScenario(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '7px',
                  fontSize: '12px',
                }}
              >
                {activePlugin.scenarios.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name} — {sc.subtitle}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
              {activeScenario.description}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: '#00e5ff',
                backgroundColor: 'rgba(0, 229, 255, 0.08)',
                padding: '6px 8px',
                borderRadius: '4px',
                marginTop: '4px',
              }}
            >
              <strong>Scientific Hypothesis:</strong> {activeScenario.hypothesis}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}
          >
            <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
              Run Label (Optional):
              <input
                type="text"
                placeholder={`${activeScenario.name}`}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: '4px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '6px 8px',
                  fontSize: '12px',
                }}
              />
            </label>

            <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
              Deterministic PRNG Seed:
              <input
                type="number"
                aria-label="Deterministic PRNG Seed"
                value={customSeed}
                onChange={(e) => setCustomSeed(Number(e.target.value))}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: '4px',
                  backgroundColor: '#0f172a',
                  color: '#00e5ff',
                  fontFamily: 'monospace',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '6px 8px',
                  fontSize: '12px',
                }}
              />
            </label>
          </div>

          {/* Dynamic Config Parameters */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
              gap: '8px',
              borderTop: '1px solid #1e293b',
              paddingTop: '10px',
            }}
          >
            {Object.entries(configDraft).map(([key, val]) => {
              if (typeof val === 'boolean') {
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      color: '#cbd5e1',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={val}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, [key]: e.target.checked })
                      }
                    />
                    {key}
                  </label>
                );
              }
              return (
                <label key={key} style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {key}:
                  <input
                    type="number"
                    step="any"
                    value={Number(val)}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        [key]: Number(e.target.value),
                      })
                    }
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      marginTop: '2px',
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      padding: '4px 6px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}
                  />
                </label>
              );
            })}
          </div>

          <button
            type="submit"
            style={{
              backgroundColor: activePlugin.accentColor,
              color: '#05080f',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            Initialize & Launch Seeded World Run
          </button>
        </form>

        {/* Physical Model & Active Runs Panel */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0b0f17',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#f8fafc' }}>
              Documented Physical & Mathematical Model ({activePlugin.name})
            </h3>
            <ul
              style={{
                margin: '0 0 10px 0',
                paddingLeft: '18px',
                fontSize: '12px',
                color: '#cbd5e1',
                lineHeight: 1.55,
              }}
            >
              {activePlugin.physicalModelDocumentation.map((doc, i) => (
                <li key={i} style={{ marginBottom: '4px' }}>
                  {doc}
                </li>
              ))}
            </ul>
            <div
              style={{
                fontSize: '11px',
                color: '#ffb300',
                backgroundColor: 'rgba(255, 179, 0, 0.08)',
                border: '1px solid rgba(255, 179, 0, 0.3)',
                borderRadius: '4px',
                padding: '8px',
              }}
            >
              <strong>Explicit Modeling Boundary:</strong>{' '}
              {activePlugin.simplifiedMechanicsNote}
            </div>
          </div>

          {/* Active Runs Quick Switcher */}
          <div
            style={{
              backgroundColor: '#0b0f17',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#f8fafc' }}>
              Active Runs in Memory ({Object.keys(runs).length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Object.values(runs).map((r) => (
                <div
                  key={r.runId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    fontSize: '12px',
                  }}
                >
                  <div>
                    <strong style={{ color: '#f8fafc' }}>{r.name}</strong>{' '}
                    <span style={{ color: '#64748b', fontFamily: 'monospace' }}>
                      [Tick {r.tick} • Seed {r.seed}]
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      selectRun(r.runId);
                      setActiveTab('observatory');
                    }}
                    style={{
                      backgroundColor: '#00e5ff',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Open Observatory
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
