/**
 * Omniverse III — Scientific Instruments Engine (P010: A Scientist's Hands)
 *
 * Provides physical in-world instruments (environmental samplers, structural probes,
 * spectral/signal analyzers) with calibrated channel sampling, energy/resource costs,
 * calibration maintenance, and strict provenance-stamped scientific observations.
 */

import { ScientificBudgetLedger } from './budgetLedger';

export type InstrumentDeviceClass =
  | 'environmental_sampler'
  | 'structural_probe'
  | 'spectral_analyzer';

export interface InstrumentChannelDefinition {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly minValid: number;
  readonly maxValid: number;
  readonly basePrecision: number;
}

export interface ScientificInstrumentConfig {
  readonly id: string;
  readonly worldId: string;
  readonly name: string;
  readonly description: string;
  readonly deviceClass: InstrumentDeviceClass;
  readonly channels: readonly InstrumentChannelDefinition[];
  readonly sampleCost?: Array<{ resource: string; amount: number }>;
  readonly calibrationCost?: Array<{ resource: string; amount: number }>;
  readonly maxRangeMeters?: number;
}

export interface SampleObservation {
  readonly id: string;
  readonly instrumentId: string;
  readonly worldId: string;
  readonly siteId: string;
  readonly channel: string;
  readonly rawValue: number;
  readonly calibratedValue: number;
  readonly unit: string;
  readonly confidence: number;
  readonly tick: number;
  readonly provenance: {
    readonly deviceClass: InstrumentDeviceClass;
    readonly calibrationLevel: number;
    readonly rulesVersion: number;
    readonly costPaid?: Array<{ resource: string; amount: number }>;
  };
}

export interface SampleRequest {
  readonly channelId: string;
  readonly siteId: string;
  readonly tick: number;
  readonly distanceMeters?: number;
  readonly rawMetricValue: number;
  readonly isDisclosed?: boolean;
}

export interface SampleResult {
  readonly success: boolean;
  readonly observation?: SampleObservation;
  readonly reason?: string;
}

export interface CalibrationResult {
  readonly success: boolean;
  readonly previousLevel: number;
  readonly newLevel: number;
  readonly reason?: string;
}

export class ScientificInstrument {
  readonly id: string;
  readonly worldId: string;
  readonly name: string;
  readonly description: string;
  readonly deviceClass: InstrumentDeviceClass;
  readonly channels: ReadonlyMap<string, InstrumentChannelDefinition>;
  readonly sampleCost: readonly { resource: string; amount: number }[];
  readonly calibrationCost: readonly { resource: string; amount: number }[];
  readonly maxRangeMeters: number;

  private _calibrationLevel = 1.0;
  private _sampleCount = 0;
  private _lastSampleTick = -1;

  constructor(config: ScientificInstrumentConfig) {
    this.id = config.id;
    this.worldId = config.worldId;
    this.name = config.name;
    this.description = config.description;
    this.deviceClass = config.deviceClass;
    this.sampleCost = config.sampleCost ?? [];
    this.calibrationCost = config.calibrationCost ?? [];
    this.maxRangeMeters = config.maxRangeMeters ?? 500;

    const channelMap = new Map<string, InstrumentChannelDefinition>();
    for (const ch of config.channels) {
      channelMap.set(ch.id, ch);
    }
    this.channels = channelMap;
  }

  get calibrationLevel(): number {
    return this._calibrationLevel;
  }

  get sampleCount(): number {
    return this._sampleCount;
  }

  get lastSampleTick(): number {
    return this._lastSampleTick;
  }

  hasChannel(channelId: string): boolean {
    return this.channels.has(channelId);
  }

  getChannel(channelId: string): InstrumentChannelDefinition | undefined {
    return this.channels.get(channelId);
  }

