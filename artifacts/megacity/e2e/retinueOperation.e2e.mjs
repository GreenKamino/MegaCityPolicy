// Browser regression coverage for the player-facing squad operation lifecycle.
//
// The disposable fixture starts with an eligible captain-led squad using
// Assault doctrine. The test selects Supply Recovery, checks the doctrine-
// adjusted preview, launches it through the confirmation modal, advances the
// real turn-based tick pipeline, and verifies the returned history entry and
// troop recovery.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/retinueOperation.e2e.mjs

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
  `${BASE_URL}/?demo=1&retinueoperation=1&retinueOperationReload=save&mode=turnbased&go=retinue`;
const RELOAD_URL =
  `${BASE_URL}/?demo=1&retinueoperation=1&retinueOperationReload=load&mode=turnbased&go=retinue`;
const CLOUD_SAVE_URL =
  `${BASE_URL}/?demo=1&retinueoperation=1&retinueOperationReload=cloud-save&mode=turnbased&go=retinue`;
const CLOUD_LOAD_URL =
  `${BASE_URL}/?demo=1&retinueoperation=1&retinueOperationReload=cloud-load&mode=turnbased&go=retinue`;
const ISOLATED_SAVE_KEY = "@megacity_e2e_retinue_operation_1";
const CLOUD_FIXTURE_STORAGE_PREFIX = "@megacity_e2e_retinue_operation_cloud_";

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForIsolatedSave(page, timeout = 90000) {
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout },
    ISOLATED_SAVE_KEY,
  );
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json =
    typeof envelope.data === "string"
      ? decompressFromUTF16(envelope.data)
      : raw;
  return json ? JSON.parse(json) : null;
}

async function readIsolatedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), ISOLATED_SAVE_KEY);
  if (!raw) throw new Error("The isolated Retinue operation save was not written");
  return decodePersistedState(raw);
}

async function installCloudFixtureBridge(page) {
  await page.evaluateOnNewDocument(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("demo") !== "1" ||
      params.get("retinueoperation") !== "1" ||
      !["cloud-save", "cloud-load"].includes(
        params.get("retinueOperationReload") ?? "",
      )
    ) {
      return;
    }

    const storagePrefix = "@megacity_e2e_retinue_operation_cloud_";
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
      getSteamId: () => "e2e-retinue-operation",
      cloud,
    };
  });
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

function assertInFlightOperation(state, source) {
  const active = state?.retinue?.activeOperation;
  const squad = state?.retinue?.squads?.find((candidate) => candidate.id === "demo-operation-squad");
  const troops = state?.retinue?.troops?.filter((troop) =>
    ["demo-operation-infantry", "demo-operation-gunner"].includes(troop.id),
  );
  if (
    !active ||
    active.operationId !== "supply_recovery" ||
    active.squadId !== "demo-operation-squad" ||
    active.ticksRemaining !== 11 ||
    active.resolution.duration !== 11 ||
    active.resolution.successChance !== 95 ||
    active.resolution.doctrineModifiers?.powerMultiplier !== 1.15 ||
    active.resolution.doctrineModifiers?.casualtyRiskMultiplier !== 1.2 ||
    active.resolution.doctrineModifiers?.operationSpeedMultiplier !== 1.1 ||
    squad?.doctrine !== "assault" ||
    troops?.length !== 2 ||
    troops.some((troop) => troop.status !== "deployed")
  ) {
    throw new Error(`${source} save did not preserve the in-flight operation, doctrine values, or deployed troops`);
  }
}

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

async function pressTestId(page, testId) {
  const pressed = await page.evaluate((targetTestId) => {
    const element = document.querySelector(`[data-testid="${targetTestId}"]`);
    if (!element || element.getBoundingClientRect().width <= 0 || element.getBoundingClientRect().height <= 0) {
      return false;
    }
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
  }, testId);
  if (!pressed) throw new Error(`Could not find visible test id: ${testId}`);
}

