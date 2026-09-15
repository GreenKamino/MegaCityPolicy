// Browser regression coverage for the Military supply card's supply rows on
// phone-sized and representative desktop layouts. Requires the "artifacts/megacity: expo"
// workflow.
//   node e2e/militaryFoodPool.e2e.mjs
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
  `${BASE_URL}/?demo=1&militaryfoodpool=1&militaryFoodPoolReload=save&go=military`;
const RELOAD_URL =
  `${BASE_URL}/?demo=1&militaryfoodpool=1&militaryFoodPoolReload=load&go=military`;
const LEGACY_RELOAD_URL =
  `${BASE_URL}/?demo=1&militaryfoodpool=1&militaryFoodPoolReload=legacy-load&go=military`;
const ISOLATED_SAVE_KEY = "@megacity_e2e_military_food_pool_1";
const EXPECTED_BALANCES = {
  resourcesAmmo: "111",
  resourcesFuel: "222 / 5,000",
  resourcesFood: "333 / 1,000",
  stockpileAmmo: "1,111",
  stockpileFuel: "2,222",
  stockpileVehicleParts: "3,333",
  rationsFood: "333 FOOD",
};

function computeChecksum(json) {
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) - hash + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function makeLegacyEnvelope() {
  // This is intentionally a pre-migration v1 save shape: the payload omits
  // current fields and keeps only the values needed to prove that migration
  // preserves ownership of the three reserve ledgers.
  const legacyState = {
    cityName: "LEGACY MILITARY CITY",
    totalTicks: 42,
    lastTickTime: Date.now(),
    tickPaused: true,
    hasCompletedOnboarding: true,
    buildings: {},
    units: {},
    cityStats: {},
    resources: { ammo: 111, fuel: 222, food: 333 },
    stockpiles: { ammo: 1_111, fuel: 2_222, vehicleParts: 3_333 },
    activeEvents: [],
    messages: [],
  };
  const json = JSON.stringify(legacyState);
  return JSON.stringify({ v: 1, checksum: computeChecksum(json), data: json });
}

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForVisibleText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate((target) => {
      const needle = target.toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.toUpperCase().includes(needle)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    }, text);
    if (found) return;
    await sleep(400);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const matches = [...document.querySelectorAll("div, span, button")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (element.innerText ?? "").trim().toUpperCase() === needle;
    });
    const element = matches.sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function inspectSupplyRow(page, rowKey) {
  return page.evaluate(function (rowKey) {
    const patterns = {
      ammo: { label: "AMMO", value: /[\d,.]+\s*\/\s*[\d,.]+/ },
      fuel: { label: "FUEL", value: /[\d,.]+\s*\/\s*[\d,.]+/ },
      rations: { label: "RATIONS", value: /[\d,.]+\s*\/\s*[\d,.]+/ },
    };
    const pattern = patterns[rowKey];
    const anchoredRow = document.querySelector(`[data-testid="military-supply-row-${rowKey}"]`);
    const rows = anchoredRow ? [anchoredRow] : [...document.querySelectorAll("div")].filter((element) => {
      const text = (element.innerText ?? "").trim().toUpperCase();
      const rect = element.getBoundingClientRect();
      return (
        pattern &&
        text.includes(pattern.label) &&
        pattern.value.test(text) &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    const row = rows.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
    if (!row) return null;

    const anchoredLabel = row.querySelector(`[data-testid="military-supply-label-${rowKey}"]`);
    const label = anchoredLabel ?? [...row.querySelectorAll("div, span")].find((element) => {
      const text = (element.innerText ?? "").trim().toUpperCase();
      return text === pattern.label || (rowKey === "rations" && text.includes("RATIONS") && text.includes("FOOD POOL"));
    }) ?? row;
    const value = [...row.querySelectorAll("div, span")].find((element) => {
      const text = (element.innerText ?? "").trim().toUpperCase();
      return element !== label && pattern.value.test(text);
    });
    const rowRect = row.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const valueRect = value?.getBoundingClientRect();
    let card = row.parentElement;
    while (card && !((card.innerText ?? "").toUpperCase().includes("LOGISTICS THROUGHPUT"))) {
      card = card.parentElement;
    }
    const cardRect = card?.getBoundingClientRect();
    const text = (label.innerText ?? label.textContent ?? "").trim();
    const supplyMatch = value?.innerText?.match(pattern.value);
    return {
      text,
      hasSupplyValue: Boolean(supplyMatch),
      valueText: value?.innerText?.trim() ?? null,
      labelRect: { left: labelRect.left, right: labelRect.right, top: labelRect.top, bottom: labelRect.bottom },
      valueRect: valueRect
        ? { left: valueRect.left, right: valueRect.right, top: valueRect.top, bottom: valueRect.bottom }
        : null,
      rowRect: { left: rowRect.left, right: rowRect.right, top: rowRect.top, bottom: rowRect.bottom },
      cardRect: cardRect
        ? { left: cardRect.left, right: cardRect.right, top: cardRect.top, bottom: cardRect.bottom }
        : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }, rowKey);
}

async function assertSupplyRowReadable(page, rowKey, layoutName) {
  await page.evaluate(function (rowKey) {
    const patterns = {
      ammo: (text) => text.includes("AMMO") && /[\d,.]+\s*\/\s*[\d,.]+/.test(text),
      fuel: (text) => text.includes("FUEL") && /[\d,.]+\s*\/\s*[\d,.]+/.test(text),
      rations: (text) => text.includes("RATIONS") && text.includes("FOOD POOL") && /\d+\s+FOOD/.test(text),
    };
    const rows = [...document.querySelectorAll("div")].filter((element) => {
      const text = (element.innerText ?? "").trim().toUpperCase();
      const rect = element.getBoundingClientRect();
      return patterns[rowKey]?.(text) && rect.width > 0 && rect.height > 0;
    });
    rows.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0]?.scrollIntoView({
      block: "center",
      inline: "nearest",
    });
  }, rowKey);

  const row = await inspectSupplyRow(page, rowKey);
  const rowName = rowKey === "rations" ? "Rations → Food pool" : rowKey.toUpperCase();
  if (!row) throw new Error(`Could not locate the visible ${rowName} row at ${layoutName}`);

  const fullyInside = (inner, outer) =>
    inner.left >= outer.left &&
    inner.right <= outer.right &&
    inner.top >= outer.top &&
    inner.bottom <= outer.bottom;
  const viewport = { left: 0, top: 0, right: row.viewport.width, bottom: row.viewport.height };

  if (!row.text.toUpperCase().includes(rowKey === "rations" ? "RATIONS" : rowKey.toUpperCase())) {
    throw new Error(`${rowName} label is missing at ${layoutName}: "${row.text}"`);
  }
  if (rowKey === "rations" && !row.text.toUpperCase().includes("FOOD POOL")) {
    throw new Error(`Food pool label is missing at ${layoutName}: "${row.text}"`);
  }
  if (!row.hasSupplyValue || !row.valueRect) {
    throw new Error(`${rowName} value is missing at ${layoutName}: "${row.text}"`);
  }
  if (!fullyInside(row.labelRect, row.rowRect)) {
    throw new Error(`${rowName} label is clipped by its row at ${layoutName}: ${JSON.stringify(row)}`);
  }
  if (!fullyInside(row.valueRect, row.rowRect)) {
    throw new Error(`${rowName} value is clipped by its row at ${layoutName}: ${JSON.stringify(row)}`);
  }
  if (row.labelRect.right > row.valueRect.left && row.valueRect.right > row.labelRect.left &&
      row.labelRect.bottom > row.valueRect.top && row.valueRect.bottom > row.labelRect.top) {
    throw new Error(`${rowName} label and value overlap at ${layoutName}: ${JSON.stringify(row)}`);
  }
  if (!row.cardRect || !fullyInside(row.labelRect, row.cardRect) || !fullyInside(row.valueRect, row.cardRect)) {
    throw new Error(`${rowName} label/value is clipped by the supply card at ${layoutName}: ${JSON.stringify(row)}`);
  }
  if (!fullyInside(row.labelRect, viewport) || !fullyInside(row.valueRect, viewport)) {
    throw new Error(`${rowName} label/value is outside the viewport at ${layoutName}: ${JSON.stringify(row)}`);
  }

  return row;
}

async function inspectSupplyLedgers(page) {
  return page.evaluate(() => {
    const topLevel = document.querySelector('[data-testid="military-top-level-reserves"]');
    const stockpiles = document.querySelector('[data-testid="military-logistics-stockpiles"]');
    return {
      topLevel: topLevel?.innerText ?? "",
      stockpiles: stockpiles?.innerText ?? "",
    };
  });
}

async function assertMilitaryBalances(page, stage) {
  const result = await page.evaluate(() => {
    const read = (testId) =>
      document.querySelector(`[data-testid="${testId}"]`)?.innerText ?? "";
    return {
      rows: {
        resourcesAmmo: read("military-top-level-reserve-row-ammo"),
        resourcesFuel: read("military-top-level-reserve-row-fuel"),
        resourcesFood: read("military-top-level-reserve-row-food"),
        stockpileAmmo: read("military-logistics-stockpile-row-ammo"),
        stockpileFuel: read("military-logistics-stockpile-row-fuel"),
        stockpileVehicleParts: read("military-logistics-stockpile-row-vehicleParts"),
      },
      rations: read("military-supply-row-rations"),
    };
  });

  for (const [key, expected] of Object.entries(EXPECTED_BALANCES)) {
    const actual = key === "rationsFood"
      ? result.rations
      : result.rows[key];
    if (!actual.includes(expected)) {
      throw new Error(
        `${stage} military balance ${key} drifted: expected "${expected}" in "${actual}"`,
      );
    }
  }
}

async function assertReadinessGuidance(page, stage) {
  const guidance = await page.evaluate(() => ({
    body: document.querySelector('[data-testid="military-readiness-guidance"]')?.innerText ?? "",
    action: document.querySelector('[data-testid="military-readiness-guidance-action"]')?.innerText ?? "",
  }));
  const body = guidance.body.toUpperCase();
  if (!body.includes("SUPPLIES ARE LIMITING READINESS")) {
    throw new Error(`${stage} readiness guidance did not select supplies: "${guidance.body}"`);
  }
  if (!body.includes("FUEL IS THE LIMITING SUPPLY (2 TICKS REMAINING). REVIEW SUPPLY.")) {
    throw new Error(`${stage} readiness guidance lost the limiting supply: "${guidance.body}"`);
  }
  if (guidance.action.trim().toUpperCase() !== "OPEN SUPPLY") {
    throw new Error(`${stage} readiness guidance action drifted: "${guidance.action}"`);
  }
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string"
    ? decompressFromUTF16(envelope.data)
    : raw;
  return json ? JSON.parse(json) : null;
}

async function waitForIsolatedSave(page, timeout = 120000) {
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout },
    ISOLATED_SAVE_KEY,
  );
}

async function assertNoPlayerSaveStorage(page) {
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  const playerKeys = keys.filter((key) =>
    key.startsWith("@megacity_slot_") ||
    key === "@megacity_save" ||
    key === "@megacity_profiles_index" ||
    key.startsWith("@megacity_profile_") ||
    key === "@megacity_active_profile",
  );
  if (playerKeys.length) {
    throw new Error(`Military food-pool fixture touched player save storage: ${JSON.stringify(playerKeys)}`);
  }
}

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const context =
  typeof browser.createBrowserContext === "function"
    ? await browser.createBrowserContext()
    : await browser.createIncognitoBrowserContext();
const page = await context.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
    pageErrors.push(message.text());
  }
});

