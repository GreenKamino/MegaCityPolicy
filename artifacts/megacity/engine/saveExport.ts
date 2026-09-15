// Save slot export / import — JSON format, no cloud dependency.
//
// Players can back up and share runs as plain .json files. The export wraps
// the current GameState in an envelope with a schema version and metadata so
// future changes can migrate older exports cleanly.
//
// On import we run the same `migrateState` pipeline used by `loadSlot`, so an
// older export from a previous game version still hydrates correctly.
//
// Tamper detection (schema v2): each exported state carries a stateChecksum
// computed over its compact JSON serialization. On import, a missing or
// mismatched checksum does NOT reject the file — the state loads normally but
// is silently marked integrityCompromised, which permanently stops the run
// from earning achievements (same contract as unwrapSave in saveLoad.ts).
// Missing counts as tampered on purpose: otherwise deleting the checksum
// field would be a trivial bypass. Legacy v1 exports (made before checksums
// existed) therefore import as flagged too — an accepted tradeoff.
//
// Two envelopes live in this file:
//   - SaveExportEnvelope: a single slot.
//   - FullBackupEnvelope: every populated slot bundled with the player's
//     in-app settings, for one-click "back up everything" workflows.

import type { GameState } from "@/engine/types";
import { APP_VERSION, BUILD_NUMBER } from "@/constants/version";
import { compactStateForSave } from "@/engine/independentEnterprises";
import { computeChecksum } from "@/engine/saveLoad";

export const EXPORT_SCHEMA_VERSION = 2;
export const FULL_BACKUP_SCHEMA_VERSION = 2;
// Upper bound for slot ids accepted in a full-backup envelope. Must stay in
// sync with `MAX_SLOTS` in `context/GameContext.tsx`. Kept as a separate
// constant here so this file does not have to import the React context layer.
export const FULL_BACKUP_MAX_SLOT = 6;

export type SaveExportEnvelope = {
  format: "megacity-save-export";
  schemaVersion: number;
  appVersion: string;
  buildNumber: number;
  exportedAt: number;     // epoch ms
  sourceSlot: number;
  cityName: string;
  playerName: string;
  playerLevel: number;
  totalTicks: number;
  state: GameState;
  // Checksum over JSON.stringify(state) at export time (schema v2+).
  stateChecksum?: string;
};

// Verify an imported state object against its export-time checksum. The
// checksum was computed over the compact JSON serialization of the state;
// JSON.parse preserves key order, so re-stringifying the parsed object
// reproduces the exact bytes for an unedited file regardless of any
// whitespace changes to the file itself. Missing or mismatched checksum
// silently injects the permanent integrityCompromised mark (see saveLoad.ts).
function markStateUnlessVerified(state: GameState, checksum: unknown): void {
  const verified =
    typeof checksum === "string" &&
    computeChecksum(JSON.stringify(state)) === checksum;
  if (!verified) {
    (state as GameState & { integrityCompromised?: boolean }).integrityCompromised = true;
  }
}

export function serializeSaveExport(state: GameState, sourceSlot: number): string {
  const compact = compactStateForSave(state);
  const envelope: SaveExportEnvelope = {
    format: "megacity-save-export",
    schemaVersion: EXPORT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    buildNumber: BUILD_NUMBER,
    exportedAt: Date.now(),
    sourceSlot,
    cityName: state.cityName ?? "MEGACITY",
    playerName: state.player?.name ?? "Commander",
    playerLevel: state.player?.level ?? 1,
    totalTicks: state.totalTicks ?? 0,
    state: compact,
    stateChecksum: computeChecksum(JSON.stringify(compact)),
  };
  return JSON.stringify(envelope, null, 2);
}

export type ParseResult =
  | { ok: true; envelope: SaveExportEnvelope }
  | { ok: false; error: string };

