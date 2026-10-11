import { ExperimentResultRecord } from '../core/experimentRunner';
import { SerializedRunRecord } from '../core/kernel';

const DB_NAME = 'OmniverseMultiverseDB';
const DB_VERSION = 1;
const STORE_RUNS = 'runs';
const STORE_EXPERIMENTS = 'experiments';
const STORE_PREFERENCES = 'preferences';

export interface SavedRunMeta {
  runId: string;
  name: string;
  worldId: string;
  seed: number;
  tick: number;
  stateHash: string;
  savedAtIso: string;
  byteSize: number;
  parentRunId: string | null;
}

export interface StoredRunEnvelope {
  meta: SavedRunMeta;
  record: SerializedRunRecord;
}

export interface UIPreferencesRecord {
  id: 'user_prefs';
  reducedMotion: boolean;
  highContrast: boolean;
  simplified3D: boolean;
  accessibleTableView: boolean;
  autosaveEnabled: boolean;
  simulationSpeed: number;
}

export const DEFAULT_UI_PREFERENCES: UIPreferencesRecord = {
  id: 'user_prefs',
  reducedMotion: false,
  highContrast: false,
  simplified3D: false,
  accessibleTableView: false,
  autosaveEnabled: true,
  simulationSpeed: 1,
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RUNS)) {
        db.createObjectStore(STORE_RUNS, { keyPath: 'meta.runId' });
      }
      if (!db.objectStoreNames.contains(STORE_EXPERIMENTS)) {
        db.createObjectStore(STORE_EXPERIMENTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PREFERENCES)) {
        db.createObjectStore(STORE_PREFERENCES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to open IndexedDB database'));
  });
}

let simulatedQuotaExceeded = false;

export function setSimulatedQuotaExceeded(enabled: boolean): void {
  simulatedQuotaExceeded = enabled;
}

export async function saveRunToDb(record: SerializedRunRecord): Promise<SavedRunMeta> {
  if (simulatedQuotaExceeded) {
    const quotaErr = new Error(
      'QuotaExceededError: Storage quota exhausted while writing simulation run.',
    );
    quotaErr.name = 'QuotaExceededError';
    throw quotaErr;
  }

  const rawJson = JSON.stringify(record);
  const meta: SavedRunMeta = {
    runId: record.runId,
    name: record.name,
    worldId: record.worldId,
    seed: record.seed,
    tick: record.tick,
    stateHash: record.stateHash,
    savedAtIso: new Date().toISOString(),
    byteSize: rawJson.length,
    parentRunId: record.lineage?.parentRunId ?? null,
  };

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RUNS, 'readwrite');
    const store = tx.objectStore(STORE_RUNS);
    const envelope: StoredRunEnvelope = { meta, record };
    const req = store.put(envelope);
    req.onsuccess = () => resolve(meta);
    req.onerror = () =>
      reject(req.error ?? new Error(`Failed to persist run "${record.runId}"`));
    tx.oncomplete = () => db.close();
  });
}

export async function loadRunFromDb(runId: string): Promise<SerializedRunRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RUNS, 'readonly');
    const store = tx.objectStore(STORE_RUNS);
    const req = store.get(runId);
    req.onsuccess = () => {
      const result = req.result as StoredRunEnvelope | undefined;
      if (!result || !result.record) {
        resolve(null);
        return;
      }
      if (
        typeof result.record.runId !== 'string' ||
        typeof result.record.worldId !== 'string' ||
        typeof result.record.worldState !== 'object' ||
        result.record.worldState === null
      ) {
        reject(new Error(`Corrupt save detected in IndexedDB for run "${runId}"`));
        return;
      }
      resolve(result.record);
    };
    req.onerror = () =>
      reject(req.error ?? new Error(`Failed to load run "${runId}"`));
    tx.oncomplete = () => db.close();
  });
}

export async function listSavedRunsFromDb(): Promise<SavedRunMeta[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RUNS, 'readonly');
    const store = tx.objectStore(STORE_RUNS);
    const req = store.getAll();
    req.onsuccess = () => {
      const envelopes = (req.result as StoredRunEnvelope[]) || [];
      const metas = envelopes
        .filter((e) => e && e.meta && typeof e.meta.runId === 'string')
        .map((e) => e.meta)
        .sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
      resolve(metas);
    };
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to list saved runs from IndexedDB'));
    tx.oncomplete = () => db.close();
  });
}

