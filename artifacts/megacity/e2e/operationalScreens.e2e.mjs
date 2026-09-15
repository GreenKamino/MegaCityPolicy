// Real-screen regression for the operational-only UI cleanup.
//
// This is intentionally an on-demand E2E, not a validation-gate command. It
// uses a fresh isolated browser context, completes the real unified commander
// and city setup, checks the global operations ticker, then visits every
// affected screen. The context is destroyed after localStorage is cleared so
// no real browser profile or save slot is involved.
//
// Requires the "artifacts/megacity: expo" workflow.
// Run with:
//   node e2e/operationalScreens.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");

const BOOT_TIMEOUT_MS = 120_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let useReadOnlyDemoRoutes = false;

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

async function hasText(page, text) {
  return page.evaluate((needle) => (
    !!document.body &&
    document.body.innerText.toUpperCase().includes(needle.toUpperCase())
  ), text);
}

async function waitForText(page, text, timeout = BOOT_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasText(page, text)) return;
    await sleep(400);
  }
  throw new Error(`Timed out waiting for "${text}" at ${page.url()}`);
}

async function clickText(page, text, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const clicked = await page.evaluate((target) => {
      const needle = target.trim().toUpperCase();
      const textOf = (node) => ((node.innerText ?? node.textContent) || "").trim().toUpperCase();
      const visible = (node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const matches = [...document.querySelectorAll("button, [role='button'], div, span")]
        .filter((node) => visible(node) && textOf(node) === needle)
        .sort((a, b) => textOf(a).length - textOf(b).length);
      const element = matches[0];
      if (!element) return false;
      element.scrollIntoView({ block: "center", inline: "center" });
      element.click();
      return true;
    }, text);
    if (clicked) {
      await sleep(500);
      return;
    }
    await sleep(300);
  }
  throw new Error(`Could not click "${text}" at ${page.url()}`);
}

async function typeCommanderName(page, name) {
  const selector = 'input[aria-label="Commander name"]';
  await page.waitForSelector(selector, { visible: true, timeout: 20_000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, name, { delay: 15 });
}

async function clickTestIdIfVisible(page, testId) {
  return page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, testId);
}

async function navigate(page, route) {
  if (route === "summary" || route === "propaganda") {
    // RUN SUMMARY is opened from More > Display Settings rather than from the
    // command destination catalog. Its existing dev-only route is read-only
    // and keeps this final check independent of the onboarding lock.
    await page.goto(`${BASE_URL}/?demo=1&go=${route}`, {
      waitUntil: "domcontentloaded",
      timeout: BOOT_TIMEOUT_MS,
    }).catch((error) => {
      if (!String(error?.message ?? error).includes("Navigation timeout")) throw error;
    });
    await sleep(700);
    return;
  }

  // The map is a full-width surface and intentionally hides desktop command
  // controls. The bottom navigation bar was removed, so use the existing
  // read-only demo router for the next screen rather than resizing the live
  // setup session through a control that is not present on the map.
  if (useReadOnlyDemoRoutes || page.url().endsWith("/worldmap")) {
    useReadOnlyDemoRoutes = true;
    await page.goto(`${BASE_URL}/?demo=1&go=${route}`, {
      waitUntil: "domcontentloaded",
      timeout: BOOT_TIMEOUT_MS,
    }).catch((error) => {
      if (!String(error?.message ?? error).includes("Navigation timeout")) throw error;
    });
    await sleep(700);
    return;
  }

  // Navigate through the live app shell instead of reloading a grouped Expo
  // Router deep link.
  // The setup flow has a real active session in memory; a full reload is both
  // slower and can race the first profile/save handoff.
  if (await clickTestIdIfVisible(page, `desktop-command-${route}`)) {
    await sleep(500);
    return;
  }

  // If the desktop sidebar is unavailable, use the compact top navigation.
  if (!(await clickTestIdIfVisible(page, "desktop-command-palette-trigger"))) {
    await page.setViewport({ width: 900, height: 900 });
    if (!(await clickTestIdIfVisible(page, "top-nav-overview"))) {
      throw new Error(`Could not open an in-app navigator while navigating to ${route}`);
    }
    await waitForText(page, "CITY STATUS MATRIX");
    await sleep(500);
  }

  // Some fresh Veteran starts keep the command-menu screen behind the first
  // onboarding acknowledgement. The palette is available immediately and
  // exposes the same live destinations without bypassing the app router.
  const paletteOpened =
    await clickTestIdIfVisible(page, "desktop-command-palette-trigger") ||
    await clickTestIdIfVisible(page, "command-palette-trigger");
  if (paletteOpened) {
    await waitForText(page, "COMMAND PALETTE");
    const searchTerms = {
      contracts: "contracts",
      mining: "mining",
      atlas: "landforms",
      bestiary: "bestiary",
      districts: "sector map",
      "local-economy": "local economy",
      megaprojects: "mega projects",
    };
    const search = searchTerms[route];
    if (!search) throw new Error(`No command-palette search configured for ${route}`);
    const input = '[data-testid="command-palette-input"]';
    await page.waitForSelector(input, { visible: true, timeout: 10_000 });
    await page.click(input);
    await page.type(input, search);
    await page.keyboard.press("Enter");
    await sleep(700);
    return;
  }

  throw new Error(`Could not open an in-app navigator while navigating to ${route}`);
}

