/**
 * Expeditions with Real Crew Specializations (P009)
 *
 * Implements assignable, consequential scientific crew roles with distinct competencies,
 * energy consumption, fatigue mechanics, and expedition legality checking.
 */

export enum CrewRole {
  FIELD_SURVEYOR = 0,
  SYSTEMS_ENGINEER = 1,
  BIOSPHERE_ECOLOGIST = 2,
  LOGISTICS_COURIER = 3,
  HEAVY_CONSTRUCTOR = 4,
  HAZARD_SPECIALIST = 5,
  FieldSurveyor = 0,
  SystemsEngineer = 1,
  BiosphereEcologist = 2,
  LogisticsCourier = 3,
  HeavyConstructor = 4,
  HazardSpecialist = 5,
}

export interface CrewRoleModifiers {
  readonly roleName: string;
  readonly description: string;
  readonly discoveryBonus: number;
  readonly surveySpeedMultiplier: number;
  readonly calibrationWearReduction: number;
  readonly repairEfficiencyMultiplier: number;
  readonly observationPrecisionBonus: number;
  readonly facilityBuildSpeedMultiplier: number;
  readonly hazardFatigueReduction: number;
  readonly hazardMitigationBonus: number;
  readonly cargoBonus: number;
}

export const CREW_ROLE_DEFINITIONS: Record<CrewRole, CrewRoleModifiers> = {
  [CrewRole.FIELD_SURVEYOR]: {
    roleName: 'Field Surveyor',
    description: 'Specializes in site detection, planetary cartography, and high-accuracy telemetry.',
    discoveryBonus: 0.25,
    surveySpeedMultiplier: 1.35,
    calibrationWearReduction: 0.0,
    repairEfficiencyMultiplier: 1.0,
    observationPrecisionBonus: 0.15,
    facilityBuildSpeedMultiplier: 1.0,
    hazardFatigueReduction: 0.0,
    hazardMitigationBonus: 0.05,
    cargoBonus: 0,
  },
  [CrewRole.SYSTEMS_ENGINEER]: {
    roleName: 'Systems Engineer',
    description: 'Maintains complex instrumentation, repairs facilities, and halving instrument calibration wear.',
    discoveryBonus: 0.0,
    surveySpeedMultiplier: 1.0,
    calibrationWearReduction: 0.5,
    repairEfficiencyMultiplier: 1.5,
    observationPrecisionBonus: 0.05,
    facilityBuildSpeedMultiplier: 1.25,
    hazardFatigueReduction: 0.1,
    hazardMitigationBonus: 0.1,
    cargoBonus: 0,
  },
  [CrewRole.BIOSPHERE_ECOLOGIST]: {
    roleName: 'Biosphere Ecologist',
    description: 'Expert in biological samples, organic restoration layers, and nutrient web analysis.',
    discoveryBonus: 0.1,
    surveySpeedMultiplier: 1.1,
    calibrationWearReduction: 0.0,
    repairEfficiencyMultiplier: 1.0,
    observationPrecisionBonus: 0.1,
    facilityBuildSpeedMultiplier: 1.0,
    hazardFatigueReduction: 0.15,
    hazardMitigationBonus: 0.15,
    cargoBonus: 0,
  },
  [CrewRole.LOGISTICS_COURIER]: {
    roleName: 'Logistics Courier',
    description: 'Coordinates cargo shipments, high-speed regional transport, and depot supply runs.',
    discoveryBonus: 0.0,
    surveySpeedMultiplier: 1.15,
    calibrationWearReduction: 0.0,
    repairEfficiencyMultiplier: 1.0,
    observationPrecisionBonus: 0.0,
    facilityBuildSpeedMultiplier: 1.0,
    hazardFatigueReduction: 0.1,
    hazardMitigationBonus: 0.05,
    cargoBonus: 20,
  },
  [CrewRole.HEAVY_CONSTRUCTOR]: {
    roleName: 'Heavy Constructor',
    description: 'Constructs permanent facilities, deep passage bracing, and structural bulkheads.',
    discoveryBonus: 0.0,
    surveySpeedMultiplier: 0.9,
    calibrationWearReduction: 0.0,
    repairEfficiencyMultiplier: 1.2,
    observationPrecisionBonus: 0.0,
    facilityBuildSpeedMultiplier: 1.5,
    hazardFatigueReduction: 0.2,
    hazardMitigationBonus: 0.2,
    cargoBonus: 10,
  },
  [CrewRole.HAZARD_SPECIALIST]: {
    roleName: 'Hazard Specialist',
    description: 'Monitors runaway cascade thresholds and protects team members from hazardous environments.',
    discoveryBonus: 0.05,
    surveySpeedMultiplier: 1.0,
    calibrationWearReduction: 0.1,
    repairEfficiencyMultiplier: 1.0,
    observationPrecisionBonus: 0.05,
    facilityBuildSpeedMultiplier: 1.0,
    hazardFatigueReduction: 0.35,
    hazardMitigationBonus: 0.4,
    cargoBonus: 0,
  },
};

