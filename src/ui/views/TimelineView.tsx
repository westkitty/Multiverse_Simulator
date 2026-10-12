import React, { useState } from 'react';
import { useMultiverseStore } from '../../store/multiverseStore';

export const TimelineView: React.FC = () => {
  const runs = useMultiverseStore((s) => s.runs);
  const activeRunId = useMultiverseStore((s) => s.activeRunId);
  const lastReplayCheck = useMultiverseStore((s) => s.lastReplayCheck);
  useMultiverseStore((s) => s.uiRevision);

  const selectRun = useMultiverseStore((s) => s.selectRun);
  const setComparisonRightRun = useMultiverseStore((s) => s.setComparisonRightRun);
  const setActiveTab = useMultiverseStore((s) => s.setActiveTab);
  const createManualCheckpoint = useMultiverseStore((s) => s.createManualCheckpoint);
  const restoreCheckpoint = useMultiverseStore((s) => s.restoreCheckpoint);
  const forkRunBranch = useMultiverseStore((s) => s.forkRunBranch);
  const verifyReplayEquivalence = useMultiverseStore((s) => s.verifyReplayEquivalence);

  const kernel = runs[activeRunId] ?? Object.values(runs)[0];
  const checkpoints = kernel ? kernel.listCheckpoints() : [];
  const interventions = kernel ? kernel.plugin.quickInterventions : [];

  const [checkpointLabel, setCheckpointLabel] = useState<string>('');
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>(
    checkpoints[checkpoints.length - 1]?.id ?? '',
  );
  const [branchName, setBranchName] = useState<string>('');
  const [hypothesisNote, setHypothesisNote] = useState<string>(
    'Counterfactual intervention branch',
  );
  const [selectedInterventionId, setSelectedInterventionId] = useState<string>(
    interventions[0]?.id ?? 'none',
  );

  if (!kernel) return null;
  const lineage = kernel.getLineage();
  const replayReceipt = lastReplayCheck?.runId === kernel.runId &&
    lastReplayCheck.tick === kernel.tick &&
    lastReplayCheck.authoritativeHash === kernel.getStateHash()
    ? lastReplayCheck : null;
  const replayStartingTick = lineage.parentRunId ? lineage.forkedAtTick : 0;

  const sameWorldRuns = Object.values(runs).filter(
    (r) => r.worldId === kernel.worldId,
  );

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    const targetChkId =
      selectedCheckpointId && checkpoints.some((c) => c.id === selectedCheckpointId)
        ? selectedCheckpointId
        : checkpoints[checkpoints.length - 1]?.id;

    const intervention = interventions.find((i) => i.id === selectedInterventionId);
    forkRunBranch({
      sourceRunId: kernel.runId,
      checkpointId: targetChkId,
      newName:
        branchName.trim() ||
        `${kernel.name.split(' [')[0]} [Branch: ${intervention ? intervention.label : `T${kernel.tick}`}]`,
      hypothesisNote,
      initialCommand: intervention
        ? {
            type: intervention.commandType,
            label: intervention.label,
            payload: intervention.defaultPayload,
          }
        : undefined,
    });
    setBranchName('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header & Deterministic Replay Verification */}
      <div
        style={{
          backgroundColor: '#0b0f17',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#a855f7' }}>
            TIMELINE & BRANCHING REALITIES WORKBENCH
          </div>
          <h2 style={{ margin: '4px 0', fontSize: '18px', color: '#f8fafc' }}>
            Rewind History, Fork Counterfactual Realities & Verify Deterministic Replay
          </h2>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
            Active Run: <strong style={{ color: '#f8fafc' }}>{kernel.name}</strong> | Tick{' '}
            {kernel.tick} | State Hash:{' '}
            <code style={{ color: '#00e5ff' }}>{kernel.getStateHash()}</code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => verifyReplayEquivalence(kernel.runId)}
            style={{
              backgroundColor: '#00e5ff',
              color: '#05080f',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {lineage.parentRunId ? `Verify branch replay from fork T${replayStartingTick}` : 'Verify deterministic replay from genesis T0'}
          </button>

          {replayReceipt && (
            <span
              role="status"
              aria-live="polite"
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                padding: '6px 10px',
                borderRadius: '4px',
                backgroundColor: replayReceipt.unavailableReason
                  ? 'rgba(236, 183, 81, 0.12)'
                  : replayReceipt.passed ? 'rgba(0, 230, 118, 0.14)' : 'rgba(255, 61, 87, 0.18)',
                color: replayReceipt.unavailableReason
                  ? '#f7cf83' : replayReceipt.passed ? '#00e676' : '#ff8197',
                border: `1px solid ${replayReceipt.unavailableReason ? '#d4ac60' : replayReceipt.passed ? '#00e676' : '#ff3d57'}`,
              }}
            >
              {replayReceipt.unavailableReason
                ? `REPLAY UNVERIFIABLE: ${replayReceipt.unavailableReason}`
                : replayReceipt.passed
                  ? `REPLAY VERIFIED ${replayReceipt.verificationBasis === 'genesis' ? 'FROM GENESIS' : 'FROM FORK'} T${replayReceipt.originTick ?? 0} → T${replayReceipt.tick}: ${replayReceipt.replayedHash.slice(0, 12)}`
                  : `REPLAY MISMATCH: ${replayReceipt.replayedHash}`}
            </span>
          )}
        </div>
      </div>

      {/* Branch Ancestry Tree */}
      <div
        style={{
          backgroundColor: '#0b0f17',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#f8fafc' }}>
          Multiverse Branch Lineage ({kernel.plugin.name} — {sameWorldRuns.length} Branches)
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: '10px',
          }}
        >
          {sameWorldRuns.map((branch) => {
            const lineage = branch.getLineage();
            const isActive = branch.runId === kernel.runId;
            return (
              <div
                key={branch.runId}
                style={{
                  backgroundColor: isActive ? '#111927' : '#0f172a',
                  border: `1px solid ${isActive ? '#00e5ff' : '#1e293b'}`,
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      color: '#94a3b8',
                    }}
                  >
                    <span>
                      {lineage.parentRunId
                        ? `⑂ Forked from ${lineage.parentRunId} @ T${lineage.forkedAtTick}`
                        : '● Root Genesis Timeline'}
                    </span>
                    <span style={{ color: '#00e5ff' }}>Tick {branch.tick}</span>
                  </div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#f8fafc',
                      margin: '4px 0',
                    }}
                  >
                    {branch.name}
                  </div>
                  {lineage.hypothesisNote && (
                    <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                      {lineage.hypothesisNote}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid #1e293b',
                    paddingTop: '8px',
                    gap: '6px',
                  }}
                >
                  <code style={{ fontSize: '10px', color: '#64748b' }}>
                    Hash: {branch.getStateHash().slice(0, 10)}
                  </code>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => selectRun(branch.runId)}
                        style={{
                          backgroundColor: '#00e5ff',
                          color: '#000',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Activate
                      </button>
                    )}
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => {
                          setComparisonRightRun(branch.runId);
                          setActiveTab('compare');
                        }}
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
                        Compare
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Checkpoints & Branch Forking Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: '16px',
        }}
      >
        {/* Checkpoint History */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#f8fafc' }}>
              Checkpoints & Historical Snapshots ({checkpoints.length})
            </h3>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="Checkpoint label..."
                value={checkpointLabel}
                onChange={(e) => setCheckpointLabel(e.target.value)}
                style={{
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const id = createManualCheckpoint(checkpointLabel);
                  setSelectedCheckpointId(id);
                  setCheckpointLabel('');
                }}
                style={{
                  backgroundColor: '#00e676',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                + Save Checkpoint
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: '340px',
              overflowY: 'auto',
            }}
          >
            {checkpoints.map((chk) => {
              const isSelected = chk.id === selectedCheckpointId;
              return (
                <div
                  key={chk.id}
                  onClick={() => setSelectedCheckpointId(chk.id)}
                  style={{
                    backgroundColor: isSelected ? 'rgba(0, 229, 255, 0.1)' : '#0f172a',
                    border: `1px solid ${isSelected ? '#00e5ff' : '#1e293b'}`,
                    borderRadius: '6px',
                    padding: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: '#f8fafc' }}>
                      {chk.label}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: '#94a3b8',
                        marginTop: '2px',
                      }}
                    >
                      Tick {chk.tick} | Hash {chk.stateHash.slice(0, 10)} |{' '}
                      {(chk.byteSizeEstimate / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        restoreCheckpoint(chk.id);
                      }}
                      style={{
                        backgroundColor: '#ffb300',
                        color: '#000',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ↺ Rewind Here
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Fork Reality Branch Form */}
        <form
          onSubmit={handleCreateBranch}
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
          <h3 style={{ margin: 0, fontSize: '14px', color: '#f8fafc' }}>
            ⑂ Fork New Counterfactual Branch Reality
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
            Creates an isolated simulation branch sharing historical ancestry up to the
            selected checkpoint, then applies your chosen counterfactual intervention.
          </p>

          <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
            Origin Checkpoint:
            <select
              aria-label="Origin Checkpoint"
              value={selectedCheckpointId}
              onChange={(e) => setSelectedCheckpointId(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px',
                fontSize: '12px',
              }}
            >
              {checkpoints.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} (Tick {c.tick} • Hash {c.stateHash.slice(0, 8)})
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
            Branch Name:
            <input
              type="text"
              placeholder="e.g. Branch A — Predator Introduction"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
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
            Counterfactual Intervention at Fork Point:
            <select
              aria-label="Counterfactual Intervention"
              value={selectedInterventionId}
              onChange={(e) => setSelectedInterventionId(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                backgroundColor: '#0f172a',
                color: '#00e5ff',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px',
                fontSize: '12px',
              }}
            >
              <option value="none">No Immediate Command (Pure Parameter/Baseline Fork)</option>
              {interventions.map((intv) => (
                <option key={intv.id} value={intv.id}>
                  {intv.label} — {intv.description}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
            Hypothesis / Experimental Note:
            <input
              type="text"
              value={hypothesisNote}
              onChange={(e) => setHypothesisNote(e.target.value)}
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

          <button
            type="submit"
            style={{
              backgroundColor: '#a855f7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            ⑂ Create Independent Branch Reality
          </button>
        </form>
      </div>
    </div>
  );
};
