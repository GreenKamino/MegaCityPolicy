const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");

// Desktop shell controls (Task #532), separate from the Steam SDK surface
// below. The renderer detects the Electron shell via either bridge; see
// utils/desktopShell.ts for the consuming helpers.
contextBridge.exposeInMainWorld("desktop", {
  // Release-safe fixture and failure injection are only exposed when the
  // packaged smoke test explicitly opts in through its environment. Normal
  // Steam launches always expose both capabilities as false.
  saveAndQuitFixture: process.env.MEGACITY_E2E_FIXTURE === "save-and-quit",
  retinueSuccessionFixture:
    process.env.MEGACITY_E2E_FIXTURE === "retinue-succession",
  communicationsBoundaryFixture:
    process.env.MEGACITY_E2E_FIXTURE === "communications-boundary",
  militaryFoodPoolFixture:
    process.env.MEGACITY_E2E_FIXTURE === "military-food-pool",
  utilityParityFixture:
    process.env.MEGACITY_E2E_FIXTURE === "utility-parity",
  researchQueueFixture:
    process.env.MEGACITY_E2E_FIXTURE === "research-queue",
  housingBlockerFixture:
    process.env.MEGACITY_E2E_FIXTURE === "housing-blocker",
  railModulesFixture:
    process.env.MEGACITY_E2E_FIXTURE === "rail-modules",
  districtCommandsFixture:
    process.env.MEGACITY_E2E_FIXTURE === "district-commands",
  crimeRecoveryFixture:
    process.env.MEGACITY_E2E_FIXTURE === "crime-recovery",
  missionMailFixture:
    process.env.MEGACITY_E2E_FIXTURE === "mission-mail",
  worldMapEventLogFixture:
    process.env.MEGACITY_E2E_FIXTURE === "world-map-event-log",
  mapFoodStorageFixture:
    process.env.MEGACITY_E2E_FIXTURE === "map-food-storage",
  storagePlanFixture:
    process.env.MEGACITY_E2E_FIXTURE === "storage-plan",
  simulateSaveFailure: process.env.MEGACITY_E2E_SAVE_FAILURE === "1",
  // Explicit in-app quit (main-menu QUIT GAME / in-game QUIT TO DESKTOP).
  // Marks the quit as confirmed in the main process so the close-guard
  // dialog never re-prompts, then closes the window.
  quitApp: () => ipcRenderer.send("app-quit-request"),
  // Live close-guard inputs: whether the simulation is running and whether
  // the player wants a confirm dialog on close. Sanitized to booleans here
  // so the main process never sees arbitrary payloads.
  setCloseGuardState: (state) =>
    ipcRenderer.send("close-guard-state", {
      simRunning: !!(state && state.simRunning),
      confirmOnClose: !!(state && state.confirmOnClose),
    }),
  // Whole-window UI scale via Chromium's real zoom factor (validated and
  // clamped main-side).
  setZoomFactor: (factor) => ipcRenderer.send("set-zoom-factor", factor),
  // Open the same OS folder used by F9 screenshot capture.
  openScreenshotsFolder: () => ipcRenderer.invoke("open-screenshots-folder"),
  // Narrow release-integrity status; no manifest paths or filesystem access
  // cross the context bridge.
  getReleaseIntegrityStatus: () => ipcRenderer.invoke("release-integrity-status"),
});

// A packaged profile smoke test must seed storage before the first renderer
// document executes. Puppeteer can attach after Electron has already started
// that document, so evaluateOnNewDocument is not a reliable substitute here.
// The path is supplied only by an explicit opt-in E2E environment variable;
// normal launches never read an external fixture.
if (process.env.MEGACITY_E2E_LOCAL_STORAGE_FIXTURE) {
  try {
    const fixture = JSON.parse(
      fs.readFileSync(process.env.MEGACITY_E2E_LOCAL_STORAGE_FIXTURE, "utf8"),
    );
    if (fixture?.clear === true) window.localStorage.clear();
    for (const [key, value] of Object.entries(fixture?.entries ?? {})) {
      if (typeof key === "string" && typeof value === "string") {
        window.localStorage.setItem(key, value);
      }
    }
  } catch (error) {
    console.error(`[E2E] localStorage fixture failed: ${error?.message ?? error}`);
  }
}

contextBridge.exposeInMainWorld("steamworks", {
  setAchievement: (name) => ipcRenderer.invoke("steam-set-achievement", name),
  clearAchievement: (name) => ipcRenderer.invoke("steam-clear-achievement", name),
  getAchievement: (name) => ipcRenderer.invoke("steam-get-achievement", name),
  storeStats: () => ipcRenderer.invoke("steam-store-stats"),
  getSteamId: () => ipcRenderer.invoke("steam-get-id"),
  isInitialized: () => ipcRenderer.invoke("steam-is-initialized"),
  captureScreenshot: () => ipcRenderer.invoke("capture-screenshot"),

  cloud: {
    writeFile: (filename, data) => ipcRenderer.invoke("steam-cloud-write", filename, data),
    readFile: (filename) => ipcRenderer.invoke("steam-cloud-read", filename),
    deleteFile: (filename) => ipcRenderer.invoke("steam-cloud-delete", filename),
    fileExists: (filename) => ipcRenderer.invoke("steam-cloud-exists", filename),
    getFileCount: () => ipcRenderer.invoke("steam-cloud-count"),
    getFileSize: () => 0,
    isCloudEnabled: () => ipcRenderer.invoke("steam-cloud-enabled"),
  },

  richPresence: {
    setRichPresence: (key, value) => {
      ipcRenderer.send("steam-rich-presence-set", key, value);
      return true;
    },
    clearRichPresence: () => {
      ipcRenderer.send("steam-rich-presence-clear");
    },
  },

  stats: {
    setStat: (name, value) => ipcRenderer.invoke("steam-set-stat", name, value),
    getStat: (name) => ipcRenderer.invoke("steam-get-stat", name),
    storeStats: () => ipcRenderer.invoke("steam-store-stats"),
  },
});
