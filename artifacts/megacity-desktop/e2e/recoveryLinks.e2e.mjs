// Desktop packaging smoke test for overview recovery links.
//
// This intentionally starts at the desktop wrapper route rather than loading
// the Expo game directly. The wrapper's iframe is the packaged desktop
// surface whose route bridge and bundling can regress independently.
//
// Run with:
//   E2E_BASE_URL=http://localhost:80/desktop node e2e/recoveryLinks.e2e.mjs
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:80/desktop";
const BASE_PATH = BASE_URL.replace(/\/$/, "");
const RECOVERY_BASE_URL = `${BASE_PATH}/?demo=1&recovery=1`;
const CRIME_OVERVIEW_URL = `${BASE_PATH}/?demo=1&crime=1&go=overview`;
const recoveryUrl = (route) => `${RECOVERY_BASE_URL}&go=${route}`;

function resolveChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return execSync("which chromium-browser", { encoding: "utf8" }).trim();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function waitFor(predicate, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await sleep(500);
  }
  throw new Error(`Timed out after ${timeout}ms`);
}

async function visibleText(frame) {
  return frame.evaluate(() => document.body?.innerText ?? "");
}

function destinationText(expected) {
  if (expected.screen === "recruitment") return "RECRUITMENT & PERSONNEL";
  if (expected.screen === "law") return "LAW / JUSTICE / SECURITY";
  if (expected.screen === "companies") return "COMMERCIAL LICENSING";
  if (expected.screen === "military") return "MILITARY";
  if (expected.screen === "megaprojects") return "AVAILABLE PROJECTS";
  if (expected.screen === "mining") return "MINING";
  throw new Error(`Unknown recovery destination ${expected.screen}`);
}

function destinationMatches(frame, expected) {
  const url = new URL(frame.url());
  if (!url.pathname.endsWith(`/${expected.screen}`)) return false;
  if (expected.screen !== "construction") return true;
  return url.searchParams.get("category") === expected.category &&
    url.searchParams.get("highlight") === (expected.highlight ?? null);
}

async function findGameFrame(page) {
  return waitFor(() => {
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    return frame ?? null;
  });
}

function readyTextForRoute(route) {
  return route === "wildlands"
    ? "WILDLANDS"
    : route === "law"
      ? "LAW / JUSTICE / SECURITY"
      : "CITY STATUS MATRIX";
}

async function waitForGameScreen(page, route) {
  return waitFor(async () => {
    const frame = await findGameFrame(page);
    try {
      return (await visibleText(frame)).includes(readyTextForRoute(route)) ? frame : null;
    } catch {
      // The wrapper can replace the iframe document while Expo Router boots.
      return null;
    }
  }, 120000);
}

