// Real-screen regression for the Mexico City world-map marker and detail sheet.
// The demo fixture is read-only and must not create or promote a player save.
//
// Requires the "artifacts/megacity: expo" workflow.

import { execSync } from "node:child_process";
import LZString from "lz-string";
import puppeteer from "puppeteer";

const { decompressFromUTF16 } = LZString;
const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const EXPORT_URL =
  `${BASE_URL}/?demo=1&go=worldmap&worldmaprestore=1&worldmaprestorereload=export`;
const RESTORE_URL =
  `${BASE_URL}/?demo=1&go=worldmap&worldmaprestore=1&worldmaprestorereload=restore`;
const FULL_BACKUP_EXPORT_URL =
  `${BASE_URL}/?demo=1&go=worldmap&worldmaprestore=1&worldmaprestorereload=full-backup-export`;
const FULL_BACKUP_RESTORE_URL =
  `${BASE_URL}/?demo=1&go=worldmap&worldmaprestore=1&worldmaprestorereload=full-backup-restore`;
const CLOUD_SAVE_URL =
  `${BASE_URL}/?demo=1&go=worldmap&worldmaprestore=1&worldmaprestorereload=cloud-save`;
const CLOUD_LOAD_URL =
  `${BASE_URL}/?demo=1&go=worldmap&worldmaprestore=1&worldmaprestorereload=cloud-load`;
const FIXTURE_SLOT_KEY = "@megacity_e2e_worldmap_export_restore_1";
const FIXTURE_EXPORT_KEY = "@megacity_e2e_worldmap_export_restore_export";
const FULL_BACKUP_FIXTURE_SLOT_KEY = "@megacity_e2e_worldmap_full_backup_1";
const FULL_BACKUP_FIXTURE_EXPORT_KEY = "@megacity_e2e_worldmap_full_backup_export";
const CLOUD_FIXTURE_SLOT_KEY = "@megacity_e2e_worldmap_cloud_restore_1";
const CLOUD_FIXTURE_STORAGE_PREFIX = "@megacity_e2e_worldmap_cloud_restore_cloud_";
const CLOUD_SYNC_BASELINE_KEY = "@megacity_cloud_sync_baseline";
const VIEWPORT_WIDTH = Number(process.env.E2E_VIEWPORT_WIDTH ?? 1400);
const VIEWPORT_HEIGHT = Number(process.env.E2E_VIEWPORT_HEIGHT ?? 900);
const IS_PHONE_VIEWPORT = VIEWPORT_WIDTH < 600;
const SCREENSHOT_PATH = process.env.E2E_SCREENSHOT_PATH;
const RENAMED_LOCATION_INTEL = [
  {
    id: "dusthaven",
    event: "legacy-dusthaven-discovery",
    retired: "Dusthaven",
    current: "Mexico City",
    type: "township",
  },
  {
    id: "iron-khanate",
    event: "legacy-iron-khanate-discovery",
    retired: "Iron Khanate",
    current: "LA CITY",
    type: "megacity",
  },
  {
    id: "nova-pacifica",
    event: "legacy-nova-pacifica-discovery",
    retired: "Nova Pacifica",
    current: "Megacity Pacifica",
    type: "megacity",
  },
  {
    id: "crimson-reach",
    event: "legacy-crimson-reach-discovery",
    retired: "Crimson Reach",
    current: "Red Mesa",
    type: "megacity",
  },
  {
    id: "cheyenne-mountain",
    event: "legacy-cheyenne-mountain-discovery",
    retired: "Cheyenne Mountain",
    current: "USR (United States Remnants)",
    type: "notable",
  },
];

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function visibleText(page, text) {
  return page.evaluate((target) => {
    const needle = target.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
      const rect = node.parentElement?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }, text);
}

async function visibleTextInTestId(page, testId, text) {
  return page.evaluate(
    ({ targetId, targetText }) => {
      const element = document.querySelector(`[data-testid="${CSS.escape(targetId)}"]`);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (element.textContent ?? "").includes(targetText);
    },
    { targetId: testId, targetText: text },
  );
}

