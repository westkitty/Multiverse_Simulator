import React, { useMemo, useState } from 'react';
import type { CrossWorldAdapter } from '../../core/crossWorldContract';
import type { WorldId, WorldPlugin } from '../../core/contracts';
import './reality-lattice.css';

interface RealityLatticeProps {
  worlds: readonly WorldPlugin[];
  adapters: readonly CrossWorldAdapter[];
  selectedWorldId: WorldId;
  onSelectWorld: (worldId: WorldId) => void;
  onOpenEventWorkbench: () => void;
}

interface NodePosition {
  x: number;
  y: number;
  domain: 'biosphere' | 'planetary' | 'civilization' | 'orbital';
}

// Positions are a filing layout, not physical coordinates. Every visible edge below
// is built from a registered, directed adapter in the production contract registry.
const NODE_POSITIONS: Record<WorldId, NodePosition> = {
  ecosystem: { x: 135, y: 108, domain: 'biosphere' },
  'wild-meridian': { x: 135, y: 210, domain: 'biosphere' },
  ocean: { x: 278, y: 160, domain: 'biosphere' },
  atmosphere: { x: 412, y: 278, domain: 'planetary' },
  geology: { x: 556, y: 278, domain: 'planetary' },
  'hollow-deep': { x: 412, y: 386, domain: 'planetary' },
  'terraforming-frontier': { x: 556, y: 386, domain: 'planetary' },
  station: { x: 702, y: 78, domain: 'orbital' },
  celestial: { x: 850, y: 78, domain: 'orbital' },
  'signal-expanse': { x: 1000, y: 158, domain: 'orbital' },
  civilization: { x: 702, y: 278, domain: 'civilization' },
  megacity: { x: 850, y: 278, domain: 'civilization' },
  industrial: { x: 702, y: 386, domain: 'civilization' },
  'timeworn-empire': { x: 850, y: 386, domain: 'civilization' },
  'machine-wilderness': { x: 850, y: 170, domain: 'civilization' },
};

const DOMAIN_LABELS: Record<NodePosition['domain'], string> = {
  biosphere: 'BIOSPHERE',
  planetary: 'PLANETARY',
  civilization: 'CIVILIZATION',
  orbital: 'ORBITAL',
};

const VIEWBOX_WIDTH = 1080;
const VIEWBOX_HEIGHT = 450;

function adapterPath(
  source: NodePosition,
  target: NodePosition,
  lane: number,
): string {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const offset = lane * 13;
  const controlX = (source.x + target.x) / 2 - (dy / distance) * offset;
  const controlY = (source.y + target.y) / 2 + (dx / distance) * offset;
  return `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`;
}

