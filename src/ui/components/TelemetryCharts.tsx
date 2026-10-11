import React from 'react';
import { MetricDefinition, MetricPoint } from '../../core/contracts';

export interface TelemetryChartsProps {
  metricDefinitions: MetricDefinition[];
  history: MetricPoint[];
  accentColor?: string;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  metricDefinitions,
  history,
  accentColor = '#00e5ff',
}) => {
  const latest = history[history.length - 1]?.values ?? {};
  const previous =
    history.length > 1 ? history[history.length - 2].values : latest;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '10px',
      }}
    >
      {metricDefinitions.map((def) => {
        const currentVal = latest[def.id] ?? 0;
        const prevVal = previous[def.id] ?? currentVal;
        const delta = Math.round((currentVal - prevVal) * 100) / 100;

        const points = history.slice(-45).map((h) => h.values[def.id] ?? 0);
        const minV = points.length > 0 ? Math.min(...points) : 0;
        const maxV = points.length > 0 ? Math.max(...points) : 100;
        const span = Math.max(1e-3, maxV - minV);

        const polylinePoints = points
          .map((v, idx) => {
            const x =
              points.length <= 1
                ? 0
                : (idx / (points.length - 1)) * 180;
            const y = 38 - ((v - minV) / span) * 32;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');

        const isCritical =
          def.criticalThreshold !== undefined &&
          (def.higherIsBetter !== false
            ? currentVal <= def.criticalThreshold
            : currentVal >= def.criticalThreshold);

        const isWarning =
          !isCritical &&
          def.warningThreshold !== undefined &&
          (def.higherIsBetter !== false
            ? currentVal <= def.warningThreshold
            : currentVal >= def.warningThreshold);

        const strokeColor = isCritical
          ? '#ff3d57'
          : isWarning
            ? '#ffb300'
            : accentColor;

        return (
          <div
            key={def.id}
            style={{
              backgroundColor: '#0c111b',
              border: `1px solid ${
                isCritical ? '#ff3d57' : isWarning ? '#ffb300' : '#1e293b'
              }`,
              borderRadius: '6px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: '11px',
                color: '#94a3b8',
              }}
            >
              <span>{def.label}</span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                {def.category}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                margin: '6px 0',
              }}
            >
              <span
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: strokeColor,
                }}
              >
                {currentVal}{' '}
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>
                  {def.unit}
                </span>
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color:
                    delta > 0
                      ? '#00e676'
                      : delta < 0
                        ? '#ff3d57'
                        : '#64748b',
                }}
              >
                {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta}
              </span>
            </div>

            <svg
              viewBox="0 0 180 42"
              style={{
                width: '100%',
                height: '42px',
                overflow: 'visible',
              }}
              aria-label={`Time series chart for ${def.label}`}
            >
              <line
                x1="0"
                y1="39"
                x2="180"
                y2="39"
                stroke="#1e293b"
                strokeWidth="1"
              />
              {points.length > 1 && (
                <polyline
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="1.8"
                  points={polylinePoints}
                />
              )}
            </svg>
          </div>
        );
      })}
    </div>
  );
};
