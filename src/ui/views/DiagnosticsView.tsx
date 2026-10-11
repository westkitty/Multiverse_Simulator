import React, { useState } from 'react';
import {
  createThermalLatticeTemplatePlugin,
  PluginVerificationResult,
  verifyWorldPluginContract,
} from '../../core/pdk';
import { useMultiverseStore } from '../../store/multiverseStore';
import { CORE_WORLD_PLUGINS } from '../../worlds';

export const DiagnosticsView: React.FC = () => {
  const runs = useMultiverseStore((s) => s.runs);
  const activeRunId = useMultiverseStore((s) => s.activeRunId);
  const preferences = useMultiverseStore((s) => s.preferences);
  const systemAlerts = useMultiverseStore((s) => s.systemAlerts);
  useMultiverseStore((s) => s.uiRevision);

  const getPerformanceSample = useMultiverseStore((s) => s.getPerformanceSample);
  const updatePreferences = useMultiverseStore((s) => s.updatePreferences);
  const triggerFaultRecoveryDrill = useMultiverseStore(
    (s) => s.triggerFaultRecoveryDrill,
  );
  const clearAlerts = useMultiverseStore((s) => s.clearAlerts);
  const exportDiagnosticsJson = useMultiverseStore((s) => s.exportDiagnosticsJson);

  const [pdkResults, setPdkResults] = useState<PluginVerificationResult[]>([]);
  const [diagJsonPreview, setDiagJsonPreview] = useState<string | null>(null);

  const activeKernel = runs[activeRunId] ?? Object.values(runs)[0];
  const perf = getPerformanceSample();
  const budget = activeKernel?.getBudget();

  const handleRunPdkSuite = () => {
    const templatePlugin = createThermalLatticeTemplatePlugin();
    const allPlugins = [...CORE_WORLD_PLUGINS, templatePlugin];
    const results = allPlugins.map((p) => verifyWorldPluginContract(p as any, 16));
    setPdkResults(results);
  };

  const handleExportDiagnostics = () => {
    const json = exportDiagnosticsJson();
    setDiagJsonPreview(json);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Performance Telemetry Grid */}
      <div
        style={{
          backgroundColor: '#0b0f17',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#00e5ff' }}>
          SYSTEM DIAGNOSTICS // ENGINE & RENDERING INSTRUMENTATION
        </div>
        <h2 style={{ margin: '4px 0 12px 0', fontSize: '18px', color: '#f8fafc' }}>
          Real-Time Telemetry, Resource Budgets & Fault Recovery Workbench
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 175px), 1fr))',
            gap: '10px',
          }}
        >
          <MetricCard label="Step Duration" value={`${perf.stepDurationMs} ms`} sub="Fixed-Tick CPU Time" />
          <MetricCard label="Sim Steps / Sec" value={`${perf.stepsPerSecond} sps`} sub="Rolling Throughput" />
          <MetricCard label="Render FPS" value={`${perf.renderFps} fps`} sub={`${perf.frameTimeMs} ms/frame`} />
          <MetricCard
            label="Active Entities"
            value={`${perf.entityCount}`}
            sub={`Budget <= ${budget?.maxEntitiesWarning ?? 1200}`}
          />
          <MetricCard
            label="Event Journal"
            value={`${perf.eventCount} evts`}
            sub={`Bounded <= ${budget?.maxEvents ?? 1500}`}
          />
          <MetricCard
            label="Checkpoints"
            value={`${perf.checkpointCount}`}
            sub={`${(perf.snapshotStorageBytes / 1024).toFixed(1)} KB (${budget?.maxCheckpoints ?? 32} max)`}
          />
          <MetricCard
            label="Worker Queue Depth"
            value={`${perf.workerQueueDepth}`}
            sub={`Max Depth ${budget?.maxWorkerQueueDepth ?? 32}`}
          />
          <MetricCard
            label="Heap Memory"
            value={
              perf.heapUsedBytes !== null
                ? `${(perf.heapUsedBytes / (1024 * 1024)).toFixed(1)} MB`
                : 'API Unavailable'
            }
            sub="Browser performance.memory"
          />
        </div>
      </div>

      {/* Accessibility & Fault Recovery Drills */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: '16px',
        }}
      >
        {/* Accessibility & Visual Mode Controls */}
        <div
          style={{
            backgroundColor: '#0b0f17',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '14px', color: '#f8fafc' }}>
            Accessibility & Constrained-Device Preferences
          </h3>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={preferences.reducedMotion}
              onChange={(e) =>
                updatePreferences({ reducedMotion: e.target.checked })
              }
            />
            Reduced Motion (Disable interpolation & camera drift)
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={preferences.highContrast}
              onChange={(e) =>
                updatePreferences({ highContrast: e.target.checked })
              }
            />
            High Contrast Observatory Surface
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={preferences.simplified3D}
              onChange={(e) =>
                updatePreferences({ simplified3D: e.target.checked })
              }
            />
            Simplified Low-Power 3D Geometry Mode
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={preferences.accessibleTableView}
              onChange={(e) =>
                updatePreferences({ accessibleTableView: e.target.checked })
              }
            />
            Always Show Accessible Tabular State Mirror
          </label>
        </div>

        {/* Adversarial Fault Recovery Drills */}
        <div
          style={{
            backgroundColor: '#0b0f17',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#f8fafc' }}>
              Error Recovery & Isolation Drills
            </h3>
            <button
              type="button"
              onClick={handleExportDiagnostics}
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
              Export Sanitized Diagnostics JSON
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="button"
              onClick={() => triggerFaultRecoveryDrill('worker_crash')}
              style={drillBtnStyle}
            >
              Drill: Worker Crash & Recovery
            </button>
            <button
              type="button"
              onClick={() =>
                triggerFaultRecoveryDrill('simulation_exception_rollback')
              }
              style={drillBtnStyle}
            >
              Drill: Runtime Fault Checkpoint Rollback
            </button>
            <button
              type="button"
              onClick={() => triggerFaultRecoveryDrill('storage_quota')}
              style={drillBtnStyle}
            >
              Drill: Storage Quota Exhaustion
            </button>
            <button
              type="button"
              onClick={() => triggerFaultRecoveryDrill('corrupt_archive')}
              style={drillBtnStyle}
            >
              Drill: Corrupt Archive Rejection
            </button>
            <button
              type="button"
              onClick={() => triggerFaultRecoveryDrill('invalid_plugin')}
              style={drillBtnStyle}
            >
              Drill: Invalid Plugin Guard
            </button>
          </div>

          {systemAlerts.length > 0 && (
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                <span>Diagnostic Event Log ({systemAlerts.length})</span>
                <button
                  type="button"
                  onClick={clearAlerts}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#94a3b8',
                    border: 'none',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Clear Log
                </button>
              </div>
              {systemAlerts.slice(0, 5).map((al) => (
                <div
                  key={al.id}
                  style={{
                    backgroundColor: '#0f172a',
                    borderLeft: `3px solid ${
                      al.severity === 'recovered'
                        ? '#00e676'
                        : al.severity === 'error'
                          ? '#ff3d57'
                          : '#ffb300'
                    }`,
                    padding: '6px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}
                >
                  <strong style={{ color: '#f8fafc' }}>{al.title}:</strong>{' '}
                  <span style={{ color: '#cbd5e1' }}>{al.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {diagJsonPreview && (
        <pre
          style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '12px',
            fontSize: '11px',
            color: '#00e5ff',
            overflowX: 'auto',
            maxHeight: '220px',
          }}
        >
          {diagJsonPreview}
        </pre>
      )}

      {/* World Plugin Development Kit (PDK) Verification Studio */}
      <div
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#a855f7' }}>
              WORLD PLUGIN DEVELOPMENT KIT (PDK) // CONTRACT VERIFIER
            </div>
            <h3 style={{ margin: '2px 0', fontSize: '15px', color: '#f8fafc' }}>
              Verify Determinism, Serialization Round-Trip & Branch Isolation Across All Plugins + 4th Reference Template
            </h3>
          </div>

          <button
            type="button"
            onClick={handleRunPdkSuite}
            style={{
              backgroundColor: '#a855f7',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ▶ Run PDK Contract Verification Suite (4 Worlds)
          </button>
        </div>

        {pdkResults.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
              gap: '10px',
            }}
          >
            {pdkResults.map((res) => (
              <div
                key={res.pluginId}
                style={{
                  backgroundColor: '#0f172a',
                  border: `1px solid ${res.passed ? '#00e676' : '#ff3d57'}`,
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '11px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span style={{ color: '#f8fafc' }}>{res.pluginId.toUpperCase()}</span>
                  <span style={{ color: res.passed ? '#00e676' : '#ff3d57' }}>
                    {res.passed ? '✓ ALL CONTRACTS PASS' : '✗ FAILED'}
                  </span>
                </div>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px', color: '#cbd5e1' }}>
                  {res.details.map((d, i) => (
                    <li key={i} style={{ marginBottom: '3px' }}>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; sub: string }> = ({
  label,
  value,
  sub,
}) => (
  <div
    style={{
      backgroundColor: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: '6px',
      padding: '10px 12px',
    }}
  >
    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{label}</div>
    <div
      style={{
        fontSize: '17px',
        fontWeight: 700,
        fontFamily: 'monospace',
        color: '#f8fafc',
        margin: '4px 0',
      }}
    >
      {value}
    </div>
    <div style={{ fontSize: '10px', color: '#64748b' }}>{sub}</div>
  </div>
);

const drillBtnStyle: React.CSSProperties = {
  backgroundColor: '#1e293b',
  color: '#f8fafc',
  border: '1px solid #334155',
  borderRadius: '4px',
  padding: '6px 10px',
  fontSize: '11px',
  cursor: 'pointer',
};
