/**
 * Hazard Dependency Graph (P002 - The Anatomy of a Catastrophe)
 *
 * Models an observable and interruptible world-native failure chain for each universe.
 * Distinguishes observed triggers from hypothesized explanations.
 * Evaluates metric thresholds and maps active hazards to legal mitigation actions.
 */

export type HazardSeverity = 'info' | 'warning' | 'critical' | 'catastrophic';

export type ComparisonOperator = '>' | '>=' | '<' | '<=';

export type CausalLinkType = 'direct' | 'dependency' | 'inferred';

export interface HazardNode {
  readonly id: string;
  readonly label: string;
  readonly worldId: string;
  readonly sourceMetric: string;
  readonly targetMetric: string;
  readonly threshold: number;
  readonly operator: ComparisonOperator;
  readonly severity: HazardSeverity;
  readonly upstreamNodeIds: readonly string[];
  readonly mitigationActionFamily: string;
  readonly description: string;
  readonly observedTriggerTemplate: string;
  readonly hypothesizedExplanation: string;
}

export interface HazardLink {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly causalLinkType: CausalLinkType;
  readonly propagationDelayTicks?: number;
  readonly description: string;
}

export interface EvaluatedHazardState {
  readonly nodeId: string;
  readonly label: string;
  readonly currentValue: number;
  readonly threshold: number;
  readonly operator: ComparisonOperator;
  readonly severity: HazardSeverity;
  readonly status: 'dormant' | 'active' | 'mitigated';
  readonly upstreamCauses: readonly string[];
  readonly observedTrigger: string;
  readonly hypothesizedExplanation: string;
  readonly mitigationActionFamily: string;
}

export interface HazardEvaluationResult {
  readonly worldId: string;
  readonly tick: number;
  readonly activeHazards: readonly EvaluatedHazardState[];
  readonly allHazards: readonly EvaluatedHazardState[];
  readonly hazardLevel: number; // Normalized 0..100
  readonly unmitigatedCascadeActive: boolean;
  readonly recommendedMitigations: readonly string[];
}

function evaluateThreshold(
  value: number,
  operator: ComparisonOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case '>':
      return value > threshold;
    case '>=':
      return value >= threshold;
    case '<':
      return value < threshold;
    case '<=':
      return value <= threshold;
    default:
      return false;
  }
}

export class HazardDependencyGraph {
  readonly worldId: string;
  private readonly nodes: Map<string, HazardNode> = new Map();
  private readonly links: HazardLink[] = [];
  private readonly outgoingLinks: Map<string, HazardLink[]> = new Map();
  private readonly incomingLinks: Map<string, HazardLink[]> = new Map();

  constructor(worldId: string, nodes: readonly HazardNode[], links: readonly HazardLink[] = []) {
    this.worldId = worldId;
    for (const node of nodes) {
      this.nodes.set(node.id, Object.freeze({ ...node }));
    }
    for (const link of links) {
      this.links.push(Object.freeze({ ...link }));
      const outgoing = this.outgoingLinks.get(link.fromNodeId) ?? [];
      outgoing.push(link);
      this.outgoingLinks.set(link.fromNodeId, outgoing);

      const incoming = this.incomingLinks.get(link.toNodeId) ?? [];
      incoming.push(link);
      this.incomingLinks.set(link.toNodeId, incoming);
    }
  }

