import { z } from 'zod';
import {
  clampDet,
  DeterministicRng,
  EntityInspection,
  MetricDefinition,
  QuickInterventionDescriptor,
  RenderFrameData,
  roundDet,
  RunId,
  SimulationCommand,
  SimulationSystem,
  Tick,
  WorldId,
  WorldPlugin,
  WorldScaleMetadata,
  WorldScenarioPreset,
} from './contracts';
import { SimulationKernel } from './kernel';

export interface DefineWorldPluginSpec<
  TConfig extends Record<string, unknown>,
  TState,
> {
  id: WorldId;
  name: string;
  subtitle: string;
  version: string;
  schemaVersion: number;
  accentColor: string;
  description: string;
  physicalModelDocumentation: string[];
  simplifiedMechanicsNote: string;
  scaleMetadata?: WorldScaleMetadata;
  configSchema: z.ZodType<TConfig>;
  defaultConfig: TConfig;
  scenarios: WorldScenarioPreset<TConfig>[];
  quickInterventions: QuickInterventionDescriptor[];
  metricDefinitions: MetricDefinition[];
  initializeWorld(config: TConfig, rng: DeterministicRng): TState;
  systems: SimulationSystem<TState, TConfig>[];
  applyCommand: WorldPlugin<TConfig, TState>['applyCommand'];
  serializeState?(state: TState): Record<string, unknown>;
  restoreState?(serialized: Record<string, unknown>): TState;
  migrateState?(
    serialized: Record<string, unknown>,
    fromSchemaVersion: number,
  ): Record<string, unknown>;
  extractMetrics(state: TState, config: TConfig): Record<string, number>;
  inspectEntities(state: TState, config: TConfig): EntityInspection[];
  extractRenderFrame(
    state: TState,
    config: TConfig,
    runId: RunId,
    tick: Tick,
  ): RenderFrameData;
  onRegister?(): void;
  onDispose?(): void;
}

/**
 * PDK factory that wraps a declarative plugin specification with Zod config
 * validation, deterministic system sorting, and safe JSON state serialization defaults.
 */
export function defineWorldPlugin<
  TConfig extends Record<string, unknown>,
  TState,
>(spec: DefineWorldPluginSpec<TConfig, TState>): WorldPlugin<TConfig, TState> {
  return {
    id: spec.id,
    name: spec.name,
    subtitle: spec.subtitle,
    version: spec.version,
    schemaVersion: spec.schemaVersion,
    accentColor: spec.accentColor,
    description: spec.description,
    physicalModelDocumentation: spec.physicalModelDocumentation,
    simplifiedMechanicsNote: spec.simplifiedMechanicsNote,
    scaleMetadata: spec.scaleMetadata,
    defaultConfig: spec.defaultConfig,
    scenarios: spec.scenarios,
    quickInterventions: spec.quickInterventions,
    metricDefinitions: spec.metricDefinitions,

    register() {
      spec.onRegister?.();
    },

    validateConfig(raw: unknown) {
      const parsed = spec.configSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          valid: false,
          errors: parsed.error.issues.map(
            (i) => `${i.path.join('.') || 'config'}: ${i.message}`,
          ),
        };
      }
      return {
        valid: true,
        config: parsed.data,
      };
    },

    initializeWorld(config: TConfig, rng: DeterministicRng): TState {
      return spec.initializeWorld(config, rng);
    },

    getSystems(): SimulationSystem<TState, TConfig>[] {
      return [...spec.systems].sort((a, b) =>
        a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id),
      );
    },

    applyCommand(state, command, ctx) {
      spec.applyCommand(state, command, ctx);
    },

    serializeState(state: TState): Record<string, unknown> {
      if (spec.serializeState) {
        return spec.serializeState(state);
      }
      return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    },

    restoreState(serialized: Record<string, unknown>): TState {
      if (spec.restoreState) {
        return spec.restoreState(serialized);
      }
      return JSON.parse(JSON.stringify(serialized)) as TState;
    },

    migrateState(serialized: Record<string, unknown>, fromSchemaVersion: number) {
      if (spec.migrateState) {
        return spec.migrateState(serialized, fromSchemaVersion);
      }
      return serialized;
    },

    extractMetrics(state: TState, config: TConfig) {
      return spec.extractMetrics(state, config);
    },

    inspectEntities(state: TState, config: TConfig) {
      return spec.inspectEntities(state, config);
    },

    extractRenderFrame(state: TState, config: TConfig, runId: RunId, tick: Tick) {
      return spec.extractRenderFrame(state, config, runId, tick);
    },

    dispose() {
      spec.onDispose?.();
    },
  };
}

