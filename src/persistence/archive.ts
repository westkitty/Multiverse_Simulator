import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import {
  computeStateHash,
  ENGINE_VERSION,
  fnv1a64,
  SCHEMA_VERSION,
  stableStringify,
} from '../core/contracts';
import { SerializedRunRecord } from '../core/kernel';

export const ARCHIVE_FORMAT_ID = 'OMNIVERSE_PORTABLE_ARCHIVE';
export const MAX_ARCHIVE_COMPRESSED_BYTES = 16 * 1024 * 1024; // 16 MB
export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 32 * 1024 * 1024; // 32 MB

export interface ArchiveManifest {
  format: typeof ARCHIVE_FORMAT_ID;
  archiveVersion: number;
  engineVersion: string;
  schemaVersion: number;
  pluginId: string;
  pluginVersion: string;
  exportedAtIso: string;
  runId: string;
  runName: string;
  seed: number;
  tick: number;
}

export interface ArchiveIntegrity {
  stateHash: string;
  configHash: string;
  stateFileHash: string;
  checkpointsFileHash: string;
  eventsFileHash: string;
}

export interface ArchiveInspectionResult {
  valid: boolean;
  migratedFromSchema?: number;
  manifest?: ArchiveManifest;
  integrity?: ArchiveIntegrity;
  record?: SerializedRunRecord;
  errors: string[];
  warnings: string[];
}

const manifestSchema = z.object({
  format: z.literal(ARCHIVE_FORMAT_ID),
  archiveVersion: z.number().int().min(0),
  engineVersion: z.string().min(1),
  schemaVersion: z.number().int().min(0),
  pluginId: z.string().min(1),
  pluginVersion: z.string().min(1),
  exportedAtIso: z.string().min(1),
  runId: z.string().min(1),
  runName: z.string().min(1),
  seed: z.number(),
  tick: z.number().int().min(0),
});

const integritySchema = z.object({
  stateHash: z.string().min(8),
  configHash: z.string().min(8),
  stateFileHash: z.string().min(8),
  checkpointsFileHash: z.string().min(8),
  eventsFileHash: z.string().min(8),
});

/**
 * Packages a SerializedRunRecord into a portable, versioned `.omniverse.zip` byte array.
 */
export function createPortableArchiveZip(record: SerializedRunRecord): Uint8Array {
  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT_ID,
    archiveVersion: 1,
    engineVersion: record.engineVersion || ENGINE_VERSION,
    schemaVersion: record.schemaVersion ?? SCHEMA_VERSION,
    pluginId: record.worldId,
    pluginVersion: record.pluginVersion || '1.0.0',
    exportedAtIso: new Date().toISOString(),
    runId: record.runId,
    runName: record.name,
    seed: record.seed,
    tick: record.tick,
  };

  const configData = {
    initialConfig: record.initialConfig,
    currentConfig: record.currentConfig,
    budget: record.budget,
  };

  const stateData = {
    rngState: record.rngState,
    worldState: record.worldState,
    lineage: record.lineage,
    commandSequence: record.commandSequence,
  };

  const checkpointsData = {
    checkpoints: record.checkpoints,
    metricHistory: record.metricHistory,
  };

  const eventsData = {
    pendingCommands: record.pendingCommands,
    executedCommands: record.executedCommands,
    eventJournal: record.eventJournal,
  };

  const configStr = stableStringify(configData);
  const stateStr = stableStringify(stateData);
  const checkpointsStr = stableStringify(checkpointsData);
  const eventsStr = stableStringify(eventsData);

  const computedStateHash = computeStateHash(
    record.worldId,
    record.tick,
    record.worldState,
    record.rngState,
  );

  const integrity: ArchiveIntegrity = {
    stateHash: computedStateHash,
    configHash: fnv1a64(configStr),
    stateFileHash: fnv1a64(stateStr),
    checkpointsFileHash: fnv1a64(checkpointsStr),
    eventsFileHash: fnv1a64(eventsStr),
  };

  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'config.json': strToU8(configStr),
    'state.json': strToU8(stateStr),
    'checkpoints.json': strToU8(checkpointsStr),
    'events.json': strToU8(eventsStr),
    'integrity.json': strToU8(JSON.stringify(integrity, null, 2)),
  };

  return zipSync(files, { level: 6 });
}

/**
 * Inspects, validates, and unpacks a portable `.omniverse.zip` archive.
 * Rejects malformed, corrupt, oversized, or future-incompatible archives safely.
 */