export interface CrewMember {
  readonly id: string;
  readonly worldId: string;
  readonly name: string;
  readonly role: CrewRole;
  energy: number; // 0 - 100
  assignedRegionId: string;
  assignedSiteId: string | null;
  work: number;
}

export interface CrewMemberSummary {
  readonly id: string;
  readonly name: string;
  readonly role: CrewRole;
  readonly roleName: string;
  readonly energy: number;
  readonly assignedRegionId: string;
  readonly assignedSiteId: string | null;
  readonly work: number;
}

export interface ExpeditionLegalityResult {
  readonly legal: boolean;
  readonly reason?: string;
  readonly participatingRoles: readonly CrewRole[];
}

export interface ExpeditionRiskPreview {
  readonly meanEnergy: number;
  readonly minimumEnergy: number;
  readonly estimatedEnergyDrain: number;
  readonly fatigueRisk: 'low' | 'moderate' | 'high' | 'critical';
  readonly survivalChancePct: number;
}

export interface MissionRiskPreview {
  readonly baselineRisk: number;
  readonly mitigationDiscount: number;
  readonly netRisk: number;
}

export class CrewManager {
  readonly worldId: string;
  private readonly members: Map<string, CrewMember> = new Map();

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  registerCrew(member: CrewMember): void {
    this.members.set(member.id, member);
  }

  getCrew(id: string): CrewMember | undefined {
    return this.members.get(id);
  }

  getAllCrew(): readonly CrewMember[] {
    return Array.from(this.members.values());
  }

