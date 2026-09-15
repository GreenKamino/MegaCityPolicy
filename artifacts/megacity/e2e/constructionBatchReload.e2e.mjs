// Real-screen regression for a multi-building construction batch surviving a
// normal save/reload. The fixture uses a disposable slot namespace and never
// touches a player's profile save.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/constructionBatchReload.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import {
  readFixtureState,
  readStorageRaw,
  removeFixtureStorage,
  writeFixtureState,
} from "./disposableSaveFixture.mjs";
import {
  clickVisibleTestId,
  clickVisibleTestIdCenter,
  waitForVisibleTestId,
} from "./visibleTestId.mjs";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120000;
const FIXTURE_STORAGE_KEY = "@megacity_e2e_construction_batch_reload_1";
const BUILDING_TEST_ID = "construction-building-waterPumpStations";

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
  throw new Error(`Timed out waiting for path ${suffix}; current URL: ${page.url()}`);
}

async function waitForOverviewOrConstruction(page, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const pathname = new URL(page.url()).pathname;
    if (pathname.endsWith("/overview") || pathname.endsWith("/construction")) {
      return pathname;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for overview or construction; current URL: ${page.url()}`);
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
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForGone(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await visibleText(page, text))) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for text to disappear: ${text}`);
}

async function waitForTurnRecap(page, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, "TURN COMPLETE")) return "complete";
    if (await visibleText(page, "TURN INTERRUPTED")) return "interrupted";
    await sleep(250);
  }
  const body = await page.evaluate(() => document.body.innerText.slice(-3000));
  throw new Error(`Timed out waiting for turn recap. Visible tail:\n${body}`);
}

async function clickVisibleText(page, text, { containing = false } = {}) {
  const marked = await page.evaluate(({ target, containing }) => {
    const needle = target.toUpperCase();
    const matches = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const value = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().toUpperCase();
        const label = (element.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim().toUpperCase();
        return rect.width > 0 && rect.height > 0 &&
          (containing ? value.includes(needle) : value === needle || label === needle);
      });
    // React Native Web puts the readable label in a nested span. Promote
    // matching text to its nearest Pressable before selecting a candidate so
    // a fast wizard transition cannot leave the click on a non-interactive
    // text node.
    const controls = matches.map((element) =>
      element.closest("[role='button'], button") ?? element,
    );
    const pressables = controls.filter((element) =>
      element.getAttribute("tabindex") === "0" ||
      element.getAttribute("role") === "button" ||
      element.tagName === "BUTTON",
    );
    const candidates = (pressables.length ? pressables : controls)
      .filter((element, index, all) => all.indexOf(element) === index)
      .sort((a, b) => (a.innerText || a.textContent || "").length - (b.innerText || b.textContent || "").length);
    const element = candidates[0];
    if (!element) return false;
    document.querySelectorAll("[data-e2e-target]").forEach((node) => node.removeAttribute("data-e2e-target"));
    element.setAttribute("data-e2e-target", "1");
    element.scrollIntoView({ block: "center", inline: "center" });
    return true;
  }, { target: text, containing });
  if (!marked) throw new Error(`Could not click visible text: ${text}`);
  const element = await page.$("[data-e2e-target]");
  if (!element) throw new Error(`Could not reacquire visible text: ${text}`);
  await sleep(250);
  await element.click();
  await page.evaluate(() => {
    document.querySelectorAll("[data-e2e-target]").forEach((node) => node.removeAttribute("data-e2e-target"));
  });
}

async function pressVisibleAriaLabel(page, label) {
  const pressed = await page.evaluate((target) => {
    const needle = target.trim().toUpperCase();
    const element = [...document.querySelectorAll("[aria-label]")]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          (candidate.getAttribute("aria-label") ?? "").trim().toUpperCase() === needle;
      });
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!pressed) throw new Error(`Could not press visible control: ${label}`);
}

async function clickVisibleConstructionNavigation(page) {
  const testIds = ["top-nav-construction", "desktop-command-construction"];
  await page.waitForFunction(
    (ids) => ids.some((id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }),
    { timeout: 30000 },
    testIds,
  );
  const constructionNav = await page.evaluate((ids) => {
    for (const testId of ids) {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return testId;
    }
    return null;
  }, testIds);
  if (!constructionNav) throw new Error("Could not find a visible construction navigation control");
  await clickVisibleTestId(page, constructionNav);
}

async function clickVisibleBuildingCard(page, testId, expectedText) {
  await clickVisibleTestIdCenter(page, testId);
  if (!expectedText) return;
  try {
    await waitForVisibleText(page, expectedText, 5000);
  } catch {
    await clickVisibleTestId(page, testId);
    await waitForVisibleText(page, expectedText);
  }
}

