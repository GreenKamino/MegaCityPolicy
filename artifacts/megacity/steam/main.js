const { app, BrowserWindow, ipcMain, protocol, net, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { shouldConfirmClose } = require("./closeGuard");
const { verifyReleaseIntegrity } = require("./releaseIntegrity");

// The Expo web export references assets with root-absolute paths
// (e.g. "/_expo/static/js/entry.js", plus lazy chunks/assets loaded at
// runtime). Under file:// those resolve to the OS filesystem root and fail
// on every platform — not just Linux. Serving the bundle from a privileged
// "app://" origin preserves absolute-path semantics relative to the bundle
// root, so both the initial load and runtime chunk/asset loads resolve
// against web-build/ correctly.
const APP_SCHEME = "app";
const WEB_ROOT = path.join(__dirname, "web-build");
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    // Parsing/decoding can throw on a malformed URL (e.g. a stray "%" that
    // isn't a valid percent-escape) — answer 400 rather than crashing the
    // handler.
    let rel;
    try {
      const { pathname } = new URL(request.url);
      rel = decodeURIComponent(pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    // Strip leading slashes so path.join is unambiguous on every platform,
    // then default the bundle root to index.html.
    rel = rel.replace(/^\/+/, "");
    if (rel === "") rel = "index.html";
    // Normalize and confine to WEB_ROOT to prevent path traversal.
    const filePath = path.normalize(path.join(WEB_ROOT, rel));
    if (filePath !== WEB_ROOT && !filePath.startsWith(WEB_ROOT + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch {
      // SPA fallback: the Expo web export is a single-page app, so any path
      // that isn't a real file on disk (i.e. a client-side route like
      // "/game" or "/settings", which has no file extension) must be served
      // index.html so the router can resolve it. Requests for missing assets
      // (which DO have an extension, e.g. .js/.png) still return 404.
      if (!path.extname(rel)) {
        try {
          return await net.fetch(
            pathToFileURL(path.join(WEB_ROOT, "index.html")).toString()
          );
        } catch {
          /* fall through to 404 below */
        }
      }
      return new Response(`Not found: ${rel}`, { status: 404 });
    }
  });
}

const APP_ID_FILE = path.join(__dirname, "steam_appid.txt");
const APP_ID_RAW = fs.existsSync(APP_ID_FILE)
  ? fs.readFileSync(APP_ID_FILE, "utf-8").trim()
  : process.env.STEAM_APP_ID || "4633600";
const APP_ID_PARSED = parseInt(APP_ID_RAW, 10);
const APP_ID = Number.isInteger(APP_ID_PARSED) && APP_ID_PARSED > 0
  ? String(APP_ID_PARSED)
  : "4633600";
if (APP_ID !== APP_ID_RAW) {
  console.warn(`[Steam] Invalid Steam App ID "${APP_ID_RAW}" — falling back to default ${APP_ID}`);
}
const STORE_ITEM_ID = "1160419";

// Persist window position/size between launches so Windows-laptop and
// Steam Deck users don't have to re-place + re-size the window every
// time. Hand-rolled to avoid pulling in electron-window-state as a new
// runtime dep. Stored next to the userData (per-user, per-OS path).
const WINDOW_STATE_FILE = path.join(app.getPath("userData"), "window_state.json");
const DEFAULT_WINDOW_STATE = { width: 1280, height: 720, x: undefined, y: undefined, isMaximized: false, isFullScreen: false };

function loadWindowState() {
  try {
    if (!fs.existsSync(WINDOW_STATE_FILE)) return { ...DEFAULT_WINDOW_STATE };
    const raw = fs.readFileSync(WINDOW_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      width: Number.isFinite(parsed.width) && parsed.width >= 800 ? parsed.width : DEFAULT_WINDOW_STATE.width,
      height: Number.isFinite(parsed.height) && parsed.height >= 600 ? parsed.height : DEFAULT_WINDOW_STATE.height,
      x: Number.isFinite(parsed.x) ? parsed.x : undefined,
      y: Number.isFinite(parsed.y) ? parsed.y : undefined,
      isMaximized: parsed.isMaximized === true,
      isFullScreen: parsed.isFullScreen === true,
    };
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

function saveWindowState(win) {
  try {
    if (!win || win.isDestroyed()) return;
    const isMaximized = win.isMaximized();
    const isFullScreen = win.isFullScreen();
    // Only persist a normal-state bounds snapshot. If the window is
    // currently maximized or full-screen, getBounds() returns the
    // restore bounds on most platforms, but we only stash size/position
    // when the window isn't in a special state to avoid surprises.
    const bounds = isMaximized || isFullScreen ? null : win.getBounds();
    const next = {
      width: bounds?.width ?? DEFAULT_WINDOW_STATE.width,
      height: bounds?.height ?? DEFAULT_WINDOW_STATE.height,
      x: bounds?.x,
      y: bounds?.y,
      isMaximized,
      isFullScreen,
    };
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(next), "utf-8");
  } catch {
    // Persist is best-effort; never crash the app over this.
  }
}

let mainWindow;

// Window-close guard state (Task #532). The renderer reports simRunning /
// confirmOnClose over IPC whenever the game route's pause state or the WARN
// BEFORE CLOSING setting changes; defaults are "not running" so the title
// screen and main menu always close instantly. quitConfirmed flips once the
// player confirms (native dialog or in-app QUIT button) so the follow-up
// close is never re-intercepted. Decision logic lives in ./closeGuard.js so
// the vitest suite can pin the truth table.
let closeGuardState = { simRunning: false, confirmOnClose: true };
let quitConfirmed = false;
let closeDialogOpen = false;

let steam = null;
let steamClient = null;
let steamInitialized = false;
let steamHandlersRegistered = false;
let releaseIntegrityStatus = {
  mode: "unpackaged",
  trusted: true,
  reason: "development-exempt",
  version: null,
  build: null,
  manifestVersion: null,
};
let overlayCallbackInterval = null;
let e2eCloudSeedFilenames = [];

function getScreenshotsDirectory() {
  return path.join(app.getPath("pictures"), "MEGACITY Screenshots");
}

// The packaged cloud-restore smoke test needs a deterministic cloud backend
// when Steam is not running in CI. It is deliberately opt-in and lives behind
// the same main-process handlers as the real Steam SDK, so the renderer still
// crosses the production preload/IPC boundary. The test supplies a separate
// temporary directory; normal launches never enter this path.
function initE2ECloudFixture() {
  if (process.env.MEGACITY_E2E_CLOUD_FIXTURE !== "1") return false;

  const rawDirectory = process.env.MEGACITY_E2E_CLOUD_FIXTURE_DIR;
  if (!rawDirectory) {
    throw new Error("MEGACITY_E2E_CLOUD_FIXTURE_DIR is required when cloud fixture mode is enabled");
  }
  const directory = path.resolve(rawDirectory);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Steam Cloud fixture directory does not exist: ${directory}`);
  }
  const cloudWriteDelayMs = Math.max(
    0,
    Number.parseInt(process.env.MEGACITY_E2E_CLOUD_WRITE_DELAY_MS ?? "0", 10) || 0,
  );
  let cloudDeleteFailuresRemaining = Math.max(
    0,
    Number.parseInt(process.env.MEGACITY_E2E_CLOUD_DELETE_FAILURES ?? "0", 10) || 0,
  );
  const waitForCloudWriteDelay = cloudWriteDelayMs > 0
    ? () => new Promise((resolve) => setTimeout(resolve, cloudWriteDelayMs))
    : null;

  const fixturePath = (filename) => {
    if (
      typeof filename !== "string" ||
      !filename ||
      filename === "." ||
      filename === ".." ||
      filename !== path.basename(filename)
    ) {
      throw new TypeError(`invalid Steam Cloud fixture filename: ${String(filename)}`);
    }
    const resolved = path.resolve(directory, filename);
    if (resolved !== path.join(directory, filename)) {
      throw new TypeError(`Steam Cloud fixture filename escapes its directory: ${filename}`);
    }
    return resolved;
  };
  const cloud = {
    async writeFile(filename, data) {
      if (waitForCloudWriteDelay) await waitForCloudWriteDelay();
      fs.writeFileSync(fixturePath(filename), Buffer.isBuffer(data) ? data : Buffer.from(data));
      return true;
    },
    readFile(filename) {
      try {
        return fs.readFileSync(fixturePath(filename));
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    },
    deleteFile(filename) {
      if (cloudDeleteFailuresRemaining > 0) {
        cloudDeleteFailuresRemaining -= 1;
        return false;
      }
      try {
        fs.unlinkSync(fixturePath(filename));
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      return true;
    },
    isFileExists(filename) {
      return fs.existsSync(fixturePath(filename));
    },
    getFileCount() {
      return fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile()).length;
    },
    isCloudEnabledForApp() {
      return true;
    },
  };

  steam = { type: "e2e-cloud-fixture", cloud };
  console.log(`[Steam] using disposable E2E Cloud fixture at ${directory}`);
  return true;
}

function initSteamworksJS() {
  // Probe first so a missing optional native module doesn't dump a
  // multi-line "Cannot find module 'steamworks.js'" stack on every
  // launch in offline-mode dev/CI. Silent-by-design when not bundled;
  // mirrors initGreenworksFallback below.
  try {
    require.resolve("steamworks.js");
  } catch {
    return false;
  }
  try {
    const steamworks = require("steamworks.js");
    steamClient = steamworks.init(Number(APP_ID));
    if (!steamClient) return false;

    steam = {
      type: "steamworks.js",
      client: steamClient,
      achievement: steamClient.achievement,
      cloud: steamClient.cloud,
      stats: steamClient.stats,
    };

    console.log(`[Steam] steamworks.js initialized for App ID ${APP_ID}`);
    const playerName = steamClient.localplayer?.getName?.() ?? "Unknown";
    const steamId = steamClient.localplayer?.getSteamId?.()?.steamId64 ?? "unknown";
    console.log(`[Steam] Player: ${playerName} (${steamId})`);
    return true;
  } catch (err) {
    console.log(`[Steam] steamworks.js not available: ${err.message}`);
    return false;
  }
}

function promisifyGW(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, resolve, reject);
  });
}

function initGreenworksFallback() {
  // Greenworks is an optional secondary fallback that ships out-of-tree
  // (the `greenworks/` folder is gitignored and not declared in
  // package.json). Probe with require.resolve first so a missing module
  // doesn't dump a multi-line "Cannot find module" stack on every launch
  // — this fallback is silent-by-design when greenworks isn't bundled.
  let greenworksPath = null;
  try {
    greenworksPath = require.resolve("greenworks");
  } catch {
    const localPath = path.join(__dirname, "greenworks", "greenworks");
    try {
      greenworksPath = require.resolve(localPath);
    } catch {
      return false;
    }
  }

  try {
    const greenworks = require(greenworksPath);

    if (!greenworks.initAPI()) return false;

    steam = {
      type: "greenworks",
      gw: greenworks,
    };

    console.log(`[Steam] Greenworks initialized for App ID ${APP_ID}`);
    const screenName = greenworks.getSteamId?.()?.screenName ?? "Unknown";
    console.log(`[Steam] Player: ${screenName}`);
    return true;
  } catch (err) {
    console.log(`[Steam] Greenworks not available: ${err.message}`);
    return false;
  }
}

function seedE2ECloudFiles() {
  const seedDirectory = process.env.MEGACITY_E2E_CLOUD_SEED_DIR;
  const seedPath = process.env.MEGACITY_E2E_CLOUD_SEED_PATH;
  if (!seedDirectory && !seedPath) return;
  if (steam?.type !== "steamworks.js") {
    throw new Error(
      "MEGACITY_E2E_CLOUD_SEED_DIR/MEGACITY_E2E_CLOUD_SEED_PATH requires the real steamworks.js backend",
    );
  }

  let seeds;
  if (seedDirectory) {
    const directory = path.resolve(seedDirectory);
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      throw new Error(`Steam Cloud seed directory does not exist: ${directory}`);
    }
    seeds = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => ({
        filename: entry.name,
        data: fs.readFileSync(path.join(directory, entry.name), "utf8"),
      }));
    if (seeds.length === 0) {
      throw new Error(`Steam Cloud seed directory is empty: ${directory}`);
    }
  } else {
    const filename = process.env.MEGACITY_E2E_CLOUD_SEED_FILENAME;
    if (!filename || filename !== path.basename(filename)) {
      throw new Error(
        "MEGACITY_E2E_CLOUD_SEED_FILENAME must be a plain filename",
      );
    }
    seeds = [{
      filename,
      data: fs.readFileSync(path.resolve(seedPath), "utf8"),
    }];
  }

  for (const seed of seeds) {
    if (
      !seed.filename ||
      seed.filename === "." ||
      seed.filename === ".." ||
      seed.filename !== path.basename(seed.filename)
    ) {
      throw new Error(
        `Steam Cloud seed filename must be a plain filename: ${seed.filename}`,
      );
    }
  }

  const accountCloudEnabled = steam.cloud.isEnabledForAccount?.() ?? true;
  const appCloudEnabled = steam.cloud.isEnabledForApp?.() ?? true;
  if (!accountCloudEnabled || !appCloudEnabled) {
    throw new Error("Steam Cloud is not enabled for the release test account/app");
  }

  const files = steam.cloud.listFiles?.() ?? [];
  const seedFilenames = new Set(seeds.map((seed) => seed.filename));
  const unexpectedFiles = files
    .map((file) => (typeof file === "string" ? file : file?.name))
    .filter((name) => typeof name === "string" && !seedFilenames.has(name));
  if (unexpectedFiles.length > 0) {
    throw new Error(
      `dedicated Steam Cloud account is not empty; unexpected files: ${unexpectedFiles.join(", ")}`,
    );
  }

  for (const seed of seeds) {
    steam.cloud.deleteFile(seed.filename);
    if (!steam.cloud.writeFile(seed.filename, seed.data)) {
      throw new Error(`Steam Cloud seed write failed for ${seed.filename}`);
    }
  }
  console.log(
    `[Steam] seeded ${seeds.length} disposable Cloud file(s): ${seeds
      .map((seed) => `${seed.filename} (${Buffer.byteLength(seed.data, "utf8")} bytes)`)
      .join(", ")}`,
  );
  e2eCloudSeedFilenames = seeds.map((seed) => seed.filename);
}

function initSteam() {
  if (initE2ECloudFixture()) {
    if (process.env.MEGACITY_E2E_REQUIRE_STEAMWORKS === "1") {
      throw new Error("the release Cloud check requires real steamworks.js");
    }
    steamInitialized = true;
    return;
  }
  if (initSteamworksJS()) {
    seedE2ECloudFiles();
    steamInitialized = true;
    return;
  }
  if (process.env.MEGACITY_E2E_REQUIRE_STEAMWORKS === "1") {
    throw new Error("real steamworks.js did not initialize on the release runner");
  }
  if (initGreenworksFallback()) {
    steamInitialized = true;
    return;
  }
  console.log("[Steam] No Steam SDK available — running in offline mode");
}

// Capture the current window contents, normalize to exactly 1920×1080 (the
// Steam store screenshot size; the window is 16:9 by default so this scales
// without distortion), and write a timestamped PNG into a "MEGACITY
// Screenshots" folder inside the OS Pictures directory. Returns { ok, path }
// on success or { ok:false, error } on any failure. Independent of the Steam
// SDK so it works in offline mode too.
async function captureAndSaveScreenshot() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, error: "no-window" };
    }
    const image = await mainWindow.webContents.capturePage();
    const resized = image.resize({ width: 1920, height: 1080, quality: "best" });
    const png = resized.toPNG();
    if (!png || png.length === 0) {
      return { ok: false, error: "empty-capture" };
    }
    const dir = getScreenshotsDirectory();
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    // Include milliseconds so two captures in the same second don't overwrite
    // each other (e.g. a quick double-tap of F9).
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${ms}`;
    const filePath = path.join(dir, `MEGACITY-${stamp}.png`);
    fs.writeFileSync(filePath, png);
    console.log(`[Screenshot] saved ${filePath}`);
    return { ok: true, path: filePath };
  } catch (err) {
    console.error(`[Screenshot] capture failed: ${err?.message ?? err}`);
    return { ok: false, error: String(err?.message ?? err) };
  }
}

// Inject a small, self-removing on-screen confirmation toast directly into the
// renderer from the main process. Used by the global F9 handler so the player
// gets feedback on EVERY screen (title, menus, in-game) — the in-app React
// toast only exists inside game routes. Fully self-contained and wrapped in
// try/catch so it can never break the page.
function showCaptureFeedback(res) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const ok = !!(res && res.ok);
  const msg = ok
    ? "Screenshot saved to Pictures\\MEGACITY Screenshots"
    : `Screenshot failed${res && res.error ? `: ${res.error}` : ""}`;
  const payload = JSON.stringify({ msg, ok });
  const js = `(function(){try{
    var d=${payload};
    var id="__megacity_shot_toast__";
    var prev=document.getElementById(id); if(prev){prev.remove();}
    var el=document.createElement("div"); el.id=id;
    el.textContent=d.msg;
    var s=el.style;
    s.position="fixed"; s.left="50%"; s.bottom="32px";
    s.transform="translateX(-50%)"; s.zIndex="2147483647";
    s.background=d.ok?"#1B5E20":"#7F1D1D"; s.color="#FFFFFF";
    s.font="600 13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif";
    s.padding="10px 16px"; s.borderRadius="6px";
    s.boxShadow="0 4px 16px rgba(0,0,0,0.45)"; s.pointerEvents="none";
    s.opacity="0"; s.transition="opacity .2s ease";
    (document.body||document.documentElement).appendChild(el);
    requestAnimationFrame(function(){el.style.opacity="1";});
    setTimeout(function(){el.style.opacity="0";setTimeout(function(){try{el.remove();}catch(e){}},320);},2200);
  }catch(e){}})();`;
  mainWindow.webContents.executeJavaScript(js).catch(() => {});
}

function registerIpcHandlers() {
  if (steamHandlersRegistered) return;
  steamHandlersRegistered = true;

  // Deliberately expose status only; renderer code never receives a path,
  // manifest contents, or a filesystem primitive.
  ipcMain.handle("release-integrity-status", async () => ({ ...releaseIntegrityStatus }));

  ipcMain.handle("steam-set-achievement", async (_event, name) => {
    if (!releaseIntegrityStatus.trusted || !steam) return false;
    try {
      if (steam.type === "steamworks.js") {
        return steam.achievement.activate(name);
      }
      await promisifyGW(steam.gw.activateAchievement.bind(steam.gw), name);
      return true;
    } catch { return false; }
  });

  ipcMain.handle("steam-clear-achievement", async (_event, name) => {
    if (!releaseIntegrityStatus.trusted || !steam) return false;
    try {
      if (steam.type === "steamworks.js") {
        return steam.achievement.clear(name);
      }
      await promisifyGW(steam.gw.clearAchievement.bind(steam.gw), name);
      return true;
    } catch { return false; }
  });

  ipcMain.handle("steam-get-achievement", async (_event, name) => {
    if (!releaseIntegrityStatus.trusted || !steam) return false;
    try {
      if (steam.type === "steamworks.js") {
        return steam.achievement.isActivated(name);
      }
      return await promisifyGW(steam.gw.getAchievement.bind(steam.gw), name);
    } catch { return false; }
  });

  ipcMain.handle("steam-store-stats", async () => {
    if (!releaseIntegrityStatus.trusted || !steam) return false;
    try {
      if (steam.type === "steamworks.js") {
        steam.client.stats?.store?.();
        return true;
      }
      await promisifyGW(steam.gw.storeStats.bind(steam.gw));
      return true;
    } catch { return false; }
  });

  ipcMain.handle("steam-get-id", async () => {
    if (!steam) return "unknown";
    try {
      if (steam.type === "steamworks.js") {
        return steam.client.localplayer?.getSteamId?.()?.steamId64 ?? "unknown";
      }
      return steam.gw.getSteamId?.()?.steamId ?? "unknown";
    } catch { return "unknown"; }
  });

  ipcMain.handle("steam-is-initialized", async () => steamInitialized);

  ipcMain.handle("steam-cloud-write", async (_event, filename, data) => {
    if (!steam) return false;
    // Throw on bad input so programming bugs (e.g. an upstream stringify
    // returning undefined) aren't indistinguishable from a Steam outage.
    if (typeof filename !== "string" || !filename) {
      throw new TypeError(`steam-cloud-write: filename must be a non-empty string (got ${typeof filename})`);
    }
    if (typeof data !== "string") {
      throw new TypeError(`steam-cloud-write: data must be a string (got ${typeof data})`);
    }
    try {
      if (steam.type === "steamworks.js") {
        return steam.cloud.writeFile(filename, data);
      }
      if (steam.type === "e2e-cloud-fixture") {
        return steam.cloud.writeFile(filename, Buffer.from(data, "utf-8"));
      }
      await promisifyGW(steam.gw.saveTextToFile.bind(steam.gw), filename, data);
      return true;
    } catch { return false; }
  });

  ipcMain.handle("steam-cloud-read", async (_event, filename) => {
    if (!steam) return null;
    try {
      if (steam.type === "steamworks.js") {
        const raw = steam.cloud.readFile(filename);
        return raw == null ? null : String(raw);
      }
      if (steam.type === "e2e-cloud-fixture") {
        const buf = steam.cloud.readFile(filename);
        return buf ? buf.toString("utf-8") : null;
      }
      return await promisifyGW(steam.gw.readTextFromFile.bind(steam.gw), filename);
    } catch { return null; }
  });

  ipcMain.handle("steam-cloud-delete", async (_event, filename) => {
    if (!steam) return false;
    try {
      if (steam.type === "steamworks.js") {
        return steam.cloud.deleteFile(filename);
      }
      if (steam.type === "e2e-cloud-fixture") {
        return steam.cloud.deleteFile(filename);
      }
      await promisifyGW(steam.gw.deleteFile.bind(steam.gw), filename);
      return true;
    } catch { return false; }
  });

  ipcMain.handle("steam-cloud-exists", async (_event, filename) => {
    if (!steam) return false;
    try {
      if (steam.type === "steamworks.js") {
        return steam.cloud.fileExists?.(filename) ??
          steam.cloud.isFileExists?.(filename) ??
          false;
      }
      if (steam.type === "e2e-cloud-fixture") {
        return steam.cloud.isFileExists(filename);
      }
      if (!steam.gw.isCloudEnabledForUser()) return false;
      await promisifyGW(steam.gw.readTextFromFile.bind(steam.gw), filename);
      return true;
    } catch { return false; }
  });

  ipcMain.handle("steam-cloud-count", async () => {
    if (!steam) return 0;
    try {
      if (steam.type === "steamworks.js") {
        return steam.cloud.listFiles?.().length ??
          steam.cloud.getFileCount?.() ??
          steam.cloud.fileCount?.() ??
          0;
      }
      if (steam.type === "e2e-cloud-fixture") {
        return steam.cloud.getFileCount();
      }
      return steam.gw.getFileCount?.() ?? 0;
    } catch { return 0; }
  });

  ipcMain.handle("steam-cloud-enabled", async () => {
    if (!steam) return false;
    try {
      if (steam.type === "steamworks.js") {
        const accountEnabled = steam.cloud.isEnabledForAccount?.() ?? true;
        const appEnabled = steam.cloud.isEnabledForApp?.() ?? true;
        return accountEnabled && appEnabled;
      }
      if (steam.type === "e2e-cloud-fixture") {
        return steam.cloud.isCloudEnabledForApp();
      }
      return steam.gw.isCloudEnabled() && steam.gw.isCloudEnabledForUser();
    } catch { return false; }
  });

  ipcMain.on("steam-rich-presence-set", (_event, key, value) => {
    if (!steam) return;
    try {
      if (steam.type === "steamworks.js") {
        const friends = steam.client.friends ?? steam.client.localplayer;
        if (friends?.setRichPresence) {
          friends.setRichPresence(key, value);
        }
        return;
      }
      steam.gw.setRichPresence?.(key, value);
    } catch {}
  });

  ipcMain.on("steam-rich-presence-clear", () => {
    if (!steam) return;
    try {
      if (steam.type === "steamworks.js") {
        const friends = steam.client.friends ?? steam.client.localplayer;
        if (friends?.clearRichPresence) {
          friends.clearRichPresence();
        }
        return;
      }
      steam.gw.clearRichPresence?.();
    } catch {}
  });

  ipcMain.handle("steam-set-stat", async (_event, name, value) => {
    if (!releaseIntegrityStatus.trusted || !steam) return false;
    try {
      if (steam.type === "steamworks.js") {
        steam.client.stats?.setInt?.(name, Math.floor(value));
        return true;
      }
      await promisifyGW(steam.gw.setStat.bind(steam.gw), name, value);
      return true;
    } catch { return false; }
  });

  ipcMain.handle("steam-get-stat", async (_event, name) => {
    if (!releaseIntegrityStatus.trusted || !steam) return 0;
    try {
      if (steam.type === "steamworks.js") {
        return steam.client.stats?.getInt?.(name) ?? 0;
      }
      return await promisifyGW(steam.gw.getStat.bind(steam.gw), name);
    } catch { return 0; }
  });

  // Renderer-side screenshot path (kept for the web preview / back-compat).
  // The desktop F9 hotkey is handled globally in the main process via
  // before-input-event (see createWindow) so it fires on every screen; this
  // IPC handler just reuses the same capture routine.
  ipcMain.handle("capture-screenshot", async () => captureAndSaveScreenshot());

  ipcMain.handle("open-screenshots-folder", async () => {
    try {
      const dir = getScreenshotsDirectory();
      fs.mkdirSync(dir, { recursive: true });
      const error = await shell.openPath(dir);
      if (error) {
        console.error(`[Screenshot] folder open failed: ${error}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`[Screenshot] folder open failed: ${err?.message ?? err}`);
      return false;
    }
  });

  // ── Desktop shell controls (Task #532) ─────────────────────────────────

  // Live close-guard inputs from the renderer. Strict boolean coercion so a
  // malformed payload fails safe (not running / guard on).
  ipcMain.on("close-guard-state", (_event, state) => {
    closeGuardState = {
      simRunning: state?.simRunning === true,
      confirmOnClose: state?.confirmOnClose !== false,
    };
  });

  // Explicit in-app quit (QUIT GAME / QUIT TO DESKTOP buttons). The player
  // already confirmed — and saved, if they chose to — inside the game UI, so
  // mark the quit confirmed BEFORE closing to bypass the close-guard dialog.
  ipcMain.on("app-quit-request", () => {
    quitConfirmed = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    } else {
      app.quit();
    }
  });

  // Whole-window UI scale. Chromium's real zoom factor, so the layout
  // reflows exactly like a smaller window (unlike CSS transforms). Clamped
  // to the settings range plus a little headroom; anything else is ignored.
  ipcMain.on("set-zoom-factor", (_event, factor) => {
    const z = Number(factor);
    if (!Number.isFinite(z) || z < 1 || z > 2) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try { mainWindow.webContents.setZoomFactor(z); } catch {}
  });
}

// Clamp persisted x/y so the window never opens off-screen after the
// user unplugs an external monitor or changes display topology. Returns
// the input bounds with x/y set to undefined (= OS-default placement)
// when the saved position lies outside every connected display.
function clampBoundsToDisplays(ws) {
  if (ws.x === undefined || ws.y === undefined) return ws;
  try {
    const { screen } = require("electron");
    const displays = screen.getAllDisplays();
    const fitsSomewhere = displays.some(d => {
      const wa = d.workArea;
      // Require a reasonable visible portion (at least 100px) on a
      // display, not just a single pixel of overlap.
      return ws.x + Math.min(ws.width, 100) > wa.x
        && ws.x < wa.x + wa.width - 100
        && ws.y + 50 > wa.y
        && ws.y < wa.y + wa.height - 50;
    });
    if (!fitsSomewhere) return { ...ws, x: undefined, y: undefined };
  } catch {
    return { ...ws, x: undefined, y: undefined };
  }
  return ws;
}

function createWindow() {
  const ws = clampBoundsToDisplays(loadWindowState());
  mainWindow = new BrowserWindow({
    width: ws.width,
    height: ws.height,
    x: ws.x,
    y: ws.y,
    minWidth: 800,
    minHeight: 600,
    title: "MEGACITY",
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#0A0F0A",
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      // DevTools are disabled entirely in the shipped build so players
      // cannot open the console and edit live game state (money, stats,
      // saves). Development keeps them for debugging. This also neuters the
      // Ctrl+Shift+I / menu-role shortcuts — Electron refuses to open
      // DevTools at all when this is false.
      devTools: process.env.NODE_ENV === "development",
    },
  });

  if (ws.isMaximized) mainWindow.maximize();
  if (ws.isFullScreen) mainWindow.setFullScreen(true);

  // Load the bundle ROOT (path "/"), not "/index.html". The Expo web export
  // is a single-page app whose router resolves the initial route from the URL
  // path; "/index.html" matches no route and shows the not-found screen,
  // whereas "/" resolves to the home route.
  // The packaged Electron smoke test can opt into a deterministic demo route
  // without changing the shipped launch experience. Keep this query injection
  // environment-gated so arbitrary deep links never become part of production.
  const e2eQuery = process.env.MEGACITY_E2E_QUERY;
  const e2eRoute = process.env.MEGACITY_E2E_ROUTE?.replace(/^\/+/, "").replace(/\/+$/, "");
  const launchPath = e2eRoute ? `${APP_SCHEME}://bundle/${e2eRoute}` : `${APP_SCHEME}://bundle/`;
  const launchUrl = e2eQuery
    ? `${launchPath}?${e2eQuery.replace(/^[?&]+/, "")}`
    : launchPath;
  mainWindow.loadURL(launchUrl);

  // If the bundle fails to load (missing web-build, corrupt install,
  // permission error), show an in-window error page instead of leaving
  // the player staring at a black window. Ignore frame-level navigation
  // aborts (errorCode -3) which fire on legitimate redirects.
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    const msg = `Failed to load MEGACITY (code ${errorCode}: ${errorDescription})\n\n${validatedURL}`;
    console.error(`[Window] ${msg}`);
    // errorDescription and validatedURL come from Chromium's did-fail-load
    // callback and can technically be influenced by a malicious server
    // response. Escape both before interpolating into the HTML error page
    // so a hostile string can't inject script/markup into our window.
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
    const html = `<html><body style="background:#0A0F0A;color:#E0E0E0;font-family:system-ui;padding:40px;">
      <h1 style="color:#FF6B6B;">MEGACITY failed to start</h1>
      <p>${esc(errorDescription)} (code ${esc(errorCode)})</p>
      <p style="color:#888;font-size:12px;">${esc(validatedURL)}</p>
      <p>Try reinstalling the game, or contact support if this persists.</p>
    </body></html>`;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });

  // Lock the renderer to its initial document. Stray window.location
  // assignments or accidental link clicks from third-party content can
  // strand the player on a blank page; force any non-file navigation to
  // open in the user's default browser instead.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://`) && !url.startsWith("file://")) {
      event.preventDefault();
      try { require("electron").shell.openExternal(url); } catch {}
    }
  });

  // Global in-game screenshot hotkeys (F9 and F12). Handled here in the main
  // process — not the React layer — so they fire on EVERY screen (title, menus,
  // in-game) and regardless of which element has focus. The renderer's hotkey
  // provider only mounts inside game routes, which is why F9 appeared dead
  // elsewhere. preventDefault stops the key from also reaching the page, so the
  // renderer's own F9 binding never double-fires.
  //
  // F12 is Steam's own screenshot key, normally handled by the Steam overlay.
  // The overlay frequently fails to inject into Electron/Chromium apps, in
  // which case Steam never grabs F12 and the keypress reaches us — so we treat
  // F12 as a screenshot trigger too, giving the player a reliable capture
  // either way. (If the overlay IS working, Steam consumes F12 before we see
  // it and captures into the Steam library as usual.) F12 capture is gated to
  // non-development so F12 still toggles DevTools while developing.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat) return;
    const isF9 = input.key === "F9" || input.code === "F9";
    const isF12 =
      (input.key === "F12" || input.code === "F12") &&
      process.env.NODE_ENV !== "development";
    if (isF9 || isF12) {
      event.preventDefault();
      captureAndSaveScreenshot().then(showCaptureFeedback);
    }
  });

  // Debounced persist on resize/move; persist immediately on state
  // changes (maximize/unmaximize/fullscreen) and on close.
  let persistTimer = null;
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => saveWindowState(mainWindow), 400);
  };
  mainWindow.on("resize", schedulePersist);
  mainWindow.on("move", schedulePersist);
  mainWindow.on("maximize", () => saveWindowState(mainWindow));
  mainWindow.on("unmaximize", () => saveWindowState(mainWindow));
  mainWindow.on("enter-full-screen", () => saveWindowState(mainWindow));
  mainWindow.on("leave-full-screen", () => saveWindowState(mainWindow));
  mainWindow.on("close", () => saveWindowState(mainWindow));

  // Window-close guard (Task #532). Replaces the renderer's old beforeunload
  // veto, which Electron honored SILENTLY — clicking [X] while the sim ran
  // appeared to do nothing until the player paused first. Here we intercept
  // the close in the main process and show a real native confirm dialog;
  // confirming closes the window without requiring a pause. The renderer's
  // beforeunload guard is skipped inside the Electron shell (see
  // hooks/useDesktopPolish.ts) so the two mechanisms never stack.
  mainWindow.on("close", (event) => {
    if (!shouldConfirmClose({ ...closeGuardState, quitConfirmed })) return;
    event.preventDefault();
    if (closeDialogOpen) return; // dialog already up — swallow repeat [X] clicks
    closeDialogOpen = true;
    dialog
      .showMessageBox(mainWindow, {
        type: "warning",
        title: "MEGACITY",
        message: "Simulation running",
        detail:
          "The simulation is still running. Progress since the last save will be lost. Quit anyway?",
        buttons: ["Cancel", "Quit Anyway"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      .then(({ response }) => {
        closeDialogOpen = false;
        if (response === 1) {
          quitConfirmed = true;
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
        }
      })
      .catch(() => {
        // Dialog failure must never wedge the window in an unclosable state:
        // treat it as a confirmed quit so the next [X] click closes cleanly.
        closeDialogOpen = false;
        quitConfirmed = true;
      });
  });

  mainWindow.on("closed", () => {
    if (persistTimer) clearTimeout(persistTimer);
    mainWindow = null;
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require("electron").shell.openExternal(url);
    return { action: "deny" };
  });
}

app.on("ready", () => {
  // Check the immutable release payload before creating a renderer. The
  // verifier is intentionally fail-open for unpackaged development builds;
  // packaged failures remain playable but disable achievement/stat writes and
  // are surfaced by the renderer.
  try {
    releaseIntegrityStatus = verifyReleaseIntegrity(__dirname, {
      isPackaged: app.isPackaged,
    });
    if (!releaseIntegrityStatus.trusted) {
      console.warn(`[Release] integrity check failed: ${releaseIntegrityStatus.reason}`);
    }
  } catch (err) {
    releaseIntegrityStatus = {
      mode: app.isPackaged ? "packaged" : "unpackaged",
      trusted: app.isPackaged !== true,
      reason: app.isPackaged ? "verification-error" : "development-exempt",
      version: null,
      build: null,
      manifestVersion: null,
    };
    console.error(`[Release] integrity verifier failed: ${err?.message ?? err}`);
  }
  // Belt-and-braces: a throw in any of these would leave the user with
  // no window at all on Steam. Each step is independently recoverable —
  // Steam init failure must not block the window from opening.
  try { initSteam(); } catch (err) {
    console.error(`[Steam] init failed, continuing without Steam: ${err?.message ?? err}`);
  }
  try { registerIpcHandlers(); } catch (err) {
    console.error(`[Steam] handler registration failed: ${err?.message ?? err}`);
  }
  try { registerAppProtocol(); } catch (err) {
    console.error(`[Protocol] app:// registration failed: ${err?.message ?? err}`);
  }
  try {
    createWindow();
  } catch (err) {
    console.error(`[Window] createWindow failed: ${err?.message ?? err}`);
    app.quit();
    return;
  }

  if (steamInitialized && steam?.type === "steamworks.js") {
    overlayCallbackInterval = setInterval(() => {
      try { steam.client.runCallbacks?.(); } catch {}
    }, 100);
  }
});

app.on("window-all-closed", () => {
  if (overlayCallbackInterval) clearInterval(overlayCallbackInterval);
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

app.on("before-quit", () => {
  if (overlayCallbackInterval) {
    clearInterval(overlayCallbackInterval);
    overlayCallbackInterval = null;
  }
  if (e2eCloudSeedFilenames.length > 0 && steam?.type === "steamworks.js") {
    for (const filename of e2eCloudSeedFilenames) {
      try {
        steam.cloud.deleteFile(filename);
        console.log(`[Steam] removed disposable Cloud file ${filename}`);
      } catch {}
    }
    e2eCloudSeedFilenames = [];
  }
});
