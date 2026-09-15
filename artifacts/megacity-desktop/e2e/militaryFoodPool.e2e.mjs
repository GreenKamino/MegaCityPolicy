// Desktop wrapper smoke test for the Military supply card.
//
// This starts at the desktop wrapper route, not the Expo game route directly.
// The wrapper's iframe is the packaged desktop surface whose viewport,
// scaling, and query-string forwarding can regress independently.
//
// Run with:
//   E2E_BASE_URL=http://localhost:80/desktop node e2e/militaryFoodPool.e2e.mjs
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import LZString from "../../megacity/node_modules/lz-string/libs/lz-string.js";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const { decompressFromUTF16 } = LZString;

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:80/desktop";
const BASE_PATH = BASE_URL.replace(/\/$/, "");
const MILITARY_URL = `${BASE_PATH}/?demo=1&go=military`;
const MILITARY_FIXTURE_URL =
  `${BASE_PATH}/?demo=1&militaryfoodpool=1&militaryFoodPoolReload=save&go=military`;
const MILITARY_RELOAD_URL =
  `${BASE_PATH}/?demo=1&militaryfoodpool=1&militaryFoodPoolReload=load&go=military`;
const MILITARY_LEGACY_RELOAD_URL =
  `${BASE_PATH}/?demo=1&militaryfoodpool=1&militaryFoodPoolReload=legacy-load&go=military`;
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
const DESKTOP_VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1 };
const READY_TIMEOUT_MS =
  Number(process.env.E2E_DESKTOP_READY_TIMEOUT_MS) || 120000;
const POLL_INTERVAL_MS = 500;

function computeChecksum(json) {
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) - hash + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function makeLegacyEnvelope() {
  // Deliberately omit current state fields so the desktop smoke exercises the
  // same v1 unwrap/migrate/sanitize path used by returning players.
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

function resolveChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH)
    return process.env.PUPPETEER_EXECUTABLE_PATH;
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

async function readDesktopDiagnostics(page) {
  const outer = await page
    .evaluate(() => {
      const overlays = [
        ...document.querySelectorAll('[role="alert"], [role="status"]'),
      ]
        .map((element) => (element.innerText ?? "").trim())
        .filter(Boolean);
      const iframe = document.querySelector("iframe");
      return {
        overlays,
        iframeSrc: iframe?.getAttribute("src") ?? null,
      };
    })
    .catch((error) => ({ outerError: errorMessage(error) }));
  return {
    outer,
    frames: page.frames().map((frame) => frame.url()),
  };
}

async function waitFor(
  predicate,
  timeout = READY_TIMEOUT_MS,
  step,
  diagnostics,
) {
  const deadline = Date.now() + timeout;
  let lastFailure = null;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastFailure = errorMessage(error);
      // The iframe can be replaced while the Expo route boots. Retry with the
      // current frame instead of holding onto a detached frame handle.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  const diagnosticText = diagnostics
    ? ` State: ${JSON.stringify(await diagnostics())}`
    : "";
  const failureText = lastFailure ? ` Last probe error: ${lastFailure}.` : "";
  throw new Error(
    `Timed out after ${timeout}ms while ${step}.${failureText}${diagnosticText}`,
  );
}

async function findGameFrame(
  page,
  step = "waiting for the embedded game frame",
  timeout = READY_TIMEOUT_MS,
) {
  return waitFor(
    () => {
      const frame = page
        .frames()
        .find((candidate) => candidate !== page.mainFrame());
      return frame ?? null;
    },
    timeout,
    step,
    () => readDesktopDiagnostics(page),
  );
}

async function waitForVisibleText(page, text, timeout = READY_TIMEOUT_MS) {
  const needle = text.toUpperCase();
  await waitFor(
    async () => {
      const frame = page
        .frames()
        .find((candidate) => candidate !== page.mainFrame());
      if (!frame) return false;
      const bodyText = await frame.evaluate(
        () => document.body?.innerText ?? "",
      );
      return bodyText.toUpperCase().includes(needle);
    },
    timeout,
    `waiting for visible game text "${text}"`,
    () => readDesktopDiagnostics(page),
  );
}