export const RealityLattice: React.FC<RealityLatticeProps> = ({
  worlds,
  adapters,
  selectedWorldId,
  onSelectWorld,
  onOpenEventWorkbench,
}) => {
  const [selectedAdapterId, setSelectedAdapterId] = useState<string | null>(null);
  const worldById = useMemo(() => new Map(worlds.map(world => [world.id, world])), [worlds]);
  const selectedWorld = worldById.get(selectedWorldId) ?? worlds[0];
  const linkedAdapters = adapters.filter(adapter =>
    adapter.sourceWorldId === selectedWorld.id || adapter.targetWorldId === selectedWorld.id,
  );
  const selectedAdapter = linkedAdapters.find(adapter => adapter.id === selectedAdapterId) ?? linkedAdapters[0];

  const pairLaneCounts = new Map<string, number>();
  const edges = adapters.flatMap(adapter => {
    const source = NODE_POSITIONS[adapter.sourceWorldId];
    const target = NODE_POSITIONS[adapter.targetWorldId];
    if (!source || !target || !worldById.has(adapter.sourceWorldId) || !worldById.has(adapter.targetWorldId)) return [];
    const pair = `${adapter.sourceWorldId}->${adapter.targetWorldId}`;
    const lane = pairLaneCounts.get(pair) ?? 0;
    pairLaneCounts.set(pair, lane + 1);
    return [{ adapter, source, target, lane }];
  });

  const worldIndex = new Map(worlds.map((world, index) => [world.id, String(index + 1).padStart(2, '0')]));

  return (
    <section className="reality-lattice" aria-labelledby="reality-lattice-title">
      <div className="reality-lattice__heading">
        <div>
          <p className="reality-lattice__eyebrow">SYSTEM TOPOLOGY / READ-ONLY CONTRACT INDEX</p>
          <h2 id="reality-lattice-title">The realities are not isolated.</h2>
          <p className="reality-lattice__intro">
            {worlds.length} modeled worlds. {adapters.length} explicit event translators. A line is a one-way contract—not a physical bridge, shared clock, or promise of causation.
          </p>
        </div>
        <div className="reality-lattice__count" aria-label={`${edges.length} registered directed transfer paths shown`}>
          <strong>{edges.length.toString().padStart(2, '0')}</strong>
          <span>DIRECTED<br />PATHS</span>
        </div>
      </div>

      <div className="reality-lattice__map-scroll" tabIndex={0} aria-label="Scrollable map of simulation worlds">
        <div className="reality-lattice__map-frame">
          <svg
            className="reality-lattice__wires"
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            role="img"
            aria-label={`Contract map: ${worlds.length} worlds connected by ${edges.length} registered event adapters`}
          >
            <title>Registered cross-world event translation paths</title>
            <desc>World positions are categorical. Arrows show the exact source and target direction of each registered adapter; they do not represent spatial proximity.</desc>
            <defs>
              <marker id="reality-lattice-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
              </marker>
            </defs>
            <g className="reality-lattice__domains" aria-hidden="true">
              <ellipse cx="205" cy="159" rx="174" ry="116" data-domain="biosphere" />
              <ellipse cx="486" cy="325" rx="167" ry="150" data-domain="planetary" />
              <ellipse cx="782" cy="320" rx="166" ry="158" data-domain="civilization" />
              <ellipse cx="850" cy="122" rx="212" ry="78" data-domain="orbital" />
              <text x="48" y="34">BIOSPHERE</text>
              <text x="338" y="218">PLANETARY</text>
              <text x="646" y="30">ORBITAL</text>
              <text x="646" y="226">CIVILIZATION</text>
            </g>
            <g className="reality-lattice__edges" aria-hidden="true">
              {edges.map(({ adapter, source, target, lane }) => {
                const touchesSelection = adapter.sourceWorldId === selectedWorldId || adapter.targetWorldId === selectedWorldId;
                const isFocused = selectedAdapter?.id === adapter.id;
                return (
                  <path
                    key={adapter.id}
                    d={adapterPath(source, target, lane)}
                    className={isFocused ? 'is-focused' : touchesSelection ? 'is-related' : ''}
                    markerEnd="url(#reality-lattice-arrow)"
                    data-adapter={adapter.id}
                  />
                );
              })}
            </g>
          </svg>

          <div className="reality-lattice__nodes">
            {worlds.map(world => {
              const position = NODE_POSITIONS[world.id];
              const isSelected = world.id === selectedWorldId;
              return (
                <button
                  key={world.id}
                  type="button"
                  className="reality-lattice__node"
                  aria-label={`Select ${world.name} world`}
                  aria-pressed={isSelected}
                  data-domain={position.domain}
                  style={{
                    left: `${(position.x / VIEWBOX_WIDTH) * 100}%`,
                    top: `${(position.y / VIEWBOX_HEIGHT) * 100}%`,
                    '--node-accent': world.accentColor,
                  } as React.CSSProperties}
                  onClick={() => onSelectWorld(world.id)}
                >
                  <span className="reality-lattice__index">{worldIndex.get(world.id)}</span>
                  <span className="reality-lattice__node-copy">
                    <strong>{world.name}</strong>
                    <small>{DOMAIN_LABELS[position.domain]} / {world.id.toUpperCase()}</small>
                  </span>
                  <span className="reality-lattice__node-mark" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="reality-lattice__details" aria-live="polite">
        <div className="reality-lattice__selected-world">
          <span className="reality-lattice__section-label">SELECTED REALITY</span>
          <strong>{selectedWorld.name}</strong>
          <span>{linkedAdapters.length} registered translation {linkedAdapters.length === 1 ? 'path' : 'paths'}</span>
        </div>

        {selectedAdapter ? (
          <div className="reality-lattice__contract">
            <div className="reality-lattice__contract-list" role="group" aria-label="Contracts touching the selected world">
              {linkedAdapters.map(adapter => (
                <button
                  key={adapter.id}
                  type="button"
                  aria-pressed={selectedAdapter.id === adapter.id}
                  onClick={() => setSelectedAdapterId(adapter.id)}
                >
                  <span>{worldById.get(adapter.sourceWorldId)?.name ?? adapter.sourceWorldId}</span>
                  <span aria-hidden="true">→</span>
                  <span>{worldById.get(adapter.targetWorldId)?.name ?? adapter.targetWorldId}</span>
                </button>
              ))}
            </div>
            <article className="reality-lattice__contract-record" aria-label="Selected transfer contract">
              <p className="reality-lattice__section-label">
                CONTRACT / {selectedAdapter.id} · v{selectedAdapter.version} · SCHEMA {selectedAdapter.schemaVersion}
              </p>
              <h3>{selectedAdapter.name}</h3>
              <p>{selectedAdapter.description}</p>
              <div className="reality-lattice__translation">
                <span>ACCEPTS</span>
                <code>{selectedAdapter.sourceEventTypes.join(' · ')}</code>
              </div>
              <div className="reality-lattice__translation">
                <span>APPLIES</span>
                <code>{selectedAdapter.targetCommandType}</code>
              </div>
              {selectedAdapter.requiredUnits.map(unit => (
                <div className="reality-lattice__translation" key={`${unit.sourceField}:${unit.targetField}`}>
                  <span>UNIT MAP</span>
                  <code>{unit.sourceField} [{unit.sourceUnit}] → {unit.targetField} [{unit.targetUnit}] · {unit.formulaDescription}</code>
                </div>
              ))}
              {selectedAdapter.transformationRules.map(rule => (
                <div className="reality-lattice__translation" key={rule}>
                  <span>RULE</span>
                  <code>{rule}</code>
                </div>
              ))}
              <details>
                <summary>Inspect information discarded by this translation</summary>
                {selectedAdapter.informationLoss.length > 0 ? (
                  <ul>{selectedAdapter.informationLoss.map(item => <li key={item}>{item}</li>)}</ul>
                ) : <p>The registered contract declares no information-loss notes.</p>}
              </details>
            </article>
          </div>
        ) : (
          <div className="reality-lattice__empty-contract">
            <span className="reality-lattice__section-label">NO DIRECT CONTRACT</span>
            <p>No registered translator touches this world. Shared themes do not imply shared rules.</p>
          </div>
        )}
      </div>

      <div className="reality-lattice__footer">
        <p>Nothing crosses between runs here. Transfers require a recorded source event, a compatible contract, and an explicit application.</p>
        <button type="button" onClick={onOpenEventWorkbench}>Open Event Observatory <span aria-hidden="true">↗</span></button>
      </div>
    </section>
  );
};
