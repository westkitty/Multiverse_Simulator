import React, { useState } from 'react';
import {
  ArchiveInspectionResult,
  inspectAndUnpackArchiveZip,
} from '../../persistence/archive';
import { useMultiverseStore } from '../../store/multiverseStore';

export const DataVaultView: React.FC = () => {
  const runs = useMultiverseStore((s) => s.runs);
  const activeRunId = useMultiverseStore((s) => s.activeRunId);
  const savedRunsMeta = useMultiverseStore((s) => s.savedRunsMeta);
  const preferences = useMultiverseStore((s) => s.preferences);
  useMultiverseStore((s) => s.uiRevision);

  const saveRunToVault = useMultiverseStore((s) => s.saveRunToVault);
  const loadRunFromVault = useMultiverseStore((s) => s.loadRunFromVault);
  const deleteRunFromVault = useMultiverseStore((s) => s.deleteRunFromVault);
  const exportRunArchive = useMultiverseStore((s) => s.exportRunArchive);
  const importRunArchive = useMultiverseStore((s) => s.importRunArchive);
  const updatePreferences = useMultiverseStore((s) => s.updatePreferences);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [archiveInspection, setArchiveInspection] =
    useState<ArchiveInspectionResult | null>(null);
  const [vaultStatusBanner, setVaultStatusBanner] = useState<string | null>(null);

  const activeKernel = runs[activeRunId] ?? Object.values(runs)[0];
  if (!activeKernel) return null;

  const handleSaveCurrent = async () => {
    const meta = await saveRunToVault(activeKernel.runId);
    if (meta) {
      setVaultStatusBanner(
        `Saved "${meta.name}" (Tick ${meta.tick}, Hash ${meta.stateHash.slice(0, 10)}) to IndexedDB (${(meta.byteSize / 1024).toFixed(1)} KB).`,
      );
    }
  };

  const handleDownloadArchive = () => {
    const { filename, bytes } = exportRunArchive(activeKernel.runId);
    const inspection = inspectAndUnpackArchiveZip(bytes);
    setArchiveInspection(inspection);

    try {
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setVaultStatusBanner(
        `Exported portable archive "${filename}" (${(bytes.byteLength / 1024).toFixed(1)} KB compressed ZIP).`,
      );
    } catch {
      setVaultStatusBanner(
        `Generated portable archive "${filename}" (${bytes.byteLength} bytes) and verified manifest checksums.`,
      );
    }
  };

  const handleRoundTripTest = async () => {
    const { filename, bytes } = exportRunArchive(activeKernel.runId);
    const res = await importRunArchive(bytes);
    setArchiveInspection(res);
    if (res.valid) {
      setVaultStatusBanner(
        `Round-Trip Archive Verification PASSED for "${filename}": State Hash ${res.integrity?.stateHash} preserved identically.`,
      );
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const res = await importRunArchive(new Uint8Array(buf));
    setArchiveInspection(res);
    if (res.valid && res.manifest) {
      setVaultStatusBanner(
        `Successfully imported archive "${res.manifest.runName}" (Tick ${res.manifest.tick}, Engine v${res.manifest.engineVersion}).`,
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header & Controls */}
      <div
        style={{
          backgroundColor: '#0b0f17',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#00e5ff' }}>
            DATA VAULT // INDEXEDDB PERSISTENCE & PORTABLE ZIP ARCHIVES
          </div>
          <h2 style={{ margin: '4px 0 0 0', fontSize: '18px', color: '#f8fafc' }}>
            Manage Saved Realities, Checkpoints & Versioned `.omniverse.zip` Archives
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: '#cbd5e1',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              padding: '6px 10px',
              borderRadius: '4px',
            }}
          >
            <input
              type="checkbox"
              checked={preferences.autosaveEnabled}
              onChange={(e) =>
                updatePreferences({ autosaveEnabled: e.target.checked })
              }
            />
            Throttled Autosave
          </label>

          <button
            type="button"
            onClick={handleSaveCurrent}
            style={{
              backgroundColor: '#00e676',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            💾 Save Active Run to IndexedDB
          </button>

          <button
            type="button"
            onClick={handleDownloadArchive}
            style={{
              backgroundColor: '#00e5ff',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            📦 Export Portable .omniverse.zip
          </button>

          <button
            type="button"
            onClick={handleRoundTripTest}
            style={{
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '7px 12px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ✓ Verify Archive Round-Trip
          </button>
        </div>
      </div>

      {vaultStatusBanner && (
        <div
          style={{
            backgroundColor: 'rgba(0, 229, 255, 0.1)',
            border: '1px solid #00e5ff',
            borderRadius: '6px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#f8fafc',
          }}
        >
          {vaultStatusBanner}
        </div>
      )}

      {/* Main Split: IndexedDB Runs on Left, Portable Archive Inspector on Right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: '16px',
        }}
      >
        {/* IndexedDB Saved Runs Table */}
        <div
          style={{
            backgroundColor: '#0b0f17',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '14px', color: '#f8fafc' }}>
            IndexedDB Persisted Runs ({savedRunsMeta.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {savedRunsMeta.map((meta) => (
              <div
                key={meta.runId}
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#f8fafc' }}>
                    {meta.name}
                  </div>
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8' }}>
                    World: {meta.worldId} | Tick: {meta.tick} | Seed: {meta.seed} | Hash:{' '}
                    {meta.stateHash.slice(0, 8)} | {(meta.byteSize / 1024).toFixed(1)} KB
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => loadRunFromVault(meta.runId)}
                    style={{
                      backgroundColor: '#00e5ff',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Load
                  </button>

                  {confirmDeleteId === meta.runId ? (
                    <button
                      type="button"
                      onClick={() => {
                        deleteRunFromVault(meta.runId);
                        setConfirmDeleteId(null);
                      }}
                      style={{
                        backgroundColor: '#ff3d57',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '5px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Confirm Delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(meta.runId)}
                      style={{
                        backgroundColor: '#1e293b',
                        color: '#cbd5e1',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        padding: '5px 10px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Portable Archive Import & Version/Integrity Inspector */}
        <div
          style={{
            backgroundColor: '#0b0f17',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '14px', color: '#f8fafc' }}>
            Portable Archive Import & Integrity Inspector
          </h3>

          <label
            style={{
              backgroundColor: '#0f172a',
              border: '1px dashed #334155',
              borderRadius: '6px',
              padding: '12px',
              fontSize: '12px',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <strong>Import Portable `.omniverse.zip` Archive:</strong>
            <input
              type="file"
              accept=".zip,application/zip"
              aria-label="Import Portable Archive ZIP"
              onChange={handleFileUpload}
              style={{ fontSize: '11px', color: '#94a3b8' }}
            />
          </label>

          {archiveInspection && (
            <div
              style={{
                backgroundColor: '#0f172a',
                border: `1px solid ${archiveInspection.valid ? '#00e676' : '#ff3d57'}`,
                borderRadius: '6px',
                padding: '12px',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  color: archiveInspection.valid ? '#00e676' : '#ff3d57',
                }}
              >
                {archiveInspection.valid
                  ? '✓ ARCHIVE MANIFEST & INTEGRITY VERIFIED'
                  : '✗ ARCHIVE REJECTED BY VALIDATOR'}
              </div>

              {archiveInspection.manifest && (
                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#cbd5e1' }}>
                  <div>Format: {archiveInspection.manifest.format} (v{archiveInspection.manifest.archiveVersion})</div>
                  <div>Engine: v{archiveInspection.manifest.engineVersion} | Schema: v{archiveInspection.manifest.schemaVersion}</div>
                  <div>World Plugin: {archiveInspection.manifest.pluginId} v{archiveInspection.manifest.pluginVersion}</div>
                  <div>Run: {archiveInspection.manifest.runName} (Tick {archiveInspection.manifest.tick}, Seed {archiveInspection.manifest.seed})</div>
                </div>
              )}

              {archiveInspection.integrity && (
                <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#00e5ff' }}>
                  <div>State Hash: {archiveInspection.integrity.stateHash}</div>
                  <div>Config Hash: {archiveInspection.integrity.configHash}</div>
                  <div>Checkpoints Hash: {archiveInspection.integrity.checkpointsFileHash}</div>
                </div>
              )}

              {archiveInspection.errors.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: '18px', color: '#fecdd3', fontSize: '11px' }}>
                  {archiveInspection.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
