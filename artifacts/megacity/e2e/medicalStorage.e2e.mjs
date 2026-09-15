// Browser regression coverage for medical reserve overflow notices. The
// medicalstorage demo fixture is dev-only, so this test can drive the real
// live-tick, offline catch-up, event-response, Economy, and Wildlands screens.
// Its save/load case uses a disposable slot namespace and cleans up every
// primary, backup, and temporary fixture key without touching player saves.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/medicalStorage.e2e.mjs

import { execSync } from "node:child_process";
import LZString from "lz-string";
import puppeteer from "puppeteer";

const { decompressFromUTF16 } = LZString;
const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const GUIDANCE_FRAGMENT = "OPEN ECONOMY TO CHECK THE MEDICAL STORAGE READOUT";
const ECONOMY_FULL_GUIDANCE = "FULL: POSITIVE MEDICAL-SUPPLY GAINS ARE REJECTED; CONSUMPTION STILL APPLIES.";
const STORED_FRAGMENT = "MEDICAL SUPPLIES STORED";
const REJECTED_FRAGMENT = "REJECTED BECAUSE THE RESERVE IS FULL";
const CONSUMED_FRAGMENT = "CONSUMED";
const MEDICAL_REPORT_CONSUMED_FRAGMENT = "CONSUMED.";
const FIXTURE_STORAGE_KEY = "@megacity_e2e_medical_storage_1";
const CLOUD_FIXTURE_STORAGE_PREFIX = "@megacity_e2e_medical_storage_cloud_";
const CLOUD_SYNC_BASELINE_KEY = "@megacity_cloud_sync_baseline";
const RELOAD_SAVE_URL =
  `${BASE_URL}/?demo=1&medicalstorage=1&medicalstoragecase=reload&medicalStorageReload=save&go=overview`;
const RELOAD_LOAD_URL =
  `${BASE_URL}/?demo=1&medicalstorage=1&medicalstoragecase=reload&medicalStorageReload=load&go=economy`;
const CLOUD_SAVE_URL =
  `${BASE_URL}/?demo=1&medicalstorage=1&medicalstoragecase=reload&medicalStorageReload=cloud-save&go=overview`;
const CLOUD_LOAD_URL =
  `${BASE_URL}/?demo=1&medicalstorage=1&medicalstoragecase=reload&medicalStorageReload=cloud-load&go=events`;

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPath(page, suffix, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith(suffix)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for path ${suffix}; current URL: ${page.url()}`);
}

async function navigate(page, url) {
  // Expo web keeps the dev document alive while the router mounts and can
  // outlive Puppeteer's DOMContentLoaded lifecycle timeout under the shared
  // validation load. The routed page is still usable once its path appears.
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (error) {
    if (!String(error?.message ?? error).includes("Navigation timeout")) throw error;
  }
}

async function visibleText(page, needle) {
  return page.evaluate((target) => {
    const wanted = target.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(wanted)) continue;
      const parent = node.parentElement;
      const rect = parent?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }, needle);
}

async function waitForVisibleText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickVisibleByLabel(page, label) {
  const clicked = await page.evaluate((wanted) => {
    const target = wanted.toUpperCase();
    const candidates = [...document.querySelectorAll('[role="button"], button, [tabindex="0"]')].filter((element) => {
      const rect = element.getBoundingClientRect();
      const aria = (element.getAttribute("aria-label") ?? "").toUpperCase();
      const text = (element.innerText ?? element.textContent ?? "").toUpperCase();
      return rect.width > 0 && rect.height > 0 && (aria === target || text.includes(target));
    });
    candidates.sort((a, b) => {
      const buttonPriority = Number(b.tagName === "BUTTON") - Number(a.tagName === "BUTTON");
      if (buttonPriority !== 0) return buttonPriority;
      return (a.innerText ?? a.textContent ?? "").length - (b.innerText ?? b.textContent ?? "").length;
    });
    const element = candidates[0];
    if (!element) return false;
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not find visible button: ${label}`);
}

async function assertMedicalSummary(page, label, { requireConsumed = true } = {}) {
  const result = await page.evaluate(({ stored, rejected, consumed }) => {
    const text = document.body.innerText.toUpperCase();
    return {
      stored: text.includes(stored),
      rejected: text.includes(rejected),
      consumed: text.includes(consumed),
    };
  }, { stored: STORED_FRAGMENT, rejected: REJECTED_FRAGMENT, consumed: CONSUMED_FRAGMENT });
  if (!result.stored || !result.rejected || (requireConsumed && !result.consumed)) {
    throw new Error(`${label} did not distinguish stored, rejected, and consumed quantities: ${JSON.stringify(result)}`);
  }
}

