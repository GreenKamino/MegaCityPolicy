import { Platform } from "react-native";
import { ALL_BASE_ACHIEVEMENTS, type AchievementDef } from "./achievements";
import { countFulfilledContracts } from "./contracts";
import {
  initReleaseIntegrity,
  isReleaseIntegrityTrusted,
} from "./releaseIntegrity";

const ACHIEVEMENT_INDEX = new Map<string, AchievementDef>();
for (const ach of ALL_BASE_ACHIEVEMENTS) {
  ACHIEVEMENT_INDEX.set(ach.id, ach);
}

type SteamworksApi = {
  setAchievement: (apiName: string) => Promise<boolean> | boolean;
  clearAchievement: (apiName: string) => Promise<boolean> | boolean;
  getAchievement: (apiName: string) => Promise<boolean> | boolean;
  storeStats: () => Promise<boolean> | boolean;
  getSteamId: () => Promise<string> | string;
  isInitialized: () => Promise<boolean> | boolean;
};

type SteamCloudApi = {
  writeFile: (filename: string, data: string) => Promise<boolean> | boolean;
  readFile: (filename: string) => Promise<string | null> | string | null;
  deleteFile: (filename: string) => Promise<boolean> | boolean;
  fileExists: (filename: string) => Promise<boolean> | boolean;
  getFileCount: () => Promise<number> | number;
  getFileSize: (filename: string) => Promise<number> | number;
  isCloudEnabled: () => Promise<boolean> | boolean;
};

type SteamRichPresenceApi = {
  setRichPresence: (key: string, value: string) => boolean;
  clearRichPresence: () => void;
};

type SteamStatsApi = {
  setStat: (name: string, value: number) => Promise<boolean> | boolean;
  getStat: (name: string) => Promise<number> | number;
  storeStats: () => Promise<boolean> | boolean;
};

let steamApi: SteamworksApi | null = null;
let cloudApi: SteamCloudApi | null = null;
let richPresenceApi: SteamRichPresenceApi | null = null;
let statsApi: SteamStatsApi | null = null;
let initialized = false;
let cloudEnabled = false;

const STEAM_IPC_TIMEOUT_MS = 1500;

/**
 * Electron's preload bridge uses ipcRenderer.invoke(), so even status checks
 * return Promises. Bound every bridge call: Steam being offline or an IPC
 * handler failing to answer must never hold the renderer's boot path open.
 */
function awaitSteamCall<T>(
  value: Promise<T> | T,
  fallback: T,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      onTimeout?.();
      finish(fallback);
    }, STEAM_IPC_TIMEOUT_MS);
    Promise.resolve(value).then(
      (result) => finish(result),
      () => finish(fallback),
    );
  });
}

export function isSteamAvailable(): boolean {
  return initialized && steamApi !== null;
}

export function isSteamCloudAvailable(): boolean {
  return initialized && cloudApi !== null && cloudEnabled;
}

export type ScreenshotResult = { ok: boolean; path?: string; error?: string };

// Desktop (Steam / Electron) screenshot capture, used by the F9 hotkey.
// Intentionally decoupled from initSteamBridge()/`initialized`: the Electron
// preload exposes window.steamworks.captureScreenshot even when the Steam SDK
// itself failed to initialize (offline mode), and capture must work
// regardless. So we detect the method directly on window.steamworks at call
// time rather than relying on the bridge being initialized.
export function isDesktopCaptureAvailable(): boolean {
  if (Platform.OS !== "web") return false;
  try {
    const win = typeof window !== "undefined" ? (window as any) : null;
    return typeof win?.steamworks?.captureScreenshot === "function";
  } catch {
    return false;
  }
}

export async function captureSteamScreenshot(): Promise<ScreenshotResult> {
  if (!isDesktopCaptureAvailable()) return { ok: false, error: "unavailable" };
  try {
    const win = window as any;
    const result = await win.steamworks.captureScreenshot();
    if (result && typeof result === "object" && typeof result.ok === "boolean") {
      return result as ScreenshotResult;
    }
    return { ok: false, error: "bad-result" };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "error" };
  }
}