  getCrewSummaries(): readonly CrewMemberSummary[] {
    return this.getAllCrew().map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      roleName: CREW_ROLE_DEFINITIONS[c.role].roleName,
      energy: c.energy,
      assignedRegionId: c.assignedRegionId,
      assignedSiteId: c.assignedSiteId,
      work: c.work,
    }));
  }

  debitEnergy(crewId: string, amount: number): boolean {
    const member = this.members.get(crewId);
    if (!member) return false;
    if (member.energy <= 0) return false;
    member.energy = Math.max(0, Math.round((member.energy - amount) * 10) / 10);
    return true;
  }

  restCrew(crewId: string, amount: number): void {
    const member = this.members.get(crewId);
    if (!member) return;
    member.energy = Math.min(100, Math.round((member.energy + amount) * 10) / 10);
  }

  incrementWork(crewId: string, delta = 1): void {
    const member = this.members.get(crewId);
    if (member) {
      member.work += delta;
    }
  }

  /**
   * Checks whether a crew assignment is legally certified and capable of dispatch.
   */
  checkExpeditionLegality(
    crewIds: readonly string[],
    requiredRole?: CrewRole,
    minEnergy = 10,
  ): ExpeditionLegalityResult {
    if (crewIds.length === 0) {
      return {
        legal: false,
        reason: 'Expedition roster is empty; at least one certified specialist required.',
        participatingRoles: [],
      };
    }

    const roles: CrewRole[] = [];
    for (const id of crewIds) {
      const member = this.members.get(id);
      if (!member) {
        return {
          legal: false,
          reason: `Crew member '${id}' does not exist on world ${this.worldId}.`,
          participatingRoles: roles,
        };
      }
      if (member.energy < minEnergy) {
        return {
          legal: false,
          reason: `Crew member '${member.name}' is exhausted (${member.energy}% energy; minimum ${minEnergy}% required).`,
          participatingRoles: roles,
        };
      }
      roles.push(member.role);
    }

    if (requiredRole !== undefined && !roles.includes(requiredRole)) {
      const reqName = CREW_ROLE_DEFINITIONS[requiredRole]?.roleName ?? `Role ${requiredRole}`;
      return {
        legal: false,
        reason: `Missing certified role: expedition requires certified ${reqName} for this hazardous assignment.`,
        participatingRoles: roles,
      };
    }

    return {
      legal: true,
      participatingRoles: roles,
    };
  }

  /**
   * Previews mission risk based on baseline danger and assigned crew mitigations.
   */
  previewMissionRisk(
    baselineRisk: number,
    crewIds: readonly string[] = [],
  ): MissionRiskPreview {
    let maxMitigation = 0;
    for (const id of crewIds) {
      const member = this.members.get(id);
      if (member) {
        const mod = CREW_ROLE_DEFINITIONS[member.role];
        if (mod && mod.hazardMitigationBonus > maxMitigation) {
          maxMitigation = mod.hazardMitigationBonus;
        }
      }
    }

    const discount = Math.round(baselineRisk * maxMitigation * 100) / 100;
    const netRisk = Math.max(0, Math.round((baselineRisk - discount) * 100) / 100);

    return {
      baselineRisk,
      mitigationDiscount: discount,
      netRisk,
    };
  }

  /**
   * Previews expedition risk based on crew energy, roles, and regional hazard level.
   */
  previewExpeditionRisk(
    crewIds: readonly string[],
    regionHazard: number,
  ): ExpeditionRiskPreview {
    if (crewIds.length === 0) {
      return {
        meanEnergy: 0,
        minimumEnergy: 0,
        estimatedEnergyDrain: 0,
        fatigueRisk: 'critical',
        survivalChancePct: 0,
      };
    }

    let totalEnergy = 0;
    let minEnergy = 100;
    let maxHazardReduction = 0;

    for (const id of crewIds) {
      const member = this.members.get(id);
      const energy = member ? member.energy : 0;
      totalEnergy += energy;
      if (energy < minEnergy) minEnergy = energy;
      if (member) {
        const mod = CREW_ROLE_DEFINITIONS[member.role];
        if (mod.hazardFatigueReduction > maxHazardReduction) {
          maxHazardReduction = mod.hazardFatigueReduction;
        }
      }
    }

    const meanEnergy = Math.round((totalEnergy / crewIds.length) * 10) / 10;
    const baseDrain = 5 + regionHazard * 0.25;
    const estimatedEnergyDrain = Math.max(1, Math.round(baseDrain * (1 - maxHazardReduction) * 10) / 10);

    let fatigueRisk: ExpeditionRiskPreview['fatigueRisk'] = 'low';
    if (minEnergy < 20 || estimatedEnergyDrain > minEnergy * 0.8) {
      fatigueRisk = 'critical';
    } else if (minEnergy < 40 || estimatedEnergyDrain > minEnergy * 0.5) {
      fatigueRisk = 'high';
    } else if (minEnergy < 60 || estimatedEnergyDrain > 15) {
      fatigueRisk = 'moderate';
    }

    const survivalChancePct = Math.max(
      10,
      Math.min(100, Math.round(100 - regionHazard * 0.5 + meanEnergy * 0.3)),
    );

    return {
      meanEnergy,
      minimumEnergy: minEnergy,
      estimatedEnergyDrain,
      fatigueRisk,
      survivalChancePct,
    };
  }
}
