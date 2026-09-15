// Browser regression coverage for black-market audit durability.
//
// The fixture seeds an active commander profile and a quiet city with enough
// credits for one real Contraband Food Supply purchase. The test cancels once, confirms
// once, follows the user-facing Black Market → Finance → Black Market path,
// then recreates the provider through the isolated save/load fixture.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/blackMarketAuditReload.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import LZString from "lz-string";

const { decompressFromUTF16 } = LZString;
const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const PROFILE_ID = "black-market-audit-reload";
const FIXTURE_KEY = "@megacity_e2e_black_market_audit_1";
const FIXTURE_ROOT = `${BASE_URL}/?demo=1&blackmarketaudit=1`;
const EXPECTED_ITEM = "Contraband Food Supply";
const EXPECTED_COST = "-2,500 CR";
const EXPECTED_PURCHASE = "PURCHASE — 2,500 CR";
const OUTCOMES = ["delivered", "seized"];

function fixtureUrl(phase, outcome) {
  return `${FIXTURE_ROOT}&blackMarketAuditReload=${phase}&blackMarketAuditOutcome=${outcome}&go=blackmarket`;
}

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function hasVisibleText(page, text) {
  return page.evaluate((target) => {
    const needle = target.toUpperCase();
    return [...document.querySelectorAll("div, span, button, [role='button']")].some((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? element.textContent ?? "").toUpperCase().includes(needle)
      );
    });
  }, text);
}

async function waitForVisibleText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasVisibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForGone(page, text, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await hasVisibleText(page, text))) return;
    await sleep(250);
  }
  throw new Error(`Expected visible text to disappear: ${text}`);
}

async function waitForAnyVisibleText(page, texts, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const text of texts) {
      if (await hasVisibleText(page, text)) return text;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for one of: ${texts.join(", ")}`);
}

async function countVisibleExactText(page, text) {
  return page.evaluate((targetText) => {
    const target = targetText.trim().toUpperCase();
    return [...document.querySelectorAll("div, span, button, [role='button']")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? element.textContent ?? "").trim().toUpperCase() === target
      );
    }).length;
  }, text);
}

async function waitForPath(page, suffix, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith(suffix)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for path ${suffix}; current URL: ${page.url()}`);
}

async function pressExactText(page, text, { last = false } = {}) {
  const pressed = await page.evaluate(
    ({ targetText, lastMatch }) => {
      const target = targetText.trim().toUpperCase();
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const textOf = (element) =>
        (element.innerText ?? element.textContent ?? "").trim().toUpperCase();
      const matches = [...document.querySelectorAll("div, span, button, [role='button']")]
        .filter((element) => visible(element) && textOf(element) === target);
      const element = lastMatch ? matches.at(-1) : matches[0];
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
    },
    { targetText: text, lastMatch: last },
  );
  if (!pressed) throw new Error(`Could not find visible exact text: ${text}`);
}

async function seedActiveProfile(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate((profileId) => {
    const profile = {
      id: profileId,
      name: "Audit Marshal",
      age: 40,
      sex: "other",
      portraitId: "player_male_1",
      commanderLevel: 1,
      xp: 0,
      attributes: { authority: 5, intelligence: 4, charisma: 3, combat: 6, endurance: 5 },
      attributePoints: 0,
      traits: [],
      backstory: "",
      careerStats: {},
    };
    localStorage.clear();
    localStorage.setItem(`@megacity_profile_${profileId}`, JSON.stringify(profile));
    localStorage.setItem("@megacity_profiles_index", JSON.stringify([profileId]));
    localStorage.setItem("@megacity_active_profile", profileId);
  }, PROFILE_ID);
}

async function readCredits(page) {
  return page.evaluate(() => {
    const match = (document.body?.innerText ?? "").match(/\bCREDITS\s*\n\s*([\d,]+)/i);
    return match ? Number(match[1].replaceAll(",", "")) : null;
  });
}

async function readFood(page) {
  return page.evaluate(() => {
    const match = (document.body?.innerText ?? "").match(/\bFOOD\s*\n\s*([\d,]+)/i);
    return match ? Number(match[1].replaceAll(",", "")) : null;
  });
}

async function decodePersistedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_KEY);
  if (!raw) throw new Error("The black-market fixture did not write its isolated save");
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string"
    ? decompressFromUTF16(envelope.data)
    : raw;
  if (!json) throw new Error("The black-market fixture save payload could not be decompressed");
  return JSON.parse(json);
}

async function openMoreDestination(page, label, routeSuffix) {
  await pressExactText(page, "MORE");
  await waitForVisibleText(page, label);
  await pressExactText(page, label);
  await waitForPath(page, routeSuffix);
}