export async function initSteamBridge(): Promise<boolean> {
  if (Platform.OS !== "web") return false;

  try {
    await initReleaseIntegrity();
    const win = typeof window !== "undefined" ? (window as any) : null;
    if (!win?.steamworks) {
      initialized = false;
      cloudEnabled = false;
      steamApi = null;
      cloudApi = null;
      richPresenceApi = null;
      statsApi = null;
      return false;
    }

    steamApi = win.steamworks as SteamworksApi;
    cloudApi = null;
    richPresenceApi = null;
    statsApi = null;

    if (win.steamworks.cloud) {
      cloudApi = win.steamworks.cloud as SteamCloudApi;
    }
    if (win.steamworks.richPresence) {
      richPresenceApi = win.steamworks.richPresence as SteamRichPresenceApi;
    }
    if (win.steamworks.stats) {
      statsApi = win.steamworks.stats as SteamStatsApi;
    }

    initialized = await awaitSteamCall(steamApi.isInitialized(), false);
    cloudEnabled =
      initialized && cloudApi !== null
        ? await awaitSteamCall(cloudApi.isCloudEnabled(), false, () => {
            cloudEnabled = false;
          })
        : false;

    return initialized;
  } catch {
    initialized = false;
    cloudEnabled = false;
    steamApi = null;
    cloudApi = null;
    richPresenceApi = null;
    statsApi = null;
    return false;
  }
}

export async function unlockSteamAchievement(achievementId: string): Promise<boolean> {
  if (!isReleaseIntegrityTrusted() || !steamApi || !initialized) return false;

  const def = ACHIEVEMENT_INDEX.get(achievementId);
  if (!def) return false;

  try {
    const result = await steamApi.setAchievement(def.steamApiName);
    if (result) {
      await steamApi.storeStats();
    }
    return result;
  } catch {
    return false;
  }
}

export async function unlockSteamAchievements(achievementIds: string[]): Promise<void> {
  if (!isReleaseIntegrityTrusted() || !steamApi || !initialized || achievementIds.length === 0) return;

  let anyUnlocked = false;
  for (const id of achievementIds) {
    const def = ACHIEVEMENT_INDEX.get(id);
    if (!def) continue;
    try {
      if (await steamApi.setAchievement(def.steamApiName)) {
        anyUnlocked = true;
      }
    } catch {}
  }

  if (anyUnlocked) {
    try { await steamApi.storeStats(); } catch {}
  }
}

export async function syncSteamAchievements(unlockedIds: string[]): Promise<void> {
  if (!isReleaseIntegrityTrusted() || !steamApi || !initialized) return;

  let anySet = false;
  for (const id of unlockedIds) {
    const def = ACHIEVEMENT_INDEX.get(id);
    if (!def) continue;
    try {
      const alreadyUnlocked = await steamApi.getAchievement(def.steamApiName);
      if (!alreadyUnlocked) {
        await steamApi.setAchievement(def.steamApiName);
        anySet = true;
      }
    } catch {}
  }

  if (anySet) {
    try { await steamApi.storeStats(); } catch {}
  }
}

export async function resetSteamAchievements(): Promise<void> {
  if (!isReleaseIntegrityTrusted() || !steamApi || !initialized) return;

  for (const ach of ALL_BASE_ACHIEVEMENTS) {
    try { await steamApi.clearAchievement(ach.steamApiName); } catch {}
  }
  try { await steamApi.storeStats(); } catch {}
}

export function exportSteamAchievementConfig(): { apiName: string; displayName: string; description: string }[] {
  return ALL_BASE_ACHIEVEMENTS.map((ach) => ({
    apiName: ach.steamApiName,
    displayName: ach.title,
    description: ach.description,
  }));
}

const CLOUD_SAVE_PREFIX = "megacity_save_";
const CLOUD_PROFILE_KEY = "megacity_profiles.json";

export async function writeCloudSave(slotKey: string, data: string): Promise<boolean> {
  if (!isSteamCloudAvailable() || !cloudApi) return false;

  try {
    const filename = `${CLOUD_SAVE_PREFIX}${slotKey.replace(/[^a-zA-Z0-9_]/g, "_")}.json`;
    return await awaitSteamCall(cloudApi.writeFile(filename, data), false, () => {
      cloudEnabled = false;
    });
  } catch {
    return false;
  }
}