export async function deleteRunFromDb(runId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RUNS, 'readwrite');
    const store = tx.objectStore(STORE_RUNS);
    const req = store.delete(runId);
    req.onsuccess = () => resolve();
    req.onerror = () =>
      reject(req.error ?? new Error(`Failed to delete run "${runId}"`));
    tx.oncomplete = () => db.close();
  });
}

export async function saveExperimentToDb(exp: ExperimentResultRecord): Promise<void> {
  if (simulatedQuotaExceeded) {
    throw new Error('QuotaExceededError: Cannot save experiment while storage quota is full.');
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EXPERIMENTS, 'readwrite');
    const store = tx.objectStore(STORE_EXPERIMENTS);
    const req = store.put(exp);
    req.onsuccess = () => resolve();
    req.onerror = () =>
      reject(req.error ?? new Error(`Failed to save experiment "${exp.id}"`));
    tx.oncomplete = () => db.close();
  });
}

export async function listExperimentsFromDb(): Promise<ExperimentResultRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EXPERIMENTS, 'readonly');
    const store = tx.objectStore(STORE_EXPERIMENTS);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = ((req.result as ExperimentResultRecord[]) || []).sort((a, b) =>
        b.executedAtIso.localeCompare(a.executedAtIso),
      );
      resolve(list);
    };
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to list saved experiments'));
    tx.oncomplete = () => db.close();
  });
}

export async function savePreferencesToDb(
  prefs: Partial<UIPreferencesRecord>,
): Promise<UIPreferencesRecord> {
  const current = await loadPreferencesFromDb();
  const merged: UIPreferencesRecord = {
    ...current,
    ...prefs,
    id: 'user_prefs',
  };
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PREFERENCES, 'readwrite');
    const store = tx.objectStore(STORE_PREFERENCES);
    const req = store.put(merged);
    req.onsuccess = () => resolve(merged);
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to save UI preferences'));
    tx.oncomplete = () => db.close();
  });
}

export async function loadPreferencesFromDb(): Promise<UIPreferencesRecord> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_PREFERENCES, 'readonly');
      const store = tx.objectStore(STORE_PREFERENCES);
      const req = store.get('user_prefs');
      req.onsuccess = () => {
        if (req.result) {
          resolve({ ...DEFAULT_UI_PREFERENCES, ...(req.result as UIPreferencesRecord) });
        } else {
          resolve({ ...DEFAULT_UI_PREFERENCES });
        }
      };
      req.onerror = () => resolve({ ...DEFAULT_UI_PREFERENCES });
      tx.oncomplete = () => db.close();
    });
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

/**
 * Throttled autosave coordinator that prevents excessive IndexedDB writes
 * during rapid simulation stepping or fast-forwarding.
 */
export class ThrottledAutosaveManager {
  private minIntervalMs: number;
  private lastSavedAtWallMs = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(minIntervalMs = 4500) {
    this.minIntervalMs = minIntervalMs;
  }

  scheduleAutosave(
    getRecord: () => SerializedRunRecord,
    onSaved?: (meta: SavedRunMeta) => void,
    onError?: (err: Error) => void,
  ): void {
    const now = Date.now();
    const elapsed = now - this.lastSavedAtWallMs;

    if (elapsed >= this.minIntervalMs) {
      this.cancelPending();
      this.lastSavedAtWallMs = now;
      try {
        const record = getRecord();
        saveRunToDb(record)
          .then((meta) => onSaved?.(meta))
          .catch((err) => onError?.(err instanceof Error ? err : new Error(String(err))));
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
      return;
    }

    if (!this.pendingTimer) {
      const delay = Math.max(250, this.minIntervalMs - elapsed);
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        this.lastSavedAtWallMs = Date.now();
        try {
          const record = getRecord();
          saveRunToDb(record)
            .then((meta) => onSaved?.(meta))
            .catch((err) => onError?.(err instanceof Error ? err : new Error(String(err))));
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }, delay);
    }
  }

  cancelPending(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }
}
