// Browser regression coverage for faction diplomacy cooldowns after resume,
// across a real save-envelope reload, and through a Steam Cloud restore.
// Requires the "artifacts/megacity: expo" workflow.
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const PREVIEW_READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120000;
const PREVIEW_REQUEST_TIMEOUT_MS = 10000;
const FIXTURE_STORAGE_KEY = "@megacity_e2e_faction_cooldowns_1";
const CLOUD_FIXTURE_STORAGE_PREFIX = "@megacity_e2e_faction_cooldowns_cloud_";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures.push(name);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function ensurePreviewReady() {
  const deadline = Date.now() + PREVIEW_READY_TIMEOUT_MS;
  let lastFailure = "no response";
  while (Date.now() <= deadline) {
    try {
      const response = await fetchWithTimeout(BASE_URL, PREVIEW_REQUEST_TIMEOUT_MS);
      if (!response.ok) throw new Error(`preview returned HTTP ${response.status}`);
      const html = await response.text();
      const bundleMatch = html.match(/<script\b[^>]*\bsrc=["']([^"']*\.bundle[^"']*)["']/i);
      if (!bundleMatch) throw new Error("preview HTML did not expose the Expo web bundle");
      const bundleResponse = await fetchWithTimeout(
        new URL(bundleMatch[1], BASE_URL).href,
        PREVIEW_REQUEST_TIMEOUT_MS,
      );
      if (!bundleResponse.ok) throw new Error(`Metro bundle returned HTTP ${bundleResponse.status}`);
      await bundleResponse.arrayBuffer();
      console.log(`PASS  Expo preview ready at ${BASE_URL}`);
      return;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() >= deadline) break;
    await sleep(Math.min(1000, deadline - Date.now()));
  }
  throw new Error(
    `Expected Expo preview URL ${BASE_URL} is unavailable or still starting (${lastFailure}). ` +
      'Start the "artifacts/megacity: expo" workflow, or wait for Metro to finish bundling, then retry.',
  );
}

async function visibleText(page, text) {
  return page.evaluate((target) => {
    const needle = target.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.toUpperCase().includes(needle)) continue;
      const rect = node.parentElement?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }, text);
}

async function waitForText(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function installCloudFixtureBridge(page) {
  await page.evaluateOnNewDocument(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("demo") !== "1" ||
      params.get("factioncooldowns") !== "1" ||
      !["cloud-save", "cloud-load"].includes(params.get("factioncooldownreload") ?? "")
    ) {
      return;
    }

    const storagePrefix = "@megacity_e2e_faction_cooldowns_cloud_";
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
    // incognito browser context keeps it away from a player's storage.
    window.steamworks = {
      isInitialized: () => true,
      setAchievement: () => true,
      clearAchievement: () => true,
      getAchievement: () => false,
      storeStats: () => true,
      getSteamId: () => "e2e-faction-cooldowns",
      cloud,
    };
  });
}

async function factionCard(page, factionName) {
  return page.evaluate((name) => {
    const heading = [...document.querySelectorAll("div, span")].find(
      (el) => (el.innerText ?? "").trim() === name && el.getBoundingClientRect().height > 0,
    );
    if (!heading) return null;
    let card = heading;
    while (card.parentElement) {
      const text = card.innerText ?? "";
      if (
        text.includes(name) &&
        text.includes("NEGOTIATE") &&
        (text.includes("MORE ACTIONS") || text.includes("FEWER ACTIONS"))
      ) {
        return card;
      }
      card = card.parentElement;
    }
    return null;
  }, factionName);
}

async function expandFactionActions(page, factionName) {
  const expanded = await page.evaluate((name) => {
    const heading = [...document.querySelectorAll("div, span")].find(
      (el) => (el.innerText ?? "").trim() === name && el.getBoundingClientRect().height > 0,
    );
    if (!heading) return false;
    let card = heading;
    while (card.parentElement) {
      const text = card.innerText ?? "";
      if (
        text.includes(name) &&
        text.includes("NEGOTIATE") &&
        (text.includes("MORE ACTIONS") || text.includes("FEWER ACTIONS"))
      ) {
        const toggle = [...card.querySelectorAll("div, span, button")].find((el) => {
          const value = (el.innerText ?? "").trim().toUpperCase();
          return value.startsWith("MORE ACTIONS");
        });
        if (toggle) toggle.click();
        return true;
      }
      card = card.parentElement;
    }
    return false;
  }, factionName);
  if (!expanded) throw new Error(`Could not find faction action menu: ${factionName}`);
  await sleep(250);
}

