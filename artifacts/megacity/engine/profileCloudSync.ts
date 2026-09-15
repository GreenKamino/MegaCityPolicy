import type { PlayerProfile } from "./types";
import {
  loadActiveProfileId,
  loadAllProfiles,
  loadProfileIndex,
  saveActiveProfileId,
  saveProfile,
  saveProfileIndex,
} from "./profiles";
import { readCloudProfiles, writeCloudProfiles } from "./steamBridge";

// ─── STEAM CLOUD PROFILE SYNC ───────────────────────────────────────────
//
// Slots already cloud-mirror through saveLoad helpers. Profiles (player
// identity, prestige, decorations, augmentations, settings preferences)
// previously lived only in local AsyncStorage, so a fresh-device install
// would lose them even with cloud-saved slots. These helpers bundle the
// whole profile set into a single cloud file. The Steam Cloud API in
// `steamBridge.ts` short-circuits on non-Steam platforms (web/mobile),
// so calls here are safe to make unconditionally.
//
// This module is split out of `profiles.ts` so the latter stays free of
// react-native imports (steamBridge imports `Platform` from
// "react-native"), keeping the engine's node-only test runs working.
export const CLOUD_PROFILE_BUNDLE_VERSION = 1;

export interface CloudProfileBundle {
  version: number;
  profiles: PlayerProfile[];
  activeProfileId: string | null;
  exportedAt: number;
}

export type CloudSyncContinue = () => boolean;
const alwaysContinue: CloudSyncContinue = () => true;

/** Bundle every local profile + the active id and push to Steam Cloud.
 *  Fire-and-forget: returns false on any failure (cloud unavailable,
 *  serialization error, etc.) without throwing. */
export async function pushProfilesToCloud(): Promise<boolean> {
  try {
    const profiles = await loadAllProfiles();
    const activeProfileId = await loadActiveProfileId();
    const bundle: CloudProfileBundle = {
      version: CLOUD_PROFILE_BUNDLE_VERSION,
      profiles,
      activeProfileId,
      exportedAt: Date.now(),
    };
    return await writeCloudProfiles(JSON.stringify(bundle));
  } catch {
    return false;
  }
}

function isCloudProfileBundle(value: unknown): value is CloudProfileBundle {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.version !== "number") return false;
  if (!Array.isArray(v.profiles)) return false;
  // activeProfileId may be string or null; missing is also tolerated.
  return true;
}

/** Read the cloud bundle and restore profiles into local AsyncStorage.
 *  Returns the number of restored profiles (0 if cloud missing/empty/corrupt). */
export async function restoreProfilesFromCloud(
  shouldContinue: CloudSyncContinue = alwaysContinue,
): Promise<number> {
  try {
    const raw = await readCloudProfiles();
    if (!shouldContinue()) return 0;
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    if (!isCloudProfileBundle(parsed)) return 0;
    const bundle = parsed;
    let restored = 0;
    const restoredIds: string[] = [];
    for (const p of bundle.profiles) {
      // Defensive: skip profiles missing the bare minimum fields rather
      // than throwing — a partially corrupt bundle should not nuke the
      // whole restore path.
      if (!p || typeof p.id !== "string" || !p.id) continue;
      try {
        if (!shouldContinue()) return 0;
        await saveProfile(p);
        restoredIds.push(p.id);
        restored++;
      } catch {}
    }
    if (restoredIds.length > 0) {
      if (!shouldContinue()) return 0;
      await saveProfileIndex(restoredIds);
    }
    if (bundle.activeProfileId && restoredIds.includes(bundle.activeProfileId)) {
      if (!shouldContinue()) return 0;
      await saveActiveProfileId(bundle.activeProfileId);
    }
    return restored;
  } catch {
    return 0;
  }
}

/** Restore from cloud only if local AsyncStorage has no profiles yet.
 *  Intended for app boot on a fresh device. Returns the number of
 *  profiles restored (0 if local already has data or cloud is empty). */
export async function bootstrapProfilesFromCloudIfEmpty(
  shouldContinue: CloudSyncContinue = alwaysContinue,
): Promise<number> {
  const localIds = await loadProfileIndex();
  if (localIds.length > 0) return 0;
  if (!shouldContinue()) return 0;
  return restoreProfilesFromCloud(shouldContinue);
}
