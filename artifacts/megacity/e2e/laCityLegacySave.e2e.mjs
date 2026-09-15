// Real-screen regression for loading a legacy Iron Khanate slot through the
// profile/slot path. The fixture is isolated to a disposable browser context.
//
// Requires the "artifacts/megacity: expo" workflow.

import { execFileSync, execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import LZString from "lz-string";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const VIEWPORT_WIDTH = Number(process.env.E2E_VIEWPORT_WIDTH ?? 1400);
const VIEWPORT_HEIGHT = Number(process.env.E2E_VIEWPORT_HEIGHT ?? 900);
const PROFILE_ID = "legacy-la-city-browser-regression";
const SLOT_KEY = `@megacity_profile_${PROFILE_ID}_slot_1`;
const PROFILES_INDEX_KEY = "@megacity_profiles_index";
const ACTIVE_PROFILE_KEY = "@megacity_active_profile";
const LEGACY_CITY_ID = "iron-khanate";
const EXPECTED = {
  name: "LA CITY",
  influence: 81,
  loyalty: 17,
  threat: 93,
  faith: "ancestor-cult",
  tradeInventory: { steel_plates: 987, fuel_cells: 4 },
  war: {
    id: "legacy-border-war",
    belligerents: ["iron-khanate", "nova-pacifica"],
    belligerentNames: ["LA CITY", "NOVA PACIFICA"],
    stage: "skirmishes",
    intensity: 37,
    startTick: 300,
    lastEscalationTick: 318,
    playerInitiated: false,
    casualties: { a: 12, b: 8 },
    infrastructureDamage: { a: 3, b: 1 },
    warWeariness: 4,
    peaceOffered: false,
    timeline: {
      stages: [{ stage: "tensions", tick: 300 }, { stage: "skirmishes", tick: 318 }],
      reports: [{ tick: 318, label: "Southern corridor remains contested" }],
    },
  },
  activeEvent: {
    id: "legacy-southern-logistics",
    title: "SOUTHERN LOGISTICS REVIEW",
    description: "A freight convoy needs a routing decision before the next dispatch.",
    severity: "medium",
    effects: { credits: 250 },
    timestamp: 321,
    resolved: false,
    responseOptions: [{
      id: "hold-course",
      label: "HOLD COURSE",
      description: "Keep the convoy on its current route.",
      effects: {},
    }],
    maxResponses: 1,
  },
  gridRef: "AA25",
};
const RETIRED_PROSE = ["KHANATE", "TORGRIM"];

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

function buildLegacyFixture() {
  const fixtureScript = String.raw`
    import { createInitialState } from "./engine/initialState";
    import { getDefaultAdvancedState } from "./engine/diplomacyAdvanced";
    import { createDefaultProfile } from "./engine/profiles";
    import { computeChecksum } from "./engine/saveLoad";

    const state = createInitialState();
    const city = state.externalMegacities.find((entry) => entry.id === "iron-khanate");
    if (!city) throw new Error("initial state is missing the durable LA CITY id");

    Object.assign(city, {
      name: "The Iron Khanate",
      description: "The Iron Khanate controls the southern freight corridor.",
      influence: 81,
      loyalty: 17,
      threat: 93,
      isActive: true,
      tradeInventory: { steel_plates: 987, fuel_cells: 4 },
      lastRefreshTick: 321,
      dominantFaithId: "ancestor-cult",
      leader: {
        name: "Khan Torgrim",
        title: "Khan",
        attitude: "hostile",
        goals: [],
        personalityTraits: [],
        portraitId: "khan_torgrim",
      },
    });

    state.diplomacyAdvanced = {
      ...getDefaultAdvancedState(),
      wars: [{
        id: "legacy-border-war",
        belligerents: ["iron-khanate", "nova-pacifica"],
        belligerentNames: ["LA CITY", "NOVA PACIFICA"],
        stage: "skirmishes",
        intensity: 37,
        startTick: 300,
        lastEscalationTick: 318,
        playerInitiated: false,
        casualties: { a: 12, b: 8 },
        infrastructureDamage: { a: 3, b: 1 },
        warWeariness: 4,
        peaceOffered: false,
        timeline: {
          stages: [{ stage: "tensions", tick: 300 }, { stage: "skirmishes", tick: 318 }],
          reports: [{ tick: 318, label: "Southern corridor remains contested" }],
        },
      }],
      totalWars: 1,
    };

    state.activeEvents = [{
      id: "legacy-southern-logistics",
      title: "SOUTHERN LOGISTICS REVIEW",
      description: "A freight convoy needs a routing decision before the next dispatch.",
      severity: "medium",
      effects: { credits: 250 },
      timestamp: 321,
      resolved: false,
      responseOptions: [{
        id: "hold-course",
        label: "HOLD COURSE",
        description: "Keep the convoy on its current route.",
        effects: {},
      }],
      maxResponses: 1,
    }];
    state.totalTicks = 321;
    state.tickPaused = true;
    state.lastTickTime = Date.now();
    // Omit the onboarding flag to model a genuinely old save. Migration must
    // recognize the missing flag as a veteran save and keep the normal routes
    // available for this browser regression.
    delete state.hasCompletedOnboarding;

    const profile = {
      ...createDefaultProfile("Legacy LA City Test Commander", 40, "other"),
      id: "legacy-la-city-browser-regression",
    };
    const legacyEnvelope = JSON.stringify({
      v: 1,
      checksum: computeChecksum(JSON.stringify(state)),
      data: JSON.stringify(state),
    });
    console.log(JSON.stringify({
      profile,
      profilesIndex: ["legacy-la-city-browser-regression"],
      legacyEnvelope,
    }));
  `;

  const output = execFileSync(
    "pnpm",
    ["exec", "tsx", "-e", fixtureScript],
    { cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."), encoding: "utf8" },
  ).trim();
  return JSON.parse(output.split("\n").at(-1));
}

async function visibleText(page, text) {
  return page.evaluate((target) => {
    const needle = target.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
      const element = node.parentElement;
      const rect = element?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }, text);
}

async function waitForVisibleText(page, text, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for visible text: ${text}; current URL: ${page.url()}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const nodes = Array.from(document.querySelectorAll('div, span, a, button, [role="button"]'));
    const textOf = (node) => ((node.innerText ?? node.textContent) || "").trim().toUpperCase();
    const matches = nodes
      .filter((node) => textOf(node) === needle)
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .sort((a, b) => textOf(a).length - textOf(b).length);
    const element = matches[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not find visible text to click: ${text}`);
}

async function waitForVisibleAccessibleNode(page, label, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate((target) => {
      const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }, label);
    if (found) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for accessible node: ${label}; current URL: ${page.url()}`);
}

async function clickVisibleAccessibleNode(page, label) {
  const clicked = await page.evaluate((target) => {
    const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not click visible accessible node: ${label}`);
}

async function decodeEnvelope(raw) {
  const envelope = JSON.parse(raw);
  if (envelope.v === 1) return JSON.parse(envelope.data);
  if (envelope.v === 2) {
    const json = LZString.decompressFromUTF16(envelope.data);
    if (!json) throw new Error("could not decompress the resaved v2 slot");
    return JSON.parse(json);
  }
  throw new Error(`unexpected save envelope version: ${String(envelope.version ?? envelope.v)}`);
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertMigratedState(state, label) {
  const city = state.externalMegacities?.find((entry) => entry.id === LEGACY_CITY_ID);
  if (!city) throw new Error(`${label}: durable LA CITY entity is missing`);
  assertEqual(city.name, EXPECTED.name, `${label} city name`);
  assertEqual(city.influence, EXPECTED.influence, `${label} influence`);
  assertEqual(city.loyalty, EXPECTED.loyalty, `${label} loyalty`);
  assertEqual(city.threat, EXPECTED.threat, `${label} threat`);
  assertEqual(city.dominantFaithId, EXPECTED.faith, `${label} faith`);
  assertEqual(city.tradeInventory, EXPECTED.tradeInventory, `${label} trade inventory`);
  assertEqual(state.diplomacyAdvanced.wars, [EXPECTED.war], `${label} wars`);
  assertEqual(state.activeEvents, [EXPECTED.activeEvent], `${label} active events`);

  // The durable compatibility id intentionally contains the retired word.
  // Scan player-facing payload values while ignoring that internal id.
  const serialized = JSON.stringify(state)
    .toUpperCase()
    .replaceAll(LEGACY_CITY_ID.toUpperCase(), "");
  for (const retired of RETIRED_PROSE) {
    if (serialized.includes(retired)) {
      throw new Error(`${label}: retired presentation prose survived migration (${retired})`);
    }
  }
}

async function main() {
  const fixture = buildLegacyFixture();
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  page.setDefaultNavigationTimeout(120_000);

  try {
    await page.evaluateOnNewDocument((seed) => {
      localStorage.clear();
      localStorage.setItem("@megacity_profiles_index", JSON.stringify(seed.profilesIndex));
      localStorage.setItem("@megacity_active_profile", seed.profile.id);
      localStorage.setItem(`@megacity_profile_${seed.profile.id}`, JSON.stringify(seed.profile));
      localStorage.setItem(`@megacity_profile_${seed.profile.id}_slot_1`, seed.legacyEnvelope);
    }, fixture);

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await waitForVisibleText(page, "CONTINUE");
    await clickVisibleText(page, "CONTINUE");
    await waitForVisibleText(page, "MAP");
    await waitForVisibleText(page, "SOUTHERN LOGISTICS REVIEW");

    await clickVisibleText(page, "MAP");
    await waitForVisibleAccessibleNode(page, "LA CITY, megacity");
    await clickVisibleAccessibleNode(page, "LA CITY, megacity");
    await waitForVisibleText(page, EXPECTED.gridRef);
    await waitForVisibleText(page, "LA CITY");

    await clickVisibleText(page, "DIPLO");
    await waitForVisibleText(page, "MEGACITIES");
    await clickVisibleText(page, "MEGACITIES");
    await waitForVisibleText(page, "LA CITY");
    await waitForVisibleText(page, "81");
    await waitForVisibleText(page, "17");
    await waitForVisibleText(page, "HOSTILE");
    await clickVisibleText(page, "LA CITY");
    await waitForVisibleText(page, "RELATIONSHIP MATRIX");

    const pageText = await page.evaluate(() => document.body.innerText.toUpperCase());
    for (const retired of RETIRED_PROSE) {
      if (pageText.includes(retired)) {
        throw new Error(`retired player-facing prose is visible after load (${retired})`);
      }
    }

    await page.keyboard.down("Control");
    await page.keyboard.press("s");
    await page.keyboard.up("Control");
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const resaved = await page.evaluate((key) => localStorage.getItem(key), SLOT_KEY);
    if (!resaved) throw new Error("real quick-save did not write the profile slot");
    const migratedState = await decodeEnvelope(resaved);
    assertMigratedState(migratedState, "resaved slot");

    console.log("PASS: old Iron Khanate profile slot loads as LA CITY across map, diplomacy, and resave");
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();