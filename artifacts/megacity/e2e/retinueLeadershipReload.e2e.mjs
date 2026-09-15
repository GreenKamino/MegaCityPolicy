// Browser regression coverage for squad captain and doctrine persistence,
// including a disposable Steam Cloud round trip.
//
// The disposable fixture starts with a two-troop, leaderless squad and one
// available captain. The test appoints Captain Rhea, switches the squad to
// Assault doctrine, verifies the live power ledger, then reloads through the
// isolated save path and checks the same leadership, doctrine, and breakdown.
// It then repeats the save through a disposable Steam-compatible cloud bridge,
// removes the local copy, and restores through the cloud reconciliation path.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/retinueLeadershipReload.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import LZString from "lz-string";

const { decompressFromUTF16 } = LZString;

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const FIXTURE_URL =
  `${BASE_URL}/?demo=1&retinueleadership=1&retinueLeadershipReload=save&go=retinue`;
const RELOAD_URL =
  `${BASE_URL}/?demo=1&retinueleadership=1&retinueLeadershipReload=load&go=retinue`;
const CHARACTER_RELOAD_URL =
  `${BASE_URL}/?demo=1&retinueleadership=1&retinueLeadershipReload=load&go=character`;
const CLOUD_SAVE_URL =
  `${BASE_URL}/?demo=1&retinueleadership=1&retinueLeadershipReload=cloud-save&go=retinue`;
const CLOUD_LOAD_URL =
  `${BASE_URL}/?demo=1&retinueleadership=1&retinueLeadershipReload=cloud-load&go=retinue`;
