import AsyncStorage from "@react-native-async-storage/async-storage";
import { compressToUTF16, decompressFromUTF16 } from "lz-string";

import { sanitizeState, ARRAY_CAPS } from "@/engine/sanitizer";
import { TMP_SUFFIX } from "@/engine/saveLoad";
import { compactStateForSave } from "@/engine/independentEnterprises";
import type { GameState } from "@/engine/types";

export const RECOVERY_SAVE_KEY = "@megacity_slot_recovery";
const RECOVERY_TMP_KEY = RECOVERY_SAVE_KEY + TMP_SUFFIX;

type StateAccessor = () => GameState | null;

let stateAccessor: StateAccessor | null = null;
let lastPanicAt = 0;

export function registerPanicSaveAccessor(fn: StateAccessor | null): void {
  stateAccessor = fn;
}

function computeChecksum(json: string): string {
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) - hash + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function wrap(json: string): string {
  const checksum = computeChecksum(json);
  const compressed = compressToUTF16(json);
  return JSON.stringify({ v: 2, checksum, data: compressed });
}

function unwrap(raw: string): { json: string; valid: boolean } {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.data === "string" && parsed.v === 2) {
      const decompressed = decompressFromUTF16(parsed.data);
      if (!decompressed) return { json: raw, valid: false };
      const expected = computeChecksum(decompressed);
      return { json: decompressed, valid: expected === parsed.checksum };
    }
    return { json: raw, valid: true };
  } catch {
    return { json: raw, valid: false };
  }
}

/**
 * Best-effort snapshot of the current game state into a dedicated recovery
 * slot. Called by the top-level Error Boundary when something throws so the
 * player doesn't lose progress between autosaves.
 *
 * - Fire-and-forget. Catches every error to avoid masking the original crash.
 * - Self-throttled (1 panic save per 5 seconds) so a render loop can't
 *   hammer storage.
 */
export function triggerPanicSave(): void {
  const now = Date.now();
  if (now - lastPanicAt < 5000) return;
  lastPanicAt = now;

  try {
    const accessor = stateAccessor;
    if (!accessor) return;
    const state = accessor();
    if (!state) return;

    const sanitized = sanitizeState(state);
    const trimmed: GameState = {
      ...sanitized,
      lastTickTime: now,
      tickLog: [],
      messages:
        sanitized.messages && sanitized.messages.length > ARRAY_CAPS.messages
          ? sanitized.messages.slice(0, ARRAY_CAPS.messages)
          : sanitized.messages,
      saveLabel: "RECOVERY SNAPSHOT",
    };
    const wrapped = wrap(JSON.stringify(compactStateForSave(trimmed)));
    // Atomic temp-key + swap, mirroring the slot-write path in saveLoad.ts.
    // Even though the panic path is fire-and-forget after a crash, we still
    // never want to leave the recovery key holding half-written garbage —
    // a torn write here would cost the player exactly the snapshot they're
    // about to need. Phase 1 lands the bytes on a tmp key; phase 2 commits
    // via a single per-key setItem (atomic across AsyncStorage backends);
    // phase 3 best-effort cleanup. Each phase catches independently so a
    // failure never masks the original crash that triggered us.
    (async () => {
      try {
        await AsyncStorage.setItem(RECOVERY_TMP_KEY, wrapped);
        await AsyncStorage.setItem(RECOVERY_SAVE_KEY, wrapped);
        // Verify-on-read-back: the bytes the OS just acknowledged might
        // still be wrong (truncation under quota, encoding bug, native
        // bridge glitch). Read the recovery key back and confirm the
        // checksum matches before declaring victory. If it doesn't, drop
        // the recovery key so the post-crash UI never offers the player
        // a corrupted snapshot to "restore" — better no recovery than a
        // silently-broken one.
        try {
          const readback = await AsyncStorage.getItem(RECOVERY_SAVE_KEY);
          const ok = readback != null && unwrap(readback).valid;
          if (!ok) {
            console.warn("Panic save read-back checksum failed; clearing recovery slot.");
            try {
              await AsyncStorage.removeItem(RECOVERY_SAVE_KEY);
            } catch {
              /* nothing more we can do here */
            }
          }
        } catch (verifyErr) {
          // Fail-closed: a thrown read-back means we can't prove the
          // persisted bytes are intact. Better to drop the recovery
          // key than to leave behind something the post-crash UI
          // would happily try (and likely fail) to load.
          console.warn("Panic save read-back failed; clearing recovery slot:", verifyErr);
          try {
            await AsyncStorage.removeItem(RECOVERY_SAVE_KEY);
          } catch {
            /* nothing more we can do here */
          }
        }
        try {
          await AsyncStorage.removeItem(RECOVERY_TMP_KEY);
        } catch {
          /* leftover tmp is harmless */
        }
      } catch (err) {
        console.warn("Panic save (write) failed:", err);
      }
    })();
  } catch (err) {
    console.warn("Panic save failed:", err);
  }
}

export type RecoverySnapshotMeta = {
  exists: boolean;
  savedAt: number | null;
  cityName: string | null;
};

/**
 * Inspect the recovery slot without committing to loading from it.
 * Used by the error fallback UI to decide whether to surface a
 * "restore from before the crash" button.
 */
export async function readRecoverySnapshotMeta(): Promise<RecoverySnapshotMeta> {
  try {
    const raw = await AsyncStorage.getItem(RECOVERY_SAVE_KEY);
    if (!raw) return { exists: false, savedAt: null, cityName: null };
    const { json, valid } = unwrap(raw);
    if (!valid) return { exists: false, savedAt: null, cityName: null };
    const parsed = JSON.parse(json) as Partial<GameState>;
    return {
      exists: true,
      savedAt: parsed.lastTickTime ?? null,
      cityName: parsed.cityName ?? null,
    };
  } catch {
    return { exists: false, savedAt: null, cityName: null };
  }
}

export async function clearRecoverySnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECOVERY_SAVE_KEY);
  } catch {
    /* ignore */
  }
}
