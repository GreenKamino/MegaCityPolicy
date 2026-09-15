// Browser regression coverage for the nature-risk warning on the real TV-news
// ticker. The biosphereticker fixture starts at LOW risk and the real
// turn-based END TURN action runs the shared tick pipeline until the biosphere
// enters the EASING band. The warning is then saved, reloaded, and checked
// again so persisted news does not replay on the ticker. The same warning is
// also saved to and restored from an isolated Steam Cloud fixture.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/biosphereRiskTicker.e2e.mjs

import { execSync } from "node:child_process";
import LZString from "lz-string";
import puppeteer from "puppeteer";

const { decompressFromUTF16 } = LZString;
const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const WARNING_FRAGMENT = "NATURE DESK: NATURE CRISIS RISK RISING";
const FIXTURE_STORAGE_KEY = "@megacity_e2e_biosphere_risk_ticker_1";
const CLOUD_FIXTURE_STORAGE_PREFIX = "@megacity_e2e_biosphere_risk_ticker_cloud_";

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

async function waitForVisibleText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await page.evaluate((needle) => {
      const target = needle.toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!(node.textContent ?? "").toUpperCase().includes(target)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    }, text);
    if (visible) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickEndTurn(page) {
  const clicked = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('[role="button"], button')].filter((element) => {
      const rect = element.getBoundingClientRect();
      const label = (element.getAttribute("aria-label") ?? "").toUpperCase();
      return rect.width > 0 && rect.height > 0 && label === "END TURN";
    });
    const target = candidates[0];
    if (!target) return false;
    target.click();
    return true;
  });
  if (!clicked) throw new Error("Could not find the visible END TURN button");
}

async function readTicker(page) {
  return page.evaluate((warning) => {
    const ticker = document.querySelector('[data-testid="news-ticker"]');
    if (!ticker) return { found: false };
    const rect = ticker.getBoundingClientRect();
    const accessible = ticker.getAttribute("aria-label") ?? "";
    const normalized = accessible.toUpperCase();
    const matches = normalized.split(warning).length - 1;
    const noExclamation = !accessible.includes("!");
    return {
      found: true,
      visible: rect.width > 0 && rect.height > 0,
      accessible,
      matches,
      noExclamation,
    };
  }, WARNING_FRAGMENT);
}

async function readPersistedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_STORAGE_KEY);
  if (!raw) return null;
  return decodePersistedState(raw);
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string"
    ? decompressFromUTF16(envelope.data)
    : raw;
  return json ? JSON.parse(json) : null;
}

async function installCloudFixtureBridge(page) {
  await page.evaluateOnNewDocument(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("demo") !== "1" ||
      params.get("biosphereticker") !== "1" ||
      !["cloud-save", "cloud-load"].includes(params.get("biospheretickerreload") ?? "")
    ) {
      return;
    }

    const storagePrefix = "@megacity_e2e_biosphere_risk_ticker_cloud_";
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

    // This shape matches the Electron preload contract consumed by
    // engine/steamBridge.ts. It exists only in this dev-only test URL; the
    // browser's local storage is the disposable cloud fixture.
    window.steamworks = {
      isInitialized: () => true,
      setAchievement: () => true,
      clearAchievement: () => true,
      getAchievement: () => false,
      storeStats: () => true,
      getSteamId: () => "e2e-biosphere-risk-ticker",
      cloud,
    };
  });
}

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});