async function visibleTickerMetrics(page) {
  return page.evaluate(() => {
    const ticker = document.querySelector('[data-testid="news-ticker"]');
    return ticker?.getAttribute("aria-label") ?? "";
  });
}

async function assertNoPlayerStorage(page) {
  const keys = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => (
    key.startsWith("@megacity_slot_") ||
    key === "@megacity_save" ||
    key === "@megacity_profiles_index" ||
    key.startsWith("@megacity_profile_") ||
    key === "@megacity_active_profile"
  )));
  if (keys.length > 0) {
    throw new Error(`Operational screens fixture left player storage keys: ${JSON.stringify(keys)}`);
  }
}

async function assertOperationalScreen(page, route, heading) {
  await navigate(page, route);
  await waitForText(page, heading);

  const body = await page.evaluate(() => document.body?.innerText ?? "");
  const forbidden = [
    "FACTION IDEOLOGY",
    "READ MORE",
    "FIELD NOTE",
    "ACADEMY STAR",
    "STREET CLIMBED",
    "CORPORATE DEFECTOR",
    "VETERAN RETURNED",
    "CULT SURVIVOR",
    "RELUCTANT HEIR",
    "WASTELAND WANDERER",
    "AWAITING TRANSMISSION",
    "STAND BY FOR BROADCAST",
    "ALL SYSTEMS NOMINAL",
  ];
  const found = forbidden.filter((phrase) => body.toUpperCase().includes(phrase));
  if (found.length > 0) {
    throw new Error(`${route} rendered retired/generated prose: ${found.join(", ")}`);
  }
  if (route === "factions") {
    for (const detail of [
      "Cost:",
      "Prerequisite:",
      "Cooldown:",
      "Expected relationship if accepted:",
      "Coercive backlash",
    ]) {
      if (!body.includes(detail)) {
        throw new Error(`factions action menu is missing commitment detail "${detail}"`);
      }
    }
  }

  const ticker = await visibleTickerMetrics(page);
  for (const metric of ["TICK", "POPULATION", "CREDITS", "ACTIVE INCIDENTS", "UNREST", "CRIME"]) {
    if (!ticker.toUpperCase().includes(metric)) {
      throw new Error(`${route} ticker is missing live metric "${metric}": ${ticker}`);
    }
  }
  console.log(`[e2e] PASS ${route}: ${heading}; ${ticker}`);
}

async function run() {
  console.log(`[e2e] operational screens base URL: ${BASE_URL}`);
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
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!/favicon|net::|404|AbortError|NotAllowedError/i.test(text)) pageErrors.push(text);
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: BOOT_TIMEOUT_MS });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded", timeout: BOOT_TIMEOUT_MS });
    await waitForText(page, "IDENTIFY YOURSELF");

    // Complete the real unified setup flow in this isolated context.
    await clickText(page, "NEW COMMANDER");
    await waitForText(page, "COMMANDER & CITY SETUP");
    await waitForText(page, "CITY & SECTOR COMMAND");
    await typeCommanderName(page, "Operational Fixture");
    await clickText(page, "VETERAN");

    const setupText = await page.evaluate(() => document.body?.innerText ?? "");
    for (const retiredSetupText of ["ACADEMY STAR", "STREET CLIMBED", "READ MORE"]) {
      if (setupText.toUpperCase().includes(retiredSetupText)) {
        throw new Error(`Unified setup rendered retired setup prose: ${retiredSetupText}`);
      }
    }

    await clickText(page, "CREATE COMMANDER & LAUNCH CITY");
    await waitForText(page, "CITY STATUS MATRIX", 45_000);
    // Veteran starts still surface the first-run coach tip until the player
    // acknowledges it; dismissing it also unlocks the MORE command window.
    if (await hasText(page, "GOT IT")) await clickText(page, "GOT IT");
    console.log("[e2e] PASS unified commander + city setup completed in isolated context");

    const screens = [
      ["worldmap", "WORLD MAP"],
      ["factions", "FACTIONS / CIVIC & EXTERNAL AFFAIRS"],
      ["contracts", "CONTRACTS"],
      ["mining", "MINING"],
      ["atlas", "WASTELAND ATLAS"],
      ["bestiary", "BESTIARY"],
      ["districts", "SECTOR OVERVIEW"],
      ["construction", "CONSTRUCTION"],
      ["local-economy", "LOCAL ECONOMY"],
      ["megaprojects", "MEGA-PROJECTS"],
      ["propaganda", "PUBLIC INFORMATION CONTROL"],
      // RUN SUMMARY is a system action rather than a command-palette
      // destination. Use its explicitly supported demo route after the
      // real setup and keep it last because that fixture owns the page state.
      ["summary", "RUN SUMMARY"],
    ];
    for (const [route, heading] of screens) {
      await assertOperationalScreen(page, route, heading);
    }

    await page.evaluate(() => localStorage.clear());
    await assertNoPlayerStorage(page);
    if (pageErrors.length > 0) {
      throw new Error(`Browser errors during operational screens E2E:\n${pageErrors.join("\n")}`);
    }
    console.log("[e2e] PASS operational-only screens and isolated-storage cleanup");
  } catch (error) {
    console.error(`[e2e] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    try {
      console.error(`[e2e] URL: ${page.url()}`);
      console.error(`[e2e] visible text:\n${(await page.evaluate(() => document.body?.innerText ?? "")).slice(0, 3000)}`);
    } catch {
      // Preserve the original failure if the page detached during navigation.
    }
    process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run();