// Packaged Electron smoke coverage for the isolated Military reserve fixture.
//
// The same release-safe fixture runs against the local Steam Electron shell or
// an unpacked Windows release:
//
//   MEGACITY_RUN_PACKAGED_MILITARY_FOOD_POOL=1 \
//   node e2e/packagedMilitaryFoodPool.e2e.mjs
//
// A Windows release runner also sets MEGACITY_RELEASE_EXECUTABLE and requires
// the native x64 package through the companion PowerShell script.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer";

const STEAM_DIR = resolve(import.meta.dirname, "..", "steam");
const ELECTRON_PATH =
  process.env.ELECTRON_PATH ??
  resolve(STEAM_DIR, "node_modules", "electron", "dist", "electron");
const RELEASE_EXECUTABLE = process.env.MEGACITY_RELEASE_EXECUTABLE
  ? resolve(process.env.MEGACITY_RELEASE_EXECUTABLE)
  : null;
const PACKAGED_MODE =
  process.env.MEGACITY_RUN_PACKAGED_MILITARY_FOOD_POOL === "1" ||
  Boolean(RELEASE_EXECUTABLE);
const REQUIRE_RELEASE =
  process.env.MEGACITY_REQUIRE_PACKAGED_MILITARY_FOOD_POOL === "1";
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const ISOLATED_SAVE_KEY = "@megacity_e2e_military_food_pool_1";
const FIXTURE_QUERY =
  "demo=1&militaryfoodpool=1&militaryFoodPoolReload=save&go=military";
const RELOAD_QUERY =
  "demo=1&militaryfoodpool=1&militaryFoodPoolReload=load&go=military";
const LEGACY_QUERY =
  "demo=1&militaryfoodpool=1&militaryFoodPoolReload=legacy-load&go=military";