export async function readCloudSave(slotKey: string): Promise<string | null> {
  if (!isSteamCloudAvailable() || !cloudApi) return null;

  try {
    const filename = `${CLOUD_SAVE_PREFIX}${slotKey.replace(/[^a-zA-Z0-9_]/g, "_")}.json`;
    const exists = await awaitSteamCall(cloudApi.fileExists(filename), false, () => {
      cloudEnabled = false;
    });
    if (!exists) return null;
    return await awaitSteamCall(cloudApi.readFile(filename), null, () => {
      cloudEnabled = false;
    });
  } catch {
    return null;
  }
}

export async function deleteCloudSave(slotKey: string): Promise<boolean> {
  if (!isSteamCloudAvailable() || !cloudApi) return false;

  try {
    const filename = `${CLOUD_SAVE_PREFIX}${slotKey.replace(/[^a-zA-Z0-9_]/g, "_")}.json`;
    return await awaitSteamCall(cloudApi.deleteFile(filename), false, () => {
      cloudEnabled = false;
    });
  } catch {
    return false;
  }
}

export async function writeCloudProfiles(data: string): Promise<boolean> {
  if (!isSteamCloudAvailable() || !cloudApi) return false;
  try {
    return await awaitSteamCall(cloudApi.writeFile(CLOUD_PROFILE_KEY, data), false, () => {
      cloudEnabled = false;
    });
  } catch {
    return false;
  }
}

export async function readCloudProfiles(): Promise<string | null> {
  if (!isSteamCloudAvailable() || !cloudApi) return null;
  try {
    const exists = await awaitSteamCall(cloudApi.fileExists(CLOUD_PROFILE_KEY), false, () => {
      cloudEnabled = false;
    });
    if (!exists) return null;
    return await awaitSteamCall(cloudApi.readFile(CLOUD_PROFILE_KEY), null, () => {
      cloudEnabled = false;
    });
  } catch { return null; }
}

export function updateRichPresence(info: {
  cityName?: string;
  day?: number;
  population?: number;
  reputation?: string;
  season?: string;
}): void {
  if (!richPresenceApi) return;

  try {
    if (info.cityName) {
      richPresenceApi.setRichPresence("steam_display", "#StatusFull");
      richPresenceApi.setRichPresence("city", info.cityName);
    }
    if (info.day !== undefined) {
      richPresenceApi.setRichPresence("day", `Day ${info.day}`);
    }
    if (info.population !== undefined) {
      const popStr = info.population >= 1000000
        ? `${(info.population / 1000000).toFixed(1)}M`
        : info.population >= 1000
        ? `${Math.floor(info.population / 1000)}K`
        : `${info.population}`;
      richPresenceApi.setRichPresence("population", `${popStr} citizens`);
    }
    if (info.reputation) {
      richPresenceApi.setRichPresence("reputation", `Grade ${info.reputation}`);
    }
    if (info.season) {
      richPresenceApi.setRichPresence("season", info.season);
    }
  } catch {}
}

export function clearRichPresence(): void {
  if (!richPresenceApi) return;
  try { richPresenceApi.clearRichPresence(); } catch {}
}

export const STEAM_STATS = {
  TOTAL_TICKS: "stat_total_ticks",
  TOTAL_CREDITS_EARNED: "stat_total_credits_earned",
  TOTAL_POPULATION_PEAK: "stat_population_peak",
  TOTAL_DISTRICTS_MANAGED: "stat_districts_managed",
  TOTAL_TECHNOLOGIES_UNLOCKED: "stat_technologies_unlocked",
  TOTAL_EVENTS_SURVIVED: "stat_events_survived",
  TOTAL_CONTRACTS_COMPLETED: "stat_contracts_completed",
  TOTAL_FACTIONS_ALLIED: "stat_factions_allied",
  TOTAL_PRESTIGES: "stat_total_prestiges",
  LONGEST_RUN_TICKS: "stat_longest_run_ticks",
} as const;