const browserErrors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      browserErrors.push(message.text());
    }
  });

  const saveFixtureUrl = `${BASE_URL}/?demo=1&biosphereticker=1&biospheretickerreload=save&go=overview`;
  await page.goto(saveFixtureUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitForPath(page, "/overview");
  await waitForVisibleText(page, "TURN-BASED COMMAND");
  await clickEndTurn(page);
  await waitForVisibleText(page, "TURN COMPLETE");
  await sleep(2500);

  const ticker = await readTicker(page);
  if (!ticker.found || !ticker.visible) {
    throw new Error(`NewsTicker was not visible on the Overview screen: ${JSON.stringify(ticker)}`);
  }
  if (ticker.matches !== 1) {
    throw new Error(`Expected one accessible nature-risk warning, got ${ticker.matches}: ${ticker.accessible}`);
  }
  if (!ticker.noExclamation) {
    throw new Error(`Nature-risk ticker warning contains an exclamation mark: ${ticker.accessible}`);
  }

  // The fixture save phase only writes after the warning has landed, so this
  // proves the warning is present in the persisted state before navigating to
  // a fresh provider instance.
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout: 120000 },
    FIXTURE_STORAGE_KEY,
  );
  const persistedState = await readPersistedState(page);
  const persistedWarning = persistedState?.newsFeed?.find(
    (item) => item.id.startsWith("news-biosphere-risk-rising-"),
  );
  if (!persistedWarning) {
    throw new Error("The saved game state did not retain the nature-risk news-feed warning");
  }

  const reloadFixtureUrl =
    `${BASE_URL}/?demo=1&biosphereticker=1&biospheretickerreload=load&go=overview`;
  await page.goto(reloadFixtureUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitForPath(page, "/overview");
  await waitForVisibleText(page, "TURN-BASED COMMAND");
  await sleep(2500);

  const reloadedTicker = await readTicker(page);
  if (!reloadedTicker.found || !reloadedTicker.visible) {
    throw new Error(`NewsTicker was not visible after reload: ${JSON.stringify(reloadedTicker)}`);
  }
  if (reloadedTicker.matches !== 0) {
    throw new Error(
      `Expected the persisted nature-risk warning to stay out of the ticker after reload, got ${reloadedTicker.matches}: ${reloadedTicker.accessible}`,
    );
  }
  const reloadedState = await readPersistedState(page);
  const reloadedWarning = reloadedState?.newsFeed?.find(
    (item) => item.id === persistedWarning.id,
  );
  if (!reloadedWarning) {
    throw new Error("The reloaded game state no longer retained the nature-risk news-feed warning");
  }

  // Cloud restore exercises the separate Steam Cloud reconciliation path. The
  // fixture bridge uses a disposable namespace, and only this fixture's local
  // save is removed to model a fresh device without touching player saves.
  await installCloudFixtureBridge(page);
  const cloudSaveFixtureUrl =
    `${BASE_URL}/?demo=1&biosphereticker=1&biospheretickerreload=cloud-save&go=overview`;
  await page.goto(cloudSaveFixtureUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitForPath(page, "/overview");
  await waitForVisibleText(page, "TURN-BASED COMMAND");
  await sleep(2500);
  await page.waitForFunction(
    (prefix, localKey) => {
      const cloudKey = Object.keys(window.localStorage).find((key) => key.startsWith(prefix));
      const cloudRaw = cloudKey ? window.localStorage.getItem(cloudKey) : null;
      return Boolean(cloudRaw && window.localStorage.getItem(localKey) === cloudRaw);
    },
    { timeout: 120000 },
    CLOUD_FIXTURE_STORAGE_PREFIX,
    FIXTURE_STORAGE_KEY,
  );
  const cloudSnapshot = await page.evaluate((prefix) => {
    const cloudKey = Object.keys(window.localStorage).find(
      (key) => key.startsWith(prefix) && key.includes("megacity_save_"),
    );
    return cloudKey
      ? {
          key: cloudKey,
          raw: window.localStorage.getItem(cloudKey),
        }
      : null;
  }, CLOUD_FIXTURE_STORAGE_PREFIX);
  if (!cloudSnapshot?.raw) {
    throw new Error("The cloud fixture did not retain the nature-risk save envelope");
  }
  const cloudState = decodePersistedState(cloudSnapshot.raw);
  const cloudWarning = cloudState?.newsFeed?.find(
    (item) => item.id === persistedWarning.id,
  );
  if (!cloudWarning) {
    throw new Error("The cloud save did not retain the nature-risk news-feed warning");
  }

  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}_backup`);
    window.localStorage.removeItem(`${key}.tmp`);
  }, FIXTURE_STORAGE_KEY);
  const beforeCloudRestore = await page.evaluate((key) => ({
    fixture: window.localStorage.getItem(key),
    realSlot: window.localStorage.getItem("@megacity_slot_1"),
    legacySlot: window.localStorage.getItem("@megacity_save"),
  }), FIXTURE_STORAGE_KEY);
  if (beforeCloudRestore.fixture || beforeCloudRestore.realSlot || beforeCloudRestore.legacySlot) {
    throw new Error("Cloud restore fixture still has a local or player save before restore");
  }

  const cloudLoadFixtureUrl =
    `${BASE_URL}/?demo=1&biosphereticker=1&biospheretickerreload=cloud-load&go=overview`;
  await page.goto(cloudLoadFixtureUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitForPath(page, "/overview");
  await waitForVisibleText(page, "TURN-BASED COMMAND");
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout: 120000 },
    FIXTURE_STORAGE_KEY,
  );
  await sleep(2500);

  const cloudRestoredTicker = await readTicker(page);
  if (!cloudRestoredTicker.found || !cloudRestoredTicker.visible) {
    throw new Error(
      `NewsTicker was not visible after cloud restore: ${JSON.stringify(cloudRestoredTicker)}`,
    );
  }
  if (cloudRestoredTicker.matches !== 0) {
    throw new Error(
      `Expected the cloud-restored nature-risk warning to stay out of the ticker, got ${cloudRestoredTicker.matches}: ${cloudRestoredTicker.accessible}`,
    );
  }
  const cloudRestoredRaw = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    FIXTURE_STORAGE_KEY,
  );
  const cloudRestoredState = cloudRestoredRaw ? decodePersistedState(cloudRestoredRaw) : null;
  const cloudRestoredWarning = cloudRestoredState?.newsFeed?.find(
    (item) => item.id === persistedWarning.id,
  );
  if (!cloudRestoredWarning) {
    throw new Error("The cloud-restored game state no longer retained the nature-risk news-feed warning");
  }

  if (browserErrors.length) {
    throw new Error(`Browser errors during nature-risk ticker check:\n${browserErrors.join("\n")}`);
  }

  console.log(
    `[e2e] PASS: real NewsTicker shows one LOW-to-EASING nature-risk warning, preserves it in newsFeed, and does not replay it after local reload or Steam Cloud restore`,
  );
} finally {
  await browser.close().catch(() => {});
}