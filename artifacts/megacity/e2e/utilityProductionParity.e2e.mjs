// Browser regression coverage for licensed power and water output on the real
// Economy screen. The fixture runs one tick at the spring/summer boundary, so
// the displayed rate snapshot is deliberately older than the current season
// used by a fresh breakdown calculation.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/utilityProductionParity.e2e.mjs

import { execSync } from "node:child_process";
import LZString from "lz-string";
import puppeteer from "puppeteer";

const { decompressFromUTF16 } = LZString;
const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const FIXTURE_URL = (status, route) =>
  `${BASE_URL}/?demo=1&utilityparity=1${status ? `&utilityparitystatus=${status}` : ""}&go=${route}`;
const FIXTURE_STORAGE_KEY = "@megacity_e2e_utility_parity_reload_1";

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForVisibleText(page, text, timeout = 120000) {
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

async function navigate(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  } catch (error) {
    if (!String(error?.message ?? error).includes("Navigation timeout")) throw error;
  }
}

async function assertNoVisibleText(page, text) {
  if (await page.evaluate((needle) => {
    const target = needle.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(target)) continue;
      const rect = node.parentElement?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }, text)) {
    throw new Error(`Quarantined utility fixture misleadingly rendered: ${text}`);
  }
}

async function openCitySection(page, label) {
  await waitForVisibleText(page, "CITY STATUS MATRIX");
  const clicked = await page.evaluate((wanted) => {
    const target = wanted.toUpperCase();
    const tab = [...document.querySelectorAll('[role="tab"]')].find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        (element.textContent ?? "").trim().toUpperCase() === target;
    });
    if (!tab) return false;
    tab.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not open the ${label} City section`);
}

async function assertNoPlayerSaveStorage(page) {
  const saveKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) =>
      key.startsWith("@megacity_slot_") ||
      key === "@megacity_save" ||
      key.startsWith("@megacity_save_"),
    ),
  );
  if (saveKeys.length) {
    throw new Error(`Utility parity fixture touched player save storage: ${JSON.stringify(saveKeys)}`);
  }
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string" ? decompressFromUTF16(envelope.data) : raw;
  if (!json) throw new Error("The utility parity save payload could not be decompressed");
  return JSON.parse(json);
}

async function readPersistedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_STORAGE_KEY);
  if (!raw) throw new Error("The utility parity fixture did not write its isolated save");
  return decodePersistedState(raw);
}

async function removeFixtureStorage(page) {
  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}_backup`);
    window.localStorage.removeItem(`${key}.tmp`);
  }, FIXTURE_STORAGE_KEY);
}

async function assertUtilityRows(page) {
  await waitForVisibleText(page, "Licensed Company Power");
  await waitForVisibleText(page, "Licensed Company Water");
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  const compact = body.replace(/\s+/g, " ");
  for (const expected of [
    "Licensed Company Power 120 MW/tick",
    "Licensed Company Water 110 units/tick",
    "Helios Grid Authority +120 MW/tick",
    "ClearFlow Water Authority +110 units/tick",
  ]) {
    if (!compact.includes(expected)) {
      throw new Error(`Economy licensed utility row drifted: expected "${expected}" in ${compact}`);
    }
  }
}

async function assertOverviewTotals(page) {
  await openCitySection(page, "Infrastructure");
  await waitForVisibleText(page, "POWER GRID BREAKDOWN");
  await waitForVisibleText(page, "WATER SUPPLY BREAKDOWN");
  await waitForVisibleText(page, "SUMMER");
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  const compact = body.replace(/\s+/g, " ");
  for (const expected of ["7918MW gen", "+7657 MW / tick · 7918 generated", "+3199 / tick · 3374 produced"]) {
    if (!compact.includes(expected)) {
      throw new Error(`Overview utility total drifted: expected "${expected}" in ${compact}`);
    }
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
  await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });
  // The app intentionally gates city screens behind a commander profile.
  // Seed only the minimal valid profile blob in this disposable browser
  // context; the utility fixture itself remains read-only and creates no slot.
  await page.evaluateOnNewDocument(() => {
    const id = "e2e_utility_parity";
    const profile = {
      id,
      name: "Utility Parity Commander",
      age: 40,
      sex: "male",
      portraitId: "player_male_1",
      commanderLevel: 1,
      xp: 0,
      attributes: { authority: 5, intelligence: 4, charisma: 3, combat: 6, endurance: 5 },
      attributePoints: 0,
      traits: [],
      backstory: "",
      careerStats: {},
    };
    localStorage.setItem(`@megacity_profile_${id}`, JSON.stringify(profile));
    localStorage.setItem("@megacity_profiles_index", JSON.stringify([id]));
    localStorage.setItem("@megacity_active_profile", id);
  });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      browserErrors.push(message.text());
    }
  });

  try {
    for (const viewport of [
      { name: "narrow", width: 402, height: 874 },
      { name: "desktop", width: 1400, height: 900 },
    ]) {
      await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
      await navigate(page, FIXTURE_URL("", "economy"));
      await assertUtilityRows(page);
      await assertNoPlayerSaveStorage(page);
      await navigate(page, FIXTURE_URL("", "overview"));
      await assertOverviewTotals(page);
      await assertNoPlayerSaveStorage(page);
      console.log(`[e2e] PASS: ${viewport.name} Economy rows match Overview utility rates`);
    }

    await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });
    await navigate(
      page,
      `${BASE_URL}/?demo=1&utilityparity=1&utilityParityReload=save&go=overview`,
    );
    await assertOverviewTotals(page);
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      FIXTURE_STORAGE_KEY,
    );
    const savedState = await readPersistedState(page);
    if (savedState.season !== "summer" || savedState.gameDate?.month !== 6 || savedState.tickPaused !== true) {
      throw new Error(
        `Utility parity save did not preserve the paused June/summer boundary state: ` +
        `${JSON.stringify({ season: savedState.season, gameDate: savedState.gameDate, tickPaused: savedState.tickPaused })}`,
      );
    }
    if (savedState.rates?.powerGeneration !== 7918 || savedState.rates?.waterProduction !== 3374) {
      throw new Error(
        `Utility parity save changed the spring-computed rates: ` +
        `${JSON.stringify({ power: savedState.rates?.powerGeneration, water: savedState.rates?.waterProduction })}`,
      );
    }
    console.log("[e2e] PASS: paused June/summer utility totals were written to the isolated save envelope");

    await navigate(
      page,
      `${BASE_URL}/?demo=1&utilityparity=1&utilityParityReload=load&go=overview`,
    );
    await assertOverviewTotals(page);
    await assertNoPlayerSaveStorage(page);
    await navigate(
      page,
      `${BASE_URL}/?demo=1&utilityparity=1&utilityParityReload=load&go=economy`,
    );
    await assertUtilityRows(page);
    await assertNoPlayerSaveStorage(page);
    console.log("[e2e] PASS: Overview and Economy utility cards remained error-free after save/reload");

    await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });
    await navigate(page, FIXTURE_URL("quarantined", "economy"));
    await waitForVisibleText(page, "Production Rates / Tick");
    await assertNoVisibleText(page, "Licensed Company Power");
    await assertNoVisibleText(page, "Licensed Company Water");
    await assertNoVisibleText(page, "Licensed Company Output");
    await assertNoPlayerSaveStorage(page);

    if (browserErrors.length) {
      throw new Error(`Browser errors during utility parity check:\n${browserErrors.join("\n")}`);
    }
    console.log("[e2e] PASS: quarantined utility licenses render no contribution rows");
  } finally {
    await removeFixtureStorage(page).catch(() => {});
    await browser.close().catch(() => {});
  }
}

await run();