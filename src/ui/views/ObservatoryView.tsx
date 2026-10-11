import React, { useState } from 'react';
import { ThreeWorldViewport } from '../../renderers/ThreeWorldViewport';
import { useMultiverseStore } from '../../store/multiverseStore';
import { CivilizationState } from '../../worlds/civilization/civilizationPlugin';
import { EcosystemState } from '../../worlds/ecosystem/ecosystemPlugin';
import { StationState } from '../../worlds/station/stationPlugin';
import { AccessibleStateTable } from '../components/AccessibleStateTable';
import { TelemetryCharts } from '../components/TelemetryCharts';

export const ObservatoryView: React.FC = () => {
  const runs = useMultiverseStore((s) => s.runs);
  const activeRunId = useMultiverseStore((s) => s.activeRunId);
  const isRunning = useMultiverseStore((s) => s.isRunning);
  const simulationSpeed = useMultiverseStore((s) => s.simulationSpeed);
  const selectedEntityId = useMultiverseStore((s) => s.selectedEntityId);
  const preferences = useMultiverseStore((s) => s.preferences);
  useMultiverseStore((s) => s.uiRevision);

  const selectRun = useMultiverseStore((s) => s.selectRun);
  const selectEntity = useMultiverseStore((s) => s.selectEntity);
  const selectEvent = useMultiverseStore((s) => s.selectEvent);
  const setActiveTab = useMultiverseStore((s) => s.setActiveTab);
  const toggleRunning = useMultiverseStore((s) => s.toggleRunning);
  const setSimulationSpeed = useMultiverseStore((s) => s.setSimulationSpeed);
  const stepActiveRun = useMultiverseStore((s) => s.stepActiveRun);
  const fastForwardActiveRun = useMultiverseStore((s) => s.fastForwardActiveRun);
  const resetActiveRun = useMultiverseStore((s) => s.resetActiveRun);
  const dispatchCommand = useMultiverseStore((s) => s.dispatchCommand);
  const createManualCheckpoint = useMultiverseStore((s) => s.createManualCheckpoint);
  const forkRunBranch = useMultiverseStore((s) => s.forkRunBranch);
  const setRenderTelemetry = useMultiverseStore((s) => s.setRenderTelemetry);
  const setWebglStatus = useMultiverseStore((s) => s.setWebglStatus);
  const updatePreferences = useMultiverseStore((s) => s.updatePreferences);

  const [inspectorOpenMobile, setInspectorOpenMobile] = useState<boolean>(true);

  const kernel = runs[activeRunId] ?? Object.values(runs)[0];
  if (!kernel) return null;

  const plugin = kernel.plugin;
  const renderFrame = kernel.extractRenderFrame();
  const metricHistory = kernel.getMetricHistory();
  const entities = kernel.inspectEntities();
  const recentEvents = kernel.getEvents().slice(-8).reverse();

  const selectedEntity =
    entities.find((e) => e.entityId === selectedEntityId) ?? entities[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Top Run & Time Control Bar */}
      <div
        style={{
          backgroundColor: '#0b0f17',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '10px 14px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '12px', color: '#94a3b8' }}>
            Active Run:{' '}
            <select
              aria-label="Select Active Simulation Run"
              value={kernel.runId}
              onChange={(e) => selectRun(e.target.value)}
              style={{
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: `1px solid ${plugin.accentColor}`,
                borderRadius: '4px',
                padding: '5px 8px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {Object.values(runs).map((r) => (
                <option key={r.runId} value={r.runId}>
                  {r.name} (Tick {r.tick})
                </option>
              ))}
            </select>
          </label>

          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              padding: '4px 8px',
              borderRadius: '4px',
              color: '#00e5ff',
            }}
          >
            TICK: <strong>{kernel.tick}</strong> | SEED: {kernel.seed} | HASH:{' '}
            {kernel.getStateHash().slice(0, 8)}
          </span>
        </div>

        {/* Playback & Branching Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => toggleRunning()}
            aria-label={isRunning ? 'Pause Simulation' : 'Resume Simulation'}
            style={{
              backgroundColor: isRunning ? '#ffb300' : '#00e676',
              color: '#05080f',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isRunning ? '⏸ Pause' : '▶ Run'}
          </button>

          <button
            type="button"
            onClick={() => stepActiveRun(1)}
            disabled={isRunning}
            aria-label="Single Step Simulation"
            style={{
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            +1 Step
          </button>

          <button
            type="button"
            onClick={() => fastForwardActiveRun(10)}
            aria-label="Fast Forward 10 Ticks"
            style={{
              backgroundColor: '#1e293b',
              color: '#00e5ff',
              border: '1px solid #0e7490',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ⏩ +10 Ticks
          </button>

          <select
            aria-label="Simulation Speed"
            value={simulationSpeed}
            onChange={(e) =>
              setSimulationSpeed(Number(e.target.value) as 0.5 | 1 | 2 | 4 | 8)
            }
            style={{
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '5px 8px',
              fontSize: '12px',
            }}
          >
            <option value={0.5}>0.5x Speed</option>
            <option value={1}>1x Speed</option>
            <option value={2}>2x Speed</option>
            <option value={4}>4x Speed</option>
            <option value={8}>8x Speed</option>
          </select>

          <button
            type="button"
            onClick={() => createManualCheckpoint()}
            style={{
              backgroundColor: '#0f172a',
              color: '#cbd5e1',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            📌 Checkpoint
          </button>

          <button
            type="button"
            onClick={() => {
              forkRunBranch({
                newName: `${kernel.name} [Branch @ T${kernel.tick}]`,
                hypothesisNote: `Manual branch forked from observatory at tick ${kernel.tick}`,
              });
            }}
            style={{
              backgroundColor: '#0f172a',
              color: '#a855f7',
              border: '1px solid #7e22ce',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⑂ Fork Branch
          </button>

          <button
            type="button"
            onClick={resetActiveRun}
            style={{
              backgroundColor: '#0f172a',
              color: '#ff3d57',
              border: '1px solid #881337',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ↺ Reset
          </button>

          <button
            type="button"
            onClick={() =>
              updatePreferences({
                accessibleTableView: !preferences.accessibleTableView,
              })
            }
            style={{
              backgroundColor: preferences.accessibleTableView ? '#00e5ff' : '#0f172a',
              color: preferences.accessibleTableView ? '#000' : '#cbd5e1',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {preferences.accessibleTableView ? 'Hide State Table' : 'Accessible Table'}
          </button>
        </div>
      </div>

      {/* Main Observatory Split: 3D Viewport + Command Deck on Left, Inspector + Events on Right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: '14px',
        }}
      >
        <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <ThreeWorldViewport
            frame={renderFrame}
            selectedEntityId={selectedEntity?.entityId ?? null}
            onSelectEntity={selectEntity}
            simplifiedMode={preferences.simplified3D}
            reducedMotion={preferences.reducedMotion}
            highContrast={preferences.highContrast}
            onTelemetrySample={setRenderTelemetry}
            onWebglStatusChange={setWebglStatus}
          />

          {preferences.accessibleTableView && (
            <AccessibleStateTable
              entities={entities}
              selectedEntityId={selectedEntity?.entityId ?? null}
              onSelectEntity={selectEntity}
            />
          )}

          {/* World-Specific Interactive Intervention Deck */}
          <div
            style={{
              backgroundColor: '#0b0f17',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#f8fafc',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>INTERACTIVE INTERVENTIONS & COMMAND DECK ({plugin.name})</span>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>
                All interventions log direct causal provenance
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              {plugin.quickInterventions.map((item) => {
                const borderColor =
                  item.category === 'crisis'
                    ? '#ff3d57'
                    : item.category === 'restoration'
                      ? '#00e676'
                      : item.category === 'structure'
                        ? '#ffb300'
                        : '#00e5ff';

                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.description}
                    onClick={() =>
                      dispatchCommand(item.commandType, item.label, item.defaultPayload)
                    }
                    style={{
                      backgroundColor: '#111827',
                      color: '#f8fafc',
                      border: `1px solid ${borderColor}`,
                      borderRadius: '6px',
                      padding: '7px 11px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Domain-Specific Granular Control Panel */}
            {kernel.worldId === 'ecosystem' && (
              <EcosystemHeatmapMatrix
                state={kernel.getState() as EcosystemState}
                selectedEntityId={selectedEntity?.entityId ?? null}
                onSelectZone={selectEntity}
              />
            )}

            {kernel.worldId === 'station' && (
              <StationControlMatrix
                state={kernel.getState() as StationState}
                onDispatch={dispatchCommand}
                onSelectEntity={selectEntity}
              />
            )}

            {kernel.worldId === 'civilization' && (
              <CivilizationControlMatrix
                state={kernel.getState() as CivilizationState}
                onDispatch={dispatchCommand}
                onSelectEntity={selectEntity}
              />
            )}

            {kernel.worldId !== 'ecosystem' &&
              kernel.worldId !== 'station' &&
              kernel.worldId !== 'civilization' && (
                <UniversalDomainMatrix
                  frame={renderFrame}
                  selectedEntityId={selectedEntity?.entityId ?? null}
                  onSelectEntity={selectEntity}
                />
              )}
          </div>
        </div>

        {/* Right Column: Entity Inspector & Causal Event Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              backgroundColor: '#0b0f17',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#00e5ff' }}>
                ENTITY / SUBSYSTEM INSPECTOR
              </span>
              <button
                type="button"
                onClick={() => setInspectorOpenMobile(!inspectorOpenMobile)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                {inspectorOpenMobile ? 'Collapse' : 'Expand'}
              </button>
            </div>

            {inspectorOpenMobile && selectedEntity && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <select
                    aria-label="Select Entity to Inspect"
                    value={selectedEntity.entityId}
                    onChange={(e) => selectEntity(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      padding: '5px',
                      fontSize: '12px',
                    }}
                  >
                    {entities.map((ent) => (
                      <option key={ent.entityId} value={ent.entityId}>
                        [{ent.kind}] {ent.label} ({ent.status.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: '#cbd5e1',
                    backgroundColor: '#0f172a',
                    padding: '6px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {selectedEntity.summary}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px',
                  }}
                >
                  {selectedEntity.properties.map((prop) => (
                    <div
                      key={prop.key}
                      style={{
                        backgroundColor: '#111827',
                        border: '1px solid #1e293b',
                        borderRadius: '4px',
                        padding: '5px 8px',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ color: '#64748b', fontSize: '10px' }}>{prop.label}</div>
                      <div style={{ color: '#f8fafc', fontFamily: 'monospace', fontWeight: 600 }}>
                        {prop.value} {prop.unit ?? ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Live Causal Event Stream */}
          <div
            style={{
              backgroundColor: '#0b0f17',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px',
              flex: 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                CAUSAL EVENT STREAM ({kernel.getEvents().length})
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('events')}
                style={{
                  backgroundColor: 'transparent',
                  color: '#00e5ff',
                  border: 'none',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Open Causal Inspector →
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
              {recentEvents.map((ev) => {
                const badgeColor =
                  ev.severity === 'critical'
                    ? '#ff3d57'
                    : ev.severity === 'warning'
                      ? '#ffb300'
                      : ev.severity === 'positive'
                        ? '#00e676'
                        : '#00e5ff';

                return (
                  <div
                    key={ev.id}
                    onClick={() => {
                      selectEvent(ev.id);
                      setActiveTab('events');
                    }}
                    style={{
                      backgroundColor: '#0f172a',
                      borderLeft: `3px solid ${badgeColor}`,
                      borderRadius: '4px',
                      padding: '6px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                      <strong style={{ color: '#f8fafc' }}>{ev.title}</strong>
                      <span style={{ fontFamily: 'monospace' }}>T{ev.tick}</span>
                    </div>
                    <div style={{ color: '#94a3b8', marginTop: '2px' }}>{ev.description}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Live Telemetry Charts */}
      <TelemetryCharts
        metricDefinitions={plugin.metricDefinitions}
        history={metricHistory}
        accentColor={plugin.accentColor}
      />
    </div>
  );
};

const EcosystemHeatmapMatrix: React.FC<{
  state: EcosystemState;
  selectedEntityId: string | null;
  onSelectZone: (id: string) => void;
}> = ({ state, selectedEntityId, onSelectZone }) => {
  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
        SPATIAL 8x6 HABITAT RESOURCE HEATMAP (48 Active Zones — Flora Biomass & Soil Moisture — Click sector to inspect):
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: '5px',
        }}
      >
        {state.zones.map((z) => {
          const bioPct = Math.min(100, Math.round((z.plantBiomass / 120) * 100));
          const isSelected = selectedEntityId === z.id;
          return (
            <div
              key={z.id}
              onClick={() => onSelectZone(z.id)}
              style={{
                backgroundColor: `rgba(16, 185, 129, ${Math.max(0.08, (bioPct / 100) * 0.35)})`,
                border: `1px solid ${isSelected ? '#00e5ff' : '#1e293b'}`,
                borderRadius: '4px',
                padding: '4px 6px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, color: '#f8fafc' }}>{z.label}</div>
              <div style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>
                Bio: {z.plantBiomass}kg | H2O: {z.moisture}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const UniversalDomainMatrix: React.FC<{
  frame: ReturnType<import('../../core/kernel').SimulationKernel['extractRenderFrame']>;
  selectedEntityId: string | null;
  onSelectEntity: (id: string) => void;
}> = ({ frame, selectedEntityId, onSelectEntity }) => {
  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
        SPATIAL SECTOR / NODE TELEMETRY MATRIX ({frame.zones.length} Active Zones & {frame.entities.length} Entities — Click to inspect):
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '5px',
          maxHeight: '220px',
          overflowY: 'auto',
        }}
      >
        {frame.zones.map((z) => {
          const isSelected = selectedEntityId === z.id;
          const badge =
            z.status === 'critical' ? '■' : z.status === 'warning' ? '▲' : '●';
          return (
            <div
              key={z.id}
              onClick={() => onSelectEntity(z.id)}
              style={{
                backgroundColor: '#0f172a',
                border: `1px solid ${isSelected ? '#00e5ff' : z.color}`,
                borderRadius: '4px',
                padding: '4px 6px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, color: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
                <span>{z.label.slice(0, 16)}</span>
                <span style={{ color: z.color }}>{badge}</span>
              </div>
              <div style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: '9px' }}>
                {Object.entries(z.metadata ?? {})
                  .slice(0, 2)
                  .map(([k, v]) => `${k.slice(0, 6)}:${v}`)
                  .join(' | ')}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StationControlMatrix: React.FC<{
  state: StationState;
  onDispatch: (type: string, label: string, payload: Record<string, unknown>) => void;
  onSelectEntity: (id: string) => void;
}> = ({ state, onDispatch, onSelectEntity }) => {
  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
        COMPARTMENT ATMOSPHERE, POWER PRIORITY & HATCH BULKHEAD CONTROLS:
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
          gap: '6px',
          marginBottom: '8px',
        }}
      >
        {state.rooms.map((room) => (
          <div
            key={room.id}
            onClick={() => onSelectEntity(room.id)}
            style={{
              backgroundColor: '#0f172a',
              border: `1px solid ${room.alarmActive ? '#ff3d57' : '#1e293b'}`,
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span style={{ color: '#f8fafc' }}>{room.name}</span>
              <span style={{ color: room.alarmActive ? '#ff3d57' : '#00e676' }}>
                {room.pressureKpa} kPa
              </span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94a3b8', margin: '3px 0' }}>
              O2: {room.o2PartialKpa} | CO2: {room.co2PartialKpa} kPa | Pwr: {Math.round(room.poweredFraction * 100)}%
            </div>
            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDispatch('toggle_equipment', `Toggle ${room.name} Load`, {
                    roomId: room.id,
                  });
                }}
                style={{
                  backgroundColor: room.equipmentOnline ? '#00e676' : '#334155',
                  color: room.equipmentOnline ? '#000' : '#f8fafc',
                  border: 'none',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                {room.equipmentOnline ? 'Load ON' : 'Load OFF'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextP = room.powerPriority === 1 ? 3 : (room.powerPriority - 1);
                  onDispatch(
                    'set_power_priority',
                    `Set ${room.name} Priority P${nextP}`,
                    { roomId: room.id, priority: nextP },
                  );
                }}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#00e5ff',
                  border: '1px solid #334155',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                Priority P{room.powerPriority}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {state.hatches.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() =>
              onDispatch('toggle_hatch', `Toggle ${h.label}`, { hatchId: h.id })
            }
            style={{
              backgroundColor: h.isOpen ? 'rgba(0, 230, 118, 0.14)' : 'rgba(255, 61, 87, 0.18)',
              color: h.isOpen ? '#00e676' : '#ff3d57',
              border: `1px solid ${h.isOpen ? '#00e676' : '#ff3d57'}`,
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '10px',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {h.id.replace('hatch-', '').toUpperCase()}: {h.isOpen ? 'OPEN' : 'SEALED'}
          </button>
        ))}
      </div>
    </div>
  );
};

const CivilizationControlMatrix: React.FC<{
  state: CivilizationState;
  onDispatch: (type: string, label: string, payload: Record<string, unknown>) => void;
  onSelectEntity: (id: string) => void;
}> = ({ state, onDispatch, onSelectEntity }) => {
  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
        SETTLEMENT INFRASTRUCTURE & WORKFORCE ALLOCATION DECK:
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '8px',
        }}
      >
        {state.settlements.map((stl) => (
          <div
            key={stl.id}
            onClick={() => onSelectEntity(stl.id)}
            style={{
              backgroundColor: '#0f172a',
              border: `1px solid ${stl.shortageStreakTicks > 0 ? '#ff3d57' : '#1e293b'}`,
              borderRadius: '4px',
              padding: '8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span style={{ color: '#f8fafc' }}>{stl.name}</span>
              <span style={{ color: '#ffb300' }}>
                Pop {stl.population}/{stl.housingCapacity}
              </span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#cbd5e1', margin: '4px 0' }}>
              Food: {stl.foodStock}t | Water: {stl.waterStock}kL | Mat: {stl.materialsStock}t
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDispatch(
                    'build_water_infrastructure',
                    `Upgrade ${stl.name} Aqueduct`,
                    { targetSettlementId: stl.id },
                  );
                }}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#00e5ff',
                  border: '1px solid #334155',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                +Water (L{stl.infrastructure.waterworksLevel})
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDispatch(
                    'expand_food_production',
                    `Upgrade ${stl.name} Farms`,
                    { targetSettlementId: stl.id },
                  );
                }}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#00e676',
                  border: '1px solid #334155',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                +Farms (L{stl.infrastructure.farmsLevel})
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDispatch(
                    'construct_housing',
                    `Expand ${stl.name} Housing`,
                    { targetSettlementId: stl.id },
                  );
                }}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#ffb300',
                  border: '1px solid #334155',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                +Housing (L{stl.infrastructure.housingLevel})
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
