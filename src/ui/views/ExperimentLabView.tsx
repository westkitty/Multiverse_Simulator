import React, { useState } from 'react';
import {
  ExperimentDefinition,
  ExperimentSeedPolicy,
} from '../../core/experimentRunner';
import { useMultiverseStore } from '../../store/multiverseStore';

export const ExperimentLabView: React.FC = () => {
  const runs = useMultiverseStore((s) => s.runs);
  const activeRunId = useMultiverseStore((s) => s.activeRunId);
  const experiments = useMultiverseStore((s) => s.experiments);
  const executeExperiment = useMultiverseStore((s) => s.executeExperiment);
  const selectRun = useMultiverseStore((s) => s.selectRun);
  const setComparisonRightRun = useMultiverseStore((s) => s.setComparisonRightRun);
  const setActiveTab = useMultiverseStore((s) => s.setActiveTab);

  const [baselineRunId, setBaselineRunId] = useState<string>(activeRunId);
  const baselineKernel = runs[baselineRunId] ?? runs[activeRunId] ?? Object.values(runs)[0];

  const checkpoints = baselineKernel ? baselineKernel.listCheckpoints() : [];
  const interventions = baselineKernel ? baselineKernel.plugin.quickInterventions : [];

  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>(
    checkpoints[0]?.id ?? '',
  );
  const [selectedInterventionId, setSelectedInterventionId] = useState<string>(
    interventions[0]?.id ?? '',
  );
  const [durationTicks, setDurationTicks] = useState<number>(22);
  const [seedPolicy, setSeedPolicy] = useState<ExperimentSeedPolicy>('single_deterministic');
  const [pairedSeedCount, setPairedSeedCount] = useState<number>(3);
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customHypothesis, setCustomHypothesis] = useState<string>(
    'Controlled intervention alters primary stability and resource trajectories.',
  );

  if (!baselineKernel) return null;

  const handleRunExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    const intv =
      interventions.find((i) => i.id === selectedInterventionId) ??
      interventions[0];
    if (!intv) return;

    const chk =
      checkpoints.find((c) => c.id === selectedCheckpointId) ?? checkpoints[0];

    const def: ExperimentDefinition = {
      id: `exp-${baselineKernel.worldId}-${Date.now().toString(36)}`,
      title:
        customTitle.trim() ||
        `${baselineKernel.plugin.name.replace(/World [A-Z] — /, '')}: ${intv.label}`,
      hypothesis: customHypothesis,
      worldId: baselineKernel.worldId,
      baselineRunId: baselineKernel.runId,
      checkpointId: chk?.id,
      startTick: chk ? chk.tick : baselineKernel.tick,
      durationTicks,
      seedPolicy,
      pairedSeedCount: seedPolicy === 'paired_multi_seed' ? pairedSeedCount : 1,
      intervention: {
        commandType: intv.commandType,
        commandLabel: intv.label,
        payload: intv.defaultPayload,
      },
      selectedMetrics: baselineKernel.plugin.metricDefinitions.map((m) => m.id),
    };

    await executeExperiment(def);
  };

  const runPresetExperiment = async (
    worldId: 'ecosystem' | 'station' | 'civilization',
    title: string,
    hypothesis: string,
    commandType: string,
    commandLabel: string,
    payload: Record<string, unknown>,
  ) => {
    const targetRun =
      Object.values(runs).find((r) => r.worldId === worldId) ?? baselineKernel;
    const chk = targetRun.listCheckpoints()[0];

    const def: ExperimentDefinition = {
      id: `exp-preset-${worldId}-${Date.now().toString(36)}`,
      title,
      hypothesis,
      worldId: targetRun.worldId,
      baselineRunId: targetRun.runId,
      checkpointId: chk?.id,
      startTick: chk ? chk.tick : 0,
      durationTicks: 24,
      seedPolicy: 'paired_multi_seed',
      pairedSeedCount: 3,
      intervention: {
        commandType,
        commandLabel,
        payload,
      },
      selectedMetrics: targetRun.plugin.metricDefinitions.map((m) => m.id),
    };

    await executeExperiment(def);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header & Scientific Presets */}
      <div
        style={{
          backgroundColor: '#0b0f17',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#00e676' }}>
          SCIENTIFIC EXPERIMENT LABORATORY // CONTROLLED COUNTERFACTUAL TRIALS
        </div>
        <h2 style={{ margin: '4px 0 8px 0', fontSize: '18px', color: '#f8fafc' }}>
          Paired-Seed & Single-Seed Causal Intervention Workbench
        </h2>
        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#94a3b8' }}>
          Select a baseline run and checkpoint, apply an intervention command, advance
          both Control and Treatment branches for equal simulated duration, and inspect
          derived outcome deltas.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: '10px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              padding: '10px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#00e676', fontWeight: 700 }}>
              ECOSYSTEM HYPOTHESIS
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', margin: '4px 0' }}>
              Does adding predators reduce resource depletion?
            </div>
            <button
              type="button"
              onClick={() =>
                runPresetExperiment(
                  'ecosystem',
                  'Trophic Regulation: Apex Predator Introduction',
                  'Introducing 6 apex predators curbs herbivore overgrazing and preserves primary flora biomass.',
                  'introduce_predators',
                  'Introduce Apex Predators (+6)',
                  { count: 6 },
                )
              }
              style={{
                marginTop: '6px',
                backgroundColor: '#00e676',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ▶ Run Paired Experiment (N=3 Seeds)
            </button>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              padding: '10px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#00e5ff', fontWeight: 700 }}>
              SPACE STATION HYPOTHESIS
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', margin: '4px 0' }}>
              Does repairing & prioritizing Life Support prevent CO2 toxicity?
            </div>
            <button
              type="button"
              onClick={() =>
                runPresetExperiment(
                  'station',
                  'Orbital Life Support Stabilization & Repair',
                  'Dispatching repair crew and restoring reactor/scrubbers preserves cabin atmosphere and crew survival.',
                  'dispatch_repair',
                  'Dispatch Emergency Repair Crew',
                  { targetRoomId: 'all' },
                )
              }
              style={{
                marginTop: '6px',
                backgroundColor: '#00e5ff',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ▶ Run Paired Experiment (N=3 Seeds)
            </button>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              padding: '10px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#ffb300', fontWeight: 700 }}>
              CIVILIZATION HYPOTHESIS
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', margin: '4px 0' }}>
              Does early water infrastructure improve population stability?
            </div>
            <button
              type="button"
              onClick={() =>
                runPresetExperiment(
                  'civilization',
                  'Early Deep-Aquifer Water Infrastructure Investment',
                  'Upgrading settlement water aqueducts before regional drought preserves water reserves and population growth.',
                  'build_water_infrastructure',
                  'Build Water Aqueducts (+1 Level All)',
                  { targetSettlementId: 'all' },
                )
              }
              style={{
                marginTop: '6px',
                backgroundColor: '#ffb300',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ▶ Run Paired Experiment (N=3 Seeds)
            </button>
          </div>
        </div>
      </div>

      {/* Custom Experiment Configurator + Results */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))',
          gap: '16px',
        }}
      >
        <form
          onSubmit={handleRunExperiment}
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
            Configure Controlled Experiment
          </h3>

          <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
            1. Baseline Run:
            <select
              aria-label="Baseline Run"
              value={baselineKernel.runId}
              onChange={(e) => {
                const nextId = e.target.value;
                setBaselineRunId(nextId);
                const nextK = runs[nextId];
                if (nextK) {
                  setSelectedCheckpointId(nextK.listCheckpoints()[0]?.id ?? '');
                  setSelectedInterventionId(
                    nextK.plugin.quickInterventions[0]?.id ?? '',
                  );
                }
              }}
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
              {Object.values(runs).map((r) => (
                <option key={r.runId} value={r.runId}>
                  {r.name} (Seed {r.seed})
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
            2. Fork Checkpoint (Start Tick):
            <select
              aria-label="Experiment Checkpoint"
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
                  {c.label} (Tick {c.tick})
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
            3. Experimental Intervention Command:
            <select
              aria-label="Experimental Intervention Command"
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
              {interventions.map((intv) => (
                <option key={intv.id} value={intv.id}>
                  {intv.label} ({intv.commandType})
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
              4. Simulated Duration (Ticks):
              <input
                type="number"
                min={5}
                max={120}
                value={durationTicks}
                onChange={(e) => setDurationTicks(Number(e.target.value))}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: '4px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '6px',
                  fontSize: '12px',
                }}
              />
            </label>

            <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
              5. Seed Policy:
              <select
                aria-label="Seed Policy"
                value={seedPolicy}
                onChange={(e) =>
                  setSeedPolicy(e.target.value as ExperimentSeedPolicy)
                }
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
                <option value="single_deterministic">
                  Single Deterministic Seed (N=1)
                </option>
                <option value="paired_multi_seed">
                  Paired Multi-Seed Ensemble (N=2..6)
                </option>
              </select>
            </label>
          </div>

          {seedPolicy === 'paired_multi_seed' && (
            <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
              Paired Seeds Sample Size (N, Max 6):
              <input
                type="number"
                min={2}
                max={6}
                value={pairedSeedCount}
                onChange={(e) => setPairedSeedCount(Number(e.target.value))}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: '4px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '6px',
                  fontSize: '12px',
                }}
              />
            </label>
          )}

          <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
            Experiment Title (Optional):
            <input
              type="text"
              placeholder="Auto-named from world & intervention"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: '4px',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px',
                fontSize: '12px',
              }}
            />
          </label>

          <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
            Hypothesis Statement:
            <input
              type="text"
              value={customHypothesis}
              onChange={(e) => setCustomHypothesis(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: '4px',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px',
                fontSize: '12px',
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              backgroundColor: '#00e676',
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
            ⚗ Execute Controlled Experiment & Compare
          </button>
        </form>

        {/* Experiment Results Feed */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {experiments.length === 0 ? (
            <div
              style={{
                backgroundColor: '#0b0f17',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '24px',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '13px',
              }}
            >
              No experiments executed in this session yet. Click one of the three
              scientific hypothesis presets above or run a custom trial on the left.
            </div>
          ) : (
            experiments.map((exp) => (
              <div
                key={exp.id}
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
                  <div>
                    <span
                      style={{
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        color: '#00e676',
                      }}
                    >
                      EXPERIMENT REPORT // T{exp.startTick} → T{exp.endTick} (N=
                      {exp.definition.pairedSeedCount})
                    </span>
                    <h4 style={{ margin: '2px 0', fontSize: '15px', color: '#f8fafc' }}>
                      {exp.definition.title}
                    </h4>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      selectRun(exp.baselineBranchRunId);
                      setComparisonRightRun(exp.treatmentBranchRunId);
                      setActiveTab('compare');
                    }}
                    style={{
                      backgroundColor: '#00e5ff',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Open Side-by-Side Comparison →
                  </button>
                </div>

                <div
                  style={{
                    fontSize: '12px',
                    color: '#f8fafc',
                    backgroundColor: '#0f172a',
                    borderLeft: '3px solid #00e676',
                    padding: '8px 10px',
                    borderRadius: '4px',
                  }}
                >
                  {exp.conclusionSummary}
                </div>

                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  <strong>Methodology & Epistemic Scope:</strong> {exp.methodologyNote}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '11px',
                      textAlign: 'left',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                        <th style={{ padding: '5px' }}>Metric</th>
                        <th style={{ padding: '5px' }}>Control Mean</th>
                        <th style={{ padding: '5px' }}>Treatment Mean</th>
                        <th style={{ padding: '5px' }}>Mean Delta</th>
                        <th style={{ padding: '5px' }}>% Shift</th>
                        <th style={{ padding: '5px' }}>Delta SD (N={exp.definition.pairedSeedCount})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exp.metricSummaries.map((m) => (
                        <tr key={m.metricId} style={{ borderBottom: '1px solid #111827' }}>
                          <td style={{ padding: '5px', color: '#f8fafc', fontWeight: 600 }}>
                            {m.label} ({m.unit})
                          </td>
                          <td style={{ padding: '5px', fontFamily: 'monospace' }}>
                            {m.baselineMean}
                          </td>
                          <td style={{ padding: '5px', fontFamily: 'monospace' }}>
                            {m.treatmentMean}
                          </td>
                          <td
                            style={{
                              padding: '5px',
                              fontFamily: 'monospace',
                              color:
                                m.meanDelta > 0
                                  ? '#00e676'
                                  : m.meanDelta < 0
                                    ? '#ff3d57'
                                    : '#94a3b8',
                            }}
                          >
                            {m.meanDelta >= 0 ? `+${m.meanDelta}` : m.meanDelta}
                          </td>
                          <td style={{ padding: '5px', fontFamily: 'monospace' }}>
                            {m.percentDelta >= 0 ? `+${m.percentDelta}%` : `${m.percentDelta}%`}
                          </td>
                          <td style={{ padding: '5px', fontFamily: 'monospace', color: '#94a3b8' }}>
                            ±{m.deltaStdDev}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
