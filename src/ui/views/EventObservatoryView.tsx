import React, { useState } from 'react';
import {
  CrossWorldTransferPreview,
  defaultCrossWorldRegistry,
} from '../../core/crossWorldContract';
import { useMultiverseStore } from '../../store/multiverseStore';

export const EventObservatoryView: React.FC = () => {
  const runs = useMultiverseStore((s) => s.runs);
  const activeRunId = useMultiverseStore((s) => s.activeRunId);
  const selectedEventId = useMultiverseStore((s) => s.selectedEventId);
  useMultiverseStore((s) => s.uiRevision);

  const selectRun = useMultiverseStore((s) => s.selectRun);
  const selectEvent = useMultiverseStore((s) => s.selectEvent);
  const selectEntity = useMultiverseStore((s) => s.selectEntity);
  const setActiveTab = useMultiverseStore((s) => s.setActiveTab);
  const dispatchCommand = useMultiverseStore((s) => s.dispatchCommand);
  const applyCrossWorldEvent = useMultiverseStore((s) => s.applyCrossWorldEvent);

  const kernel = runs[activeRunId] ?? Object.values(runs)[0];
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [linkFilter, setLinkFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [transferPreview, setTransferPreview] =
    useState<CrossWorldTransferPreview | null>(null);
  const [transferAppliedBanner, setTransferAppliedBanner] = useState<string | null>(
    null,
  );

  if (!kernel) return null;

  const filteredEvents = kernel
    .getJournal()
    .filter({
      severity:
        severityFilter === 'all' ? undefined : (severityFilter as any),
      causalLinkType: linkFilter === 'all' ? undefined : (linkFilter as any),
      searchQuery,
    })
    .slice()
    .reverse();

  const currentEventId =
    selectedEventId && kernel.getJournal().getById(selectedEventId)
      ? selectedEventId
      : filteredEvents[0]?.id ?? null;

  const causalChain = currentEventId
    ? kernel.inspectCausalChain(currentEventId)
    : null;

  const adapters = defaultCrossWorldRegistry.listAdapters();

  // Helper to demonstrate a compatible cross-world transfer
  const handlePreviewCompatibleTransfer = () => {
    setTransferAppliedBanner(null);
    const ecoRun = Object.values(runs).find((r) => r.worldId === 'ecosystem');
    const civRun = Object.values(runs).find((r) => r.worldId === 'civilization');
    if (!ecoRun || !civRun) return;

    // Ensure ecoRun has a drought event to transfer
    let droughtEv = ecoRun
      .getEvents()
      .find(
        (e) =>
          e.type === 'drought_triggered' || e.type === 'resource_shortage',
      );
    if (!droughtEv) {
      dispatchCommand(
        'trigger_drought',
        'Trigger Severe Drought',
        { severity: 0.45, durationTicks: 20 },
        ecoRun.runId,
      );
      const updated = ecoRun.getEvents();
      droughtEv = updated[updated.length - 1];
    }

    if (droughtEv) {
      const preview = defaultCrossWorldRegistry.previewTransfer(
        droughtEv,
        'ecosystem',
        'civilization',
      );
      setTransferPreview(preview);
    }
  };

  // Helper to demonstrate incompatible cross-world rejection (Station Hull Breach -> Ecosystem)
  const handlePreviewIncompatibleTransfer = () => {
    setTransferAppliedBanner(null);
    const stnRun = Object.values(runs).find((r) => r.worldId === 'station');
    if (!stnRun) return;

    let breachEv = stnRun.getEvents().find((e) => e.type === 'hull_breach');
    if (!breachEv) {
      dispatchCommand(
        'trigger_hull_breach',
        'Trigger Airlock Hull Breach',
        { roomId: 'room-airlock', severity: 0.55 },
        stnRun.runId,
      );
      const updated = stnRun.getEvents();
      breachEv = updated[updated.length - 1];
    }

    if (breachEv) {
      const preview = defaultCrossWorldRegistry.previewTransfer(
        breachEv,
        'station',
        'ecosystem',
      );
      setTransferPreview(preview);
    }
  };

  const handleCommitPreviewedTransfer = () => {
    if (!transferPreview || !transferPreview.compatible) return;
    const sourceRun = Object.values(runs).find(
      (r) => r.worldId === transferPreview.sourceWorldId,
    );
    const targetRun = Object.values(runs).find(
      (r) => r.worldId === transferPreview.targetWorldId,
    );
    if (!sourceRun || !targetRun) return;

    const applied = applyCrossWorldEvent(
      sourceRun.runId,
      transferPreview.sourceEvent.id,
      targetRun.runId,
      transferPreview.adapter?.id,
    );
    if (applied?.compatible && applied.translatedCommand) {
      setTransferAppliedBanner(
        `APPLIED TO ${targetRun.name}: "${applied.translatedCommand.label}" with verified provenance (${applied.translatedCommand.provenance.adapterId}).`,
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Filter & Run Selector Bar */}
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
          gap: '10px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#00e5ff' }}>
            EVENT OBSERVATORY & CAUSALITY ENGINE
          </div>
          <h2 style={{ margin: '4px 0 0 0', fontSize: '18px', color: '#f8fafc' }}>
            Append-Only Logical Event Journal & Causal Chain Inspector
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            aria-label="Event Observatory Active Run"
            value={kernel.runId}
            onChange={(e) => selectRun(e.target.value)}
            style={{
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '5px 8px',
              fontSize: '12px',
            }}
          >
            {Object.values(runs).map((r) => (
              <option key={r.runId} value={r.runId}>
                {r.name} ({r.getEvents().length} events)
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Severity"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            style={{
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '5px 8px',
              fontSize: '12px',
            }}
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="positive">Positive</option>
            <option value="info">Info</option>
          </select>

          <select
            aria-label="Filter by Causal Link Type"
            value={linkFilter}
            onChange={(e) => setLinkFilter(e.target.value)}
            style={{
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '5px 8px',
              fontSize: '12px',
            }}
          >
            <option value="all">All Causal Link Types</option>
            <option value="direct">Direct Causation</option>
            <option value="dependency">Dependency Propagation</option>
            <option value="inferred">Inferred Correlation</option>
            <option value="unknown">Unknown / Root</option>
          </select>

          <input
            type="search"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '5px 8px',
              fontSize: '12px',
            }}
          />
        </div>
      </div>

      {/* Main Split: Event List on Left, 5-Question Causal Inspector on Right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: '16px',
        }}
      >
        {/* Event List */}
        <div
          style={{
            backgroundColor: '#0b0f17',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '14px',
            maxHeight: '460px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1' }}>
            LOGICAL EVENT JOURNAL ({filteredEvents.length} matching events)
          </div>

          {filteredEvents.map((ev) => {
            const isSelected = ev.id === currentEventId;
            const color =
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
                onClick={() => selectEvent(ev.id)}
                style={{
                  backgroundColor: isSelected ? 'rgba(0, 229, 255, 0.12)' : '#0f172a',
                  border: `1px solid ${isSelected ? '#00e5ff' : '#1e293b'}`,
                  borderLeft: `4px solid ${color}`,
                  borderRadius: '6px',
                  padding: '8px 10px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: '#f8fafc' }}>{ev.title}</strong>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#00e5ff' }}>
                    Tick {ev.tick}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0' }}>
                  {ev.description}
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    color: '#64748b',
                  }}
                >
                  <span>System: {ev.sourceSystem}</span>
                  <span>Causation: {ev.causalLinkType.toUpperCase()}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 5-Part Causal Chain Inspector */}
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
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#00e5ff' }}>
            CAUSAL CHAIN EXPLANATION INSPECTOR
          </div>

          {!causalChain ? (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Select an event from the journal to inspect its causal chain.
            </div>
          ) : (
            <>
              {/* 1. WHAT HAPPENED? */}
              <div
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '10px',
                }}
              >
                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#00e5ff' }}>
                  1. WHAT HAPPENED?
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginTop: '3px' }}>
                  {causalChain.whatHappened}
                </div>
                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#64748b', marginTop: '4px' }}>
                  Event ID: {causalChain.event.id} | Correlation: {causalChain.event.correlationId} | Schema v{causalChain.event.schemaVersion}
                </div>
              </div>

              {/* 2. WHAT CHANGED? */}
              <div
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '10px',
                }}
              >
                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#00e676' }}>
                  2. WHAT CHANGED?
                </div>
                {causalChain.whatChanged.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '3px' }}>
                    Payload: <code>{JSON.stringify(causalChain.event.payload)}</code>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                    {causalChain.whatChanged.map((d, i) => (
                      <span
                        key={i}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          backgroundColor: '#111827',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          color: '#f8fafc',
                        }}
                      >
                        {d.metricOrField}: {d.before} → <strong>{d.after}</strong> {d.unit ?? ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. WHAT CAUSED IT? */}
              <div
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#ffb300' }}>
                    3. WHAT CAUSED IT?
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#1e293b',
                      color: '#f8fafc',
                    }}
                  >
                    LINK CLASS: {causalChain.whatCausedIt.linkType.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '4px' }}>
                  {causalChain.whatCausedIt.explanation}
                </div>
                {causalChain.whatCausedIt.upstreamChain.length > 0 && (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                      Upstream Causal Ancestry (Click to navigate):
                    </div>
                    {causalChain.whatCausedIt.upstreamChain.map((anc) => (
                      <button
                        key={anc.id}
                        type="button"
                        onClick={() => selectEvent(anc.id)}
                        style={{
                          textAlign: 'left',
                          backgroundColor: '#111827',
                          color: '#00e5ff',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        ↑ [Tick {anc.tick}] {anc.title} ({anc.causalLinkType})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. WHAT WAS AFFECTED? */}
              <div
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '10px',
                }}
              >
                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#a855f7' }}>
                  4. WHAT WAS AFFECTED?
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '3px' }}>
                  {causalChain.whatWasAffected.description}
                </div>
                {causalChain.whatWasAffected.entityIds.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                    {causalChain.whatWasAffected.entityIds.slice(0, 10).map((eid) => (
                      <button
                        key={eid}
                        type="button"
                        onClick={() => {
                          selectEntity(eid);
                          setActiveTab('observatory');
                        }}
                        style={{
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                          border: 'none',
                          borderRadius: '3px',
                          padding: '3px 7px',
                          fontSize: '10px',
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                        }}
                      >
                        Inspect {eid}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 5. WHAT HAPPENED NEXT? */}
              <div
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '10px',
                }}
              >
                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#ff3d57' }}>
                  5. WHAT HAPPENED NEXT? ({causalChain.whatHappenedNext.length} Recorded Downstream Consequences)
                </div>
                {causalChain.whatHappenedNext.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
                    No direct downstream events recorded from this event yet. Advance simulation ticks to observe consequences.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    {causalChain.whatHappenedNext.map((down) => (
                      <button
                        key={down.id}
                        type="button"
                        onClick={() => selectEvent(down.id)}
                        style={{
                          textAlign: 'left',
                          backgroundColor: '#111827',
                          color: '#ffb300',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        ↓ [Tick {down.tick}] {down.title} — {down.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cross-World Event Interoperability Contract Studio */}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#ffb300' }}>
              CROSS-WORLD EVENT CONTRACT & ADAPTER STUDIO
            </div>
            <h3 style={{ margin: '2px 0', fontSize: '15px', color: '#f8fafc' }}>
              Explicit Cross-World Event Translation & Physical Incompatibility Guardrails
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handlePreviewCompatibleTransfer}
              style={{
                backgroundColor: '#00e676',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Preview Compatible Transfer (Ecosystem Drought → Civilization)
            </button>

            <button
              type="button"
              onClick={handlePreviewIncompatibleTransfer}
              style={{
                backgroundColor: '#ff3d57',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Test Incompatible Rejection (Station Hull Breach → Ecosystem)
            </button>
          </div>
        </div>

        {transferAppliedBanner && (
          <div
            style={{
              backgroundColor: 'rgba(0, 230, 118, 0.14)',
              border: '1px solid #00e676',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              color: '#00e676',
            }}
          >
            ✓ {transferAppliedBanner}
          </div>
        )}

        {transferPreview && (
          <div
            style={{
              backgroundColor: '#0f172a',
              border: `1px solid ${transferPreview.compatible ? '#00e676' : '#ff3d57'}`,
              borderRadius: '6px',
              padding: '12px',
              fontSize: '12px',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: transferPreview.compatible ? '#00e676' : '#ff3d57',
                marginBottom: '6px',
              }}
            >
              {transferPreview.compatible
                ? `✓ COMPATIBLE CONTRACT PREVIEW: ${transferPreview.adapter?.name}`
                : '✗ CROSS-WORLD TRANSFER REJECTED BY CONTRACT'}
            </div>

            {!transferPreview.compatible ? (
              <div style={{ color: '#fecdd3' }}>{transferPreview.rejectionReason}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#cbd5e1' }}>
                <div>
                  <strong>Target Command:</strong>{' '}
                  <code>{transferPreview.translatedCommand?.label}</code> (
                  <code>{JSON.stringify(transferPreview.translatedCommand?.payload)}</code>)
                </div>
                <div>
                  <strong>Information Loss Disclosure:</strong>{' '}
                  {transferPreview.adapter?.informationLoss.join(' ')}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleCommitPreviewedTransfer}
                    style={{
                      backgroundColor: '#00e5ff',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      marginTop: '4px',
                    }}
                  >
                    Confirm & Inject Translated Command into Target World
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Registered Adapters Catalog */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: '10px',
          }}
        >
          {adapters.map((ad) => (
            <div
              key={ad.id}
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '10px',
                fontSize: '11px',
              }}
            >
              <div style={{ color: '#00e5ff', fontFamily: 'monospace', fontWeight: 700 }}>
                {ad.sourceWorldId.toUpperCase()} → {ad.targetWorldId.toUpperCase()} (v{ad.version})
              </div>
              <div style={{ fontWeight: 700, color: '#f8fafc', margin: '4px 0' }}>
                {ad.name}
              </div>
              <div style={{ color: '#94a3b8' }}>{ad.description}</div>
              <div style={{ color: '#cbd5e1', marginTop: '6px', fontFamily: 'monospace', fontSize: '10px' }}>
                Units: {ad.requiredUnits.map((u) => `${u.sourceField} (${u.sourceUnit}) -> ${u.targetField} (${u.targetUnit})`).join('; ')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
