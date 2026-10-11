import {
  CausalEvent,
  clampDet,
  CrossWorldProvenance,
  roundDet,
  WorldId,
} from './contracts';

export interface CrossWorldUnitMapping {
  sourceField: string;
  sourceUnit: string;
  targetField: string;
  targetUnit: string;
  formulaDescription: string;
}

export interface CrossWorldAdapter {
  id: string;
  name: string;
  version: string;
  schemaVersion: number;
  sourceWorldId: WorldId;
  sourceEventTypes: string[];
  targetWorldId: WorldId;
  targetCommandType: string;
  description: string;
  transformationRules: string[];
  requiredUnits: CrossWorldUnitMapping[];
  informationLoss: string[];
  validateSourceEvent(event: CausalEvent): { valid: boolean; reason?: string };
  translate(event: CausalEvent): {
    commandType: string;
    commandLabel: string;
    payload: Record<string, unknown>;
    provenance: CrossWorldProvenance;
  };
}

export interface CrossWorldTransferPreview {
  compatible: boolean;
  adapter: CrossWorldAdapter | null;
  sourceEvent: CausalEvent;
  sourceWorldId: WorldId;
  targetWorldId: WorldId;
  rejectionReason?: string;
  translatedCommand?: {
    type: string;
    label: string;
    payload: Record<string, unknown>;
    provenance: CrossWorldProvenance;
  };
}

export class CrossWorldContractRegistry {
  private adapters: Map<string, CrossWorldAdapter> = new Map();

  registerAdapter(adapter: CrossWorldAdapter): void {
    if (!adapter.id || !adapter.sourceWorldId || !adapter.targetWorldId) {
      throw new Error('Invalid CrossWorldAdapter: missing id, sourceWorldId, or targetWorldId');
    }
    this.adapters.set(adapter.id, adapter);
  }

  listAdapters(): CrossWorldAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAdapter(id: string): CrossWorldAdapter | undefined {
    return this.adapters.get(id);
  }

  findCompatibleAdapters(
    sourceWorldId: WorldId,
    targetWorldId: WorldId,
    eventType?: string,
  ): CrossWorldAdapter[] {
    return this.listAdapters().filter((a) => {
      if (a.sourceWorldId !== sourceWorldId || a.targetWorldId !== targetWorldId) {
        return false;
      }
      if (eventType && !a.sourceEventTypes.includes(eventType)) {
        return false;
      }
      return true;
    });
  }

  previewTransfer(
    sourceEvent: CausalEvent,
    sourceWorldId: WorldId,
    targetWorldId: WorldId,
    preferredAdapterId?: string,
  ): CrossWorldTransferPreview {
    if (!sourceEvent || typeof sourceEvent.type !== 'string') {
      return {
        compatible: false,
        adapter: null,
        sourceEvent,
        sourceWorldId,
        targetWorldId,
        rejectionReason: 'Malformed event object: missing required event type or schema.',
      };
    }

    if (sourceWorldId === targetWorldId) {
      return {
        compatible: false,
        adapter: null,
        sourceEvent,
        sourceWorldId,
        targetWorldId,
        rejectionReason:
          'Cross-world contract requires distinct source and target world modules. Use Timeline Branching for same-world interventions.',
      };
    }

    // Explicit physical incompatibility guardrails
    if (
      sourceWorldId === 'station' &&
      targetWorldId === 'ecosystem' &&
      (sourceEvent.type.includes('breach') ||
        sourceEvent.type.includes('decompression') ||
        sourceEvent.type.includes('pressure_drop'))
    ) {
      return {
        compatible: false,
        adapter: null,
        sourceEvent,
        sourceWorldId,
        targetWorldId,
        rejectionReason:
          'REJECTED BY PHYSICAL CONTRACT: A Space Station hull breach / compartment decompression models enclosed vessel pressure loss (kPa in finite m³ room volumes) into vacuum. The Ecosystem world models an open planetary biosphere without enclosed hull pressure compartments. Gas-related events are not interchangeable across incompatible physical domains.',
      };
    }

    const candidates = preferredAdapterId
      ? [this.adapters.get(preferredAdapterId)].filter((x): x is CrossWorldAdapter => Boolean(x))
      : this.findCompatibleAdapters(sourceWorldId, targetWorldId, sourceEvent.type);

    if (candidates.length === 0) {
      return {
        compatible: false,
        adapter: null,
        sourceEvent,
        sourceWorldId,
        targetWorldId,
        rejectionReason: `No registered cross-world contract adapter maps "${sourceEvent.type}" from "${sourceWorldId}" to "${targetWorldId}". Implicit or unvalidated cross-world coupling is prohibited.`,
      };
    }

    const adapter = candidates[0];
    if (
      adapter.sourceWorldId !== sourceWorldId ||
      adapter.targetWorldId !== targetWorldId ||
      !adapter.sourceEventTypes.includes(sourceEvent.type)
    ) {
      return {
        compatible: false,
        adapter,
        sourceEvent,
        sourceWorldId,
        targetWorldId,
        rejectionReason: `Adapter "${adapter.name}" only accepts [${adapter.sourceEventTypes.join(', ')}] from "${adapter.sourceWorldId}" -> "${adapter.targetWorldId}", but received "${sourceEvent.type}".`,
      };
    }

    const validation = adapter.validateSourceEvent(sourceEvent);
    if (!validation.valid) {
      return {
        compatible: false,
        adapter,
        sourceEvent,
        sourceWorldId,
        targetWorldId,
        rejectionReason:
          validation.reason ?? 'Source event payload failed adapter schema and unit validation.',
      };
    }

    const translated = adapter.translate(sourceEvent);
    return {
      compatible: true,
      adapter,
      sourceEvent,
      sourceWorldId,
      targetWorldId,
      translatedCommand: {
        type: translated.commandType,
        label: translated.commandLabel,
        payload: translated.payload,
        provenance: translated.provenance,
      },
    };
  }
}