const ISOLATED_SAVE_KEY = "@megacity_e2e_retinue_leadership_1";
const CLOUD_FIXTURE_STORAGE_PREFIX = "@megacity_e2e_retinue_leadership_cloud_";
const EXPECTED_POWER_BREAKDOWN = "43 × 1.15 doctrine = 49 combat power";
const VIEWPORTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 720 },
];

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForVisibleText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await page.evaluate((target) => {
      const needle = target.toUpperCase();
      return [...document.querySelectorAll("div, span, button, [role='button']")].some((element) => {
        const rect = element.getBoundingClientRect();
        return (
          (element.innerText ?? element.textContent ?? "").toUpperCase().includes(needle) &&
          rect.width > 0 &&
          rect.height > 0
        );
      });
    }, text);
    if (visible) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForPath(page, suffix, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith(suffix)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for path ${suffix}; current URL: ${page.url()}`);
}

async function pressAriaLabel(page, label) {
  const pressed = await page.evaluate((targetLabel) => {
    const target = targetLabel.trim().toUpperCase();
    const element = [...document.querySelectorAll("[aria-label]")].find(
      (node) => (node.getAttribute("aria-label") ?? "").trim().toUpperCase() === target,
    );
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    };
    element.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
    element.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    element.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
    return true;
  }, label);
  if (!pressed) throw new Error(`Could not find aria-label: ${label}`);
}

async function pressExactText(page, text) {
  const pressed = await page.evaluate((targetText) => {
    const target = targetText.trim().toUpperCase();
    const element = [...document.querySelectorAll("div, span, button, [role='button']")].find(
      (node) =>
        ((node.innerText ?? node.textContent) ?? "").trim().toUpperCase() === target &&
        node.getBoundingClientRect().width > 0 &&
        node.getBoundingClientRect().height > 0,
    );
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    };
    element.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
    element.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    element.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
    return true;
  }, text);
  if (!pressed) throw new Error(`Could not find visible text control: ${text}`);
}

async function waitForIsolatedSave(page, timeout = 90000) {
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout },
    ISOLATED_SAVE_KEY,
  );
}

async function installCloudFixtureBridge(page) {
  await page.evaluateOnNewDocument(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("demo") !== "1" ||
      params.get("retinueleadership") !== "1" ||
      !["cloud-save", "cloud-load"].includes(
        params.get("retinueLeadershipReload") ?? "",
      )
    ) {
      return;
    }

    const storagePrefix = "@megacity_e2e_retinue_leadership_cloud_";
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
      fileExists: (filename) =>
        window.localStorage.getItem(storageKey(filename)) !== null,
      getFileCount: () =>
        Object.keys(window.localStorage).filter((key) =>
          key.startsWith(storagePrefix),
        ).length,
      getFileSize: (filename) =>
        window.localStorage.getItem(storageKey(filename))?.length ?? 0,
      isCloudEnabled: () => true,
    };

    window.steamworks = {
      isInitialized: () => true,
      setAchievement: () => true,
      clearAchievement: () => true,
      getAchievement: () => false,
      storeStats: () => true,
      getSteamId: () => "e2e-retinue-leadership",
      cloud,
    };
  });
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json =
    typeof envelope.data === "string"
      ? decompressFromUTF16(envelope.data)
      : raw;
  return json ? JSON.parse(json) : null;
}

async function readCloudSnapshot(page) {
  return page.evaluate((prefix) => {
    const key = Object.keys(window.localStorage).find(
      (candidate) =>
        candidate.startsWith(prefix) && candidate.includes("megacity_save_"),
    );
    return key
      ? { key, raw: window.localStorage.getItem(key) }
      : null;
  }, CLOUD_FIXTURE_STORAGE_PREFIX);
}

function assertPersistedLeadership(state, source) {
  const squad = state?.retinue?.squads?.find(
    (candidate) => candidate.id === "demo-leadership-squad",
  );
  if (
    !squad ||
    squad.captainId !== "demo-leadership-captain" ||
    squad.doctrine !== "assault"
  ) {
    throw new Error(
      `${source} save did not retain Captain Rhea and Assault doctrine`,
    );
  }
  const captain = state.retinue.captains?.find(
    (candidate) => candidate.id === squad.captainId,
  );
  if (!captain || captain.name !== "CAPTAIN RHEA") {
    throw new Error(`${source} save did not retain the appointed captain record`);
  }
  if (squad.troopIds?.length !== 2) {
    throw new Error(`${source} save did not retain the squad composition used by the power breakdown`);
  }
  if (state.personalActionCooldowns?.["captain:demo-leadership-captain:flatter"] !== 128) {
    throw new Error(`${source} save did not retain the captain cooldown`);
  }
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ ...VIEWPORTS[0], deviceScaleFactor: 1 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForPath(page, "/retinue");
    await waitForVisibleText(page, "RETINUE");
    await pressExactText(page, "SQUADS");
    await waitForVisibleText(page, "COMMAND POST");
    await waitForVisibleText(page, "LEADERLESS");
    await waitForVisibleText(page, "20 × 1 doctrine × 0.75 leaderless = 15 combat power");

    await pressAriaLabel(page, "Appoint a captain for COMMAND POST");
    await waitForVisibleText(page, "APPOINT CAPTAIN");
    await pressExactText(page, "CAPTAIN RHEA — LV.1");
    await waitForVisibleText(page, "CAPTAIN RHEA");
    await waitForVisibleText(page, "FLATTER");
    await waitForVisibleText(page, "Recently used — wait 8 ticks");
    await waitForVisibleText(page, "Captain +23");
    await waitForVisibleText(page, "43 × 1 doctrine = 43 combat power");

    await pressAriaLabel(page, "Set COMMAND POST doctrine to Assault");
    await waitForVisibleText(page, "DOCTRINE: ASSAULT");
    await waitForVisibleText(page, EXPECTED_POWER_BREAKDOWN);
    await waitForIsolatedSave(page);

    await page.goto(RELOAD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForPath(page, "/retinue");
    await pressExactText(page, "SQUADS");
    await waitForVisibleText(page, "COMMAND POST");
    await waitForVisibleText(page, "CAPTAIN RHEA");
    await waitForVisibleText(page, "DOCTRINE: ASSAULT");
    await waitForVisibleText(page, "Captain +23");
    await waitForVisibleText(page, EXPECTED_POWER_BREAKDOWN);
    await waitForVisibleText(page, "2/4 troops");

    // The shared personal-action menu lives on the Character dossier's
    // Retinue/SQUADS cards. Reopen the saved state there so this verifies the
    // appointed captain's cooldown on the same real card that renders it.
    await page.goto(CHARACTER_RELOAD_URL, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForPath(page, "/character");
    await pressExactText(page, "RETINUE");
    await pressExactText(page, "SQUADS");
    await waitForVisibleText(page, "CAPTAIN RHEA");
    await waitForVisibleText(page, "FLATTER");
    for (const viewport of VIEWPORTS) {
      await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
      await waitForVisibleText(page, "Recently used — wait 8 ticks");
      console.log(`PASS ${viewport.name} Character screen keeps the captain cooldown reason visible`);
    }

    // The cloud phase starts a new provider instance. The fixture hydrates
    // the completed local save before its cloud write, then the test checks
    // the opaque cloud envelope itself before removing local bytes.
    await installCloudFixtureBridge(page);
    await page.goto(CLOUD_SAVE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForPath(page, "/retinue");
    await pressExactText(page, "SQUADS");
    await waitForVisibleText(page, EXPECTED_POWER_BREAKDOWN);
    await page.waitForFunction(
      (prefix) =>
        Object.keys(window.localStorage).some(
          (key) =>
            key.startsWith(prefix) && key.includes("megacity_save_"),
        ),
      { timeout: 120000 },
      CLOUD_FIXTURE_STORAGE_PREFIX,
    );
    const cloudSnapshot = await readCloudSnapshot(page);
    if (!cloudSnapshot?.raw) {
      throw new Error("The disposable Steam Cloud fixture did not receive the squad save");
    }
    const cloudState = decodePersistedState(cloudSnapshot.raw);
    assertPersistedLeadership(cloudState, "Cloud");

    await page.evaluate((key) => {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(`${key}_backup`);
      window.localStorage.removeItem(`${key}.tmp`);
    }, ISOLATED_SAVE_KEY);
    const localBeforeRestore = await page.evaluate((key) => ({
      fixture: window.localStorage.getItem(key),
      playerSlot: window.localStorage.getItem("@megacity_slot_1"),
      legacySlot: window.localStorage.getItem("@megacity_save"),
    }), ISOLATED_SAVE_KEY);
    if (
      localBeforeRestore.fixture ||
      localBeforeRestore.playerSlot ||
      localBeforeRestore.legacySlot
    ) {
      throw new Error("Cloud restore still had a local or player save before restore");
    }

    await page.goto(CLOUD_LOAD_URL, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForPath(page, "/retinue");
    await pressExactText(page, "SQUADS");
    await waitForVisibleText(page, "COMMAND POST");
    await waitForVisibleText(page, "CAPTAIN RHEA");
    await waitForVisibleText(page, "DOCTRINE: ASSAULT");
    await waitForVisibleText(page, "Captain +23");
    await waitForVisibleText(page, EXPECTED_POWER_BREAKDOWN);
    await waitForVisibleText(page, "2/4 troops");

    const restoredRaw = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ISOLATED_SAVE_KEY,
    );
    if (!restoredRaw) {
      throw new Error("Steam Cloud restore did not recreate the isolated local save");
    }
    assertPersistedLeadership(decodePersistedState(restoredRaw), "Cloud-restored");

    if (browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
    console.log("[e2e] PASS: captain appointment, Assault doctrine, and squad power survive local reload and Steam Cloud restore");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
