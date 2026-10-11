import React, { useState } from 'react';
import { EntityInspection } from '../../core/contracts';

export interface AccessibleStateTableProps {
  entities: EntityInspection[];
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
}

export const AccessibleStateTable: React.FC<AccessibleStateTableProps> = ({
  entities,
  selectedEntityId,
  onSelectEntity,
}) => {
  const [filterKind, setFilterKind] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const kinds = Array.from(new Set(entities.map((e) => e.kind))).sort();
  const filtered = entities.filter((e) => {
    if (filterKind !== 'all' && e.kind !== filterKind) return false;
    if (search.trim().length > 0) {
      const q = search.toLowerCase();
      return (
        e.label.toLowerCase().includes(q) ||
        e.entityId.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div
      style={{
        backgroundColor: '#0b0f17',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        padding: '12px',
      }}
      role="region"
      aria-label="Accessible World State Entity Table"
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
          ACCESSIBLE ENTITY & SUBSYSTEM TELEMETRY TABLE ({filtered.length} / {entities.length})
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '11px', color: '#94a3b8' }}>
            Category:{' '}
            <select
              aria-label="Filter Entities by Category"
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              style={{
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '3px 6px',
                fontSize: '11px',
              }}
            >
              <option value="all">All ({entities.length})</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <input
            type="search"
            aria-label="Search Entities"
            placeholder="Filter by ID or state..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '11px',
            }}
          />
        </div>
      </div>

      <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
              <th style={{ padding: '6px' }}>ID</th>
              <th style={{ padding: '6px' }}>Entity / Zone</th>
              <th style={{ padding: '6px' }}>Kind</th>
              <th style={{ padding: '6px' }}>Status</th>
              <th style={{ padding: '6px' }}>Live Telemetry Summary</th>
              <th style={{ padding: '6px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 80).map((ent) => {
              const isSelected = selectedEntityId === ent.entityId;
              const statusColor =
                ent.status === 'critical'
                  ? '#ff3d57'
                  : ent.status === 'warning'
                    ? '#ffb300'
                    : ent.status === 'inactive'
                      ? '#64748b'
                      : '#00e676';

              return (
                <tr
                  key={ent.entityId}
                  onClick={() => onSelectEntity(ent.entityId)}
                  style={{
                    borderBottom: '1px solid #111827',
                    backgroundColor: isSelected ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <td style={{ padding: '6px', fontFamily: 'monospace', color: '#94a3b8' }}>
                    {ent.entityId}
                  </td>
                  <td style={{ padding: '6px', fontWeight: 600, color: '#f8fafc' }}>
                    {ent.label}
                  </td>
                  <td style={{ padding: '6px', color: '#cbd5e1' }}>{ent.kind}</td>
                  <td
                    style={{
                      padding: '6px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: statusColor,
                    }}
                  >
                    {ent.status.toUpperCase()}
                  </td>
                  <td style={{ padding: '6px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                    {ent.summary}
                  </td>
                  <td style={{ padding: '6px' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEntity(ent.entityId);
                      }}
                      aria-label={`Inspect ${ent.label}`}
                      style={{
                        backgroundColor: isSelected ? '#00e5ff' : '#1e293b',
                        color: isSelected ? '#000000' : '#f8fafc',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {isSelected ? 'Selected' : 'Inspect'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
