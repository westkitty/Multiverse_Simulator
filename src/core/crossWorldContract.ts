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

    if (
      sourceWorldId === 'celestial' &&
      targetWorldId === 'megacity' &&
      sourceEvent.type.includes('orbital_eccentricity')
    ) {
      return {
        compatible: false,
        adapter: null,
        sourceEvent,
        sourceWorldId,
        targetWorldId,
        rejectionReason:
          'REJECTED BY PHYSICAL CONTRACT: Keplerian orbital eccentricity cannot directly mutate municipal water pipes without an intermediate planetary climate/geological transfer.',
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
  version: '2.0.0',
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
  version: '2.0.0',
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
    'Translates a Civilization material/resource surplus dispatch into an orbital resupply payload delivering O2 reserves and battery power to the Space Station.',
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
  version: '2.0.0',
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
    'Translate orbital biomass culture output into a +35% soil fertility boost and +30 flora biomass injection.',
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

// 4. Adapter: Atmosphere Monsoon / Moisture Surge -> Ecosystem Drought Relief & Biomass Restoration
defaultCrossWorldRegistry.registerAdapter({
  id: 'adapter-atm-monsoon-to-eco-restoration',
  name: 'Atmospheric Monsoon Precipitation -> Ecosystem Watershed Restoration',
  version: '2.0.0',
  schemaVersion: 1,
  sourceWorldId: 'atmosphere',
  sourceEventTypes: [
    'moisture_plume_injected',
    'moisture_surge_injected',
    'extreme_rainfall_flooding',
    'cloud_seeding_activated',
    'command:inject_moisture_plume',
  ],
  targetWorldId: 'ecosystem',
  targetCommandType: 'restore_favorable_conditions',
  description:
    'Translates an Atmospheric monsoon moisture plume or heavy rainfall event into watershed rehydration and flora regeneration across the 48 Ecosystem habitat zones.',
  transformationRules: [
    'Extract humidity/rainfall boost from Atmosphere event payload.',
    'Map into Ecosystem moistureTarget (75..96%) and biomassBoost (25..65 kg/zone).',
  ],
  requiredUnits: [
    {
      sourceField: 'humidityBoost',
      sourceUnit: '% relative humidity / mm rainfall',
      targetField: 'moistureTarget',
      targetUnit: '% soil moisture floor',
      formulaDescription: 'moistureTarget = clamp(65 + humidityBoost * 0.8, 72, 96)',
    },
  ],
  informationLoss: [
    'Synoptic wind vectors (u, v) and barometric hPa gradients are collapsed into surface soil moisture.',
  ],
  validateSourceEvent(event: CausalEvent) {
    if (!event) return { valid: false, reason: 'Missing source event.' };
    return { valid: true };
  },
  translate(event: CausalEvent) {
    const hum = Number(
      event.payload?.humidityBoost ??
        event.payload?.humidityAdd ??
        event.payload?.rainfallRateMmHr ??
        28,
    );
    const moistureTarget = roundDet(clampDet(65 + hum * 0.8, 72, 96), 1);
    const biomassBoost = roundDet(clampDet(20 + hum * 0.9, 22, 65), 1);
    return {
      commandType: 'restore_favorable_conditions',
      commandLabel: `Atmospheric Monsoon Watershed Recharge (${moistureTarget}% Moisture)`,
      payload: { moistureTarget, biomassBoost },
      provenance: {
        adapterId: 'adapter-atm-monsoon-to-eco-restoration',
        sourceRunId: event.runId,
        sourceWorldId: 'atmosphere',
        sourceEventId: event.id,
        sourceTick: event.tick,
        informationLossNotes: [
          'Upper-air geostrophic wind vectors collapsed into basin-wide rainfall.',
        ],
      },
    };
  },
});

// 5. Adapter: Atmosphere Blocking High / Heatwave -> Civilization Regional Drought
defaultCrossWorldRegistry.registerAdapter({
  id: 'adapter-atm-heatwave-to-civ-drought',
  name: 'Atmospheric Blocking High Heatwave -> Civilization Aquifer Depletion',
  version: '2.0.0',
  schemaVersion: 1,
  sourceWorldId: 'atmosphere',
  sourceEventTypes: [
    'blocking_high_established',
    'atmospheric_drought_onset',
    'regional_thermal_shock',
    'command:apply_regional_thermal_shock',
  ],
  targetWorldId: 'civilization',
  targetCommandType: 'trigger_regional_drought',
  description:
    'Translates an Atmospheric anticyclonic blocking ridge or heatwave into a multi-settlement aquifer drought across Civilization.',
  transformationRules: [
    'Convert atmospheric humidity drop or thermal anomaly into Civilization aquifer drought severity [0.25, 0.72].',
  ],
  requiredUnits: [
    {
      sourceField: 'deltaTempC',
      sourceUnit: '°C thermal anomaly / % humidity deficit',
      targetField: 'severity',
      targetUnit: 'fraction aquifer recharge reduction',
      formulaDescription: 'severity = clamp(deltaTempC * 0.08, 0.25, 0.72)',
    },
  ],
  informationLoss: [
    'Cell-by-cell cloud cover is aggregated into continental drought duration.',
  ],
  validateSourceEvent(event: CausalEvent) {
    if (!event) return { valid: false, reason: 'Missing source event.' };
    return { valid: true };
  },
  translate(event: CausalEvent) {
    const temp = Number(event.payload?.deltaTempC ?? event.payload?.severity ?? 5);
    const severity = roundDet(clampDet(Math.abs(temp) * 0.08 + 0.2, 0.25, 0.72), 2);
    return {
      commandType: 'trigger_regional_drought',
      commandLabel: `Atmospheric Blocking Drought (-${Math.round(severity * 100)}% Aquifer Yield)`,
      payload: { severity, durationTicks: 24 },
      provenance: {
        adapterId: 'adapter-atm-heatwave-to-civ-drought',
        sourceRunId: event.runId,
        sourceWorldId: 'atmosphere',
        sourceEventId: event.id,
        sourceTick: event.tick,
        informationLossNotes: ['Synoptic pressure contours simplified to regional drought scalar.'],
      },
    };
  },
});

// 6. Adapter: Geology Volcanic Eruption -> Atmosphere Stratospheric Ash Cooling
defaultCrossWorldRegistry.registerAdapter({
  id: 'adapter-geo-eruption-to-atm-aerosol-cooling',
  name: 'Volcanic Plinian Eruption -> Atmospheric Stratospheric Aerosol Cooling',
  version: '2.0.0',
  schemaVersion: 1,
  sourceWorldId: 'geology',
  sourceEventTypes: [
    'volcanic_eruption',
    'volcanic_eruption_triggered',
    'tectonic_seismic_rupture',
    'command:trigger_volcanic_eruption',
  ],
  targetWorldId: 'atmosphere',
  targetCommandType: 'adjust_aerosol_veil',
  description:
    'Translates a Geological volcanic eruption ash column into stratospheric SO2/ash aerosol optical depth cooling across the 48 Atmospheric climate cells.',
  transformationRules: [
    'Read volcanic magma/ash spike from Geology event.',
    'Convert into Atmospheric deltaAerosol (+0.20 to +0.65 optical depth).',
  ],
  requiredUnits: [
    {
      sourceField: 'magmaSpikeMpa',
      sourceUnit: 'MPa volcanic overpressure / kt ash',
      targetField: 'deltaAerosol',
      targetUnit: 'aerosol optical depth delta',
      formulaDescription: 'deltaAerosol = clamp(magmaSpikeMpa * 0.008, 0.2, 0.65)',
    },
  ],
  informationLoss: [
    'Local lava flow elevation uplift is omitted from upper-atmosphere radiative transfer.',
  ],
  validateSourceEvent(event: CausalEvent) {
    if (!event) return { valid: false, reason: 'Missing source event.' };
    return { valid: true };
  },
  translate(event: CausalEvent) {
    const spike = Number(event.payload?.magmaSpikeMpa ?? event.payload?.ashAdded ?? 45);
    const deltaAerosol = roundDet(clampDet(spike * 0.008, 0.2, 0.65), 2);
    return {
      commandType: 'adjust_aerosol_veil',
      commandLabel: `Volcanic Stratospheric Ash Veil (+${deltaAerosol} AOD)`,
      payload: { deltaAerosol },
      provenance: {
        adapterId: 'adapter-geo-eruption-to-atm-aerosol-cooling',
        sourceRunId: event.runId,
        sourceWorldId: 'geology',
        sourceEventId: event.id,
        sourceTick: event.tick,
        informationLossNotes: ['Crustal fault shear stress tensor omitted.'],
      },
    };
  },
});

// 7. Adapter: Geology Earthquake Rupture -> Megacity Emergency & Grid Shock
defaultCrossWorldRegistry.registerAdapter({
  id: 'adapter-geo-quake-to-city-emergency',
  name: 'Tectonic Fault Rupture -> Megacity Infrastructure & Grid Emergency',
  version: '2.0.0',
  schemaVersion: 1,
  sourceWorldId: 'geology',
  sourceEventTypes: [
    'tectonic_seismic_rupture',
    'earthquake_rupture_triggered',
    'command:trigger_earthquake_rupture',
  ],
  targetWorldId: 'megacity',
  targetCommandType: 'trigger_municipal_emergency',
  description:
    'Translates a Geological fault rupture earthquake into a metropolitan substation overload and structural emergency across the 18 Megacity districts.',
  transformationRules: [
    'Convert seismic magnitude (Mw) into Megacity gridLossMw [180..420 MW].',
  ],
  requiredUnits: [
    {
      sourceField: 'magnitudeMw',
      sourceUnit: 'Mw moment magnitude',
      targetField: 'gridLossMw',
      targetUnit: 'MW substation loss',
      formulaDescription: 'gridLossMw = clamp((magnitudeMw - 5.0) * 95, 180, 420)',
    },
  ],
  informationLoss: [
    'Subsurface lithostatic MPa stress distribution is collapsed into surface peak ground acceleration impact.',
  ],
  validateSourceEvent(event: CausalEvent) {
    if (!event) return { valid: false, reason: 'Missing source event.' };
    return { valid: true };
  },
  translate(event: CausalEvent) {
    const mw = Number(event.payload?.magnitudeMw ?? event.payload?.maxMagnitudeMw ?? 7.4);
    const gridLossMw = roundDet(clampDet((mw - 5.0) * 95, 180, 420), 0);
    return {
      commandType: 'trigger_municipal_emergency',
      commandLabel: `Seismic Substation Shock (-${gridLossMw} MW Grid)`,
      payload: { emergencyType: 'grid_brownout', gridLossMw },
      provenance: {
        adapterId: 'adapter-geo-quake-to-city-emergency',
        sourceRunId: event.runId,
        sourceWorldId: 'geology',
        sourceEventId: event.id,
        sourceTick: event.tick,
        informationLossNotes: ['Tectonic plate vector velocity omitted.'],
      },
    };
  },
});

// 8. Adapter: Industrial Supply Chain Output -> Megacity Clean Grid & Transit Upgrade
defaultCrossWorldRegistry.registerAdapter({
  id: 'adapter-ind-finished-goods-to-city-grid',
  name: 'Industrial Finished Equipment Shipment -> Megacity Clean Power Expansion',
  version: '2.0.0',
  schemaVersion: 1,
  sourceWorldId: 'industrial',
  sourceEventTypes: [
    'facility_upgrade_completed',
    'industrial_power_upgraded',
    'strategic_inventory_released',
    'command:construct_facility_upgrade',
  ],
  targetWorldId: 'megacity',
  targetCommandType: 'upgrade_electrical_grid',
  description:
    'Translates Industrial manufacturing and turbine output into new clean electrical generation capacity across the Megacity.',
  transformationRules: [
    'Convert industrial capacity expansion into Megacity MW grid addition (160..380 MW).',
  ],
  requiredUnits: [
    {
      sourceField: 'capacityBoostPct',
      sourceUnit: '% industrial throughput expansion',
      targetField: 'addedCapacityMw',
      targetUnit: 'MW municipal generation',
      formulaDescription: 'addedCapacityMw = clamp(capacityBoostPct * 10, 160, 380)',
    },
  ],
  informationLoss: [
    'Individual mine and refinery buffer queues are summarized as delivered municipal turbines.',
  ],
  validateSourceEvent(event: CausalEvent) {
    if (!event) return { valid: false, reason: 'Missing source event.' };
    return { valid: true };
  },
  translate(event: CausalEvent) {
    const boost = Number(event.payload?.capacityBoostPct ?? 28);
    const addedCapacityMw = roundDet(clampDet(boost * 10, 160, 380), 0);
    return {
      commandType: 'upgrade_electrical_grid',
      commandLabel: `Industrial Turbine Delivery (+${addedCapacityMw} MW Clean Grid)`,
      payload: { addedCapacityMw },
      provenance: {
        adapterId: 'adapter-ind-finished-goods-to-city-grid',
        sourceRunId: event.runId,
        sourceWorldId: 'industrial',
        sourceEventId: event.id,
        sourceTick: event.tick,
        informationLossNotes: ['Upstream raw ore provenance simplified to finished grid equipment.'],
      },
    };
  },
});

// 9. Adapter: Celestial Stellar Flare / CME -> Space Station Radiation & Power Bus Trip
defaultCrossWorldRegistry.registerAdapter({
  id: 'adapter-cel-flare-to-stn-scram',
  name: 'Celestial Stellar Superflare CME -> Space Station Avionics & Reactor SCRAM',
  version: '2.0.0',
  schemaVersion: 1,
  sourceWorldId: 'celestial',
  sourceEventTypes: [
    'stellar_radiation_surge',
    'stellar_flare_triggered',
    'stellar_luminosity_modified',
    'command:trigger_stellar_flare',
  ],
  targetWorldId: 'station',
  targetCommandType: 'trigger_reactor_scram',
  description:
    'Translates a Celestial coronal mass ejection (CME) or stellar flare into an induced geomagnetic/avionics trip on the Modular Space Station.',
  transformationRules: [
    'Convert stellar flare intensity into Station reactor avionics damage [25..75%].',
  ],
  requiredUnits: [
    {
      sourceField: 'flareIntensity',
      sourceUnit: 'solar flare flux index',
      targetField: 'damageAmount',
      targetUnit: '% reactor avionics health drop',
      formulaDescription: 'damageAmount = clamp(flareIntensity * 1.1, 25, 75)',
    },
  ],
  informationLoss: [
    'Multi-planet secular orbital elements (a, e, omega) are omitted from local orbital radiation dose.',
  ],
  validateSourceEvent(event: CausalEvent) {
    if (!event) return { valid: false, reason: 'Missing source event.' };
    return { valid: true };
  },
  translate(event: CausalEvent) {
    const intensity = Number(event.payload?.flareIntensity ?? 48);
    const damageAmount = roundDet(clampDet(intensity * 1.1, 25, 75), 0);
    return {
      commandType: 'trigger_reactor_scram',
      commandLabel: `Stellar CME Avionics Trip (${damageAmount}% Bus Impact)`,
      payload: { damageAmount },
      provenance: {
        adapterId: 'adapter-cel-flare-to-stn-scram',
        sourceRunId: event.runId,
        sourceWorldId: 'celestial',
        sourceEventId: event.id,
        sourceTick: event.tick,
        informationLossNotes: ['Barycentric orbital positions omitted.'],
      },
    };
  },
});

// 10. Adapter: Ocean Nutrient Upwelling -> Ecosystem Coastal Wetland Fertility Boost
defaultCrossWorldRegistry.registerAdapter({
  id: 'adapter-ocn-upwelling-to-eco-fertility',
  name: 'Marine Coastal Upwelling -> Ecosystem Estuarine Nutrient Enrichment',
  version: '2.0.0',
  schemaVersion: 1,
  sourceWorldId: 'ocean',
  sourceEventTypes: [
    'nutrients_injected',
    'protected_regions_established',
    'command:inject_nutrients',
  ],
  targetWorldId: 'ecosystem',
  targetCommandType: 'boost_fertility',
  description:
    'Translates an Abyssal Ocean nutrient upwelling or phytoplankton bloom into coastal wetland and riparian nutrient enrichment in the Ecosystem.',
  transformationRules: [
    'Convert marine nitrate/phosphate upwelling boost into Ecosystem soil fertility multiplier (+25% to +55%) and flora biomass.',
  ],
  requiredUnits: [
    {
      sourceField: 'nutrientDelta',
      sourceUnit: 'µmol/L marine dissolved nutrients',
      targetField: 'fertilityBoost',
      targetUnit: 'fraction soil nutrient gain',
      formulaDescription: 'fertilityBoost = clamp(nutrientDelta / 50, 0.2, 0.55)',
    },
  ],
  informationLoss: [
    'Bathypelagic salinity (PSU) and thermohaline overturning velocity (Sv) are omitted.',
  ],
  validateSourceEvent(event: CausalEvent) {
    if (!event) return { valid: false, reason: 'Missing source event.' };
    return { valid: true };
  },
  translate(event: CausalEvent) {
    const nut = Number(event.payload?.nutrientDelta ?? 22);
    const fertilityBoost = roundDet(clampDet(nut / 50, 0.2, 0.55), 2);
    return {
      commandType: 'boost_fertility',
      commandLabel: `Marine Upwelling Estuarine Enrichment (+${Math.round(fertilityBoost * 100)}%)`,
      payload: { fertilityBoost, biomassInjection: 28 },
      provenance: {
        adapterId: 'adapter-ocn-upwelling-to-eco-fertility',
        sourceRunId: event.runId,
        sourceWorldId: 'ocean',
        sourceEventId: event.id,
        sourceTick: event.tick,
        informationLossNotes: ['3D depth-layer ocean stratification collapsed into coastal nutrient flux.'],
      },
    };
  },
});

// Atlas expansion contracts deliberately exchange experimental events, not a shared universe.
for (const spec of [
  { id:'industrial-supplies-to-terraforming', source:'industrial', target:'terraforming-frontier', event:'industrial_shipment_dispatched', field:'surplusUnits', sourceUnit:'manufactured inventory units', targetField:'quantity', targetUnit:'salvage units', command:'frontier.import_supplies', factor:.25, max:100, loss:'Inventory composition, shipping delay and spatial origin are discarded; this is an experimental allocation, not conserved cross-world transport.' },
  { id:'geology-exposure-to-archaeology', source:'geology', target:'timeworn-empire', event:'landslide_mass_wasting', field:'slideCount', sourceUnit:'failed slope cells', targetField:'meters', targetUnit:'m overburden removed', command:'frontier.expose_layers', factor:.05, max:1, loss:'Slope geometry and debris deposition are lost. Positive exposure approximates selected erosion sites only, not every landslide.' },
  { id:'atmosphere-drought-to-wilderness', source:'atmosphere', target:'wild-meridian', event:'drought_triggered', field:'severity', sourceUnit:'drought severity fraction', targetField:'delta', targetUnit:'forcing multiplier increment', command:'frontier.forcing', factor:1, max:1, loss:'Climate cells, duration and precipitation units are collapsed into a bounded frontier forcing change; no physical climate coupling is implied.' },
]) {
  defaultCrossWorldRegistry.registerAdapter({
    id:`adapter-${spec.id}`,name:`${spec.source} → ${spec.target}`,version:'1.0.0',schemaVersion:1,
    sourceWorldId:spec.source,targetWorldId:spec.target,sourceEventTypes:[spec.event],targetCommandType:spec.command,
    description:spec.loss,transformationRules:[`${spec.targetField} = min(${spec.max}, ${spec.field} × ${spec.factor})`],
    requiredUnits:[{sourceField:spec.field,sourceUnit:spec.sourceUnit,targetField:spec.targetField,targetUnit:spec.targetUnit,formulaDescription:`Multiply by ${spec.factor}, cap at ${spec.max}; require finite positive input.`}],
    informationLoss:[spec.loss],
    validateSourceEvent(event){
      const value=event?.payload?.[spec.field];
      return event?.schemaVersion===1 && event.type===spec.event && typeof value==='number' && Number.isFinite(value) && value>0
        ? {valid:true}:{valid:false,reason:`Requires schema 1 ${spec.event} with positive finite ${spec.field} in ${spec.sourceUnit}.`};
    },
    translate(event){
      const value=roundDet(Math.min(spec.max,Number(event.payload[spec.field])*spec.factor),6);
      return {commandType:spec.command,commandLabel:`Experimental transfer: ${spec.id}`,payload:{[spec.targetField]:value},provenance:{adapterId:`adapter-${spec.id}`,sourceRunId:event.runId,sourceWorldId:spec.source,sourceEventId:event.id,sourceTick:event.tick,informationLossNotes:[spec.loss]}};
    },
  });
}