  /**
   * Samples a specific metric channel at a site.
   * Atomically checks range, disclosure, and resource budget.
   */
  sample(
    request: SampleRequest,
    budgetLedger?: ScientificBudgetLedger,
  ): SampleResult {
    const channel = this.channels.get(request.channelId);
    if (!channel) {
      return {
        success: false,
        reason: `Channel '${request.channelId}' not supported by instrument '${this.name}'`,
      };
    }

    if (request.isDisclosed === false) {
      return {
        success: false,
        reason: `Target site '${request.siteId}' is not disclosed or visited`,
      };
    }

    if (
      request.distanceMeters !== undefined &&
      request.distanceMeters > this.maxRangeMeters
    ) {
      return {
        success: false,
        reason: `Target site '${request.siteId}' is out of range (${request.distanceMeters}m > ${this.maxRangeMeters}m)`,
      };
    }

    // Check and debit budget if cost is defined
    if (budgetLedger && this.sampleCost.length > 0) {
      const tx = budgetLedger.applyTransaction(
        `sample-${this.id}-${request.tick}`,
        this.sampleCost,
        [],
        request.tick,
      );
      if (tx.status === 'rejected') {
        return {
          success: false,
          reason: `Insufficient budget for sampling: ${tx.rejectionReason}`,
        };
      }
    }

    // Compute calibration noise / precision
    const rawVal = request.rawMetricValue;
    // Calibrated noise decreases with higher calibration level
    // Bounded deterministic offset based on tick and calibration level
    const noiseFactor = (1.0 - this._calibrationLevel) * channel.basePrecision * 10;
    const deterministicNoise =
      Math.sin(request.tick * 0.17 + this._sampleCount) * noiseFactor;
    const observedVal = Math.round((rawVal + deterministicNoise) * 100) / 100;

    // Confidence drops with wear and uncalibrated state
    const confidence = Math.max(
      0.1,
      Math.min(1.0, Math.round(this._calibrationLevel * 100) / 100),
    );

    // Instrument degrades slightly with each sample (0.5% drift per sample, min 0.5)
    this._calibrationLevel = Math.max(0.5, this._calibrationLevel - 0.005);
    this._sampleCount++;
    this._lastSampleTick = request.tick;

    const observation: SampleObservation = {
      id: `obs-${this.id}-${request.channelId}-${request.tick}-${this._sampleCount}`,
      instrumentId: this.id,
      worldId: this.worldId,
      siteId: request.siteId,
      channel: request.channelId,
      rawValue: rawVal,
      calibratedValue: observedVal,
      unit: channel.unit,
      confidence,
      tick: request.tick,
      provenance: {
        deviceClass: this.deviceClass,
        calibrationLevel: this._calibrationLevel,
        rulesVersion: 1,
        costPaid: this.sampleCost.length > 0 ? [...this.sampleCost] : undefined,
      },
    };

    return {
      success: true,
      observation,
    };
  }

  /**
   * Calibrate the instrument back to 1.0 accuracy.
   */
  calibrate(
    tick: number,
    budgetLedger?: ScientificBudgetLedger,
  ): CalibrationResult {
    if (budgetLedger && this.calibrationCost.length > 0) {
      const tx = budgetLedger.applyTransaction(
        `calibrate-${this.id}-${tick}`,
        this.calibrationCost,
        [],
        tick,
      );
      if (tx.status === 'rejected') {
        return {
          success: false,
          previousLevel: this._calibrationLevel,
          newLevel: this._calibrationLevel,
          reason: `Insufficient budget for calibration: ${tx.rejectionReason}`,
        };
      }
    }

    const prev = this._calibrationLevel;
    this._calibrationLevel = 1.0;
    return {
      success: true,
      previousLevel: prev,
      newLevel: 1.0,
    };
  }
}

export class ScientificInstrumentManager {
  readonly worldId: string;
  private readonly _instruments = new Map<string, ScientificInstrument>();
  private readonly _observations: SampleObservation[] = [];

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  registerInstrument(config: ScientificInstrumentConfig): ScientificInstrument {
    const inst = new ScientificInstrument(config);
    this._instruments.set(inst.id, inst);
    return inst;
  }

  getInstrument(id: string): ScientificInstrument | undefined {
    return this._instruments.get(id);
  }

  getAllInstruments(): readonly ScientificInstrument[] {
    return Array.from(this._instruments.values());
  }

  getObservations(): readonly SampleObservation[] {
    return this._observations;
  }

  getRecentObservations(limit = 10): readonly SampleObservation[] {
    return this._observations.slice(-limit);
  }

  recordObservation(obs: SampleObservation): void {
    this._observations.push(obs);
    // Bounded observation history (keep last 100)
    if (this._observations.length > 100) {
      this._observations.shift();
    }
  }

  /**
   * Sample from a specific instrument by ID.
   */
  sample(
    instrumentId: string,
    request: SampleRequest,
    budgetLedger?: ScientificBudgetLedger,
  ): SampleResult {
    const inst = this._instruments.get(instrumentId);
    if (!inst) {
      return {
        success: false,
        reason: `Instrument '${instrumentId}' not registered on world '${this.worldId}'`,
      };
    }

    const res = inst.sample(request, budgetLedger);
    if (res.success && res.observation) {
      this.recordObservation(res.observation);
    }
    return res;
  }

  /**
   * Calibrate a specific instrument by ID.
   */
  calibrate(
    instrumentId: string,
    tick: number,
    budgetLedger?: ScientificBudgetLedger,
  ): CalibrationResult {
    const inst = this._instruments.get(instrumentId);
    if (!inst) {
      return {
        success: false,
        previousLevel: 0,
        newLevel: 0,
        reason: `Instrument '${instrumentId}' not registered on world '${this.worldId}'`,
      };
    }
    return inst.calibrate(tick, budgetLedger);
  }
}