async function waitForVisibleText(page, text, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text: ${text}; current URL: ${page.url()}`);
}

async function visibleAccessibleNode(page, label) {
  return page.evaluate((target) => {
    const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, label);
}

async function waitForVisibleAccessibleNode(page, label, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleAccessibleNode(page, label)) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for accessible node: ${label}; current URL: ${page.url()}`);
}

async function visibleTestId(page, testId) {
  return page.evaluate((target) => {
    const element = document.querySelector(`[data-testid="${CSS.escape(target)}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, testId);
}

async function waitForVisibleTestId(page, testId, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleTestId(page, testId)) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible test id: ${testId}; current URL: ${page.url()}`);
}

async function waitForStorageKey(page, key, timeout = 120_000) {
  await page.waitForFunction(
    (storageKey) => Boolean(window.localStorage.getItem(storageKey)),
    { timeout },
    key,
  );
  const value = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
  if (!value) throw new Error(`Fixture did not retain storage key: ${key}`);
  return value;
}

async function visibleTestIdPrefixCount(page, prefix) {
  return page.$$eval(`[data-testid^="${prefix}"]`, (elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length,
  );
}

async function visibleRect(page, selector) {
  return page.$eval(selector, (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  });
}

function assertNear(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} was ${actual}, expected ${expected} ±${tolerance}`);
  }
}

async function clickAccessibleNode(page, label) {
  const clicked = await page.evaluate((target) => {
    const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not click visible accessibility label: ${label}`);
}

async function clickAccessibleNodeRepeatedly(page, label, count) {
  for (let index = 0; index < count; index += 1) {
    await clickAccessibleNode(page, label);
    await sleep(300);
  }
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((target) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if ((node.textContent ?? "").trim() !== target) continue;
      const element = node.parentElement;
      const rect = element?.getBoundingClientRect();
      if (!element || !rect || rect.width <= 0 || rect.height <= 0) continue;
      element.click();
      return true;
    }
    return false;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function assertNoPlayerSaveStorage(page) {
  const saveKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter(
      (key) =>
        key.startsWith("@megacity_slot_") ||
        key === "@megacity_save" ||
        key === "@megacity_profiles_index" ||
        key.startsWith("@megacity_profile_") ||
        key === "@megacity_active_profile",
    ),
  );
  if (saveKeys.length) {
    throw new Error(`Mexico City map fixture touched player save storage: ${JSON.stringify(saveKeys)}`);
  }
}

function decodeFixtureSlot(raw) {
  const envelope = JSON.parse(raw);
  const json = envelope.v === 2
    ? decompressFromUTF16(envelope.data)
    : envelope.data;
  if (!json) throw new Error("World-map export/restore fixture slot could not be decompressed");
  return JSON.parse(json);
}

async function installCloudFixtureBridge(page) {
  await page.evaluateOnNewDocument(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("demo") !== "1" ||
      params.get("worldmaprestore") !== "1" ||
      !["cloud-save", "cloud-load"].includes(params.get("worldmaprestorereload") ?? "")
    ) {
      return;
    }

    const storagePrefix = "@megacity_e2e_worldmap_cloud_restore_cloud_";
    const storageKey = (filename) => `${storagePrefix}${filename}`;
    const cloud = {
      writeFile: (filename, data) => {
        window.localStorage.setItem(storageKey(filename), data);
        return true;
      },
      readFile: (filename) => window.localStorage.getItem(storageKey(filename)),
      deleteFile: (filename) => {
        window.localStorage.removeItem(storageKey(filename));
        return true;
      },
      fileExists: (filename) => window.localStorage.getItem(storageKey(filename)) !== null,
      getFileCount: () =>
        Object.keys(window.localStorage).filter((key) => key.startsWith(storagePrefix)).length,
      getFileSize: (filename) => window.localStorage.getItem(storageKey(filename))?.length ?? 0,
      isCloudEnabled: () => true,
    };

    window.steamworks = {
      isInitialized: () => true,
      setAchievement: () => true,
      clearAchievement: () => true,
      getAchievement: () => false,
      storeStats: () => true,
      getSteamId: () => "e2e-worldmap-cloud-restore",
      cloud,
    };
  });
}