try {
  const legacyEnvelope = makeLegacyEnvelope();
  await page.evaluateOnNewDocument((key, envelope) => {
    if (window.location.search.includes("militaryFoodPoolReload=legacy-load")) {
      window.localStorage.setItem(key, envelope);
    }
  }, ISOLATED_SAVE_KEY, legacyEnvelope);

  await page.goto(FIXTURE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitForVisibleText(page, "MILITARY / ARMORY");
  await clickVisibleText(page, "ARMY");
  await waitForVisibleText(page, "SUPPLIES ARE LIMITING READINESS");
  await assertReadinessGuidance(page, "saved live state");
  await clickVisibleText(page, "OPEN SUPPLY");
  await waitForVisibleText(page, "LOGISTICS THROUGHPUT");
  await waitForVisibleText(page, "RATIONS");
  await waitForVisibleText(page, "FOOD POOL");
  await waitForVisibleText(page, "TOP-LEVEL CITY RESERVES");
  await waitForVisibleText(page, "SEPARATE LOGISTICS STOCKPILES");

  const ledgers = await inspectSupplyLedgers(page);
  for (const path of ["resources.ammo", "resources.fuel", "resources.food"]) {
    if (!ledgers.topLevel.includes(path)) {
      throw new Error(`Top-level reserve accounting path is missing: ${path}`);
    }
  }
  for (const path of ["stockpiles.ammo", "stockpiles.fuel", "stockpiles.vehicleParts"]) {
    if (!ledgers.stockpiles.includes(path)) {
      throw new Error(`Logistics stockpile accounting path is missing: ${path}`);
    }
  }
  if (!ledgers.stockpiles.includes("RATIONS ARE NOT A SEPARATE STOCKPILE ITEM")) {
    throw new Error("Rations must be accounted through the shared Food reserve");
  }
  if (ledgers.stockpiles.toUpperCase().includes("CAPACITY:")) {
    throw new Error("Open-ended stockpiles must not display a per-item capacity");
  }
  await assertMilitaryBalances(page, "saved live state");
  await waitForIsolatedSave(page);
  const persistedRaw = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    ISOLATED_SAVE_KEY,
  );
  const persistedState = persistedRaw ? decodePersistedState(persistedRaw) : null;
  if (
    persistedState?.resources?.ammo !== 111 ||
    persistedState?.resources?.fuel !== 222 ||
    persistedState?.resources?.food !== 333 ||
    persistedState?.stockpiles?.ammo !== 1_111 ||
    persistedState?.stockpiles?.fuel !== 2_222 ||
    persistedState?.stockpiles?.vehicleParts !== 3_333 ||
    persistedState?.militaryOverhaul?.standingArmy?.readiness !== 30 ||
    persistedState?.militaryOverhaul?.logistics?.suppliesTicksRemaining?.fuel !== 2
  ) {
    throw new Error("The isolated military save did not retain reserve, stockpile, and readiness guidance state");
  }

  const phoneRows = {};
  for (const rowKey of ["ammo", "fuel", "rations"]) {
    phoneRows[rowKey] = await assertSupplyRowReadable(page, rowKey, "phone-sized layout");
  }

  // React Native's web renderer uses fixed pixel font sizes, so emulate the
  // browser accessibility/text-enlargement path with CSS zoom. This enlarges
  // the rendered card and forces the same wrapping/clipping constraints as
  // browser zoom without changing the game's state.
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.5";
  });
  const enlargedRows = {};
  for (const rowKey of ["ammo", "fuel", "rations"]) {
    enlargedRows[rowKey] = await assertSupplyRowReadable(page, rowKey, "150% browser text scale");
  }

  // Reopen the same supply card at a representative desktop width. Keep this
  // as a separate viewport pass so a responsive change that only affects the
  // wider card cannot hide behind the phone/text-scale assertions above.
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await waitForVisibleText(page, "LOGISTICS THROUGHPUT");
  await waitForVisibleText(page, "RATIONS");
  await waitForVisibleText(page, "FOOD POOL");
  const desktopRows = {};
  for (const rowKey of ["ammo", "fuel", "rations"]) {
    desktopRows[rowKey] = await assertSupplyRowReadable(page, rowKey, "desktop-width layout");
  }

  await page.goto(RELOAD_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitForVisibleText(page, "MILITARY / ARMORY");
  await clickVisibleText(page, "ARMY");
  await waitForVisibleText(page, "SUPPLIES ARE LIMITING READINESS");
  await assertReadinessGuidance(page, "reloaded state");
  await clickVisibleText(page, "OPEN SUPPLY");
  await waitForVisibleText(page, "TOP-LEVEL CITY RESERVES");
  await waitForVisibleText(page, "SEPARATE LOGISTICS STOCKPILES");
  await waitForVisibleText(page, EXPECTED_BALANCES.rationsFood);
  await assertMilitaryBalances(page, "reloaded state");
  await assertNoPlayerSaveStorage(page);

  await page.goto(LEGACY_RELOAD_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitForVisibleText(page, "MILITARY / ARMORY");
  await clickVisibleText(page, "SUPPLY");
  await waitForVisibleText(page, "TOP-LEVEL CITY RESERVES");
  await waitForVisibleText(page, "SEPARATE LOGISTICS STOCKPILES");
  await waitForVisibleText(page, EXPECTED_BALANCES.rationsFood);
  await assertMilitaryBalances(page, "legacy migrated state");
  await assertNoPlayerSaveStorage(page);

  if (pageErrors.length) throw new Error(`Browser errors:\n${pageErrors.join("\n")}`);

  console.log("PASS: low-readiness guidance names FUEL and opens SUPPLY before save");
  console.log("PASS: low-readiness FUEL guidance survives the isolated save/reload");
  console.log("PASS: Military supply view separates top-level reserves from open-ended logistics stockpiles");
  console.log("PASS: legacy v1 save migration preserves reserve ownership and RATIONS → FOOD POOL");
  console.log(`PASS: phone-sized AMMO/FUEL/Food pool rows are readable (${Object.values(phoneRows).map((row) => row.text).join(" | ")})`);
  console.log(`PASS: 150% text-scale AMMO/FUEL/Food pool rows are readable (${Object.values(enlargedRows).map((row) => row.text).join(" | ")})`);
  console.log(`PASS: desktop-width AMMO/FUEL/Food pool rows are readable (${Object.values(desktopRows).map((row) => row.text).join(" | ")})`);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