export interface PluginVerificationResult {
  pluginId: WorldId;
  passed: boolean;
  determinismVerified: boolean;
  serializationRoundTripVerified: boolean;
  continuationConsistencyVerified: boolean;
  branchIsolationVerified: boolean;
  hashRunA: string;
  hashRunB: string;
  details: string[];
}

/**
 * PDK Testing Helper: Automatically verifies a WorldPlugin's determinism,
 * serialization round-trip, restart continuation equivalence, and branch isolation.
 */
export function verifyWorldPluginContract<
  TConfig extends Record<string, unknown>,
  TState,
>(
  plugin: WorldPlugin<TConfig, TState>,
  steps = 20,
  seed = 424242,
): PluginVerificationResult {
  const details: string[] = [];

  // 1. Determinism test (two independent runs with identical seed and commands)
  const runA = new SimulationKernel({
    runId: `pdk-test-${plugin.id}-a`,
    name: 'PDK Run A',
    plugin,
    seed,
  });
  const runB = new SimulationKernel({
    runId: `pdk-test-${plugin.id}-b`,
    name: 'PDK Run B',
    plugin,
    seed,
  });

  const firstIntervention = plugin.quickInterventions[0];
  if (firstIntervention) {
    runA.enqueueCommand({
      tick: Math.floor(steps / 2),
      type: firstIntervention.commandType,
      label: firstIntervention.label,
      payload: firstIntervention.defaultPayload,
    });
    runB.enqueueCommand({
      tick: Math.floor(steps / 2),
      type: firstIntervention.commandType,
      label: firstIntervention.label,
      payload: firstIntervention.defaultPayload,
    });
  }

  for (let i = 0; i < steps; i++) {
    runA.step();
    runB.step();
  }

  const hashRunA = runA.getStateHash();
  const hashRunB = runB.getStateHash();
  const determinismVerified = hashRunA === hashRunB;
  details.push(
    determinismVerified
      ? `Determinism PASS: identical state hash ${hashRunA} after ${steps} ticks.`
      : `Determinism FAIL: hash A (${hashRunA}) !== hash B (${hashRunB}).`,
  );

  // 2. Serialization & restart continuation equivalence
  const midRun = new SimulationKernel({
    runId: `pdk-test-${plugin.id}-mid`,
    name: 'PDK Mid Run',
    plugin,
    seed,
  });
  const halfSteps = Math.max(1, Math.floor(steps / 2));
  for (let i = 0; i < halfSteps; i++) {
    midRun.step();
  }
  const snapshotRecord = midRun.exportRunRecord();
  const restoredRun = SimulationKernel.fromRunRecord(snapshotRecord, plugin);
  const serializationRoundTripVerified =
    restoredRun.getStateHash() === midRun.getStateHash();

  for (let i = halfSteps; i < steps; i++) {
    midRun.step();
    restoredRun.step();
  }
  const continuationConsistencyVerified =
    restoredRun.getStateHash() === midRun.getStateHash();
  details.push(
    continuationConsistencyVerified
      ? `Restart Continuation PASS: restored run matches uninterrupted run (${restoredRun.getStateHash()}).`
      : `Restart Continuation FAIL: restored (${restoredRun.getStateHash()}) !== uninterrupted (${midRun.getStateHash()}).`,
  );

  // 3. Branch isolation test
  const parentHashBeforeFork = midRun.getStateHash();
  const forked = midRun.forkBranch({
    newRunId: `pdk-test-${plugin.id}-fork`,
    newName: 'PDK Fork',
    initialCommand: firstIntervention
      ? {
          type: firstIntervention.commandType,
          label: firstIntervention.label,
          payload: firstIntervention.defaultPayload,
        }
      : undefined,
  });
  forked.step();
  forked.step();
  const branchIsolationVerified = midRun.getStateHash() === parentHashBeforeFork;
  details.push(
    branchIsolationVerified
      ? `Branch Isolation PASS: parent state hash unchanged (${parentHashBeforeFork}) while child branch advanced.`
      : `Branch Isolation FAIL: parent state was mutated by child branch execution.`,
  );

  return {
    pluginId: plugin.id,
    passed:
      determinismVerified &&
      serializationRoundTripVerified &&
      continuationConsistencyVerified &&
      branchIsolationVerified,
    determinismVerified,
    serializationRoundTripVerified,
    continuationConsistencyVerified,
    branchIsolationVerified,
    hashRunA,
    hashRunB,
    details,
  };
}