async function resetGameFrame(page, initialFrameUrl, route) {
  const currentFrame = await findGameFrame(page);
  await currentFrame.goto(initialFrameUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  return waitForGameScreen(page, route);
}

function directFixtureUrl(frameUrl, route) {
  const url = new URL(frameUrl);
  url.pathname = `/${route}`;
  url.searchParams.delete("go");
  return url.href;
}

const CRIME_ACTIONS = [
  {
    name: "construction",
    text: "Build enforcement infrastructure",
    expected: { screen: "construction", category: "security", highlight: "sectorHouseHQ" },
  },
  {
    name: "military",
    text: "Deploy more enforcers",
    expected: { screen: "military" },
  },
  {
    name: "law",
    text: "Enable a public-order policy",
    expected: { screen: "law" },
  },
  {
    name: "mining",
    text: "Repeal the black-market ore mining policy",
    expected: { screen: "mining" },
  },
];

const CRIME_VIEWPORTS = [
  { name: "wide desktop", width: 1400, height: 900, deviceScaleFactor: 1 },
  { name: "compact desktop", width: 1024, height: 900, deviceScaleFactor: 1 },
  { name: "high-DPI desktop", width: 1400, height: 900, deviceScaleFactor: 2 },
];

const RECOVERY_VIEWPORTS = [
  { name: "standard desktop", width: 1400, height: 900, deviceScaleFactor: 1 },
  { name: "high-DPI desktop", width: 1400, height: 900, deviceScaleFactor: 2 },
  { name: "compact high-DPI desktop", width: 1024, height: 900, deviceScaleFactor: 2 },
];

const RECOVERY_ACTIONS = [
  ["POWER GRID BREAKDOWN", "Build energy storage vaults", { screen: "construction", category: "energy", highlight: "energyStorageVaults" }, "overview"],
  ["WATER SUPPLY BREAKDOWN", "Build more water production", { screen: "construction", category: "water", highlight: "waterRecyclingSuperFacilities" }, "overview"],
  ["WATER SUPPLY BREAKDOWN", "Commission the Subterranean Reservoir megaproject", { screen: "megaprojects" }, "overview"],
  ["BIOSPHERE BREAKDOWN", "Build more green infrastructure", { screen: "construction", category: "biosphere", highlight: "biosphereReclamationDomes" }, "wildlands"],
  ["BIOSPHERE BREAKDOWN", "Repair failing infrastructure", { screen: "construction", category: "infrastructure" }, "wildlands"],
  ["BIOSPHERE BREAKDOWN", "Enact ecology policies", { screen: "law" }, "wildlands"],
  ["PUBLIC HEALTH BREAKDOWN", "Build Public Health Mega Clinics", { screen: "construction", category: "civic", highlight: "publicHealthMegaClinics" }],
  ["PUBLIC HEALTH BREAKDOWN", "Recruit emergency medical teams", { screen: "recruitment" }],
  ["PUBLIC HEALTH BREAKDOWN", "Restore med supply production", { screen: "construction", category: "research", highlight: "medicalResearchComplexes" }],
  ["PUBLIC HEALTH BREAKDOWN", "Fix sanitation", { screen: "construction", category: "water", highlight: "sewerPurificationPlants" }],
  ["PUBLIC HEALTH BREAKDOWN", "Bring disease risk down", { screen: "law" }],
  ["PUBLIC HEALTH BREAKDOWN", "End the famine", { screen: "construction", category: "food" }],
  ["PUBLIC HEALTH BREAKDOWN", "Restore the water supply", { screen: "construction", category: "water" }],
  ["EMPLOYMENT BREAKDOWN", "Build job-creating industry", { screen: "construction", category: "industrial", highlight: "megaManufacturingPlants" }],
  ["EMPLOYMENT BREAKDOWN", "Fix the transit overload", { screen: "construction", category: "transit", highlight: "undergroundMaglevSystem" }],
  ["EMPLOYMENT BREAKDOWN", "Enact a jobs edict", { screen: "law" }],
  ["EMPLOYMENT BREAKDOWN", "License corporations", { screen: "companies" }],
  ["TRANSIT GRID BREAKDOWN", "Build transit lines", { screen: "construction", category: "transit", highlight: "undergroundMaglevSystem" }],
  ["TRANSIT GRID BREAKDOWN", "Hire traffic control", { screen: "recruitment" }],
  ["DEFENSE READINESS BREAKDOWN", "Build defensive structures", { screen: "construction", category: "defense", highlight: "cityShieldGenerator" }],
  ["DEFENSE READINESS BREAKDOWN", "Recruit city-defense units", { screen: "recruitment" }],
  ["DEFENSE READINESS BREAKDOWN", "Enact a defense edict", { screen: "law" }],
  ["DEFENSE READINESS BREAKDOWN", "Build military installations", { screen: "military" }],
  ["INFRASTRUCTURE HEALTH BREAKDOWN", "Deploy repair and maintenance crews", { screen: "recruitment" }],
  ["INFRASTRUCTURE HEALTH BREAKDOWN", "Clear the power deficit", { screen: "construction", category: "energy", highlight: "fusionReactors" }],
  ["INFRASTRUCTURE HEALTH BREAKDOWN", "Stock steel", { screen: "construction", category: "industrial" }],
];

async function openCrimeOverview(page) {
  await page.goto(CRIME_OVERVIEW_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  const iframeSrc = await waitFor(() => page.$eval("iframe", (iframe) => iframe.src).catch(() => ""));
  if (!iframeSrc.includes("demo=1") || !iframeSrc.includes("crime=1") || !iframeSrc.includes("go=overview")) {
    throw new Error(`Desktop wrapper did not forward the high-crime overview fixture: ${iframeSrc}`);
  }
  const rootFrame = await findGameFrame(page);
  const initialFrameUrl = directFixtureUrl(iframeSrc, "overview");
  await rootFrame.goto(initialFrameUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  return waitFor(async () => {
    const frame = await findGameFrame(page);
    try {
      const text = await visibleText(frame);
      return text.includes("Crime 80") && text.includes("CRIME") ? frame : null;
    } catch {
      return null;
    }
  }, 120000);
}

async function assertCrimeActionsVisible(frame) {
  const actions = await frame.evaluate((fragments) => fragments.map((fragment) => {
    const target = fragment.toUpperCase();
    const button = [...document.querySelectorAll("button[aria-label]")].find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        (element.getAttribute("aria-label") ?? "").toUpperCase().includes(target);
    });
    if (!button) return null;
    button.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = button.getBoundingClientRect();
    return {
      label: button.getAttribute("aria-label"),
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }), CRIME_ACTIONS.map((action) => action.text));

  for (const [index, action] of actions.entries()) {
    if (!action) throw new Error(`Crime overview action was missing at desktop width: ${CRIME_ACTIONS[index].text}`);
    if (!action.label?.toUpperCase().includes("TAP TO GO THERE")) {
      throw new Error(`Crime overview action lacks an accessibility label: ${JSON.stringify(action)}`);
    }
    if (
      action.rect.width < 100 ||
      action.rect.height < 28 ||
      action.rect.left < 0 ||
      action.rect.right > action.viewport.width ||
      action.rect.top < 0 ||
      action.rect.bottom > action.viewport.height
    ) {
      throw new Error(`Crime overview action is clipped or too small at desktop width: ${CRIME_ACTIONS[index].text} ${JSON.stringify(action)}`);
    }
  }
}

async function clickRecovery(page, frame, cardTitle, actionText, expected, viewportName) {
  await waitFor(async () => (await visibleText(frame)).includes(cardTitle));
  const action = await frame.evaluate((labelFragment) => {
    const candidates = [...document.querySelectorAll('button[aria-label]')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 &&
        (element.getAttribute("aria-label") ?? "").includes(labelFragment);
    });
    const target = candidates[0];
    if (!target) return null;
    target.scrollIntoView({ block: "center" });
    const rect = target.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const result = {
      label: target.getAttribute("aria-label"),
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
      viewport,
    };
    if (
      !result.label?.toUpperCase().includes("TAP TO GO THERE") ||
      result.rect.width <= 0 ||
      result.rect.height <= 0 ||
      result.rect.left < 0 ||
      result.rect.right > viewport.width ||
      result.rect.top < 0 ||
      result.rect.bottom > viewport.height
    ) {
      return { ...result, clipped: true };
    }
    target.click();
    return { ...result, clipped: false };
  }, actionText);
  if (!action) throw new Error(`No tappable recovery action found in ${cardTitle}: ${actionText}`);
  if (action.clipped) {
    throw new Error(
      `Recovery action is clipped, too small, or lacks an accessibility label at ${viewportName}: ` +
      `${cardTitle} / ${actionText} ${JSON.stringify(action)}`,
    );
  }

  // Expo Router replaces the embedded document on navigation. Reacquire the
  // frame after the tap instead of polling the detached pre-navigation handle.
  const destinationFrame = await waitFor(async () => {
    const candidate = await findGameFrame(page);
    return destinationMatches(candidate, expected) ? candidate : null;
  }, 30000);
  if (expected.screen !== "construction") {
    const destination = destinationText(expected);
    await waitFor(async () => (await visibleText(destinationFrame)).includes(destination), 30000);
  }
  const params = expected.screen === "construction"
    ? ` category=${expected.category}${expected.highlight ? ` highlight=${expected.highlight}` : ""}`
    : "";
  console.log(`[e2e] ${cardTitle} / ${actionText} -> ${expected.screen}${params}`);
  return destinationFrame;
}

async function run() {
  console.log(`[e2e] desktop route: ${recoveryUrl("overview")}`);
  try {
    await ensureDesktopWrapperReady();
  } catch (error) {
    console.error(`[e2e] FAIL: ${errorMessage(error)}`);
    process.exitCode = 1;
    return;
  }
  const launchBrowser = () => puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  let browser = await launchBrowser();
  let page = await browser.newPage();
  const pageErrors = [];
  const watchPage = (candidate) => {
    candidate.on("pageerror", (error) => pageErrors.push(String(error)));
  };
  watchPage(page);
  try {
    let frame;
    for (const viewport of CRIME_VIEWPORTS) {
      await page.setViewport(viewport);
      frame = await openCrimeOverview(page);
      const initialCrimeFrameUrl = frame.url();
      console.log(
        `[e2e] packaged desktop wrapper and game frame loaded at ${viewport.name} ` +
        `(${viewport.width}px, ${viewport.deviceScaleFactor}x device scale)`,
      );

      for (const [index, action] of CRIME_ACTIONS.entries()) {
        if (index > 0) {
          frame = await resetGameFrame(page, initialCrimeFrameUrl, "overview");
        }
        if (index === 0) {
          await assertCrimeActionsVisible(frame);
          console.log(`[e2e] PASS: high-crime City overview actions are visible and accessible at ${viewport.name}`);
        }
        await clickRecovery(page, frame, "CRIME", action.text, action.expected);
        console.log(`[e2e] PASS: ${viewport.name} desktop crime overview action reaches ${action.name}`);
      }
    }

    for (const viewport of RECOVERY_VIEWPORTS) {
      await page.setViewport(viewport);
      console.log(
        `[e2e] running remaining recovery cards at ${viewport.name} ` +
        `(${viewport.width}px, ${viewport.deviceScaleFactor}x device scale)`,
      );

      for (const route of ["overview", "wildlands"]) {
        const routeActions = RECOVERY_ACTIONS.filter(([, , , actionRoute = "overview"]) => actionRoute === route);
        if (!routeActions.length) continue;

        await page.goto(recoveryUrl(route), { waitUntil: "domcontentloaded", timeout: 60000 });
        const iframeSrc = await waitFor(() => page.$eval("iframe", (iframe) => iframe.src).catch(() => ""));
        if (!iframeSrc.includes("demo=1") || !iframeSrc.includes("recovery=1") || !iframeSrc.includes(`go=${route}`)) {
          throw new Error(`Desktop wrapper did not forward the ${route} recovery fixture: ${iframeSrc}`);
        }
        const rootFrame = await findGameFrame(page);
        const initialRecoveryFrameUrl = directFixtureUrl(iframeSrc, route);
        await rootFrame.goto(initialRecoveryFrameUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        frame = await waitForGameScreen(page, route);
        console.log(
          `[e2e] loaded ${route} recovery fixture once; reusing the embedded game frame for ` +
          `${routeActions.length} actions`,
        );

        for (const [index, [card, action, expected]] of routeActions.entries()) {
          if (index > 0) {
            frame = await resetGameFrame(page, initialRecoveryFrameUrl, route);
          }
          frame = await clickRecovery(page, frame, card, action, expected, viewport.name);
        }
      }
    }

    if (pageErrors.length) {
      throw new Error(`page errors during desktop smoke test:\n${pageErrors.join("\n")}`);
    }
    console.log("[e2e] PASS: every actionable desktop recovery link reached its expected destination");
  } catch (error) {
    console.error(`[e2e] FAIL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
  }
}

run();