async function assertNoVisibleText(page, text) {
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
  if (visible) throw new Error(`Unexpected visible text: ${text}`);
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
  await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });
  // Keep the operation outcome deterministic without changing the game's
  // runtime code or its normal random source.
  await page.evaluateOnNewDocument(() => {
    Math.random = () => 0;
  });
  const browserErrors = [];
  page.on("pageerror", (error) => {
    // expo-audio's web player can reject an internal HTMLMediaElement.play()
    // promise when the ambience driver pauses during a route transition. It
    // is a browser-managed cancellation, not an app/runtime failure.
    if (/AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(String(error))) {
      return;
    }
    browserErrors.push(String(error));
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404|AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(message.text())
    ) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForVisibleText(page, "RETINUE COMMAND");
    await pressExactText(page, "SQUADS");
    await waitForVisibleText(page, "FIELD RESPONSE");
    await waitForVisibleText(page, "CAPTAIN VOSS");
    await waitForVisibleText(page, "DOCTRINE: ASSAULT");

    await pressAriaLabel(page, "Plan an operation for FIELD RESPONSE");
    await waitForVisibleText(page, "SELECT OPERATION");
    await pressAriaLabel(page, "Select Supply Recovery");
    await waitForVisibleText(page, "11 TICKS");
    await waitForVisibleText(page, "95%");
    await waitForVisibleText(page, "0–1 / 2");
    await waitForVisibleText(page, "110% speed");
    await waitForVisibleText(page, "120% casualty risk");

    await pressAriaLabel(page, "Launch Supply Recovery with FIELD RESPONSE");
    await waitForVisibleText(page, "LAUNCH SUPPLY RECOVERY?");
    await waitForVisibleText(page, "11 ticks · 95% success · 0-1 troop exposure");
    await pressExactText(page, "LAUNCH");
    await waitForVisibleText(page, "DEPLOYED · SUPPLY RECOVERY");
    await waitForVisibleText(page, "squad personnel are unavailable until return");
    await waitForVisibleText(page, "Resolves in 11 ticks");
    await waitForIsolatedSave(page);
    assertInFlightOperation(await readIsolatedState(page), "Local");

    await page.goto(RELOAD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForVisibleText(page, "RETINUE COMMAND");
    await waitForVisibleText(page, "ACTIVE OPERATION");
    await waitForVisibleText(page, "Supply Recovery · FIELD RESPONSE");
    await waitForVisibleText(page, "11 ticks remaining");
    await waitForVisibleText(page, "troops are deployed and unavailable");
    assertInFlightOperation(await readIsolatedState(page), "Reloaded");
    await pressExactText(page, "ROSTER");
    await waitForVisibleText(page, "ALL TROOPS (2)");
    await waitForVisibleText(page, "DEPLOYED");
    await pressExactText(page, "SQUADS");

    // Cloud save starts a new provider instance. The GameContext fixture
    // hydrates the local operation before its save is pushed through the
    // disposable Steam-compatible bridge, so a page transition cannot upload
    // the fresh demo state instead.
    await installCloudFixtureBridge(page);
    await page.goto(CLOUD_SAVE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForVisibleText(page, "RETINUE COMMAND");
    await waitForVisibleText(page, "ACTIVE OPERATION");
    await waitForVisibleText(page, "Supply Recovery · FIELD RESPONSE");
    await waitForVisibleText(page, "11 ticks remaining");
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
      throw new Error("The disposable Steam Cloud fixture did not receive the squad operation save");
    }
    assertInFlightOperation(decodePersistedState(cloudSnapshot.raw), "Cloud");

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

    await page.goto(CLOUD_LOAD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForVisibleText(page, "RETINUE COMMAND");
    await waitForVisibleText(page, "ACTIVE OPERATION");
    await waitForVisibleText(page, "Supply Recovery · FIELD RESPONSE");
    await waitForVisibleText(page, "11 ticks remaining");
    await waitForVisibleText(page, "troops are deployed and unavailable");
    assertInFlightOperation(await readIsolatedState(page), "Cloud-restored");
    await pressExactText(page, "ROSTER");
    await waitForVisibleText(page, "ALL TROOPS (2)");
    await waitForVisibleText(page, "DEPLOYED");
    await pressExactText(page, "SQUADS");

    // END TURN runs four real shared ticks. Three presses are enough to move
    // the Cloud-restored 11-tick operation through its countdown and
    // completion.
    await pressTestId(page, "top-nav-overview");
    await waitForVisibleText(page, "END TURN");
    await pressAriaLabel(page, "End turn");
    await pressAriaLabel(page, "End turn");
    await pressAriaLabel(page, "End turn");

    await pressTestId(page, "top-nav-more");
    await waitForVisibleText(page, "RETINUE COMMAND");
    await pressExactText(page, "RETINUE COMMAND");
    await waitForVisibleText(page, "RETINUE COMMAND");
    await pressExactText(page, "OVERVIEW");
    await waitForVisibleText(page, "FIELD RESPONSE");
    await waitForVisibleText(page, "OPERATION HISTORY");
    await waitForVisibleText(page, "Supply Recovery · FIELD RESPONSE");
    await waitForVisibleText(page, "SUCCESS · 11 ticks · 0 wounded · 0 KIA");

    await pressExactText(page, "SQUADS");
    await waitForVisibleText(page, "2/4 troops");
    await assertNoVisibleText(page, "DEPLOYED · SUPPLY RECOVERY");

    if (browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
    console.log("[e2e] PASS: Supply Recovery launched, deployed, completed, and returned troops to duty");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});