async function optionSnapshot(page, factionName, optionLabel) {
  return page.evaluate(({ name, label }) => {
    const heading = [...document.querySelectorAll("div, span")].find(
      (el) => (el.innerText ?? "").trim() === name && el.getBoundingClientRect().height > 0,
    );
    if (!heading) return null;
    let card = heading;
    while (card.parentElement) {
      const text = card.innerText ?? "";
      if (
        text.includes(name) &&
        text.includes("NEGOTIATE") &&
        (text.includes("MORE ACTIONS") || text.includes("FEWER ACTIONS"))
      ) {
        const option = [...card.querySelectorAll("div, span, button")].find(
          (el) => (el.innerText ?? "").trim().toUpperCase() === label.toUpperCase(),
        );
        if (!option) return { found: false, cardText: text };
        let button = option;
        let disabled = false;
        for (let i = 0; i < 7 && button; i += 1) {
          const opacity = Number.parseFloat(getComputedStyle(button).opacity);
          if (button.getAttribute("aria-disabled") === "true" || opacity <= 0.5) disabled = true;
          button = button.parentElement;
        }
        return {
          found: true,
          disabled,
          cardText: text,
        };
      }
      card = card.parentElement;
    }
    return null;
  }, { name: factionName, label: optionLabel });
}

async function clickOption(page, factionName, optionLabel) {
  const clicked = await page.evaluate(({ name, label }) => {
    const heading = [...document.querySelectorAll("div, span")].find(
      (el) => (el.innerText ?? "").trim() === name && el.getBoundingClientRect().height > 0,
    );
    if (!heading) return false;
    let card = heading;
    while (card.parentElement) {
      const text = card.innerText ?? "";
      if (
        text.includes(name) &&
        text.includes("NEGOTIATE") &&
        (text.includes("MORE ACTIONS") || text.includes("FEWER ACTIONS"))
      ) {
        const option = [...card.querySelectorAll("div, span, button")].find(
          (el) => (el.innerText ?? "").trim().toUpperCase() === label.toUpperCase(),
        );
        if (!option) return false;
        option.scrollIntoView({ block: "center" });
        option.click();
        return true;
      }
      card = card.parentElement;
    }
    return false;
  }, { name: factionName, label: optionLabel });
  if (!clicked) throw new Error(`Could not click ${optionLabel} for ${factionName}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const nodes = [...document.querySelectorAll("div, span, button")].filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (el.innerText ?? "").trim().toUpperCase() === needle;
    });
    const element = nodes.sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!element) return false;
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context =
    (await browser.createBrowserContext?.()) ??
    (await browser.createIncognitoBrowserContext?.());
  try {
    if (!context) throw new Error("Puppeteer could not create an isolated browser context");
    const page = await context.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    // The app's dev-only fixture writes through GameContext.saveToSlot into a
    // dedicated AsyncStorage namespace. The incognito context ensures this
    // can never read or overwrite a player's real profile/slot storage.
    const fixtureKey = FIXTURE_STORAGE_KEY;
    const fixtureBase = `${BASE_URL}/?demo=1&factioncooldowns=1&go=factions`;
    await page.goto(`${fixtureBase}&factioncooldownreload=save`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitForText(page, "FACTIONS / EXTERNAL AFFAIRS", 120000);
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      fixtureKey,
    );
    const isolatedStorage = await page.evaluate((key) => ({
      fixture: Boolean(window.localStorage.getItem(key)),
      realSlot: Boolean(window.localStorage.getItem("@megacity_slot_1")),
      legacySlot: Boolean(window.localStorage.getItem("@megacity_save")),
    }), fixtureKey);
    check("save fixture uses an isolated storage key", isolatedStorage.fixture && !isolatedStorage.realSlot && !isolatedStorage.legacySlot);

    // A full navigation recreates GameProvider and forces loadSlot to read
    // the wrapped bytes from AsyncStorage, then migrateState/sanitizeState
    // before the factions screen renders.
    await page.goto(`${fixtureBase}&factioncooldownreload=load`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitForText(page, "FACTIONS / EXTERNAL AFFAIRS", 120000);

    await expandFactionActions(page, "The Authority");
    const authorityNegotiation = await optionSnapshot(page, "The Authority", "NEGOTIATE");
    check(
      "cooling faction action shows the post-resume remaining-tick warning",
      authorityNegotiation?.found &&
        authorityNegotiation.disabled &&
        authorityNegotiation.cardText.includes("Recently used — wait 9 ticks"),
    );
    const authorityHonor = await optionSnapshot(page, "The Authority", "GRANT HONOR");
    check(
      "a different verb keeps its own cooldown state",
      authorityHonor?.found &&
        authorityHonor.disabled &&
        authorityHonor.cardText.includes("Recently used — wait 4 ticks"),
    );

    const syndicateNegotiation = await optionSnapshot(page, "The Sector Syndicates", "NEGOTIATE");
    check(
      "the same verb is enabled for a different faction after resume",
      syndicateNegotiation?.found && !syndicateNegotiation.disabled,
    );
    await clickOption(page, "The Sector Syndicates", "NEGOTIATE");
    await waitForText(page, "NEGOTIATE: The Sector Syndicates");
    check("the expired faction action opens its confirmation", await visibleText(page, "Open diplomatic channels"));
    await clickVisibleText(page, "Abort");
    check("the factions screen stays error-free", pageErrors.length === 0);

    // Cloud restore uses the same save envelope, but the browser fixture
    // supplies a Steam-compatible bridge so the app exercises the real
    // writeCloudSave/readCloudSave/reconcileCloudSaves path. The cloud
    // namespace is separate from both the fixture slot and player slots.
    await installCloudFixtureBridge(page);
    await page.goto(`${fixtureBase}&factioncooldownreload=cloud-save`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitForText(page, "FACTIONS / EXTERNAL AFFAIRS", 120000);
    await page.waitForFunction(
      (prefix, localKey) => {
        const cloudKey = Object.keys(window.localStorage).find((key) => key.startsWith(prefix));
        const cloudRaw = cloudKey ? window.localStorage.getItem(cloudKey) : null;
        // saveToSlot commits locally before its cloud push, so wait for the
        // cloud copy to catch up instead of accepting an earlier startup
        // reconcile upload.
        return Boolean(cloudRaw && window.localStorage.getItem(localKey) === cloudRaw);
      },
      { timeout: 120000 },
      CLOUD_FIXTURE_STORAGE_PREFIX,
      fixtureKey,
    );
    const cloudSnapshot = await page.evaluate((prefix) => {
      const cloudKey = Object.keys(window.localStorage).find((key) => key.startsWith(prefix));
      return cloudKey
        ? {
            key: cloudKey,
            raw: window.localStorage.getItem(cloudKey),
          }
        : null;
    }, CLOUD_FIXTURE_STORAGE_PREFIX);
    check(
      "cloud fixture stores the isolated save envelope",
      Boolean(cloudSnapshot?.raw) && cloudSnapshot.key !== FIXTURE_STORAGE_KEY,
    );

    // Remove only the fixture's local primary and backup. This models a
    // device restore with no local copy and leaves every real save key alone.
    await page.evaluate((key) => {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(`${key}_backup`);
      window.localStorage.removeItem(`${key}.tmp`);
    }, fixtureKey);
    const beforeCloudRestore = await page.evaluate((key) => ({
      fixture: window.localStorage.getItem(key),
      realSlot: window.localStorage.getItem("@megacity_slot_1"),
      legacySlot: window.localStorage.getItem("@megacity_save"),
    }), fixtureKey);
    check(
      "cloud restore starts without a local fixture or player save",
      !beforeCloudRestore.fixture && !beforeCloudRestore.realSlot && !beforeCloudRestore.legacySlot,
    );

    await page.goto(`${fixtureBase}&factioncooldownreload=cloud-load`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitForText(page, "FACTIONS / EXTERNAL AFFAIRS", 120000);
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      fixtureKey,
    );
    const restoredRaw = await page.evaluate((key) => window.localStorage.getItem(key), fixtureKey);
    check(
      "Steam Cloud restore preserves the saved envelope bytes",
      Boolean(cloudSnapshot?.raw) && restoredRaw === cloudSnapshot.raw,
    );

    await expandFactionActions(page, "The Authority");
    const restoredAuthorityNegotiation = await optionSnapshot(page, "The Authority", "NEGOTIATE");
    check(
      "cloud-restored cooldown keeps the faction-and-verb key",
      restoredAuthorityNegotiation?.found &&
        restoredAuthorityNegotiation.disabled &&
        restoredAuthorityNegotiation.cardText.includes("Recently used — wait 9 ticks"),
    );
    const restoredAuthorityHonor = await optionSnapshot(page, "The Authority", "GRANT HONOR");
    check(
      "cloud-restored cooldown map keeps the other verb key",
      restoredAuthorityHonor?.found &&
        restoredAuthorityHonor.disabled &&
        restoredAuthorityHonor.cardText.includes("Recently used — wait 4 ticks"),
    );
    const restoredSyndicateNegotiation = await optionSnapshot(
      page,
      "The Sector Syndicates",
      "NEGOTIATE",
    );
    check(
      "cloud-restored cooldown map keeps faction scoping",
      restoredSyndicateNegotiation?.found && !restoredSyndicateNegotiation.disabled,
    );
    await clickOption(page, "The Sector Syndicates", "NEGOTIATE");
    await waitForText(page, "NEGOTIATE: The Sector Syndicates");
    check(
      "cloud-restored expired action remains enabled",
      await visibleText(page, "Open diplomatic channels"),
    );
    await clickVisibleText(page, "Abort");
    check("cloud-restored factions screen stays error-free", pageErrors.length === 0);
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

try {
  await ensurePreviewReady();
  await run();
} catch (error) {
  console.error(`\nE2E FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (failures.length) {
  console.error(`\nFAILURES:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log("\nPASS: faction cooldown browser cases");
}