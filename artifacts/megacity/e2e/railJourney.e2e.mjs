// Real-screen regression for the complete rail-building journey:
// discover an allied endpoint, quote/propose a corridor, resolve consent,
// assign both supported crew configurations, save, reload, and verify that
// only the disposable fixture namespace was touched.

import { execSync } from "node:child_process";
import LZString from "lz-string";
import puppeteer from "puppeteer";

const { decompressFromUTF16 } = LZString;
const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120000;
const FIXTURE_STORAGE_KEY = "@megacity_e2e_rail_journey_reload_1";
const FIXTURE_PHASE_KEY = "@megacity_e2e_rail_journey_phase";

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPath(page, suffix, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith(suffix)) return;
    await sleep(250);
  }
  const body = await page.evaluate(() => document.body.innerText.slice(-5000));
  throw new Error(`Timed out waiting for path ${suffix}; current URL: ${page.url()}\n${body}`);
}

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

async function waitForVisibleText(page, text, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(250);
  }
  const body = await page.evaluate(() => document.body.innerText.slice(-4000));
  throw new Error(`Timed out waiting for visible text "${text}".\n${body}`);
}

async function clickVisibleText(page, text, { containing = false } = {}) {
  const clicked = await page.evaluate(({ target, containing }) => {
    const needle = target.toUpperCase();
    const matches = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const value = (element.innerText ?? "").replace(/\s+/g, " ").trim().toUpperCase();
        const label = (element.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim().toUpperCase();
        return rect.width > 0 && rect.height > 0 &&
          (containing ? value.includes(needle) : value === needle || label === needle);
      });
    const pressables = matches.filter((element) =>
      element.getAttribute("tabindex") === "0" ||
      element.getAttribute("role") === "button" ||
      element.tagName === "BUTTON",
    );
    const element = (pressables.length ? pressables : matches)
      .sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, { target: text, containing });
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function clickLocation(page, label) {
  const clicked = await page.evaluate((target) => {
    const elements = [...document.querySelectorAll(`[aria-label]`)]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          (element.getAttribute("aria-label") ?? "").startsWith(target);
      });
    if (!elements[0]) return false;
    elements[0].scrollIntoView({ block: "center", inline: "center" });
    elements[0].click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not select map location ${label}`);
}

async function waitForTurnRecap(page, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, "TURN COMPLETE")) return "complete";
    if (await visibleText(page, "TURN INTERRUPTED")) return "interrupted";
    await sleep(250);
  }
  const body = await page.evaluate(() => document.body.innerText.slice(-3000));
  throw new Error(`Timed out waiting for turn recap.\n${body}`);
}

async function clickEndTurn(page) {
  const clicked = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('[role="button"], button')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 &&
        (element.getAttribute("aria-label") ?? "").toUpperCase() === "END TURN";
    });
    if (!candidates[0]) return false;
    candidates[0].click();
    return true;
  });
  if (!clicked) throw new Error("Could not find the visible END TURN button");
}

async function quickSave(page) {
  await page.keyboard.down("Control");
  await page.keyboard.press("s");
  await page.keyboard.up("Control");
}

async function readVisibleRailProgress(page) {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll("div, span")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const text = (element.innerText ?? "").replace(/\s+/g, " ").trim().toUpperCase();
      return rect.width > 0 && rect.height > 0 &&
        text.includes("CORRIDOR TO IRONGATE") &&
        /PROGRESS:\s*[\d,]+\s*\/\s*[\d,]+\s*TICKS/.test(text);
    }).sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length);
    const text = candidates[0]?.innerText ?? "";
    const match = text.match(/PROGRESS:\s*([\d,]+)\s*\/\s*([\d,]+)\s*TICKS/i);
    return match ? { progressTicks: Number(match[1].replace(/,/g, "")), totalTicks: Number(match[2].replace(/,/g, "")) } : null;
  });
}

async function createIsolatedDemoProfile(page) {
  await waitForVisibleText(page, "NEW COMMANDER");
  await clickVisibleText(page, "NEW COMMANDER");
  await waitForVisibleText(page, "COMMANDER & CITY SETUP");
  const input = await page.$('input[aria-label="Commander name"]');
  if (!input) throw new Error("Commander name input was not rendered");
  await input.click({ clickCount: 3 });
  await input.type("E2E Rail Journey Marshal");
  await clickVisibleText(page, "VETERAN");
  await clickVisibleText(page, "TURN-BASED");
  await clickVisibleText(page, "CREATE COMMANDER & LAUNCH CITY");
  if (await visibleText(page, "TURN-BASED COMMAND")) {
    await clickVisibleText(page, "MAP");
  }
  await waitForPath(page, "/worldmap");
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string" ? decompressFromUTF16(envelope.data) : raw;
  return json ? JSON.parse(json) : null;
}

async function readPersistedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_STORAGE_KEY);
  if (!raw) return null;
  return decodePersistedState(raw);
}

async function snapshotNormalSlotKeys(page) {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .filter((key) => key === "@megacity_save" || key.startsWith("@megacity_slot_"))
      .sort()
      .map((key) => [key, window.localStorage.getItem(key)]),
  ));
}

async function removeFixtureStorage(page) {
  await page.evaluate((fixtureKey) => {
    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      if (key === fixtureKey ||
          key.startsWith("@megacity_e2e_rail_journey_reload_") ||
          key.startsWith("@megacity_profile_") ||
          key === "@megacity_profiles" ||
          key === "@megacity_active_profile") {
        window.localStorage.removeItem(key);
      }
    }
  }, FIXTURE_STORAGE_KEY);
}

function assertCorridor(state, label) {
  const corridor = state?.railCorridors?.[0];
  if (!corridor) throw new Error(`${label}: no rail corridor persisted`);
  if (corridor.endpointId !== "irongate") throw new Error(`${label}: wrong endpoint ${corridor.endpointId}`);
  if (!Number.isFinite(corridor.distance) || corridor.distance <= 0) throw new Error(`${label}: invalid rail distance`);
  if (corridor.totalTicks <= 0) throw new Error(`${label}: invalid rail duration`);
  if (corridor.status !== "under_construction") throw new Error(`${label}: expected under_construction, got ${corridor.status}`);
  if (corridor.committedCredits <= 0 || corridor.committedSteel <= 0) throw new Error(`${label}: missing committed costs`);
  if (corridor.progressTicks < 0 || corridor.progressTicks > corridor.totalTicks) throw new Error(`${label}: invalid progress`);
  if (corridor.staffing.engineers !== 2 ||
      corridor.staffing.railWorkers !== 0 ||
      corridor.staffing.robots !== 10 ||
      corridor.staffing.security !== 1 ||
      corridor.staffing.ticketing !== 1 ||
      corridor.staffing.admin !== 1 ||
      corridor.staffing.maintenance !== 1) {
    throw new Error(`${label}: automated crew did not persist: ${JSON.stringify(corridor.staffing)}`);
  }
  return corridor;
}

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage();
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" &&
      !/favicon|net::|404|AbortError|NotAllowedError|cannot be a descendant|nested %s/.test(message.text())) {
    browserErrors.push(message.text());
  }
});

try {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((key) => {
    window.sessionStorage.setItem(key, "save");
  }, FIXTURE_PHASE_KEY);
  await page.goto(
    `${BASE_URL}/?demo=1&railjourney=1&railjourneyreload=save&mode=turnbased&go=worldmap`,
    { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS },
  );
  const normalSlotKeysBefore = await snapshotNormalSlotKeys(page);
  await createIsolatedDemoProfile(page);

  await clickLocation(page, "Irongate, township");
  await waitForVisibleText(page, "RAIL NETWORK");
  await waitForVisibleText(page, "QUOTE:");
  await waitForVisibleText(page, "YEARS");
  await waitForVisibleText(page, "CREDITS");
  await waitForVisibleText(page, "STEEL");
  await waitForVisibleText(page, "PARTNER CONSENT REQUIRED");
  await clickVisibleText(page, "PROPOSE CORRIDOR");
  await waitForVisibleText(page, "AWAITING PARTNER RESPONSE");

  await clickVisibleText(page, "DIPLO");
  await waitForPath(page, "/diplomacy");
  await clickVisibleText(page, "PACTS");
  await waitForVisibleText(page, "RAIL CORRIDORS");
  await waitForVisibleText(page, "RAIL CORRIDOR:");
  await clickVisibleText(page, "PARTNER ACCEPTS");
  await waitForVisibleText(page, "UNDER CONSTRUCTION");

  await clickVisibleText(page, "BUILD");
  await waitForPath(page, "/construction");
  await waitForVisibleText(page, "RAIL CORRIDOR PROGRAM");
  await waitForVisibleText(page, "ASSIGN STANDARD CREW");
  await clickVisibleText(page, "ASSIGN STANDARD CREW");
  await clickVisibleText(page, "ASSIGN AUTOMATED CREW");
  await page.waitForFunction(
    () => document.body.innerText.includes("ROBOTS: 10"),
    { timeout: READY_TIMEOUT_MS },
  );
  await quickSave(page);
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout: READY_TIMEOUT_MS },
    FIXTURE_STORAGE_KEY,
  );

  const savedState = await readPersistedState(page);
  const savedCorridor = assertCorridor(savedState, "saved state");
  if (savedState.resources.credits >= 250_000 || savedState.resources.steel >= 25_000) {
    throw new Error("saved state did not commit credits and steel");
  }

  await page.evaluate((key) => window.sessionStorage.setItem(key, "load"), FIXTURE_PHASE_KEY);
  await page.goto(
    `${BASE_URL}/?demo=1&railjourney=1&railjourneyreload=load&mode=turnbased&go=construction`,
    { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS },
  );
  await waitForPath(page, "/construction");
  await waitForVisibleText(page, "RAIL CORRIDOR PROGRAM");
  await page.waitForFunction(
    () => document.body.innerText.includes("ROBOTS: 10"),
    { timeout: READY_TIMEOUT_MS },
  );
  const reloadedState = await readPersistedState(page);
  const reloadedCorridor = assertCorridor(reloadedState, "reloaded state");
  for (const field of [
    "id", "endpointId", "endpointKind", "endpointLocationId", "distance",
    "totalTicks", "progressTicks", "setbackTicks", "committedCredits",
    "committedSteel", "status",
  ]) {
    if (reloadedCorridor[field] !== savedCorridor[field]) {
      throw new Error(`reload changed corridor ${field}: ${savedCorridor[field]} → ${reloadedCorridor[field]}`);
    }
  }
  if (JSON.stringify(reloadedCorridor.staffing) !== JSON.stringify(savedCorridor.staffing)) {
    throw new Error("reload changed rail staffing");
  }

  await clickVisibleText(page, "CITY");
  await waitForPath(page, "/overview");
  await waitForVisibleText(page, "END TURN");
  const rawBeforeTurn = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_STORAGE_KEY);
  await clickEndTurn(page);
  const turnRecap = await waitForTurnRecap(page);
  if (turnRecap !== "complete") {
    const body = await page.evaluate(() => document.body.innerText);
    throw new Error(`rail journey turn was interrupted:\n${body}`);
  }

  await quickSave(page);
  await page.waitForFunction(
    ({ key, previous }) => window.localStorage.getItem(key) !== previous,
    { timeout: READY_TIMEOUT_MS },
    { key: FIXTURE_STORAGE_KEY, previous: rawBeforeTurn },
  );
  const advancedState = await readPersistedState(page);
  const advancedCorridor = assertCorridor(advancedState, "advanced saved state");
  if (advancedCorridor.progressTicks <= reloadedCorridor.progressTicks) {
    throw new Error(`rail corridor did not advance after turn: ${reloadedCorridor.progressTicks} → ${advancedCorridor.progressTicks}`);
  }

  await clickVisibleText(page, "BUILD");
  await waitForPath(page, "/construction");
  await waitForVisibleText(page, "RAIL CORRIDOR PROGRAM");
  const visibleProgressHandle = await page.waitForFunction(
    async () => {
      const candidates = [...document.querySelectorAll("div, span")].filter((element) => {
        const rect = element.getBoundingClientRect();
        const text = (element.innerText ?? "").replace(/\s+/g, " ").trim().toUpperCase();
        return rect.width > 0 && rect.height > 0 &&
          text.includes("CORRIDOR TO IRONGATE") &&
          /PROGRESS:\s*[\d,]+\s*\/\s*[\d,]+\s*TICKS/.test(text);
      }).sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length);
      const text = candidates[0]?.innerText ?? "";
      const match = text.match(/PROGRESS:\s*([\d,]+)\s*\/\s*([\d,]+)\s*TICKS/i);
      return match ? { progressTicks: Number(match[1].replace(/,/g, "")), totalTicks: Number(match[2].replace(/,/g, "")) } : null;
    },
    { timeout: READY_TIMEOUT_MS },
  );
  const visibleProgress = await visibleProgressHandle.jsonValue();
  if (!visibleProgress || visibleProgress.progressTicks <= 0) {
    throw new Error(`construction screen did not show positive rail progress: ${JSON.stringify(visibleProgress)}`);
  }
  if (visibleProgress.progressTicks !== advancedCorridor.progressTicks ||
      visibleProgress.totalTicks !== advancedCorridor.totalTicks) {
    throw new Error(`visible rail progress disagrees with saved state: ${JSON.stringify(visibleProgress)} vs ${JSON.stringify({ progressTicks: advancedCorridor.progressTicks, totalTicks: advancedCorridor.totalTicks })}`);
  }

  const normalSlotKeysAfter = await snapshotNormalSlotKeys(page);
  if (JSON.stringify(normalSlotKeysAfter) !== JSON.stringify(normalSlotKeysBefore)) {
    throw new Error("rail fixture changed normal player slot keys");
  }
  await removeFixtureStorage(page);
  const remainingFixtureKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) =>
      key.startsWith("@megacity_e2e_rail_journey_reload_") ||
      key.startsWith("@megacity_profile_") ||
      key === "@megacity_profiles" ||
      key === "@megacity_active_profile",
    ),
  );
  if (remainingFixtureKeys.length) {
    throw new Error(`fixture cleanup left storage keys: ${remainingFixtureKeys.join(", ")}`);
  }

  if (browserErrors.length) {
    throw new Error(`Browser errors during rail journey check:\n${browserErrors.join("\n")}`);
  }
  const years = Math.round(savedCorridor.totalTicks / (24 * 60 / 15 * 365));
  console.log(`[e2e] PASS: rail journey quoted ${savedCorridor.distance} km for ${years} years, committed resources, resolved consent, persisted automated staffing, advanced to ${advancedCorridor.progressTicks} progress ticks after one turn, and matched the construction screen`);
} finally {
  await removeFixtureStorage(page).catch(() => {});
  await browser.close().catch(() => {});
}