  getNode(id: string): HazardNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): readonly HazardNode[] {
    return Array.from(this.nodes.values());
  }

  getLinks(): readonly HazardLink[] {
    return [...this.links];
  }

  findUpstreamCauses(nodeId: string): readonly HazardNode[] {
    const visited = new Set<string>();
    const result: HazardNode[] = [];
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const incoming = this.incomingLinks.get(current) ?? [];
      for (const link of incoming) {
        if (!visited.has(link.fromNodeId)) {
          visited.add(link.fromNodeId);
          const parent = this.nodes.get(link.fromNodeId);
          if (parent) {
            result.push(parent);
            queue.push(link.fromNodeId);
          }
        }
      }
    }
    return result;
  }

  findDownstreamRisks(nodeId: string): readonly HazardNode[] {
    const visited = new Set<string>();
    const result: HazardNode[] = [];
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const outgoing = this.outgoingLinks.get(current) ?? [];
      for (const link of outgoing) {
        if (!visited.has(link.toNodeId)) {
          visited.add(link.toNodeId);
          const child = this.nodes.get(link.toNodeId);
          if (child) {
            result.push(child);
            queue.push(link.toNodeId);
          }
        }
      }
    }
    return result;
  }

  validateGraph(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for references to nonexistent nodes
    for (const link of this.links) {
      if (!this.nodes.has(link.fromNodeId)) {
        errors.push(`Link from unknown node: ${link.fromNodeId}`);
      }
      if (!this.nodes.has(link.toNodeId)) {
        errors.push(`Link to unknown node: ${link.toNodeId}`);
      }
    }

    // Check upstreamNodeIds on nodes
    for (const node of this.nodes.values()) {
      for (const upstreamId of node.upstreamNodeIds) {
        if (!this.nodes.has(upstreamId)) {
          errors.push(`Node ${node.id} references nonexistent upstreamNodeId ${upstreamId}`);
        }
      }
    }

    // Cycle detection using DFS
    const visited = new Map<string, 'visiting' | 'visited'>();
    const hasCycle = (curr: string): boolean => {
      visited.set(curr, 'visiting');
      const outgoing = this.outgoingLinks.get(curr) ?? [];
      for (const link of outgoing) {
        const state = visited.get(link.toNodeId);
        if (state === 'visiting') return true;
        if (!state && hasCycle(link.toNodeId)) return true;
      }
      visited.set(curr, 'visited');
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (hasCycle(nodeId)) {
          errors.push(`Graph contains a directed cycle involving node ${nodeId}`);
          break;
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  evaluate(
    metrics: Readonly<Record<string, number>>,
    tick: number,
    mitigatedNodeIds?: ReadonlySet<string>,
  ): HazardEvaluationResult {
    const evaluated: EvaluatedHazardState[] = [];
    const activeHazards: EvaluatedHazardState[] = [];
    const recommendedMitigationsSet = new Set<string>();

    for (const node of this.nodes.values()) {
      const metricVal = metrics[node.sourceMetric] ?? 0;
      const conditionTriggered = evaluateThreshold(metricVal, node.operator, node.threshold);
      const isMitigated = mitigatedNodeIds?.has(node.id) ?? false;

      let status: 'dormant' | 'active' | 'mitigated';
      if (!conditionTriggered) {
        status = 'dormant';
      } else if (isMitigated) {
        status = 'mitigated';
      } else {
        status = 'active';
      }

      const upstream = this.findUpstreamCauses(node.id).map((n) => n.id);
      const triggerText = node.observedTriggerTemplate
        .replace('{metric}', node.sourceMetric)
        .replace('{value}', metricVal.toFixed(2))
        .replace('{threshold}', node.threshold.toString());

      const item: EvaluatedHazardState = {
        nodeId: node.id,
        label: node.label,
        currentValue: metricVal,
        threshold: node.threshold,
        operator: node.operator,
        severity: node.severity,
        status,
        upstreamCauses: upstream,
        observedTrigger: triggerText,
        hypothesizedExplanation: node.hypothesizedExplanation,
        mitigationActionFamily: node.mitigationActionFamily,
      };

      evaluated.push(item);
      if (status === 'active') {
        activeHazards.push(item);
        if (node.mitigationActionFamily) {
          recommendedMitigationsSet.add(node.mitigationActionFamily);
        }
      }
    }

    // Compute composite hazard score
    let totalSeverityWeight = 0;
    for (const h of activeHazards) {
      switch (h.severity) {
        case 'info':
          totalSeverityWeight += 5;
          break;
        case 'warning':
          totalSeverityWeight += 15;
          break;
        case 'critical':
          totalSeverityWeight += 30;
          break;
        case 'catastrophic':
          totalSeverityWeight += 50;
          break;
      }
    }
    const hazardLevel = Math.min(100, totalSeverityWeight);
    const unmitigatedCascadeActive = activeHazards.some(
      (h) => h.severity === 'critical' || h.severity === 'catastrophic',
    );

    return {
      worldId: this.worldId,
      tick,
      activeHazards,
      allHazards: evaluated,
      hazardLevel,
      unmitigatedCascadeActive,
      recommendedMitigations: Array.from(recommendedMitigationsSet),
    };
  }
}