async function searchForBuilding(page, query, testId) {
  const input = await page.waitForSelector('input[aria-label="SEARCH BUILDINGS..."]', {
    timeout: READY_TIMEOUT_MS,
  });
  await input.click({ clickCount: 3 });
  await input.type(query);
  await waitForVisibleText(page, "SEARCH RESULTS");
  const visibleMatches = await page.$$eval(`[data-testid="${testId}"]`, (elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length,
  );
  if (visibleMatches !== 1) {
    throw new Error(`Expected exactly one visible global-search card for ${testId}, found ${visibleMatches}`);
  }
}

async function selectBatch100(page) {
  const clicked = await page.evaluate(() => {
    const element = document.querySelector('[role="radio"][aria-label="Build 100 buildings per order"]');
    if (!element || element.getBoundingClientRect().width <= 0 || element.getBoundingClientRect().height <= 0) {
      return false;
    }
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  });
  if (!clicked) throw new Error("Could not select the 100-building batch option");
  await page.waitForFunction(
    () => document.querySelector('[role="radio"][aria-label="Build 100 buildings per order"]')?.getAttribute("aria-checked") === "true",
    { timeout: 10000 },
  );
}

async function createIsolatedDemoProfile(page) {
  await waitForVisibleText(page, "NEW COMMANDER");
  await pressVisibleAriaLabel(page, "Create a new commander profile");
  await waitForVisibleText(page, "COMMANDER & CITY SETUP");
  await waitForVisibleText(page, "01 — COMMANDER IDENTITY");
  await waitForVisibleText(page, "04 — CITY & SECTOR COMMAND");
  const input = await page.$('input[aria-label="Commander name"]');
  if (!input) throw new Error("Commander name input was not rendered");
  await input.click({ clickCount: 3 });
  await input.type("E2E Construction Reload Marshal");
  await pressVisibleAriaLabel(page, "Start style: GUIDED");
  await pressVisibleAriaLabel(page, "Play mode: TURN-BASED");
  await pressVisibleAriaLabel(page, "Launch commander and city");
  await waitForVisibleText(page, "FIRST-RUN ORIENTATION", 60000);
  await pressVisibleAriaLabel(page, "Skip onboarding");
  await waitForVisibleText(page, "SKIP ORIENTATION?");
  await clickVisibleText(page, "SKIP", { last: true });
  const settledPath = await waitForOverviewOrConstruction(page, 60000);
  if (settledPath.endsWith("/overview")) {
    await clickVisibleConstructionNavigation(page);
  }
  await waitForPath(page, "/construction", 30000);
  await waitForVisibleText(page, "CONSTRUCTION / INFRASTRUCTURE", 60000);
  await waitForGone(page, "SKIP ORIENTATION?", 30000);
}

async function stabilizeReloadFixture(page) {
  const state = await readFixtureState(page, FIXTURE_STORAGE_KEY, "construction reload fixture");
  const templateRaw = await readStorageRaw(page, FIXTURE_STORAGE_KEY, "construction reload fixture");
  state.activeEvents = [];
  state.messages = [];
  state.newsFeed = [];
  state.calmStartTicks = Number.MAX_SAFE_INTEGER;
  state.eventChainCooldowns = Object.fromEntries(
    Object.keys(state.eventChainCooldowns ?? {}).map((key) => [key, Number.MAX_SAFE_INTEGER]),
  );
  state.tickPaused = true;
  state.gameplayMode = "turnbased";
  await writeFixtureState(page, FIXTURE_STORAGE_KEY, state, {
    templateRaw,
    label: "construction reload fixture",
  });
}

async function readPersistedState(page) {
  return readFixtureState(page, FIXTURE_STORAGE_KEY, "construction reload fixture");
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

function assertOrder(state, label) {
  const orders = state?.pendingConstructions ?? [];
  if (orders.length !== 1) throw new Error(`${label}: expected one queued order, got ${orders.length}`);
  const [order] = orders;
  if (order.kind !== "city" || order.buildingKey !== "waterPumpStations") {
    throw new Error(`${label}: queued order was not the water-pump city order`);
  }
  if (order.count !== 15) throw new Error(`${label}: expected one batch of 15, got ${order.count}`);
  if (!(order.ticksTotal > 1) || order.ticksRemaining !== order.ticksTotal) {
    throw new Error(`${label}: expected a fresh timer, got ${order.ticksRemaining}/${order.ticksTotal}`);
  }
  return order;
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
page.on("pageerror", (error) => {
  if (!/AbortError|NotAllowedError/.test(String(error))) browserErrors.push(String(error));
});
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    !/favicon|net::|404|AbortError|NotAllowedError|cannot be a descendant|nested %s/.test(message.text())
  ) {
    browserErrors.push(message.text());
  }
});