export function inspectAndUnpackArchiveZip(
  zipBytes: Uint8Array,
): ArchiveInspectionResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!zipBytes || !(zipBytes instanceof Uint8Array) || zipBytes.byteLength === 0) {
    return {
      valid: false,
      errors: ['Archive file is empty or not a valid binary buffer.'],
      warnings,
    };
  }

  if (zipBytes.byteLength > MAX_ARCHIVE_COMPRESSED_BYTES) {
    return {
      valid: false,
      errors: [
        `Archive size (${zipBytes.byteLength} bytes) exceeds maximum allowed compressed size (${MAX_ARCHIVE_COMPRESSED_BYTES} bytes).`,
      ],
      warnings,
    };
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(zipBytes);
  } catch (err) {
    return {
      valid: false,
      errors: [
        `Malformed ZIP container: ${err instanceof Error ? err.message : String(err)}`,
      ],
      warnings,
    };
  }

  // Enforce total decompressed size limit and reject executable/script filenames
  let totalUncompressed = 0;
  for (const [name, buf] of Object.entries(unzipped)) {
    totalUncompressed += buf.byteLength;
    if (totalUncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      return {
        valid: false,
        errors: [
          `Decompressed archive size exceeds safety limit of ${MAX_ARCHIVE_UNCOMPRESSED_BYTES} bytes.`,
        ],
        warnings,
      };
    }
    if (/\.(js|mjs|cjs|ts|html|wasm|sh|bat|exe)$/i.test(name)) {
      return {
        valid: false,
        errors: [
          `Security rejection: archive contains prohibited executable/script entry "${name}".`,
        ],
        warnings,
      };
    }
  }

  const requiredFiles = [
    'manifest.json',
    'config.json',
    'state.json',
    'checkpoints.json',
    'events.json',
    'integrity.json',
  ];
  for (const reqFile of requiredFiles) {
    if (!unzipped[reqFile]) {
      errors.push(`Missing required archive entry "${reqFile}".`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  try {
    const manifestRaw = JSON.parse(strFromU8(unzipped['manifest.json']));
    const manifestParsed = manifestSchema.safeParse(manifestRaw);
    if (!manifestParsed.success) {
      return {
        valid: false,
        errors: manifestParsed.error.issues.map(
          (i) => `manifest.${i.path.join('.')}: ${i.message}`,
        ),
        warnings,
      };
    }
    const manifest = manifestParsed.data;

    if (manifest.schemaVersion > SCHEMA_VERSION) {
      return {
        valid: false,
        manifest,
        errors: [
          `Incompatible newer schema version: Archive requires schema v${manifest.schemaVersion}, but this engine supports up to schema v${SCHEMA_VERSION}.`,
        ],
        warnings,
      };
    }

    const integrityRaw = JSON.parse(strFromU8(unzipped['integrity.json']));
    const integrityParsed = integritySchema.safeParse(integrityRaw);
    if (!integrityParsed.success) {
      return {
        valid: false,
        manifest,
        errors: ['Archive integrity.json is malformed or missing checksums.'],
        warnings,
      };
    }
    const integrity = integrityParsed.data;

    const configStr = strFromU8(unzipped['config.json']);
    const stateStr = strFromU8(unzipped['state.json']);
    const checkpointsStr = strFromU8(unzipped['checkpoints.json']);
    const eventsStr = strFromU8(unzipped['events.json']);

    if (fnv1a64(configStr) !== integrity.configHash) {
      errors.push('Integrity failure: config.json checksum mismatch (corrupted or tampered).');
    }
    if (fnv1a64(stateStr) !== integrity.stateFileHash) {
      errors.push('Integrity failure: state.json checksum mismatch (corrupted or tampered).');
    }
    if (fnv1a64(checkpointsStr) !== integrity.checkpointsFileHash) {
      errors.push('Integrity failure: checkpoints.json checksum mismatch.');
    }
    if (fnv1a64(eventsStr) !== integrity.eventsFileHash) {
      errors.push('Integrity failure: events.json checksum mismatch.');
    }
    if (errors.length > 0) {
      return { valid: false, manifest, integrity, errors, warnings };
    }

    const configObj = JSON.parse(configStr);
    const stateObj = JSON.parse(stateStr);
    const checkpointsObj = JSON.parse(checkpointsStr);
    const eventsObj = JSON.parse(eventsStr);

    let migratedFromSchema: number | undefined;
    if (manifest.schemaVersion === 0) {
      migratedFromSchema = 0;
      warnings.push(
        'Migrated legacy schema v0 archive to current schema v1 automatically.',
      );
    }

    const recomputedStateHash = computeStateHash(
      manifest.pluginId,
      manifest.tick,
      stateObj.worldState,
      stateObj.rngState,
    );
    if (recomputedStateHash !== integrity.stateHash) {
      return {
        valid: false,
        manifest,
        integrity,
        errors: [
          `Authoritative state hash mismatch: expected ${integrity.stateHash}, computed ${recomputedStateHash}.`,
        ],
        warnings,
      };
    }

    const record: SerializedRunRecord = {
      engineVersion: manifest.engineVersion,
      schemaVersion: SCHEMA_VERSION,
      runId: manifest.runId,
      name: manifest.runName,
      worldId: manifest.pluginId,
      pluginVersion: manifest.pluginVersion,
      seed: manifest.seed,
      tick: manifest.tick,
      stateHash: recomputedStateHash,
      lineage: stateObj.lineage ?? {
        runId: manifest.runId,
        name: manifest.runName,
        worldId: manifest.pluginId,
        parentRunId: null,
        forkedAtTick: 0,
        forkCheckpointId: null,
        seed: manifest.seed,
        createdAtLabel: 'Imported Archive',
      },
      initialConfig: configObj.initialConfig ?? {},
      currentConfig: configObj.currentConfig ?? {},
      rngState: stateObj.rngState,
      worldState: stateObj.worldState,
      commandSequence: stateObj.commandSequence ?? 1,
      pendingCommands: eventsObj.pendingCommands ?? [],
      executedCommands: eventsObj.executedCommands ?? [],
      metricHistory: checkpointsObj.metricHistory ?? [],
      checkpoints: checkpointsObj.checkpoints ?? [],
      eventJournal: eventsObj.eventJournal ?? { sequenceCounter: 1, events: [] },
      budget: configObj.budget,
    };

    return {
      valid: true,
      migratedFromSchema,
      manifest,
      integrity,
      record,
      errors: [],
      warnings,
    };
  } catch (err) {
    return {
      valid: false,
      errors: [
        `Failed to parse archive JSON payload: ${err instanceof Error ? err.message : String(err)}`,
      ],
      warnings,
    };
  }
}
