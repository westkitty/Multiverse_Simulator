import React from 'react';
import { ThreeWorldViewport } from '../../renderers/ThreeWorldViewport';
import { useMultiverseStore } from '../../store/multiverseStore';

export const CompareView: React.FC = () => {
  const runs = useMultiverseStore((s) => s.runs);
  const activeRunId = useMultiverseStore((s) => s.activeRunId);
  const comparisonRightRunId = useMultiverseStore((s) => s.comparisonRightRunId);
  const comparisonSyncTick = useMultiverseStore((s) => s.comparisonSyncTick);
  const preferences = useMultiverseStore((s) => s.preferences);
  useMultiverseStore((s) => s.uiRevision);

  const selectRun = useMultiverseStore((s) => s.selectRun);
  const setComparisonRightRun = useMultiverseStore((s) => s.setComparisonRightRun);
  const setComparisonSyncTick = useMultiverseStore((s) => s.setComparisonSyncTick);
  const stepComparisonPair = useMultiverseStore((s) => s.stepComparisonPair);
  const getComparisonReport = useMultiverseStore((s) => s.getComparisonReport);
  const selectEntity = useMultiverseStore((s) => s.selectEntity);

  const leftKernel = runs[activeRunId] ?? Object.values(runs)[0];
  const rightKernel =
    runs[comparisonRightRunId] ??
    Object.values(runs).find((r) => r.runId !== leftKernel?.runId) ??
    leftKernel;

  const report = getComparisonReport();
  if (!leftKernel || !rightKernel || !report) return null;

  const maxSharedTick = Math.max(leftKernel.tick, rightKernel.tick, 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Comparison Control Header */}
      <div
        style={{
          backgroundColor: '#0b0f17',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '14px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#00e5ff' }}>
            SIDE-BY-SIDE REALITY COMPARISON //{' '}
            {report.mode === 'same_world'
              ? 'SAME-WORLD DIRECT METRIC DELTA MODE'
              : 'CROSS-WORLD SHARED METADATA & COMPATIBLE DIMENSION MODE'}
          </div>
          <h2 style={{ margin: '4px 0 0 0', fontSize: '18px', color: '#f8fafc' }}>
            Compare Divergent Branches & Cross-World Runs
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={stepComparisonPair}
            style={{
              backgroundColor: '#00e676',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ▶ Step Both Runs (+1t)
          </button>

          <label style={{ fontSize: '11px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Sync Time Scrubber:
            <input
              type="range"
              min={0}
              max={maxSharedTick}
              value={comparisonSyncTick ?? maxSharedTick}
              onChange={(e) => setComparisonSyncTick(Number(e.target.value))}
            />
            <span style={{ fontFamily: 'monospace', color: '#00e5ff' }}>
              {comparisonSyncTick !== undefined ? `T${comparisonSyncTick}` : 'LIVE'}
            </span>
          </label>

          {comparisonSyncTick !== undefined && (
            <button
              type="button"
              onClick={() => setComparisonSyncTick(undefined)}
              style={{
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Resume Live Head
            </button>
          )}
        </div>
      </div>

      {/* Cross-World Incompatibility Guardrail Notice */}
      {report.incompatibilityNotice && (
        <div
          style={{
            backgroundColor: 'rgba(255, 179, 0, 0.1)',
            border: '1px solid #ffb300',
            borderRadius: '6px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#fef08a',
          }}
        >
          <strong>⚠ Scientific Unit-Safety Notice:</strong>{' '}
          {report.incompatibilityNotice}
        </div>
      )}

      {/* Side-by-Side (or Mobile Stacked) Viewports */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '14px',
        }}
      >
        {/* Left Reality */}
        <div
          style={{
            backgroundColor: '#0b0f17',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8', flex: 1 }}>
              Left Reality (Baseline / A):
              <select
                aria-label="Left Comparison Run"
                value={leftKernel.runId}
                onChange={(e) => selectRun(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #00e5ff',
                  borderRadius: '4px',
                  padding: '5px',
                  fontSize: '12px',
                }}
              >
                {Object.values(runs).map((r) => (
                  <option key={r.runId} value={r.runId}>
                    {r.name} (T{r.tick} • {r.worldId})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ThreeWorldViewport
            frame={leftKernel.extractRenderFrame()}
            selectedEntityId={null}
            onSelectEntity={selectEntity}
            simplifiedMode={preferences.simplified3D}
            reducedMotion={preferences.reducedMotion}
            compact
          />
        </div>

        {/* Right Reality */}
        <div
          style={{
            backgroundColor: '#0b0f17',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8', flex: 1 }}>
              Right Reality (Counterfactual / B):
              <select
                aria-label="Right Comparison Run"
                value={rightKernel.runId}
                onChange={(e) => setComparisonRightRun(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #a855f7',
                  borderRadius: '4px',
                  padding: '5px',
                  fontSize: '12px',
                }}
              >
                {Object.values(runs).map((r) => (
                  <option key={r.runId} value={r.runId}>
                    {r.name} (T{r.tick} • {r.worldId})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ThreeWorldViewport
            frame={rightKernel.extractRenderFrame()}
            selectedEntityId={null}
            onSelectEntity={selectEntity}
            simplifiedMode={preferences.simplified3D}
            reducedMotion={preferences.reducedMotion}
            compact
          />
        </div>
      </div>

      {/* Outcome Deltas & Shared Metadata Table */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '14px',
        }}
      >
        <div
          style={{
            backgroundColor: '#0b0f17',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '14px',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#f8fafc' }}>
            {report.mode === 'same_world'
              ? 'Same-World Physical Metric Deltas (Right − Left)'
              : 'Explicitly Compatible Cross-World Dimensions'}
          </h3>

          {report.mode === 'same_world' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '6px' }}>Metric</th>
                  <th style={{ padding: '6px' }}>Left (T{report.comparedAtTick.leftTick})</th>
                  <th style={{ padding: '6px' }}>Right (T{report.comparedAtTick.rightTick})</th>
                  <th style={{ padding: '6px' }}>Delta</th>
                  <th style={{ padding: '6px' }}>% Diff</th>
                </tr>
              </thead>
              <tbody>
                {report.sameWorldMetricDeltas.map((m) => (
                  <tr key={m.metricId} style={{ borderBottom: '1px solid #111827' }}>
                    <td style={{ padding: '6px', color: '#f8fafc', fontWeight: 600 }}>
                      {m.label} ({m.unit})
                    </td>
                    <td style={{ padding: '6px', fontFamily: 'monospace' }}>{m.leftValue}</td>
                    <td style={{ padding: '6px', fontFamily: 'monospace' }}>{m.rightValue}</td>
                    <td
                      style={{
                        padding: '6px',
                        fontFamily: 'monospace',
                        color:
                          m.absoluteDelta > 0
                            ? '#00e676'
                            : m.absoluteDelta < 0
                              ? '#ff3d57'
                              : '#94a3b8',
                      }}
                    >
                      {m.absoluteDelta >= 0 ? `+${m.absoluteDelta}` : m.absoluteDelta}
                    </td>
                    <td style={{ padding: '6px', fontFamily: 'monospace' }}>
                      {m.percentDelta >= 0 ? `+${m.percentDelta}%` : `${m.percentDelta}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '6px' }}>Shared Dimension</th>
                  <th style={{ padding: '6px' }}>Left Metric</th>
                  <th style={{ padding: '6px' }}>Right Metric</th>
                  <th style={{ padding: '6px' }}>Delta</th>
                </tr>
              </thead>
              <tbody>
                {report.crossWorldCompatibleDimensions.map((d) => (
                  <tr key={d.dimensionKey} style={{ borderBottom: '1px solid #111827' }}>
                    <td style={{ padding: '6px', color: '#f8fafc', fontWeight: 600 }}>
                      {d.dimensionLabel} ({d.unit})
                    </td>
                    <td style={{ padding: '6px', fontFamily: 'monospace' }}>
                      {d.leftValue} {d.unit}
                    </td>
                    <td style={{ padding: '6px', fontFamily: 'monospace' }}>
                      {d.rightValue} {d.unit}
                    </td>
                    <td style={{ padding: '6px', fontFamily: 'monospace', color: '#00e5ff' }}>
                      {d.delta >= 0 ? `+${d.delta}` : d.delta} {d.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Shared Run Metadata & Configuration Differences */}
        <div
          style={{
            backgroundColor: '#0b0f17',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '14px', color: '#f8fafc' }}>
            Shared Run Metadata & Configuration Diff
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: '4px' }}>
              <div style={{ color: '#94a3b8', fontSize: '10px' }}>Simulated Duration</div>
              <div style={{ fontFamily: 'monospace', color: '#f8fafc' }}>
                Left: {report.sharedMetadata.leftDurationTicks}t | Right:{' '}
                {report.sharedMetadata.rightDurationTicks}t
              </div>
            </div>
            <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: '4px' }}>
              <div style={{ color: '#94a3b8', fontSize: '10px' }}>Total / Critical Events</div>
              <div style={{ fontFamily: 'monospace', color: '#f8fafc' }}>
                L: {report.sharedMetadata.leftTotalEvents} ({report.sharedMetadata.leftCriticalEvents} crit) | R:{' '}
                {report.sharedMetadata.rightTotalEvents} ({report.sharedMetadata.rightCriticalEvents} crit)
              </div>
            </div>
            <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: '4px' }}>
              <div style={{ color: '#94a3b8', fontSize: '10px' }}>PRNG Master Seeds</div>
              <div style={{ fontFamily: 'monospace', color: '#00e5ff' }}>
                Left: {report.sharedMetadata.leftSeed} | Right: {report.sharedMetadata.rightSeed}
              </div>
            </div>
            <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: '4px' }}>
              <div style={{ color: '#94a3b8', fontSize: '10px' }}>Shared Lineage Ancestry</div>
              <div style={{ fontFamily: 'monospace', color: '#f8fafc' }}>
                {report.sharedMetadata.sameLineageOrigin ? 'YES (Shared Fork Origin)' : 'Independent Runs'}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
            <strong>Parameter Configuration Differences ({report.configDifferences.length}):</strong>
            {report.configDifferences.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                Identical parameter configurations (divergence driven by commands or seed).
              </div>
            ) : (
              <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px', fontSize: '11px', fontFamily: 'monospace' }}>
                {report.configDifferences.slice(0, 8).map((diff) => (
                  <li key={diff.key}>
                    {diff.key}: Left={String(diff.leftValue)} vs Right={String(diff.rightValue)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