async function clickVisibleText(page, text, timeout = READY_TIMEOUT_MS) {
  await waitFor(
    async () => {
      const frame = page
        .frames()
        .find((candidate) => candidate !== page.mainFrame());
      if (!frame) return false;
      return frame.evaluate((targetText) => {
        const needle = targetText.toUpperCase();
        const matches = [
          ...document.querySelectorAll("div, span, button"),
        ].filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            (element.innerText ?? "").trim().toUpperCase() === needle
          );
        });
        const target = matches.sort(
          (a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length,
        )[0];
        if (!target) return false;
        target.scrollIntoView({ block: "center", inline: "center" });
        target.click();
        return true;
      }, text);
    },
    timeout,
    `clicking visible game text "${text}"`,
    () => readDesktopDiagnostics(page),
  );
}

async function inspectSupplyRow(page, rowKey) {
  const frame = await findGameFrame(page);
  return frame.evaluate((key) => {
    const patterns = {
      ammo: { label: "AMMO", value: /[\d,.]+\s*\/\s*[\d,.]+/ },
      fuel: { label: "FUEL", value: /[\d,.]+\s*\/\s*[\d,.]+/ },
      rations: { label: "RATIONS", value: /[\d,.]+\s*\/\s*[\d,.]+/ },
    };
    const pattern = patterns[key];
    const anchoredRow = document.querySelector(
      `[data-testid="military-supply-row-${key}"]`,
    );
    const rows = anchoredRow
      ? [anchoredRow]
      : [...document.querySelectorAll("div")].filter((element) => {
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
    const row = rows.sort(
      (a, b) =>
        a.getBoundingClientRect().height - b.getBoundingClientRect().height,
    )[0];
    if (!row) return null;

    const anchoredLabel = row.querySelector(
      `[data-testid="military-supply-label-${key}"]`,
    );
    const label =
      anchoredLabel ??
      [...row.querySelectorAll("div, span")].find((element) => {
        const text = (element.innerText ?? "").trim().toUpperCase();
        return (
          text === pattern.label ||
          (key === "rations" &&
            text.includes("RATIONS") &&
            text.includes("FOOD POOL"))
        );
      }) ?? row;
    const value = [...row.querySelectorAll("div, span")].find((element) => {
      const text = (element.innerText ?? "").trim().toUpperCase();
      return element !== label && pattern.value.test(text);
    });
    const rowRect = row.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const valueRect = value?.getBoundingClientRect();
    let card = row.parentElement;
    while (
      card &&
      !(card.innerText ?? "").toUpperCase().includes("LOGISTICS THROUGHPUT")
    ) {
      card = card.parentElement;
    }
    const cardRect = card?.getBoundingClientRect();
    return {
      text: (label.innerText ?? label.textContent ?? "").trim(),
      valueText: value?.innerText?.trim() ?? null,
      labelRect: {
        left: labelRect.left,
        right: labelRect.right,
        top: labelRect.top,
        bottom: labelRect.bottom,
      },
      valueRect: valueRect
        ? {
            left: valueRect.left,
            right: valueRect.right,
            top: valueRect.top,
            bottom: valueRect.bottom,
          }
        : null,
      rowRect: {
        left: rowRect.left,
        right: rowRect.right,
        top: rowRect.top,
        bottom: rowRect.bottom,
      },
      cardRect: cardRect
        ? {
            left: cardRect.left,
            right: cardRect.right,
            top: cardRect.top,
            bottom: cardRect.bottom,
          }
        : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }, rowKey);
}

async function inspectMilitaryBalances(page) {
  const frame = await findGameFrame(page);
  return frame.evaluate(() => {
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
}

async function assertMilitaryBalances(page, stage) {
  const result = await inspectMilitaryBalances(page);
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

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string"
    ? decompressFromUTF16(envelope.data)
    : raw;
  return json ? JSON.parse(json) : null;
}

async function waitForIsolatedSave(page, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frame = await findGameFrame(page, "waiting for the isolated military save", timeout);
    const saved = await frame.evaluate(
      (key) => Boolean(window.localStorage.getItem(key)),
      ISOLATED_SAVE_KEY,
    );
    if (saved) return;
    await sleep(400);
  }
  throw new Error(`Timed out waiting for isolated military save key ${ISOLATED_SAVE_KEY}`);
}

async function assertNoPlayerSaveStorage(page) {
  const frame = await findGameFrame(page, "checking isolated military storage");
  const keys = await frame.evaluate(() => Object.keys(window.localStorage));
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

async function assertSupplyRowReadable(
  page,
  rowKey,
  timeout = READY_TIMEOUT_MS,
) {
  const frame = await findGameFrame(page, `reading the ${rowKey} row`, timeout);
  await frame.evaluate((key) => {
    const patterns = {
      ammo: (text) =>
        text.includes("AMMO") && /[\d,.]+\s*\/\s*[\d,.]+/.test(text),
      fuel: (text) =>
        text.includes("FUEL") && /[\d,.]+\s*\/\s*[\d,.]+/.test(text),
      rations: (text) =>
        text.includes("RATIONS") &&
        text.includes("FOOD POOL") &&
        /\d+\s+FOOD/.test(text),
    };
    const rows = [...document.querySelectorAll("div")].filter((element) => {
      const text = (element.innerText ?? "").trim().toUpperCase();
      const rect = element.getBoundingClientRect();
      return patterns[key]?.(text) && rect.width > 0 && rect.height > 0;
    });
    rows
      .sort(
        (a, b) =>
          a.getBoundingClientRect().height - b.getBoundingClientRect().height,
      )[0]
      ?.scrollIntoView({ block: "center", inline: "nearest" });
  }, rowKey);

  const row = await inspectSupplyRow(page, rowKey);
  const rowName =
    rowKey === "rations" ? "RATIONS → FOOD POOL" : rowKey.toUpperCase();
  if (!row)
    throw new Error(
      `Could not locate visible ${rowName} row in desktop wrapper`,
    );

  const fullyInside = (inner, outer) =>
    inner.left >= outer.left &&
    inner.right <= outer.right &&
    inner.top >= outer.top &&
    inner.bottom <= outer.bottom;
  const viewport = {
    left: 0,
    top: 0,
    right: row.viewport.width,
    bottom: row.viewport.height,
  };

  if (
    !row.text
      .toUpperCase()
      .includes(rowKey === "rations" ? "RATIONS" : rowKey.toUpperCase())
  ) {
    throw new Error(`${rowName} label is missing: "${row.text}"`);
  }
  if (rowKey === "rations" && !row.text.toUpperCase().includes("FOOD POOL")) {
    throw new Error(`Food pool label is missing: "${row.text}"`);
  }
  if (!row.valueText || !row.valueRect) {
    throw new Error(`${rowName} value is missing: "${row.text}"`);
  }
  if (!fullyInside(row.labelRect, row.rowRect)) {
    throw new Error(
      `${rowName} label is clipped by its row: ${JSON.stringify(row)}`,
    );
  }
  if (!fullyInside(row.valueRect, row.rowRect)) {
    throw new Error(
      `${rowName} value is clipped by its row: ${JSON.stringify(row)}`,
    );
  }
  if (
    row.labelRect.right > row.valueRect.left &&
    row.valueRect.right > row.labelRect.left &&
    row.labelRect.bottom > row.valueRect.top &&
    row.valueRect.bottom > row.labelRect.top
  ) {
    throw new Error(
      `${rowName} label and value overlap: ${JSON.stringify(row)}`,
    );
  }
  if (
    !row.cardRect ||
    !fullyInside(row.labelRect, row.cardRect) ||
    !fullyInside(row.valueRect, row.cardRect)
  ) {
    throw new Error(
      `${rowName} label/value is clipped by the supply card: ${JSON.stringify(row)}`,
    );
  }
  if (
    !fullyInside(row.labelRect, viewport) ||
    !fullyInside(row.valueRect, viewport)
  ) {
    throw new Error(
      `${rowName} label/value is outside the viewport: ${JSON.stringify(row)}`,
    );
  }

  return row;
}

async function run() {
  console.log(`[e2e] desktop route: ${MILITARY_URL}`);
  try {
    await ensureDesktopWrapperReady();
  } catch (error) {
    console.error(`[e2e] FAIL: ${errorMessage(error)}`);
    process.exitCode = 1;
    return;
  }
  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const context =
    typeof browser.createBrowserContext === "function"
      ? await browser.createBrowserContext()
      : await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  await page.setViewport(DESKTOP_VIEWPORT);
  const pageErrors = [];
  const recordPageError = (error) => {
    pageErrors.push(String(error));
  };
  page.on("pageerror", recordPageError);
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404/.test(message.text())
    ) {
      recordPageError(message.text());
    }
  });

  try {
    const legacyEnvelope = makeLegacyEnvelope();
    await page.evaluateOnNewDocument((key, envelope) => {
      if (window.location.search.includes("militaryFoodPoolReload=legacy-load")) {
        window.localStorage.setItem(key, envelope);
      }
    }, ISOLATED_SAVE_KEY, legacyEnvelope);

    await page.goto(MILITARY_FIXTURE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const readyDeadline = Date.now() + READY_TIMEOUT_MS;
    const remainingReadyTime = () => Math.max(1, readyDeadline - Date.now());

    await waitForVisibleText(page, "MILITARY / ARMORY", remainingReadyTime());
    await clickVisibleText(page, "SUPPLY", remainingReadyTime());
    await waitForVisibleText(
      page,
      "LOGISTICS THROUGHPUT",
      remainingReadyTime(),
    );
    await waitForVisibleText(page, "RATIONS", remainingReadyTime());
    await waitForVisibleText(page, "FOOD POOL", remainingReadyTime());

    const rows = {};
    for (const rowKey of ["ammo", "fuel", "rations"]) {
      rows[rowKey] = await assertSupplyRowReadable(
        page,
        rowKey,
        remainingReadyTime(),
      );
    }
    await assertMilitaryBalances(page, "saved live state");
    await waitForIsolatedSave(page);
    const gameFrame = await findGameFrame(page, "reading isolated military save");
    const persistedRaw = await gameFrame.evaluate(
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
      persistedState?.stockpiles?.vehicleParts !== 3_333
    ) {
      throw new Error("The isolated military save did not retain distinct reserve and stockpile balances");
    }

    await page.goto(MILITARY_RELOAD_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitForVisibleText(page, "MILITARY / ARMORY");
    await clickVisibleText(page, "SUPPLY");
    await waitForVisibleText(page, "TOP-LEVEL CITY RESERVES");
    await waitForVisibleText(page, "SEPARATE LOGISTICS STOCKPILES");
    await waitForVisibleText(page, EXPECTED_BALANCES.rationsFood);
    await assertMilitaryBalances(page, "reloaded state");
    await assertNoPlayerSaveStorage(page);

    await page.goto(MILITARY_LEGACY_RELOAD_URL, {
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

    if (pageErrors.length) {
      throw new Error(
        `page errors during desktop military smoke test:\n${pageErrors.join("\n")}`,
      );
    }
    console.log(
      `PASS: desktop wrapper AMMO/FUEL/RATIONS → FOOD POOL rows are readable (${Object.values(
        rows,
      )
        .map((row) => row.text)
        .join(" | ")})`,
    );
    console.log(
      "PASS: desktop wrapper legacy v1 save migration preserves reserve ownership and RATIONS → FOOD POOL",
    );
  } catch (error) {
    console.error(`[e2e] FAIL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run();