try {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(
    `${BASE_URL}/?demo=1&constructionbatch=1&constructionbatchphase=reload&constructionbatchreload=save&mode=turnbased&go=construction&highlight=waterPumpStations`,
    { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS },
  );
  await createIsolatedDemoProfile(page);
  await waitForVisibleText(page, "BUILD QUANTITY");
  await searchForBuilding(page, "water pump stations", BUILDING_TEST_ID);
  await waitForVisibleTestId(page, BUILDING_TEST_ID, READY_TIMEOUT_MS);
  await selectBatch100(page);
  await clickVisibleBuildingCard(page, BUILDING_TEST_ID, "CONSTRUCT 15x WATER PUMP STATIONS");
  await waitForVisibleText(page, "CONSTRUCT 15x WATER PUMP STATIONS");
  await waitForVisibleText(page, "Requested 100, reduced to 15");
  await waitForVisibleText(page, "195,000 cr + 300 steel");
  await waitForVisibleText(page, "Timed orders: 0/100 → 1/100");
  await clickVisibleText(page, "BUILD 15", { last: true });
  await waitForVisibleText(page, "BUILD 15× WATER PUMP STATIONS");
  await waitForGone(page, "CONSTRUCT 15x WATER PUMP STATIONS");
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout: READY_TIMEOUT_MS },
    FIXTURE_STORAGE_KEY,
  );
  await stabilizeReloadFixture(page);

  const savedState = await readPersistedState(page);
  const savedOrder = assertOrder(savedState, "saved state");
  const baselineBuildingCount = savedState.buildings?.waterPumpStations ?? 0;

  await page.goto(
    `${BASE_URL}/?demo=1&constructionbatch=1&constructionbatchphase=reload&constructionbatchreload=load&mode=turnbased&go=overview`,
    { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS },
  );
  await waitForPath(page, "/overview");
  await waitForVisibleText(page, "TURN-BASED COMMAND");
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout: READY_TIMEOUT_MS },
    FIXTURE_STORAGE_KEY,
  );
  const reloadedState = await readPersistedState(page);
  const reloadedOrder = assertOrder(reloadedState, "reloaded state");
  for (const field of ["id", "kind", "buildingKey", "label", "count", "ticksTotal", "ticksRemaining", "orderedTick"]) {
    if (reloadedOrder[field] !== savedOrder[field]) {
      throw new Error(`reload changed ${field}: ${savedOrder[field]} → ${reloadedOrder[field]}`);
    }
  }
  if (reloadedState.pendingConstructions.length !== savedState.pendingConstructions.length) {
    throw new Error("reload changed the queued batch count");
  }
  if ((reloadedState.buildings?.waterPumpStations ?? 0) !== baselineBuildingCount) {
    throw new Error("reload changed the completed-building baseline before any new turn");
  }

  await clickEndTurn(page);
  const firstTurn = await waitForTurnRecap(page);
  if (firstTurn !== "complete") {
    const body = await page.evaluate(() => document.body.innerText);
    throw new Error(`construction reload fixture was interrupted on the first turn:\n${body}`);
  }
  await clickEndTurn(page);
  const secondTurn = await waitForTurnRecap(page);
  if (secondTurn !== "complete") {
    const body = await page.evaluate(() => document.body.innerText);
    throw new Error(`construction reload fixture was interrupted on the completion turn:\n${body}`);
  }
  await clickVisibleText(page, "MORE");
  await waitForVisibleText(page, "BUILD", 30000);
  const openedConstruction = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const value = (element.innerText ?? "").replace(/\s+/g, " ").trim().toUpperCase();
        return rect.width > 0 && rect.height > 0 &&
          value === "BUILD BUILD AND EXPAND CITY INFRASTRUCTURE";
      });
    if (!candidates[0]) return false;
    candidates[0].click();
    return true;
  });
  if (!openedConstruction) {
    const options = await page.evaluate(() =>
      [...document.querySelectorAll("div, span, button, [role='button']")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 &&
            (element.innerText ?? "").toUpperCase().includes("BUILD");
        })
        .map((element) => (element.innerText ?? "").replace(/\s+/g, " ").trim())
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .slice(-20),
    );
    throw new Error(`Could not select the construction menu card. Options: ${JSON.stringify(options)}`);
  }
  await waitForPath(page, "/construction");
  await waitForVisibleText(page, "WATER");
  await clickVisibleText(page, "WATER");
  await waitForGone(page, "UNDER CONSTRUCTION", 30000);
  await waitForVisibleTestId(page, BUILDING_TEST_ID, READY_TIMEOUT_MS);
  const completionText = await page.$eval(
    `[data-testid="${BUILDING_TEST_ID}"]`,
    (element) => (element.innerText ?? "").includes("3"),
  );
  if (!completionText) throw new Error("completed construction card did not show the batch count");

  if (browserErrors.length) {
    throw new Error(`Browser errors during construction batch reload check:\n${browserErrors.join("\n")}`);
  }
  console.log("[e2e] PASS: one multi-building construction batch kept its count/timer across save/reload and completed once after reload");
} finally {
  await removeFixtureStorage(page, FIXTURE_STORAGE_KEY).catch(() => {});
  await browser.close().catch(() => {});
}