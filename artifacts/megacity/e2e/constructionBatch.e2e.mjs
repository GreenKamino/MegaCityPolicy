// Real-screen regression for construction batch affordability and queue limits.
//
// Run with:
//   node e2e/constructionBatch.e2e.mjs
//
// The demo fixture is read-only and never promotes itself to a player save.
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import {
  decodeSaveEnvelope,
  readStorageRaw,
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
const REQUEST_TIMEOUT_MS = 10000;
const QUEUE_FIXTURE_STORAGE_KEY = "@megacity_e2e_construction_batch_reload_1";
const BUILDING_TEST_ID = "construction-building-waterPumpStations";
const VIEWPORTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 720 },
];
function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastFailure = "no response";
  while (Date.now() <= deadline) {
    try {
      const response = await fetchWithTimeout(BASE_URL, REQUEST_TIMEOUT_MS);
      if (!response.ok) throw new Error(`preview returned HTTP ${response.status}`);
      const html = await response.text();
      const bundleMatch = html.match(/<script\b[^>]*\bsrc=["']([^"']*\.bundle[^"']*)["']/i);
      if (!bundleMatch) throw new Error("preview HTML did not expose the Expo web bundle");
      const bundle = await fetchWithTimeout(new URL(bundleMatch[1], BASE_URL), REQUEST_TIMEOUT_MS);
      if (!bundle.ok) throw new Error(`Metro bundle returned HTTP ${bundle.status}`);
      await bundle.arrayBuffer();
      console.log(`PASS Expo preview ready at ${BASE_URL}`);
      return;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await sleep(Math.min(1000, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`Expo preview unavailable: ${lastFailure}`);
}

async function hasVisibleText(page, text) {
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

async function waitForVisibleText(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasVisibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForGone(page, text, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await hasVisibleText(page, text))) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for text to disappear: ${text}`);
}

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

async function clickVisibleText(page, text, { containing = false, last = false } = {}) {
  const marked = await page.evaluate(({ target, containing, last }) => {
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
    const element = candidates[last ? candidates.length - 1 : 0];
    if (!element) return false;
    document.querySelectorAll("[data-e2e-target]").forEach((node) => node.removeAttribute("data-e2e-target"));
    element.setAttribute("data-e2e-target", "1");
    element.scrollIntoView({ block: "center", inline: "center" });
    return true;
  }, { target: text, containing, last });
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
  // Current MEGACITY builds require a commander profile before the game route
  // can render. Creating it in the isolated browser context keeps the fixture
  // from touching any real save slot while preserving a real-screen flow.
  await waitForVisibleText(page, "NEW COMMANDER");
  await pressVisibleAriaLabel(page, "Create a new commander profile");
  await waitForVisibleText(page, "COMMANDER & CITY SETUP");
  await waitForVisibleText(page, "01 — COMMANDER IDENTITY");
  await waitForVisibleText(page, "04 — CITY & SECTOR COMMAND");
  const input = await page.$('input[aria-label="Commander name"]');
  if (!input) throw new Error("Commander name input was not rendered");
  await input.click({ clickCount: 3 });
  await input.type("E2E Construction Marshal");
  await pressVisibleAriaLabel(page, "Start style: GUIDED");
  await pressVisibleAriaLabel(page, "Launch commander and city");
  await waitForVisibleText(page, "FIRST-RUN ORIENTATION", 60000);
  await pressVisibleAriaLabel(page, "Skip onboarding");
  await waitForVisibleText(page, "SKIP ORIENTATION?");
  // The header and confirmation modal both say SKIP. The modal is rendered
  // last in the portal, so select that visible confirmation rather than a
  // text match from the page behind it.
  await clickVisibleText(page, "SKIP", { last: true });
  const settledPath = await waitForOverviewOrConstruction(page, 60000);
  if (settledPath.endsWith("/overview")) {
    await clickVisibleConstructionNavigation(page);
  }
  await waitForPath(page, "/construction", 30000);
  await waitForVisibleText(page, "CONSTRUCTION / INFRASTRUCTURE", 60000);
  await waitForGone(page, "SKIP ORIENTATION?", 30000);
}

async function stageQueueFixture(page) {
  const profileSlotKey = await page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((candidate) =>
      /_slot_1$/.test(candidate) && !candidate.includes("e2e_construction_batch_reload"),
    );
    return key ?? null;
  });
  if (!profileSlotKey) throw new Error("Could not find the freshly created commander slot");
  const profileSlotRaw = await readStorageRaw(
    page,
    profileSlotKey,
    "freshly created commander slot",
  );
  const fixtureState = decodeSaveEnvelope(profileSlotRaw, "freshly created commander slot");
  const orderedTick = Number.isFinite(fixtureState.totalTicks) ? fixtureState.totalTicks : 0;
  fixtureState.pendingConstructions = Array.from({ length: 100 }, (_, index) => ({
    id: `e2e-construction-queue-${index}`,
    kind: "city",
    buildingKey: "waterPumpStations",
    label: "WATER PUMP STATIONS",
    count: 1,
    ticksTotal: 6,
    ticksRemaining: 6,
    orderedTick,
  }));
  await writeFixtureState(page, QUEUE_FIXTURE_STORAGE_KEY, fixtureState, {
    templateRaw: profileSlotRaw,
    label: "construction queue fixture",
  });
}

async function skipReloadOnboardingIfNeeded(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const pathname = new URL(page.url()).pathname;
    if (pathname.endsWith("/onboarding") || pathname.endsWith("/construction")) break;
    await sleep(250);
  }
  if (!new URL(page.url()).pathname.endsWith("/onboarding")) return;
  await pressVisibleAriaLabel(page, "Skip onboarding");
  await waitForVisibleText(page, "SKIP ORIENTATION?");
  await clickVisibleText(page, "SKIP", { last: true });
  await waitForPath(page, "/overview", 60000);
  await clickVisibleConstructionNavigation(page);
}

async function assertNoPlayerSaveStorage(page) {
  const storage = await page.evaluate(() => ({
    slots: Object.keys(window.localStorage).filter((key) => /^@megacity_(slot_\d+|save)$/.test(key)),
  }));
  if (storage.slots.length) {
    throw new Error(`Construction fixture touched player save storage: ${storage.slots.join(", ")}`);
  }
}

async function runPartialCase(browser, viewport) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    if (!/AbortError|NotAllowedError/.test(String(error))) errors.push(String(error));
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404|AbortError|NotAllowedError/.test(message.text())) {
      errors.push(message.text());
    }
  });

  try {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.goto(
      `${BASE_URL}/?demo=1&constructionbatch=1&constructionbatchphase=partial&go=construction&highlight=waterPumpStations`,
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
    await assertNoPlayerSaveStorage(page);
    if (errors.length) throw new Error(`${viewport.name} browser errors:\n${errors.join("\n")}`);
    console.log(`PASS ${viewport.name} partial affordability confirms 15-building order and totals`);
  } finally {
    await context.close();
  }
}

async function runQueueCase(browser, viewport) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    if (!/AbortError|NotAllowedError/.test(String(error))) errors.push(String(error));
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404|AbortError|NotAllowedError/.test(message.text())) {
      errors.push(message.text());
    }
  });

  try {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.goto(
      `${BASE_URL}/?demo=1&constructionbatch=1&constructionbatchphase=queue&go=construction&category=water&highlight=waterPumpStations`,
      { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS },
    );
    await createIsolatedDemoProfile(page);
    await stageQueueFixture(page);
    await page.goto(
      `${BASE_URL}/?demo=1&constructionbatch=1&constructionbatchphase=queue&constructionbatchreload=load&mode=turnbased&go=construction&category=water&highlight=waterPumpStations`,
      { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS },
    );
    await skipReloadOnboardingIfNeeded(page);
    await waitForPath(page, "/construction");
    await waitForVisibleText(page, "BUILD QUANTITY");
    await clickVisibleText(page, "WATER");
    await waitForVisibleTestId(page, BUILDING_TEST_ID, READY_TIMEOUT_MS);
    await selectBatch100(page);
    await clickVisibleBuildingCard(page, BUILDING_TEST_ID, "BUILD QUEUED BLOCKED");
    await waitForVisibleText(page, "BUILD QUEUED BLOCKED");
    await waitForVisibleText(page, "Requested: 100 buildings");
    await waitForVisibleText(page, "Timed orders: 100/100");
    await waitForVisibleText(page, "The timed-order queue is full (100/100).");
    await clickVisibleText(page, "OK", { last: true });
    await waitForGone(page, "BUILD QUEUED BLOCKED");
    await assertNoPlayerSaveStorage(page);
    if (errors.length) throw new Error(`${viewport.name} queue browser errors:\n${errors.join("\n")}`);
    console.log(`PASS ${viewport.name} full queue shows blocked confirmation`);
  } finally {
    await context.close();
  }
}

await ensurePreviewReady();
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

try {
  for (const viewport of VIEWPORTS) {
    await runPartialCase(browser, viewport);
    await runQueueCase(browser, viewport);
  }
} finally {
  await browser.close();
}

console.log("RESULT: construction batch affordability and queue limits passed on phone and desktop viewports");