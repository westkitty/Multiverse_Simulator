export type RestorationStage =
  | 'degraded'
  | 'stabilizing'
  | 'restoring'
  | 'flourishing';

export interface VisualElementConfig {
  materialColor: string;
  accentHex: string;
  activeMeshes: string[];
}

export interface RestorationLayerDefinition {
  id: string;
  name: string;
  metricKey: string;
  baselineValue: number;
  targetValue: number;
  visualElements: VisualElementConfig;
  stageDescriptions: Record<RestorationStage, string>;
}

export interface ComputedRestorationLayer {
  id: string;
  name: string;
  metricKey: string;
  currentMetricValue: number;
  progress: number; // 0.0 to 1.0
  stage: RestorationStage;
  opacity: number; // 0.0 to 1.0
  particleDensity: number; // 0.0 to 1.0
  activeMeshes: string[];
  materialColor: string;
  accentHex: string;
  description: string;
}

export interface VisualRestorationOptions {
  reducedMotion?: boolean;
}

export interface VisualRestorationSnapshot {
  worldId: string;
  overallProgress: number; // 0.0 to 1.0 (0% to 100%)
  overallStage: RestorationStage;
  layers: ComputedRestorationLayer[];
  accessibleSummary: string;
  reducedMotionApplied: boolean;
}

export class VisualRestorationManager {
  readonly worldId: string;
  private readonly layers = new Map<string, RestorationLayerDefinition>();

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  registerLayer(def: RestorationLayerDefinition): void {
    this.layers.set(def.id, def);
  }

  getLayerDefinition(id: string): RestorationLayerDefinition | undefined {
    return this.layers.get(id);
  }

  getAllLayerDefinitions(): RestorationLayerDefinition[] {
    return Array.from(this.layers.values());
  }

  evaluate(
    metrics: Record<string, number>,
    options: VisualRestorationOptions = {},
  ): VisualRestorationSnapshot {
    const isReduced = !!options.reducedMotion;
    const computedLayers: ComputedRestorationLayer[] = [];
    let totalProgress = 0;

    for (const [id, def] of this.layers) {
      const currentVal = metrics[def.metricKey] ?? def.baselineValue;
      const range = def.targetValue - def.baselineValue;
      let rawProgress = 0;
      if (range !== 0) {
        rawProgress = (currentVal - def.baselineValue) / range;
      }
      const clampedProgress = Math.max(0, Math.min(1, Math.round(rawProgress * 1000) / 1000));
      totalProgress += clampedProgress;

      let stage: RestorationStage;
      if (clampedProgress < 0.25) {
        stage = 'degraded';
      } else if (clampedProgress < 0.6) {
        stage = 'stabilizing';
      } else if (clampedProgress < 0.9) {
        stage = 'restoring';
      } else {
        stage = 'flourishing';
      }

      let opacity = clampedProgress;
      let particleDensity = clampedProgress;

      if (isReduced) {
        // Discrete quantization to eliminate continuous oscillation/strobe
        opacity = Math.round(clampedProgress * 4) / 4;
        // Zero particle motion in reduced-motion mode
        particleDensity = 0;
      }

      // Filter active meshes by progress threshold
      const meshCount = def.visualElements.activeMeshes.length;
      const activeCount = Math.ceil(clampedProgress * meshCount);
      const visibleMeshes = def.visualElements.activeMeshes.slice(0, Math.max(1, activeCount));

      computedLayers.push({
        id,
        name: def.name,
        metricKey: def.metricKey,
        currentMetricValue: currentVal,
        progress: clampedProgress,
        stage,
        opacity,
        particleDensity,
        activeMeshes: visibleMeshes,
        materialColor: def.visualElements.materialColor,
        accentHex: def.visualElements.accentHex,
        description: def.stageDescriptions[stage],
      });
    }

    const layerCount = this.layers.size;
    const overallProgress = layerCount > 0 ? Math.round((totalProgress / layerCount) * 1000) / 1000 : 0;

    let overallStage: RestorationStage;
    if (overallProgress < 0.25) {
      overallStage = 'degraded';
    } else if (overallProgress < 0.6) {
      overallStage = 'stabilizing';
    } else if (overallProgress < 0.9) {
      overallStage = 'restoring';
    } else {
      overallStage = 'flourishing';
    }

    const layerSummaries = computedLayers
      .map((l) => `${l.name} (${Math.round(l.progress * 100)}% - ${l.stage}): ${l.description}`)
      .join(' | ');

    const accessibleSummary = `Environmental Restoration on ${this.worldId}: Overall ${Math.round(
      overallProgress * 100,
    )}% restored (${overallStage}). ${layerSummaries}`;

    return {
      worldId: this.worldId,
      overallProgress,
      overallStage,
      layers: computedLayers,
      accessibleSummary,
      reducedMotionApplied: isReduced,
    };
  }

  toJSON(): {
    worldId: string;
    layerIds: string[];
  } {
    return {
      worldId: this.worldId,
      layerIds: Array.from(this.layers.keys()),
    };
  }
}