/**
 * Example 4th World Plugin Template ("Thermal Node Lattice") included in the PDK
 * to prove that a developer can register a new simulation world without modifying the kernel.
 */
export interface ThermalLatticeConfig extends Record<string, unknown> {
  nodeCount: number;
  ambientTempKelvin: number;
  conductivity: number;
  heaterPowerKw: number;
}

export interface ThermalNode {
  id: string;
  index: number;
  tempKelvin: number;
  heaterActive: boolean;
}

export interface ThermalLatticeState {
  nodes: ThermalNode[];
  totalThermalEnergy: number;
}

export function createThermalLatticeTemplatePlugin(): WorldPlugin<
  ThermalLatticeConfig,
  ThermalLatticeState
> {
  const schema = z.object({
    nodeCount: z.number().int().min(3).max(24),
    ambientTempKelvin: z.number().min(100).max(500),
    conductivity: z.number().min(0.01).max(0.5),
    heaterPowerKw: z.number().min(0).max(100),
  });

  return defineWorldPlugin<ThermalLatticeConfig, ThermalLatticeState>({
    id: 'thermal-lattice-template',
    name: 'Thermal Lattice (PDK Example)',
    subtitle: '1D Conductive Heat Transfer Reference Plugin',
    version: '1.0.0',
    schemaVersion: 1,
    accentColor: '#a855f7',
    description:
      'Reference World Plugin Development Kit (PDK) scaffold modeling conductive heat diffusion across coupled thermal nodes.',
    physicalModelDocumentation: [
      'Fourier 1D discrete heat conduction between adjacent nodes: dT = k * (T_neighbor - T_self).',
      'Radiative cooling toward ambient temperature and localized heater injection.',
    ],
    simplifiedMechanicsNote:
      'Reference PDK template demonstrating custom world creation without modifying the core kernel.',
    configSchema: schema,
    defaultConfig: {
      nodeCount: 8,
      ambientTempKelvin: 290,
      conductivity: 0.18,
      heaterPowerKw: 25,
    },
    scenarios: [
      {
        id: 'thermal-pulse',
        name: 'Core Thermal Pulse',
        subtitle: 'Conductive Equilibrium Test',
        description: 'Central heater warms adjacent nodes toward steady state.',
        hypothesis: 'Increasing conductivity flattens peak-to-edge thermal gradient.',
        seed: 10101,
        config: {
          nodeCount: 8,
          ambientTempKelvin: 290,
          conductivity: 0.18,
          heaterPowerKw: 25,
        },
      },
    ],
    quickInterventions: [
      {
        id: 'inject-heat-pulse',
        label: 'Inject Thermal Pulse (+80 K)',
        description: 'Injects an instant +80 K thermal spike into node-1.',
        category: 'crisis',
        commandType: 'inject_heat',
        defaultPayload: { nodeIndex: 0, deltaKelvin: 80 },
      },
    ],
    metricDefinitions: [
      {
        id: 'meanTempK',
        label: 'Mean Temperature',
        unit: 'K',
        category: 'Thermal',
        description: 'Mean temperature across all lattice nodes.',
      },
      {
        id: 'maxGradientK',
        label: 'Max Thermal Gradient',
        unit: 'K',
        category: 'Thermal',
        description: 'Difference between hottest and coldest node.',
      },
    ],
    initializeWorld(config, rng) {
      const stream = rng.stream('init');
      const nodes: ThermalNode[] = [];
      for (let i = 0; i < config.nodeCount; i++) {
        nodes.push({
          id: `node-${i + 1}`,
          index: i,
          tempKelvin: roundDet(config.ambientTempKelvin + stream.nextRange(-5, 5), 2),
          heaterActive: i === Math.floor(config.nodeCount / 2),
        });
      }
      return {
        nodes,
        totalThermalEnergy: roundDet(
          nodes.reduce((acc, n) => acc + n.tempKelvin, 0),
          2,
        ),
      };
    },
    systems: [
      {
        id: 'thermal_conduction',
        name: 'Fourier Conduction Step',
        order: 10,
        step(ctx) {
          const { state, config } = ctx;
          const prevTemps = state.nodes.map((n) => n.tempKelvin);
          for (let i = 0; i < state.nodes.length; i++) {
            const left = i > 0 ? prevTemps[i - 1] : config.ambientTempKelvin;
            const right =
              i < state.nodes.length - 1 ? prevTemps[i + 1] : config.ambientTempKelvin;
            const conduction = config.conductivity * ((left + right) / 2 - prevTemps[i]);
            const cooling = 0.04 * (config.ambientTempKelvin - prevTemps[i]);
            const heating = state.nodes[i].heaterActive ? config.heaterPowerKw * 0.25 : 0;
            state.nodes[i].tempKelvin = roundDet(
              clampDet(prevTemps[i] + conduction + cooling + heating, 50, 2000),
              3,
            );
          }
          state.totalThermalEnergy = roundDet(
            state.nodes.reduce((acc, n) => acc + n.tempKelvin, 0),
            2,
          );
        },
      },
    ],
    applyCommand(state, command: SimulationCommand, ctx) {
      if (command.type === 'inject_heat') {
        const idx = Number(command.payload.nodeIndex ?? 0);
        const delta = Number(command.payload.deltaKelvin ?? 80);
        const target = state.nodes[idx] ?? state.nodes[0];
        if (target) {
          const before = target.tempKelvin;
          target.tempKelvin = roundDet(target.tempKelvin + delta, 2);
          ctx.emitEvent({
            type: 'thermal_pulse_injected',
            severity: 'warning',
            title: `Thermal Pulse on ${target.id}`,
            description: `Temperature rose from ${before} K to ${target.tempKelvin} K.`,
            sourceSystem: 'thermal_command',
            sourceEntityId: target.id,
            affectedEntityIds: [target.id],
            deltas: [
              {
                metricOrField: 'tempKelvin',
                before,
                after: target.tempKelvin,
                unit: 'K',
              },
            ],
          });
        }
      }
    },
    extractMetrics(state) {
      const temps = state.nodes.map((n) => n.tempKelvin);
      const mean = temps.reduce((a, b) => a + b, 0) / Math.max(1, temps.length);
      const grad = Math.max(...temps) - Math.min(...temps);
      return {
        meanTempK: roundDet(mean, 2),
        maxGradientK: roundDet(grad, 2),
      };
    },
    inspectEntities(state) {
      return state.nodes.map((n) => ({
        entityId: n.id,
        kind: 'thermal_node',
        label: `Thermal Node #${n.index + 1}`,
        status: n.tempKelvin > 360 ? 'warning' : 'nominal',
        position: [(n.index - state.nodes.length / 2) * 3, 0, 0],
        summary: `${n.tempKelvin} K (${n.heaterActive ? 'Heater Active' : 'Passive'})`,
        properties: [
          { key: 'tempKelvin', label: 'Temperature', value: n.tempKelvin, unit: 'K' },
          {
            key: 'heaterActive',
            label: 'Heater State',
            value: n.heaterActive ? 'ON' : 'OFF',
          },
        ],
      }));
    },
    extractRenderFrame(state, _config, runId, tick) {
      return {
        worldId: 'thermal-lattice-template',
        runId,
        tick,
        ambientStatus: 'nominal',
        entities: state.nodes.map((n) => ({
          id: n.id,
          kind: 'thermal_node',
          label: n.id,
          position: [(n.index - state.nodes.length / 2) * 3, 1, 0],
          scale: [1, 1, 1],
          color: n.tempKelvin > 340 ? '#ff3d57' : '#00e5ff',
          energyOrHealth: clampDet((n.tempKelvin - 250) / 150, 0.1, 1),
          status: n.tempKelvin > 360 ? 'warning' : 'nominal',
        })),
        zones: [],
        connections: [],
        hudSummary: {
          Nodes: state.nodes.length,
          'Total Thermal (K)': state.totalThermalEnergy,
        },
      };
    },
  });
}