export const defaultCrossWorldRegistry = new CrossWorldContractRegistry();

// 1. Adapter: Ecosystem Drought / Resource Collapse -> Civilization Regional Drought Shock
defaultCrossWorldRegistry.registerAdapter({
  id: 'adapter-eco-drought-to-civ-water-shock',
  name: 'Biosphere Hydrological Deficit -> Regional Settlement Water Shock',
  version: '1.0.0',
  schemaVersion: 1,
  sourceWorldId: 'ecosystem',
  sourceEventTypes: ['drought_triggered', 'resource_shortage', 'command:trigger_drought'],
  targetWorldId: 'civilization',
  targetCommandType: 'trigger_regional_drought',
  description:
    'Translates an ecosystem hydrological deficit or resource scarcity event into a proportional regional water table reduction across Civilization settlements.',
  transformationRules: [
    'Extract moisture/water deficit severity from ecosystem event payload (defaulting to 0.35 if unspecified).',
    'Clamp severity to [0.15, 0.75] hydrological reduction ratio.',
    'Map into Civilization "trigger_regional_drought" command affecting regional water regeneration.',
  ],
  requiredUnits: [
    {
      sourceField: 'severityRatio',
      sourceUnit: 'fraction (0..1 soil moisture loss)',
      targetField: 'severity',
      targetUnit: 'fraction (0..1 aquifer yield drop)',
      formulaDescription: 'severity = clamp(source.severityRatio, 0.15, 0.75)',
    },
  ],
  informationLoss: [
    'Spatial 2D coordinates of individual ecosystem flora patches are collapsed into a regional aquifer scalar.',
    'Species-specific metabolic stress values are omitted.',
  ],
  validateSourceEvent(event: CausalEvent) {
    if (!event || typeof event.payload !== 'object') {
      return { valid: false, reason: 'Event payload is missing.' };
    }
    const rawSeverity = Number(event.payload.severity ?? event.payload.moistureDrop ?? 0.35);
    if (!Number.isFinite(rawSeverity) || rawSeverity <= 0 || rawSeverity > 1) {
      return {
        valid: false,
        reason: `Invalid drought severity unit: expected fraction in (0, 1], received ${String(rawSeverity)}.`,
      };
    }
    return { valid: true };
  },
  translate(event: CausalEvent) {
    const rawSeverity = Number(event.payload.severity ?? event.payload.moistureDrop ?? 0.35);
    const severity = roundDet(clampDet(rawSeverity, 0.15, 0.75), 2);
    const provenance: CrossWorldProvenance = {
      adapterId: 'adapter-eco-drought-to-civ-water-shock',
      sourceRunId: event.runId,
      sourceWorldId: 'ecosystem',
      sourceEventId: event.id,
      sourceTick: event.tick,
      informationLossNotes: [
        'Local patch coordinates collapsed into regional aquifer scalar.',
        'Herbivore/predator trophic state discarded.',
      ],
    };
    return {
      commandType: 'trigger_regional_drought',
      commandLabel: `Cross-World Hydrological Shock (${Math.round(severity * 100)}%)`,
      payload: {
        severity,
        durationTicks: 25,
        reason: `Imported from Ecosystem event "${event.title}" (Tick ${event.tick})`,
      },
      provenance,
    };
  },
});