const EXPECTED_BALANCES = {
  resourcesAmmo: "111",
  resourcesFuel: "222 / 5,000",
  resourcesFood: "333 / 1,000",
  stockpileAmmo: "1,111",
  stockpileFuel: "2,222",
  stockpileVehicleParts: "3,333",
  rationsFood: "333 FOOD",
};
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (REQUIRE_RELEASE && process.platform !== "win32") {
  throw new Error("the packaged military reserve check requires a Windows runner");
}
if (REQUIRE_RELEASE && !RELEASE_EXECUTABLE) {
  throw new Error(
    "MEGACITY_RELEASE_EXECUTABLE is required for the packaged military reserve check",
  );
}
if (PACKAGED_MODE && !existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function computeChecksum(json) {
  let hash = 0;
  for (let index = 0; index < json.length; index += 1) {
    hash = ((hash << 5) - hash + json.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function makeLegacyEnvelope() {
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

function validateReleaseBundle() {
  if (!RELEASE_EXECUTABLE) return;
  const packagedAppDirectory = resolve(
    RELEASE_EXECUTABLE,
    "..",
    "resources",
    "app",
  );
  const sourceManifest = JSON.parse(
    readFileSync(join(STEAM_DIR, "release-manifest.json"), "utf8"),
  );
  const packagedManifest = JSON.parse(
    readFileSync(join(packagedAppDirectory, "release-manifest.json"), "utf8"),
  );
  for (const field of ["appVersion", "entryBundle", "bundleSha256", "generatedAt"]) {
    if (packagedManifest[field] !== sourceManifest[field]) {
      throw new Error(`packaged release manifest drifted for ${field}`);
    }
  }
  const entryPath = join(
    packagedAppDirectory,
    "web-build",
    "_expo",
    "static",
    "js",
    "web",
    packagedManifest.entryBundle,
  );
  if (!existsSync(entryPath)) {
    throw new Error(`packaged release is missing ${packagedManifest.entryBundle}`);
  }
  const entryHash = createHash("sha256")
    .update(readFileSync(entryPath))
    .digest("hex");
  if (entryHash !== packagedManifest.bundleSha256) {
    throw new Error("packaged release entry bundle hash mismatch");
  }
  console.log(
    `[e2e] verified packaged release manifest v${packagedManifest.appVersion}: ${packagedManifest.entryBundle}`,
  );
}

async function waitForVisibleText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await page
      .evaluate((targetText) => {
        const needle = targetText.toUpperCase();
        return [...document.querySelectorAll("body *")].some((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            (element.innerText ?? "").toUpperCase().includes(needle)
          );
        });
      }, text)
      .catch(() => false);
    if (visible) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text "${text}"`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((targetText) => {
    const needle = targetText.toUpperCase();
    const element = [...document.querySelectorAll("div, span, button")].find(
      (candidate) => {
        const rect = candidate.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (candidate.innerText ?? "").trim().toUpperCase() === needle
        );
      },
    );
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text "${text}"`);
}

async function assertBalances(page, stage) {
  const result = await page.evaluate(() => {
    const read = (testId) =>
      document.querySelector(`[data-testid="${testId}"]`)?.innerText ?? "";
    return {
      resourcesAmmo: read("military-top-level-reserve-row-ammo"),
      resourcesFuel: read("military-top-level-reserve-row-fuel"),
      resourcesFood: read("military-top-level-reserve-row-food"),
      stockpileAmmo: read("military-logistics-stockpile-row-ammo"),
      stockpileFuel: read("military-logistics-stockpile-row-fuel"),
      stockpileVehicleParts: read("military-logistics-stockpile-row-vehicleParts"),
      rations: read("military-supply-row-rations"),
    };
  });
  for (const [key, expected] of Object.entries(EXPECTED_BALANCES)) {
    const actual = key === "rationsFood" ? result.rations : result[key];
    if (!actual.includes(expected)) {
      throw new Error(
        `${stage} ${key} drifted: expected "${expected}" in "${actual}"`,
      );
    }
  }
}

async function assertNoPlayerSaveStorage(page) {
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  const playerKeys = keys.filter(
    (key) =>
      key.startsWith("@megacity_slot_") ||
      key === "@megacity_save" ||
      key === "@megacity_profiles_index" ||
      key.startsWith("@megacity_profile_") ||
      key === "@megacity_active_profile",
  );
  if (playerKeys.length) {
    throw new Error(
      `packaged military fixture touched player save storage: ${JSON.stringify(playerKeys)}`,
    );
  }
}

async function openSupplyCard(page) {
  await waitForVisibleText(page, "MILITARY / ARMORY");
  await clickVisibleText(page, "SUPPLY");
  await waitForVisibleText(page, "TOP-LEVEL CITY RESERVES");
  await waitForVisibleText(page, "SEPARATE LOGISTICS STOCKPILES");
  await waitForVisibleText(page, "RATIONS");
  await waitForVisibleText(page, "FOOD POOL");
}

async function runPackaged() {
  let browser;
  let userDataDirectory;
  const rendererErrors = [];
  try {
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-packaged-military-food-pool-"),
    );
    validateReleaseBundle();
    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SANDBOX: "1",
        MEGACITY_E2E_FIXTURE: "military-food-pool",
        MEGACITY_E2E_QUERY: FIXTURE_QUERY,
        MEGACITY_E2E_ROUTE: "military",
      },
      args: [
        ...(RELEASE_EXECUTABLE ? [] : [STEAM_DIR]),
        "--no-sandbox",
        "--disable-dev-shm-usage",
        `--user-data-dir=${userDataDirectory}`,
      ],
      dumpio: false,
    });
    const page = (await browser.pages())[0] ?? (await browser.newPage());
    await page.setViewport(VIEWPORT);
    page.on("pageerror", (error) => rendererErrors.push(`pageerror: ${errorMessage(error)}`));
    page.on("error", (error) => rendererErrors.push(`renderer crashed: ${errorMessage(error)}`));
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
        rendererErrors.push(`console.error: ${message.text()}`);
      }
    });

    console.log(
      `[e2e] launching packaged military fixture (${RELEASE_EXECUTABLE ? "Windows release executable" : "Steam Electron shell"})`,
    );
    await openSupplyCard(page);
    await assertBalances(page, "saved live state");
    await waitForVisibleText(page, "333 FOOD");
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      ISOLATED_SAVE_KEY,
    );
    await assertNoPlayerSaveStorage(page);

    await page.goto(`app://bundle/military?${RELOAD_QUERY}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await openSupplyCard(page);
    await assertBalances(page, "reloaded state");
    await assertNoPlayerSaveStorage(page);

    await page.evaluateOnNewDocument((key, envelope) => {
      window.localStorage.setItem(key, envelope);
    }, ISOLATED_SAVE_KEY, makeLegacyEnvelope());
    await page.goto(`app://bundle/military?${LEGACY_QUERY}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await openSupplyCard(page);
    await assertBalances(page, "legacy migrated state");
    await assertNoPlayerSaveStorage(page);

    if (rendererErrors.length) {
      throw new Error(`packaged renderer emitted errors:\n${rendererErrors.join("\n")}`);
    }
    console.log(
      "PASS: packaged military fixture preserves three top-level reserves, three logistics stockpiles, and RATIONS → FOOD POOL after reload",
    );
    console.log("PASS: packaged military fixture leaves player profile and slot storage untouched");
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        throw new Error(
          `packaged military smoke test left temporary profile behind: ${userDataDirectory}`,
        );
      }
    }
  }
}

if (!PACKAGED_MODE) {
  throw new Error(
    "packaged military smoke test requires MEGACITY_RUN_PACKAGED_MILITARY_FOOD_POOL=1 or MEGACITY_RELEASE_EXECUTABLE",
  );
}

runPackaged().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});