async function removeCloudFixtureStorage(page) {
  await page.evaluate(({ key, cloudPrefix, baselineKey }) => {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}_backup`);
    window.localStorage.removeItem(`${key}.tmp`);
    for (const candidate of Object.keys(window.localStorage)) {
      if (candidate.startsWith(cloudPrefix)) window.localStorage.removeItem(candidate);
    }
    const rawBaseline = window.localStorage.getItem(baselineKey);
    if (!rawBaseline) return;
    try {
      const baseline = JSON.parse(rawBaseline);
      delete baseline[key];
      if (Object.keys(baseline).length === 0) {
        window.localStorage.removeItem(baselineKey);
      } else {
        window.localStorage.setItem(baselineKey, JSON.stringify(baseline));
      }
    } catch {
      window.localStorage.removeItem(baselineKey);
    }
  }, {
    key: CLOUD_FIXTURE_SLOT_KEY,
    cloudPrefix: CLOUD_FIXTURE_STORAGE_PREFIX,
    baselineKey: CLOUD_SYNC_BASELINE_KEY,
  });
}

async function assertCloudFixtureStorageRemoved(page) {
  const remaining = await page.evaluate(({ key, cloudPrefix, baselineKey }) => {
    const baseline = window.localStorage.getItem(baselineKey);
    return {
      local: Object.keys(window.localStorage).filter(
        (candidate) =>
          candidate === key ||
          candidate === `${key}_backup` ||
          candidate === `${key}.tmp`,
      ),
      cloud: Object.keys(window.localStorage).filter((candidate) => candidate.startsWith(cloudPrefix)),
      baselineEntry: baseline ? (() => {
        try {
          return Object.prototype.hasOwnProperty.call(JSON.parse(baseline), key);
        } catch {
          return true;
        }
      })() : false,
    };
  }, {
    key: CLOUD_FIXTURE_SLOT_KEY,
    cloudPrefix: CLOUD_FIXTURE_STORAGE_PREFIX,
    baselineKey: CLOUD_SYNC_BASELINE_KEY,
  });
  if (remaining.local.length || remaining.cloud.length || remaining.baselineEntry) {
    throw new Error(`World-map cloud fixture cleanup left storage behind: ${JSON.stringify(remaining)}`);
  }
}

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  timeout: 120_000,
  protocolTimeout: 120_000,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});

let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  const pageErrors = [];
  page.on("pageerror", (error) => {
    if (!/AbortError/.test(String(error))) pageErrors.push(String(error));
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404|AbortError/.test(message.text())) {
      pageErrors.push(message.text());
    }
  });

  await page.goto(EXPORT_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForVisibleText(page, "WORLD MAP");
  const exported = await waitForStorageKey(page, FIXTURE_EXPORT_KEY);
  const exportedEnvelope = JSON.parse(exported);
  const exportedDusthaven = exportedEnvelope.state?.townships?.find((township) => township.id === "dusthaven");
  if (exportedDusthaven?.name !== "Dusthaven") {
    throw new Error("World-map export fixture did not preserve the legacy Mexico City payload before restore");
  }
  for (const location of RENAMED_LOCATION_INTEL) {
    const entry = exportedEnvelope.state?.worldEventLog?.find((candidate) => candidate.revealed === location.id);
    if (
      entry?.title !== `Legacy ${location.retired} location record` ||
      !String(entry?.description ?? "").includes(location.retired)
    ) {
      throw new Error(`World-map export fixture did not preserve legacy ${location.retired} intel before restore`);
    }
  }
  await page.evaluate((slotKey) => {
    window.localStorage.removeItem(slotKey);
    window.localStorage.removeItem(`${slotKey}_backup`);
    window.localStorage.removeItem(`${slotKey}.tmp`);
  }, FIXTURE_SLOT_KEY);
  await page.goto(RESTORE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForVisibleText(page, "WORLD MAP");
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout: 120_000 },
    FIXTURE_SLOT_KEY,
  );
  const restoredRaw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_SLOT_KEY);
  if (!restoredRaw) throw new Error("World-map restore fixture did not retain its isolated slot");
  const restoredState = decodeFixtureSlot(restoredRaw);
  const restoredDusthaven = restoredState.townships?.find((township) => township.id === "dusthaven");
  if (
    restoredDusthaven?.id !== "dusthaven" ||
    restoredDusthaven?.name !== "Mexico City" ||
    restoredDusthaven?.description !==
      "High-altitude capital and metropolitan trade hub in the Valley of Mexico, with major government, manufacturing, service, and transit networks."
  ) {
    throw new Error("World-map restore did not preserve the stable ID and current Mexico City presentation");
  }
  for (const location of RENAMED_LOCATION_INTEL) {
    const entry = restoredState.worldEventLog?.find((candidate) => candidate.revealed === location.id);
    if (
      entry?.title !== `Legacy ${location.current} location record` ||
      !String(entry?.description ?? "").includes(location.current) ||
      String(entry?.title ?? "").includes(location.retired) ||
      String(entry?.description ?? "").includes(location.retired)
    ) {
      throw new Error(`World-map restore did not canonicalize legacy ${location.retired} intel`);
    }
  }
  await waitForVisibleAccessibleNode(page, "Mexico City, township");
  if (await visibleText(page, "GOT IT")) {
    await clickVisibleText(page, "GOT IT");
    await sleep(300);
  }
  await clickAccessibleNode(page, "Open world intel log");
  await waitForVisibleText(page, "WORLD INTEL LOG");
  await waitForVisibleTestId(page, "world-map-event-log-revealed-dusthaven");
  for (const location of RENAMED_LOCATION_INTEL) {
    if (!(await visibleText(page, location.current))) {
      throw new Error(`World intel log does not resolve legacy ${location.retired} to ${location.current}`);
    }
    if (!(await visibleText(page, `Legacy ${location.current} location record`))) {
      throw new Error(`World intel log does not rewrite the legacy ${location.retired} event title`);
    }
    if (await visibleText(page, location.retired)) {
      throw new Error(`World intel log still renders the retired ${location.retired} location name`);
    }
  }
  await clickAccessibleNode(page, "Close world intel log");
  await page.waitForSelector('[data-testid="world-map-viewport"]');
  await page.waitForSelector('[data-testid="world-map-frame"]');

  const viewportBox = await visibleRect(page, '[data-testid="world-map-viewport"]');
  const frameBox = await visibleRect(page, '[data-testid="world-map-frame"]');
  if (frameBox.width <= 0 || frameBox.height <= 0 || Math.abs(frameBox.width - frameBox.height) > 3) {
    throw new Error(`World map frame is not a visible square: ${JSON.stringify(frameBox)}`);
  }
  if (
    frameBox.right <= viewportBox.left ||
    frameBox.left >= viewportBox.right ||
    frameBox.bottom <= viewportBox.top ||
    frameBox.top >= viewportBox.bottom
  ) {
    throw new Error(`World map frame does not intersect its viewport: ${JSON.stringify({ viewportBox, frameBox })}`);
  }
  if (frameBox.width < 1_150 || frameBox.width > 1_400) {
    throw new Error(`World map did not open at the intended closer framing: ${JSON.stringify({ viewportBox, frameBox })}`);
  }
  if (IS_PHONE_VIEWPORT) {
    const pageWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    if (
      pageWidth.scrollWidth > pageWidth.clientWidth + 1 ||
      pageWidth.bodyScrollWidth > pageWidth.clientWidth + 1
    ) {
      throw new Error(`Phone world map overflows horizontally: ${JSON.stringify(pageWidth)}`);
    }
  }

  if (!(await visibleAccessibleNode(page, "Mexico City, township"))) {
    throw new Error("World map is missing the visible Mexico City township marker");
  }
  if (await visibleText(page, "Dusthaven")) {
    throw new Error("World map still renders the retired Dusthaven presentation");
  }
  if (IS_PHONE_VIEWPORT) {
    await waitForVisibleTestId(page, "world-map-label-dusthaven");
    const mexicoLabel = await visibleRect(page, '[data-testid="world-map-label-dusthaven"]');
    if (
      mexicoLabel.left < viewportBox.left - 1 ||
      mexicoLabel.right > viewportBox.right + 1 ||
      mexicoLabel.top < viewportBox.top - 1 ||
      mexicoLabel.bottom > viewportBox.bottom + 1
    ) {
      throw new Error(`Mexico City label is clipped on the phone map: ${JSON.stringify({ viewportBox, mexicoLabel })}`);
    }
    await clickAccessibleNode(page, "Mexico City, township");
    await waitForVisibleText(page, "Mexico City municipal government");
    if (!(await visibleAccessibleNode(page, "Mexico City operational sheet"))) {
      throw new Error("Mexico City detail view is unreachable from the phone-sized map");
    }
    if (await visibleText(page, "Dusthaven")) {
      throw new Error("Phone Mexico City detail view still renders the retired Dusthaven presentation");
    }
    await clickAccessibleNode(page, "Close location details");
  }
  if (SCREENSHOT_PATH) {
    await page.screenshot({ path: SCREENSHOT_PATH });
  }
  const initialLabelCount = await visibleTestIdPrefixCount(page, "world-map-label-");
  if (initialLabelCount < 2 || initialLabelCount > 14) {
    throw new Error(`World map opening label count is not clean and informative: ${initialLabelCount}`);
  }
  if (await visibleTestIdPrefixCount(page, "world-map-route-danger-")) {
    throw new Error("World map shows route danger badges before the detail zoom threshold");
  }

  const markerBox = await page.$eval('[aria-label="Mexico City, township"]', (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const playerMarkerSelector = '[aria-label$=", player city"]';
  const playerMarkerLabel = await page.$eval(
    playerMarkerSelector,
    (element) => element.getAttribute("aria-label"),
  );
  if (!playerMarkerLabel || !(await visibleAccessibleNode(page, playerMarkerLabel))) {
    throw new Error("World map is missing the visible player-city marker");
  }

  if (!IS_PHONE_VIEWPORT) {
    await page.hover('[aria-label="Mexico City, township"]');
    const tooltipDeadline = Date.now() + 30_000;
    while (Date.now() < tooltipDeadline && !(await visibleTestId(page, "world-map-tooltip-dusthaven"))) {
      await sleep(100);
    }
    if (!(await visibleTestId(page, "world-map-tooltip-dusthaven"))) {
      throw new Error("Hovering the Mexico City marker did not show its tooltip");
    }
    if (await visibleText(page, "Dusthaven")) {
      throw new Error("Mexico City tooltip still renders the retired Dusthaven name");
    }

    await page.mouse.click(markerBox.x, markerBox.y, { button: "right" });
    await waitForVisibleText(page, "Open Mexico City Details");
    if (await visibleText(page, "Dusthaven")) {
      throw new Error("Mexico City context menu still renders the retired Dusthaven name");
    }
    await clickVisibleText(page, "Open Mexico City Details");
  }

  await clickAccessibleNodeRepeatedly(page, "Zoom in", 2);
  const expandedLabelCount = await visibleTestIdPrefixCount(page, "world-map-label-");
  if (expandedLabelCount <= initialLabelCount) {
    throw new Error(`Zooming in did not reveal additional location labels: ${initialLabelCount} -> ${expandedLabelCount}`);
  }
  if (!(await visibleTestIdPrefixCount(page, "world-map-route-danger-"))) {
    throw new Error("Zooming in did not reveal route danger badges");
  }
  await clickAccessibleNodeRepeatedly(page, "Zoom in", 2);
  if (!(await visibleTestIdPrefixCount(page, "world-map-route-detail-"))) {
    throw new Error("Deep zoom did not reveal route distance and cost details");
  }
  await clickAccessibleNodeRepeatedly(page, "Zoom out", 4);
  const restoredLabelCount = await visibleTestIdPrefixCount(page, "world-map-label-");
  if (restoredLabelCount !== initialLabelCount) {
    throw new Error(`Zooming back out did not restore the clean label set: ${initialLabelCount} -> ${restoredLabelCount}`);
  }
  const dragStart = {
    x: viewportBox.left + viewportBox.width / 2,
    y: viewportBox.top + viewportBox.height / 2,
  };
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 45, dragStart.y + 30, { steps: 4 });
  await page.mouse.up();
  await clickAccessibleNode(page, "Recenter map on player");
  await sleep(500);
  const recenteredMarker = await visibleRect(page, playerMarkerSelector);
  assertNear(
    recenteredMarker.centerX,
    viewportBox.centerX,
    Math.max(80, viewportBox.width * 0.25),
    "recentered marker x-position",
  );
  assertNear(
    recenteredMarker.centerY,
    viewportBox.centerY,
    Math.max(80, viewportBox.height * 0.25),
    "recentered marker y-position",
  );

  if (!IS_PHONE_VIEWPORT) {
    for (const location of RENAMED_LOCATION_INTEL) {
      await clickAccessibleNode(page, `${location.current}, ${location.type}`);
      await waitForVisibleText(page, "RECENT INTEL");
      const recentIntelTestId = `world-map-location-recent-intel-${location.event}`;
      if (!(await visibleTextInTestId(page, recentIntelTestId, `Legacy ${location.current} location record`))) {
        throw new Error(`${location.current} recent intel does not rewrite the legacy event title`);
      }
      if (await visibleTextInTestId(page, recentIntelTestId, location.retired)) {
        throw new Error(`${location.current} detail view still renders the retired ${location.retired} presentation`);
      }
      await clickAccessibleNode(page, "Close location details");
    }
  }

  // The all-slots envelope has its own storage and import callback. Keep this
  // as a second disposable pass so the single-slot coverage above cannot mask
  // a regression in the full-backup path.
  await page.goto(FULL_BACKUP_EXPORT_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForVisibleText(page, "WORLD MAP");
  const fullBackupExported = await waitForStorageKey(page, FULL_BACKUP_FIXTURE_EXPORT_KEY);
  const fullBackupEnvelope = JSON.parse(fullBackupExported);
  if (fullBackupEnvelope.format !== "megacity-full-backup" || !Array.isArray(fullBackupEnvelope.slots)) {
    throw new Error("World-map full-backup fixture did not produce a full-backup envelope");
  }
  if (fullBackupEnvelope.slots.length !== 1) {
    throw new Error(`World-map full-backup fixture expected one disposable slot, got ${fullBackupEnvelope.slots.length}`);
  }
  const fullBackupState = fullBackupEnvelope.slots[0]?.state;
  const fullBackupDusthaven = fullBackupState?.townships?.find((township) => township.id === "dusthaven");
  if (fullBackupDusthaven?.name !== "Dusthaven") {
    throw new Error("World-map full-backup fixture did not preserve the legacy Mexico City payload before restore");
  }
  const fullBackupDusthavenIntel = fullBackupState?.worldEventLog?.find(
    (entry) => entry.revealed === "dusthaven",
  );
  if (
    fullBackupDusthavenIntel?.title !== "Legacy Dusthaven location record" ||
    !String(fullBackupDusthavenIntel?.description ?? "").includes("Dusthaven")
  ) {
    throw new Error("World-map full-backup fixture did not preserve legacy Mexico City intel before restore");
  }
  await page.evaluate((slotKey) => {
    window.localStorage.removeItem(slotKey);
    window.localStorage.removeItem(`${slotKey}_backup`);
    window.localStorage.removeItem(`${slotKey}.tmp`);
  }, FULL_BACKUP_FIXTURE_SLOT_KEY);
  await page.goto(FULL_BACKUP_RESTORE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForVisibleText(page, "WORLD MAP");
  const restoredFullBackupRaw = await waitForStorageKey(page, FULL_BACKUP_FIXTURE_SLOT_KEY);
  const restoredFullBackupState = decodeFixtureSlot(restoredFullBackupRaw);
  const restoredFullBackupDusthaven = restoredFullBackupState.townships?.find(
    (township) => township.id === "dusthaven",
  );
  if (
    restoredFullBackupDusthaven?.id !== "dusthaven" ||
    restoredFullBackupDusthaven?.name !== "Mexico City" ||
    restoredFullBackupDusthaven?.description !==
      "High-altitude capital and metropolitan trade hub in the Valley of Mexico, with major government, manufacturing, service, and transit networks."
  ) {
    throw new Error("World-map full-backup restore did not preserve the stable ID and current Mexico City presentation");
  }
  const restoredFullBackupIntel = restoredFullBackupState.worldEventLog?.find(
    (entry) => entry.revealed === "dusthaven",
  );
  if (
    restoredFullBackupIntel?.title !== "Legacy Mexico City location record" ||
    !String(restoredFullBackupIntel?.description ?? "").includes("Mexico City") ||
    String(restoredFullBackupIntel?.title ?? "").includes("Dusthaven") ||
    String(restoredFullBackupIntel?.description ?? "").includes("Dusthaven")
  ) {
    throw new Error("World-map full-backup restore did not canonicalize Mexico City intel");
  }
  await waitForVisibleAccessibleNode(page, "Mexico City, township");
  if (await visibleText(page, "GOT IT")) {
    await clickVisibleText(page, "GOT IT");
    await sleep(300);
  }
  await clickAccessibleNode(page, "Open world intel log");
  await waitForVisibleText(page, "WORLD INTEL LOG");
  await waitForVisibleTestId(page, "world-map-event-log-revealed-dusthaven");
  if (!(await visibleText(page, "Legacy Mexico City location record"))) {
    throw new Error("Full-backup restored world intel log does not show the current Mexico City title");
  }
  if (await visibleText(page, "Dusthaven")) {
    throw new Error("Full-backup restored world intel log still renders Dusthaven");
  }
  await clickAccessibleNode(page, "Close world intel log");
  await clickAccessibleNode(page, "Mexico City, township");
  await waitForVisibleText(page, "RECENT INTEL");
  const restoredRecentIntelTestId = "world-map-location-recent-intel-legacy-dusthaven-discovery";
  if (!(await visibleTextInTestId(page, restoredRecentIntelTestId, "Legacy Mexico City location record"))) {
    throw new Error("Full-backup restored Mexico City recent intel does not show the current title");
  }
  if (await visibleTextInTestId(page, restoredRecentIntelTestId, "Dusthaven")) {
    throw new Error("Full-backup restored Mexico City recent intel still renders Dusthaven");
  }
  await clickAccessibleNode(page, "Close location details");
  await assertNoPlayerSaveStorage(page);

  // Steam Cloud uses a separate opaque-byte transport from local export and
  // full-backup import. Keep both its cloud file and lineage baseline in a
  // disposable namespace so this pass cannot touch a player's saves.
  await installCloudFixtureBridge(page);
  await removeCloudFixtureStorage(page);
  await page.goto(CLOUD_SAVE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForVisibleText(page, "WORLD MAP");
  await page.waitForFunction(
    (prefix) => Object.keys(window.localStorage).some((key) => key.startsWith(prefix)),
    { timeout: 120_000 },
    CLOUD_FIXTURE_STORAGE_PREFIX,
  );
  const cloudSnapshot = await page.evaluate((prefix) => {
    const key = Object.keys(window.localStorage).find((candidate) => candidate.startsWith(prefix));
    return key ? window.localStorage.getItem(key) : null;
  }, CLOUD_FIXTURE_STORAGE_PREFIX);
  if (!cloudSnapshot) throw new Error("World-map cloud fixture did not retain its opaque save bytes");
  const cloudState = decodeFixtureSlot(cloudSnapshot);
  const cloudDusthaven = cloudState.townships?.find((township) => township.id === "dusthaven");
  const cloudDusthavenIntel = cloudState.worldEventLog?.find((entry) => entry.revealed === "dusthaven");
  if (
    cloudDusthaven?.id !== "dusthaven" ||
    cloudDusthaven?.name !== "Dusthaven" ||
    cloudDusthavenIntel?.title !== "Legacy Dusthaven location record" ||
    !String(cloudDusthavenIntel?.description ?? "").includes("Dusthaven")
  ) {
    throw new Error("World-map cloud fixture did not preserve the stable Dusthaven reveal ID and legacy payload");
  }

  await page.evaluate((slotKey) => {
    window.localStorage.removeItem(slotKey);
    window.localStorage.removeItem(`${slotKey}_backup`);
    window.localStorage.removeItem(`${slotKey}.tmp`);
  }, CLOUD_FIXTURE_SLOT_KEY);
  await page.goto(CLOUD_LOAD_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForVisibleText(page, "WORLD MAP");
  const restoredCloudRaw = await waitForStorageKey(page, CLOUD_FIXTURE_SLOT_KEY);
  const restoredCloudState = decodeFixtureSlot(restoredCloudRaw);
  const restoredCloudDusthaven = restoredCloudState.townships?.find(
    (township) => township.id === "dusthaven",
  );
  const restoredCloudIntel = restoredCloudState.worldEventLog?.find(
    (entry) => entry.revealed === "dusthaven",
  );
  if (
    restoredCloudDusthaven?.id !== "dusthaven" ||
    restoredCloudIntel?.revealed !== "dusthaven"
  ) {
    throw new Error("World-map cloud restore did not carry the stable Dusthaven reveal ID");
  }
  await waitForVisibleAccessibleNode(page, "Mexico City, township");
  if (await visibleText(page, "GOT IT")) {
    await clickVisibleText(page, "GOT IT");
    await sleep(300);
  }
  await clickAccessibleNode(page, "Open world intel log");
  await waitForVisibleText(page, "WORLD INTEL LOG");
  await waitForVisibleTestId(page, "world-map-event-log-revealed-dusthaven");
  if (!(await visibleText(page, "Legacy Mexico City location record"))) {
    throw new Error("Cloud-restored world intel log does not show the current Mexico City title");
  }
  if (await visibleText(page, "Dusthaven")) {
    throw new Error("Cloud-restored world intel log still renders Dusthaven");
  }
  await clickAccessibleNode(page, "Close world intel log");
  await clickAccessibleNode(page, "Mexico City, township");
  await waitForVisibleText(page, "RECENT INTEL");
  const cloudRecentIntelTestId = "world-map-location-recent-intel-legacy-dusthaven-discovery";
  if (!(await visibleTextInTestId(page, cloudRecentIntelTestId, "Legacy Mexico City location record"))) {
    throw new Error("Cloud-restored Mexico City recent intel does not show the current title");
  }
  if (await visibleTextInTestId(page, cloudRecentIntelTestId, "Dusthaven")) {
    throw new Error("Cloud-restored Mexico City recent intel still renders Dusthaven");
  }
  await clickAccessibleNode(page, "Close location details");
  await removeCloudFixtureStorage(page);
  await assertCloudFixtureStorageRemoved(page);
  await assertNoPlayerSaveStorage(page);

  if (pageErrors.length) throw new Error(`browser page errors: ${pageErrors.join(" | ")}`);
  console.log("PASS  Mexico City marker and detail sheet render on the world map");
} finally {
  if (page) await removeCloudFixtureStorage(page).catch(() => {});
  await browser.close().catch(() => {});
}