export async function setSteamStat(name: string, value: number): Promise<boolean> {
  if (!statsApi) return false;
  try {
    return await statsApi.setStat(name, Math.floor(value));
  } catch { return false; }
}

export async function getSteamStat(name: string): Promise<number> {
  if (!statsApi) return 0;
  try { return await statsApi.getStat(name); } catch { return 0; }
}

export async function storeSteamStats(): Promise<boolean> {
  if (!statsApi) return false;
  try { return await statsApi.storeStats(); } catch { return false; }
}

export async function syncGameStats(state: {
  totalTicks: number;
  resources: { credits: number };
  districts: { population: number }[];
  unlockedTechnologies: string[];
  completedContracts?: any[];
  factions: { loyalty: number }[];
  prestigeCount?: number;
  totalCreditsEarned?: number;
  eventsSurvived?: number;
}): Promise<void> {
  if (!statsApi) return;

  try {
    const totalPop = state.districts.reduce((a, d) => a + d.population, 0);
    const currentPeak = await getSteamStat(STEAM_STATS.TOTAL_POPULATION_PEAK);

    await setSteamStat(STEAM_STATS.TOTAL_TICKS, state.totalTicks);
    if (totalPop > currentPeak) {
      await setSteamStat(STEAM_STATS.TOTAL_POPULATION_PEAK, totalPop);
    }
    await setSteamStat(STEAM_STATS.TOTAL_DISTRICTS_MANAGED, state.districts.length);
    await setSteamStat(STEAM_STATS.TOTAL_TECHNOLOGIES_UNLOCKED, state.unlockedTechnologies.length);
    await setSteamStat(STEAM_STATS.TOTAL_CONTRACTS_COMPLETED, countFulfilledContracts(state.completedContracts));
    await setSteamStat(STEAM_STATS.TOTAL_FACTIONS_ALLIED, state.factions.filter(f => f.loyalty > 60).length);
    await setSteamStat(STEAM_STATS.TOTAL_PRESTIGES, state.prestigeCount ?? 0);
    await setSteamStat(STEAM_STATS.TOTAL_CREDITS_EARNED, state.totalCreditsEarned ?? Math.floor(state.resources.credits));
    await setSteamStat(STEAM_STATS.TOTAL_EVENTS_SURVIVED, state.eventsSurvived ?? 0);

    const currentLongest = await getSteamStat(STEAM_STATS.LONGEST_RUN_TICKS);
    if (state.totalTicks > currentLongest) {
      await setSteamStat(STEAM_STATS.LONGEST_RUN_TICKS, state.totalTicks);
    }

    await storeSteamStats();
  } catch {}
}

export function exportSteamStatsConfig(): { name: string; displayName: string; type: string }[] {
  return [
    { name: STEAM_STATS.TOTAL_TICKS, displayName: "Total Simulation Ticks", type: "int" },
    { name: STEAM_STATS.TOTAL_CREDITS_EARNED, displayName: "Total Credits Earned", type: "int" },
    { name: STEAM_STATS.TOTAL_POPULATION_PEAK, displayName: "Peak Population", type: "int" },
    { name: STEAM_STATS.TOTAL_DISTRICTS_MANAGED, displayName: "Districts Managed", type: "int" },
    { name: STEAM_STATS.TOTAL_TECHNOLOGIES_UNLOCKED, displayName: "Technologies Unlocked", type: "int" },
    { name: STEAM_STATS.TOTAL_EVENTS_SURVIVED, displayName: "Events Survived", type: "int" },
    { name: STEAM_STATS.TOTAL_CONTRACTS_COMPLETED, displayName: "Contracts Completed", type: "int" },
    { name: STEAM_STATS.TOTAL_FACTIONS_ALLIED, displayName: "Factions Allied", type: "int" },
    { name: STEAM_STATS.TOTAL_PRESTIGES, displayName: "Total Prestiges", type: "int" },
    { name: STEAM_STATS.LONGEST_RUN_TICKS, displayName: "Longest Run (Ticks)", type: "int" },
  ];
}