async function assertMedicalSummaryExactlyOnce(page, label) {
  const counts = await page.evaluate((fragments) => {
    const text = (document.body.innerText ?? "").toUpperCase();
    return Object.fromEntries(
      fragments.map((fragment) => {
        let count = 0;
        let offset = 0;
        while (true) {
          const index = text.indexOf(fragment, offset);
          if (index < 0) break;
          count += 1;
          offset = index + fragment.length;
        }
        return [fragment, count];
      }),
    );
  }, [STORED_FRAGMENT, REJECTED_FRAGMENT, MEDICAL_REPORT_CONSUMED_FRAGMENT]);
  if (Object.values(counts).some((count) => count !== 1)) {
    throw new Error(`${label} did not render each medical report phrase exactly once: ${JSON.stringify(counts)}`);
  }
}

async function assertNoPlayerSaveStorage(page) {
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  const saveKeys = keys.filter((key) =>
    key.startsWith("@megacity_slot_") ||
    key === "@megacity_save" ||
    key === "@megacity_profiles_index" ||
    key.startsWith("@megacity_profile_") ||
    key === "@megacity_active_profile",
  );
  if (saveKeys.length) {
    throw new Error(`Medical storage fixture touched player save storage: ${JSON.stringify(saveKeys)}`);
  }
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string" ? decompressFromUTF16(envelope.data) : raw;
  if (!json) throw new Error("The medical storage fixture save payload could not be decompressed");
  return JSON.parse(json);
}

async function readPersistedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_STORAGE_KEY);
  if (!raw) throw new Error("The medical storage fixture did not write its isolated save");
  return decodePersistedState(raw);
}

async function installCloudFixtureBridge(page) {
  await page.evaluateOnNewDocument(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("demo") !== "1" ||
      params.get("medicalstorage") !== "1" ||
      !["cloud-save", "cloud-load"].includes(params.get("medicalStorageReload") ?? "")
    ) {
      return;
    }

    const storagePrefix = "@megacity_e2e_medical_storage_cloud_";
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
      getSteamId: () => "e2e-medical-storage",
      cloud,
    };
  });
}

async function readCloudSnapshot(page) {
  return page.evaluate((prefix) => {
    const key = Object.keys(window.localStorage).find(
      (candidate) => candidate.startsWith(prefix) && candidate.includes("megacity_save_"),
    );
    return key ? { key, raw: window.localStorage.getItem(key) } : null;
  }, CLOUD_FIXTURE_STORAGE_PREFIX);
}