// 2. Adapter: Civilization Surplus Logistics Export -> Space Station Emergency Supply Drop
defaultCrossWorldRegistry.registerAdapter({
  id: 'adapter-civ-surplus-to-station-resupply',
  name: 'Settlement Logistics Convoy -> Orbital Resupply Capsule',
  version: '1.0.0',
  schemaVersion: 1,
  sourceWorldId: 'civilization',
  sourceEventTypes: [
    'infrastructure_completed',
    'resource_redistributed',
    'command:redistribute_resources',
  ],
  targetWorldId: 'station',
  targetCommandType: 'emergency_resupply',
  description:
    'Translates a Civilization material/resource surplus dispatch into an orbital resupply payload delivering O2 reserves and spare repair parts to the Space Station.',
  transformationRules: [
    'Read exported resource quantity (food/water/materials units) from Civilization event payload.',
    'Convert 10 settlement resource units into 120 moles O2 reserve + 15 kWh battery boost.',
  ],
  requiredUnits: [
    {
      sourceField: 'amount',
      sourceUnit: 'metric resource units',
      targetField: 'oxygenMoles',
      targetUnit: 'mol O2',
      formulaDescription: 'oxygenMoles = clamp(amount * 12, 60, 600)',
    },
    {
      sourceField: 'amount',
      sourceUnit: 'metric resource units',
      targetField: 'batteryKwh',
      targetUnit: 'kWh electrical reserve',
      formulaDescription: 'batteryKwh = clamp(amount * 1.5, 10, 80)',
    },
  ],
  informationLoss: [
    'Origin and destination settlement names are summarized in provenance metadata.',
    'Agricultural vs. mineral breakdown is unified into orbital life-support canisters.',
  ],
  validateSourceEvent(event: CausalEvent) {
    const amount = Number(event.payload.amount ?? event.payload.materialsInvested ?? 25);
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        valid: false,
        reason: 'Event payload must specify a positive resource amount (> 0).',
      };
    }
    return { valid: true };
  },
  translate(event: CausalEvent) {
    const amount = Number(event.payload.amount ?? event.payload.materialsInvested ?? 25);
    const oxygenMoles = roundDet(clampDet(amount * 12, 60, 600), 1);
    const batteryKwh = roundDet(clampDet(amount * 1.5, 10, 80), 1);
    const provenance: CrossWorldProvenance = {
      adapterId: 'adapter-civ-surplus-to-station-resupply',
      sourceRunId: event.runId,
      sourceWorldId: 'civilization',
      sourceEventId: event.id,
      sourceTick: event.tick,
      informationLossNotes: [
        'Settlement labor allocation and road topology excluded.',
      ],
    };
    return {
      commandType: 'emergency_resupply',
      commandLabel: `Orbital Resupply (+${oxygenMoles} mol O2, +${batteryKwh} kWh)`,
      payload: {
        oxygenMoles,
        batteryKwh,
      },
      provenance,
    };
  },
});

// 3. Adapter: Space Station Hydroponics Bio-Seed Capsule -> Ecosystem Fertility & Flora Seeding
defaultCrossWorldRegistry.registerAdapter({
  id: 'adapter-station-hydroponics-to-eco-fertility',
  name: 'Orbital Hydroponics Seed Vault -> Biosphere Fertility Restoration',
  version: '1.0.0',
  schemaVersion: 1,
  sourceWorldId: 'station',
  sourceEventTypes: [
    'compartment_repaired',
    'life_support_stabilized',
    'command:dispatch_repair',
  ],
  targetWorldId: 'ecosystem',
  targetCommandType: 'boost_fertility',
  description:
    'Translates a Space Station hydroponics/life-support stabilization milestone into a nutrient-rich flora seeding intervention in the Ecosystem.',
  transformationRules: [
    'Verify station repair/stabilization event succeeded.',
    'Translate orbital biomass culture output into a +35% soil fertility boost and +25 flora biomass injection.',
  ],
  requiredUnits: [
    {
      sourceField: 'integrityAfter',
      sourceUnit: '% structural/system integrity',
      targetField: 'fertilityBoost',
      targetUnit: 'biosphere regeneration multiplier delta',
      formulaDescription: 'fertilityBoost = clamp((integrityAfter / 100) * 0.4, 0.15, 0.5)',
    },
  ],
  informationLoss: [
    'Station electrical bus voltage and compartment pressure telemetry are discarded.',
  ],
  validateSourceEvent(event: CausalEvent) {
    if (!event) return { valid: false, reason: 'Missing source event.' };
    return { valid: true };
  },
  translate(event: CausalEvent) {
    const integrity = Number(event.payload.integrityAfter ?? 90);
    const fertilityBoost = roundDet(clampDet((integrity / 100) * 0.4, 0.15, 0.5), 2);
    const provenance: CrossWorldProvenance = {
      adapterId: 'adapter-station-hydroponics-to-eco-fertility',
      sourceRunId: event.runId,
      sourceWorldId: 'station',
      sourceEventId: event.id,
      sourceTick: event.tick,
      informationLossNotes: [
        'Station atmospheric pressure and electrical bus state discarded.',
      ],
    };
    return {
      commandType: 'boost_fertility',
      commandLabel: `Orbital Seed Vault Dispersal (+${Math.round(fertilityBoost * 100)}% Fertility)`,
      payload: {
        fertilityBoost,
        biomassInjection: 30,
      },
      provenance,
    };
  },
});