async function runScenario(browser, expectedOutcome) {
  const context =
    typeof browser.createBrowserContext === "function"
      ? await browser.createBrowserContext()
      : await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404|AbortError/.test(message.text())) {
      browserErrors.push(message.text());
    }
  });

  try {
    await seedActiveProfile(page);
    await page.goto(fixtureUrl("save", expectedOutcome), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForPath(page, "/blackmarket");
    await waitForVisibleText(page, "BLACK MARKET");
    await waitForVisibleText(page, EXPECTED_ITEM);

    const creditsBefore = await readCredits(page);
    if (creditsBefore === null) throw new Error("Could not read the starting credit balance");
    const foodBefore = await readFood(page);
    if (foodBefore === null) throw new Error("Could not read the starting food inventory");
    await pressExactText(page, EXPECTED_ITEM);
    await waitForVisibleText(page, EXPECTED_PURCHASE);
    await pressExactText(page, EXPECTED_PURCHASE);
    await waitForVisibleText(page, "PURCHASE: CONTRABAND FOOD SUPPLY");
    await pressExactText(page, "CANCEL", { last: true });
    await waitForGone(page, "PURCHASE: CONTRABAND FOOD SUPPLY");
    if ((await readCredits(page)) !== creditsBefore || (await readFood(page)) !== foodBefore) {
      throw new Error("Cancelling the black-market confirmation changed the balance or food inventory");
    }
    if (await hasVisibleText(page, "ACQUIRED") || await hasVisibleText(page, "SEIZED")) {
      throw new Error("Cancelling the black-market confirmation produced an outcome");
    }
    await pressExactText(page, "AUDIT");
    await waitForVisibleText(page, "No confirmed black-market purchases recorded.");
    await pressExactText(page, "MARKET");
    await waitForVisibleText(page, EXPECTED_ITEM);
    if (!(await hasVisibleText(page, EXPECTED_PURCHASE))) {
      await pressExactText(page, EXPECTED_ITEM);
      await waitForVisibleText(page, EXPECTED_PURCHASE);
    }
    await pressExactText(page, EXPECTED_PURCHASE);
    await waitForVisibleText(page, "PURCHASE: CONTRABAND FOOD SUPPLY");
    await pressExactText(page, "PURCHASE", { last: true });
    const outcome = (await waitForAnyVisibleText(page, ["ACQUIRED", "SEIZED"])) === "ACQUIRED"
      ? "DELIVERED"
      : "SEIZED";
    if (outcome !== expectedOutcome.toUpperCase()) {
      throw new Error(`Expected a ${expectedOutcome} purchase, but the real UI reported ${outcome.toLowerCase()}`);
    }
    await pressExactText(page, "OK", { last: true });
    await waitForGone(page, "PURCHASE: CONTRABAND FOOD SUPPLY");

    await pressExactText(page, "AUDIT");
    await waitForVisibleText(page, EXPECTED_ITEM);
    await waitForVisibleText(page, EXPECTED_COST);
    await waitForVisibleText(page, outcome);
    const auditCountBeforeNavigation = await countVisibleExactText(page, EXPECTED_ITEM);
    if (auditCountBeforeNavigation !== 1) {
      throw new Error(`Expected one AUDIT item before navigation, found ${auditCountBeforeNavigation}`);
    }

    await openMoreDestination(page, "FINANCES & BANKING", "/finances");
    await waitForVisibleText(page, "FINANCES & BANKING");
    await pressExactText(page, "LEDGER");
    await waitForVisibleText(page, EXPECTED_ITEM);
    await waitForVisibleText(page, EXPECTED_COST);
    await waitForVisibleText(page, outcome);

    await openMoreDestination(page, "BLACK MARKET", "/blackmarket");
    await waitForVisibleText(page, "BLACK MARKET");
    await pressExactText(page, "AUDIT");
    await waitForVisibleText(page, EXPECTED_ITEM);
    await waitForVisibleText(page, EXPECTED_COST);
    await waitForVisibleText(page, outcome);
    const auditCountAfterNavigation = await countVisibleExactText(page, EXPECTED_ITEM);
    if (auditCountAfterNavigation !== 1) {
      throw new Error(`Navigation duplicated the AUDIT item (${auditCountAfterNavigation})`);
    }

    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      FIXTURE_KEY,
    );
    const savedState = await decodePersistedState(page);
    if (savedState.blackMarketHistory?.length !== 1) {
      throw new Error(
        `Expected one persisted black-market audit entry, found ${savedState.blackMarketHistory?.length ?? 0}`,
      );
    }
    if (
      savedState.blackMarketHistory[0].itemName !== EXPECTED_ITEM ||
      savedState.blackMarketHistory[0].cost !== 2500 ||
      savedState.blackMarketHistory[0].outcome !== outcome.toLowerCase()
    ) {
      throw new Error(`Persisted audit entry did not match the visible ${outcome.toLowerCase()} purchase`);
    }

    await page.goto(fixtureUrl("load", expectedOutcome), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForPath(page, "/blackmarket");
    await waitForVisibleText(page, "BLACK MARKET");
    await pressExactText(page, "AUDIT");
    await waitForVisibleText(page, EXPECTED_ITEM);
    await waitForVisibleText(page, EXPECTED_COST);
    await waitForVisibleText(page, outcome);
    const auditCountAfterReload = await countVisibleExactText(page, EXPECTED_ITEM);
    if (auditCountAfterReload !== 1) {
      throw new Error(`Profile reload duplicated or lost the AUDIT item (${auditCountAfterReload})`);
    }
    await openMoreDestination(page, "FINANCES & BANKING", "/finances");
    await waitForVisibleText(page, "FINANCES & BANKING");
    await pressExactText(page, "LEDGER");
    await waitForVisibleText(page, EXPECTED_ITEM);
    await waitForVisibleText(page, EXPECTED_COST);
    await waitForVisibleText(page, outcome);
    if (browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
    console.log(
      `[e2e] PASS: cancelled purchase stayed inert; ${outcome.toLowerCase()} black-market audit survived Finance navigation and active-profile reload exactly once`,
    );
  } finally {
    await context.close().catch(() => {});
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

  try {
    for (const outcome of OUTCOMES) {
      await runScenario(browser, outcome);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});