export function parseSaveImport(input: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Import must be a JSON object." };
  }
  const env = parsed as Partial<SaveExportEnvelope>;
  if (env.format !== "megacity-save-export") {
    return { ok: false, error: "Not a MEGACITY save export file." };
  }
  if (typeof env.schemaVersion !== "number" || env.schemaVersion < 1) {
    return { ok: false, error: "Unsupported export schema version." };
  }
  if (env.schemaVersion > EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Export was made with a newer game version (schema ${env.schemaVersion}). Update the game first.`,
    };
  }
  if (!env.state || typeof env.state !== "object") {
    return { ok: false, error: "Export is missing state payload." };
  }
  const s = env.state as Partial<GameState>;
  // A few minimum-viability checks so we fail clearly instead of crashing later.
  if (!s.player || !s.cityStats || !s.resources || !s.buildings || !s.units) {
    return { ok: false, error: "Export state is missing required sections." };
  }
  markStateUnlessVerified(env.state as GameState, env.stateChecksum);
  return { ok: true, envelope: env as SaveExportEnvelope };
}

export function suggestedFileName(env: SaveExportEnvelope): string {
  const safeCity = (env.cityName || "MEGACITY")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 32);
  const date = new Date(env.exportedAt);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `megacity_${safeCity}_slot${env.sourceSlot}_${y}${m}${d}.json`;
}

// ── Full backup (all slots + settings) ────────────────────────────────────

export type FullBackupSlotEntry = {
  slot: number;
  cityName: string;
  playerName: string;
  playerLevel: number;
  totalTicks: number;
  state: GameState;
  // Checksum over JSON.stringify(state) at export time (schema v2+).
  stateChecksum?: string;
};

export type FullBackupEnvelope = {
  format: "megacity-full-backup";
  schemaVersion: number;
  appVersion: string;
  buildNumber: number;
  exportedAt: number;
  slots: FullBackupSlotEntry[];
  settings: Record<string, unknown> | null;
};

export function serializeFullBackup(
  slots: { slot: number; state: GameState }[],
  settings: Record<string, unknown> | null,
): string {
  const envelope: FullBackupEnvelope = {
    format: "megacity-full-backup",
    schemaVersion: FULL_BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    buildNumber: BUILD_NUMBER,
    exportedAt: Date.now(),
    slots: slots.map(({ slot, state }) => {
      const compact = compactStateForSave(state);
      return {
        slot,
        cityName: state.cityName ?? "MEGACITY",
        playerName: state.player?.name ?? "Commander",
        playerLevel: state.player?.level ?? 1,
        totalTicks: state.totalTicks ?? 0,
        state: compact,
        stateChecksum: computeChecksum(JSON.stringify(compact)),
      };
    }),
    settings,
  };
  return JSON.stringify(envelope, null, 2);
}

export type FullBackupParseResult =
  | { ok: true; envelope: FullBackupEnvelope }
  | { ok: false; error: string };

export function parseFullBackup(input: string): FullBackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Backup must be a JSON object." };
  }
  const env = parsed as Partial<FullBackupEnvelope>;
  if (env.format !== "megacity-full-backup") {
    return { ok: false, error: "Not a MEGACITY full-backup file." };
  }
  if (typeof env.schemaVersion !== "number" || env.schemaVersion < 1) {
    return { ok: false, error: "Unsupported backup schema version." };
  }
  if (env.schemaVersion > FULL_BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Backup was made with a newer game version (schema ${env.schemaVersion}). Update the game first.`,
    };
  }
  if (!Array.isArray(env.slots)) {
    return { ok: false, error: "Backup is missing slots array." };
  }
  const seenSlots = new Set<number>();
  for (const entry of env.slots) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "Backup contains an invalid slot entry." };
    }
    if (typeof entry.slot !== "number" || !Number.isInteger(entry.slot) || entry.slot < 1 || entry.slot > FULL_BACKUP_MAX_SLOT) {
      return { ok: false, error: `Backup slot entry has an invalid slot id (must be 1..${FULL_BACKUP_MAX_SLOT}).` };
    }
    if (seenSlots.has(entry.slot)) {
      return { ok: false, error: `Backup contains duplicate entries for slot ${entry.slot}.` };
    }
    seenSlots.add(entry.slot);
    const s = entry.state as Partial<GameState> | undefined;
    if (!s || !s.player || !s.cityStats || !s.resources || !s.buildings || !s.units) {
      return { ok: false, error: `Slot ${entry.slot} is missing required state sections.` };
    }
  }
  // Verify each slot independently: one edited slot does not taint the rest.
  for (const entry of env.slots) {
    markStateUnlessVerified(entry.state as GameState, entry.stateChecksum);
  }
  return { ok: true, envelope: env as FullBackupEnvelope };
}

export function suggestedFullBackupFileName(env: FullBackupEnvelope): string {
  const date = new Date(env.exportedAt);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `megacity_backup_${y}${m}${d}_${env.slots.length}slots.json`;
}
