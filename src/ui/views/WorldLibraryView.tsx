import React, { useState } from 'react';
import { WorldId } from '../../core/contracts';
import { useMultiverseStore } from '../../store/multiverseStore';
import { CORE_WORLD_PLUGINS } from '../../worlds';

type DomainFilter = 'all' | 'biosphere' | 'planetary' | 'orbital' | 'civilization';

const WORLD_DOMAIN_MAP: Record<string, DomainFilter> = {
  ecosystem: 'biosphere',
  ocean: 'biosphere',
  atmosphere: 'planetary',
  geology: 'planetary',
  station: 'orbital',
  celestial: 'orbital',
  civilization: 'civilization',
  megacity: 'civilization',
  industrial: 'civilization',
};

export const WorldLibraryView: React.FC = () => {
  const createNewRun = useMultiverseStore((s) => s.createNewRun);
  const runs = useMultiverseStore((s) => s.runs);
  const selectRun = useMultiverseStore((s) => s.selectRun);
  const setActiveTab = useMultiverseStore((s) => s.setActiveTab);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all');
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

  const filteredPlugins = CORE_WORLD_PLUGINS.filter((plugin) => {
    if (domainFilter !== 'all' && WORLD_DOMAIN_MAP[plugin.id] !== domainFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      plugin.name.toLowerCase().includes(q) ||
      plugin.subtitle.toLowerCase().includes(q) ||
      plugin.description.toLowerCase().includes(q) ||
      plugin.scenarios.some((s) => s.name.toLowerCase().includes(q))
    );
  });

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
          gap: '10px',
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
          OMNIVERSE ENGINE v2.0 // NINE-WORLD TRIPLE-SCALE SIMULATION PLATFORM
        </div>
        <h1 style={{ margin: 0, fontSize: '22px', color: '#f8fafc' }}>
          Create a world. Change its conditions. Watch consequences unfold.
        </h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', maxWidth: '960px' }}>
          All nine world modules execute on a shared fixed-timestep deterministic kernel with
          seeded PRNG streams, 3× expanded spatial scale, 81 curated scenarios, 171 validated
          interventions, 162 live metrics, append-only causal event journals, copy-on-write
          checkpoints, and 10 cross-world causal contract adapters.
        </p>

        {/* Search & Domain Filter Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'center',
            marginTop: '6px',
          }}
        >
          <input
            type="search"
            aria-label="Search Simulation Worlds"
            placeholder="Search 9 worlds, 81 scenarios, or physical mechanics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: '1 1 260px',
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '5px',
              padding: '7px 12px',
              fontSize: '12px',
            }}
          />
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                ['all', 'All Worlds (9)'],
                ['biosphere', 'Biosphere & Ocean (2)'],
                ['planetary', 'Atmosphere & Geology (2)'],
                ['orbital', 'Orbital & Celestial (2)'],
                ['civilization', 'Civilization, City & Industry (3)'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDomainFilter(id)}
                style={{
                  backgroundColor: domainFilter === id ? '#00e5ff' : '#111827',
                  color: domainFilter === id ? '#05080f' : '#cbd5e1',
                  border: `1px solid ${domainFilter === id ? '#00e5ff' : '#334155'}`,
                  borderRadius: '5px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: domainFilter === id ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Nine World Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: '14px',
        }}
      >
        {filteredPlugins.map((plugin) => {
          const isSelected = plugin.id === activePlugin.id;
          const sm = plugin.scaleMetadata;
          const areaRatio = sm
            ? (sm.expandedPlayableArea / Math.max(1, sm.baselinePlayableArea)).toFixed(1)
            : '3.0';

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

                <h2 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#f8fafc' }}>
                  {plugin.name}
                </h2>
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '8px' }}>
                  {plugin.subtitle}
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                  {plugin.description}
                </p>

                {sm && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '6px 8px',
                      backgroundColor: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid #1e293b',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#cbd5e1',
                      fontFamily: 'monospace',
                    }}
                  >
                    Scale: {sm.baselinePlayableArea} →{' '}
                    <strong style={{ color: plugin.accentColor }}>
                      {sm.expandedPlayableArea}
                    </strong>{' '}
                    ({areaRatio}×) • {plugin.quickInterventions.length} Interventions
                  </div>
                )}
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
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
              Scenario Preset ({activePlugin.scenarios.length} Curated Scenarios):
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 145px), 1fr))',
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