async function removeFixtureStorage(page) {
  await page.evaluate(({ key, cloudPrefix, baselineKey }) => {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}_backup`);
    window.localStorage.removeItem(`${key}.tmp`);
    window.localStorage.removeItem(baselineKey);
    for (const candidate of Object.keys(window.localStorage)) {
      if (candidate.startsWith(cloudPrefix)) window.localStorage.removeItem(candidate);
    }
  }, {
    key: FIXTURE_STORAGE_KEY,
    cloudPrefix: CLOUD_FIXTURE_STORAGE_PREFIX,
    baselineKey: CLOUD_SYNC_BASELINE_KEY,
  });
}

async function assertFixtureStorageRemoved(page) {
  const remaining = await page.evaluate(
    ({ key, cloudPrefix, baselineKey }) =>
      Object.keys(window.localStorage).filter(
        (candidate) =>
          candidate === key ||
          candidate === `${key}_backup` ||
          candidate === `${key}.tmp` ||
          candidate === baselineKey ||
          candidate.startsWith(cloudPrefix),
      ),
    {
      key: FIXTURE_STORAGE_KEY,
      cloudPrefix: CLOUD_FIXTURE_STORAGE_PREFIX,
      baselineKey: CLOUD_SYNC_BASELINE_KEY,
    },
  );
  if (remaining.length) {
    throw new Error(`Medical storage fixture cleanup left keys behind: ${JSON.stringify(remaining)}`);
  }
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: chromiumPath(),
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const browserErrors = [];
const pages = [];
let reloadPage;
async function createPage() {
  const next = await browser.newPage();
  await next.setViewport({ width: 400, height: 720, deviceScaleFactor: 1 });
  next.on("pageerror", (error) => browserErrors.push(error.message));
  next.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/In HTML, .*cannot be a descendant|cannot contain a nested/.test(message.text())
    ) {
      browserErrors.push(message.text());
    }
  });
  pages.push(next);
  return next;
}

try {
  const fixture = (caseName, route) =>
    `${BASE_URL}/?demo=1&medicalstorage=1&medicalstoragecase=${caseName}&mode=turnbased&go=${route}`;

  const page = await createPage();
  await navigate(page, fixture("live", "overview"));
  await waitForPath(page, "/overview");
  await waitForVisibleText(page, "TURN-BASED COMMAND");
  await clickVisibleByLabel(page, "END TURN");
  await waitForVisibleText(page, "TURN COMPLETE");
  await clickVisibleByLabel(page, "EVENTS");
  await waitForPath(page, "/events");
  await waitForVisibleText(page, "Last Tick Report");
  await assertMedicalSummary(page, "live tick report");

  const offlinePage = await createPage();
  await navigate(offlinePage, fixture("offline", "overview"));
  await waitForPath(offlinePage, "/overview");
  await waitForVisibleText(offlinePage, "SECTOR REPORT");
  await assertMedicalSummary(offlinePage, "offline catch-up report");

  const eventPage = await createPage();
  await navigate(eventPage, fixture("event", "events"));
  await waitForPath(eventPage, "/events");
  await waitForVisibleText(eventPage, "DEBUG: MEDICAL RELIEF SHIPMENT");
  await clickVisibleByLabel(eventPage, "Expand response options for DEBUG: MEDICAL RELIEF SHIPMENT");
  await clickVisibleByLabel(eventPage, "RECEIVE THE SHIPMENT");
  await clickVisibleByLabel(eventPage, "COMMIT RESPONSE");
  await clickVisibleByLabel(eventPage, "INBOX");
  await waitForPath(eventPage, "/inbox");
  await waitForVisibleText(eventPage, "MEDICAL RESERVE CAP REACHED");
  await assertMedicalSummary(eventPage, "event reward notice", { requireConsumed: false });

  const wildlandsPage = await createPage();
  await navigate(wildlandsPage, fixture("wildlands", "overview"));
  await waitForPath(wildlandsPage, "/overview");
  await waitForVisibleText(wildlandsPage, "TURN-BASED COMMAND");
  await clickVisibleByLabel(wildlandsPage, "END TURN");
  await waitForVisibleText(wildlandsPage, "TURN COMPLETE");
  await clickVisibleByLabel(wildlandsPage, "WILDLANDS");
  await waitForPath(wildlandsPage, "/wildlands");
  await waitForVisibleText(wildlandsPage, "RECENT RESULTS");
  await waitForVisibleText(wildlandsPage, STORED_FRAGMENT);
  await waitForVisibleText(wildlandsPage, REJECTED_FRAGMENT);
  await waitForVisibleText(wildlandsPage, GUIDANCE_FRAGMENT);

  const economyPage = await createPage();
  await navigate(economyPage, fixture("economy", "economy"));
  await waitForPath(economyPage, "/economy");
  await waitForVisibleText(economyPage, "MEDICAL RESERVE STORAGE");
  await waitForVisibleText(economyPage, ECONOMY_FULL_GUIDANCE);

  reloadPage = await createPage();
  await navigate(reloadPage, RELOAD_SAVE_URL);
  await waitForPath(reloadPage, "/overview");
  await reloadPage.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout: 120000 },
    FIXTURE_STORAGE_KEY,
  );
  const savedState = await readPersistedState(reloadPage);
  const savedMedicalText = JSON.stringify(savedState).toUpperCase();
  if (
    !savedMedicalText.includes(STORED_FRAGMENT) ||
    !savedMedicalText.includes(REJECTED_FRAGMENT) ||
    !savedMedicalText.includes(CONSUMED_FRAGMENT)
  ) {
    throw new Error("The medical storage save envelope did not retain the stored/rejected/consumed reward summary wording");
  }

  await navigate(reloadPage, RELOAD_LOAD_URL);
  await waitForPath(reloadPage, "/economy");
  await waitForVisibleText(reloadPage, "MEDICAL RESERVE STORAGE");
  await waitForVisibleText(reloadPage, ECONOMY_FULL_GUIDANCE);
  await navigate(
    reloadPage,
    `${BASE_URL}/?demo=1&medicalstorage=1&medicalstoragecase=reload&medicalStorageReload=load&go=events`,
  );
  await waitForPath(reloadPage, "/events");
  await waitForVisibleText(reloadPage, "Last Tick Report");
  await assertMedicalSummary(reloadPage, "reloaded reward notice");

  await installCloudFixtureBridge(reloadPage);
  await navigate(reloadPage, CLOUD_SAVE_URL);
  await waitForPath(reloadPage, "/overview");
  await reloadPage.waitForFunction(
    (prefix, localKey) => {
      const cloudKey = Object.keys(window.localStorage).find((key) => key.startsWith(prefix));
      const cloudRaw = cloudKey ? window.localStorage.getItem(cloudKey) : null;
      return Boolean(cloudRaw && window.localStorage.getItem(localKey) === cloudRaw);
    },
    { timeout: 120000 },
    CLOUD_FIXTURE_STORAGE_PREFIX,
    FIXTURE_STORAGE_KEY,
  );
  const cloudSnapshot = await readCloudSnapshot(reloadPage);
  if (!cloudSnapshot?.raw) {
    throw new Error("The medical storage cloud fixture did not retain the save envelope");
  }
  const cloudState = decodePersistedState(cloudSnapshot.raw);
  const cloudReportText = JSON.stringify(cloudState).toUpperCase();
  if (
    !cloudReportText.includes(STORED_FRAGMENT) ||
    !cloudReportText.includes(REJECTED_FRAGMENT) ||
    !cloudReportText.includes(CONSUMED_FRAGMENT)
  ) {
    throw new Error("The medical storage cloud envelope did not retain the complete report wording");
  }

  await reloadPage.evaluate((key) => {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}_backup`);
    window.localStorage.removeItem(`${key}.tmp`);
  }, FIXTURE_STORAGE_KEY);
  const beforeCloudRestore = await reloadPage.evaluate((key) => ({
    fixture: window.localStorage.getItem(key),
    realSlot: window.localStorage.getItem("@megacity_slot_1"),
    legacySlot: window.localStorage.getItem("@megacity_save"),
  }), FIXTURE_STORAGE_KEY);
  if (beforeCloudRestore.fixture || beforeCloudRestore.realSlot || beforeCloudRestore.legacySlot) {
    throw new Error("Medical storage cloud restore still has a local or player save before restore");
  }

  await navigate(reloadPage, CLOUD_LOAD_URL);
  await reloadPage.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout: 120000 },
    FIXTURE_STORAGE_KEY,
  );
  const restoredTransportRaw = await reloadPage.evaluate(
    (key) => window.localStorage.getItem(key),
    FIXTURE_STORAGE_KEY,
  );
  if (!restoredTransportRaw) {
    throw new Error("Steam Cloud restore did not recreate the isolated medical save envelope");
  }
  const restoredState = decodePersistedState(restoredTransportRaw);
  const cloudMedicalReport = cloudState.tickLog?.find((entry) => entry.label === "Medical Supplies");
  const restoredMedicalReport = restoredState.tickLog?.find((entry) => entry.label === "Medical Supplies");
  if (!cloudMedicalReport || !restoredMedicalReport ||
      JSON.stringify(restoredMedicalReport) !== JSON.stringify(cloudMedicalReport)) {
    throw new Error("Steam Cloud restore changed the isolated medical report payload");
  }
  // The cloud restore itself writes the opaque envelope. Wait for the
  // fixture's explicit post-restore save (the equivalent of the first
  // autosave) so this assertion also covers normal save normalization.
  await reloadPage.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(`${key}_backup`)),
    { timeout: 120000 },
    FIXTURE_STORAGE_KEY,
  );
  const postRestoreSaveState = await readPersistedState(reloadPage);
  const postRestoreMedicalReport = postRestoreSaveState.tickLog?.find(
    (entry) => entry.label === "Medical Supplies",
  );
  if (!postRestoreMedicalReport ||
      JSON.stringify(postRestoreMedicalReport) !== JSON.stringify(cloudMedicalReport)) {
    throw new Error("Post-restore save changed the isolated medical report payload");
  }
  await waitForPath(reloadPage, "/events");
  await waitForVisibleText(reloadPage, "Last Tick Report");
  await waitForVisibleText(reloadPage, STORED_FRAGMENT);
  await assertMedicalSummary(reloadPage, "post-autosave cloud-restored reward notice");
  await assertMedicalSummaryExactlyOnce(reloadPage, "post-autosave cloud-restored reward notice");

  for (const candidate of pages) await assertNoPlayerSaveStorage(candidate);
  await assertNoPlayerSaveStorage(reloadPage);
  await removeFixtureStorage(reloadPage);
  await assertFixtureStorageRemoved(reloadPage);
  if (browserErrors.length) {
    throw new Error(`Browser errors during medical storage check:\n${browserErrors.join("\n")}`);
  }
  console.log("[e2e] PASS: medical overflow guidance and stored/rejected/consumed quantities render on live, offline, event, Economy, Wildlands, local reload, and Steam Cloud restore paths");
} finally {
  for (const page of pages) {
    await removeFixtureStorage(page).catch(() => {});
  }
  await removeFixtureStorage(reloadPage).catch(() => {});
  await browser.close().catch(() => {});
}