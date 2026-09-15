// Packaged Electron smoke coverage for the Overview utility production parity
// fixture. This intentionally launches the Steam shell, not the Expo browser
// workflow, so route forwarding and the shipped bundle are both exercised.
//
// Run the local packaged-shell check with:
//   pnpm run test:e2e:packaged-utility-production-parity
//
// To exercise an unpacked Windows release instead, set:
//   MEGACITY_RELEASE_EXECUTABLE=/path/to/game.exe

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
  process.env.MEGACITY_RUN_PACKAGED_UTILITY_PARITY === "1" ||
  Boolean(RELEASE_EXECUTABLE);
const REQUIRE_RELEASE =
  process.env.MEGACITY_REQUIRE_PACKAGED_UTILITY_PARITY_RELEASE === "1";
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const FIXTURE_QUERY = "demo=1&utilityparity=1";
const QUARANTINED_FIXTURE_QUERY =
  `${FIXTURE_QUERY}&utilityparitystatus=quarantined`;
const FIXTURE_ROUTE = "overview";
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (REQUIRE_RELEASE && process.platform !== "win32") {
  throw new Error(
    "the packaged utility parity release check requires a Windows runner",
  );
}
if (REQUIRE_RELEASE && !RELEASE_EXECUTABLE) {
  throw new Error(
    "MEGACITY_RELEASE_EXECUTABLE is required for the packaged utility parity release check",
  );
}
if (PACKAGED_MODE && !existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}. Install Steam shell dependencies or set MEGACITY_RELEASE_EXECUTABLE.`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function validateReleaseBundle() {
  if (!RELEASE_EXECUTABLE) return;

  const packagedAppDirectory = resolve(
    RELEASE_EXECUTABLE,
    "..",
    "resources",
    "app",
  );
  const sourceManifestPath = join(STEAM_DIR, "release-manifest.json");
  const packagedManifestPath = join(
    packagedAppDirectory,
    "release-manifest.json",
  );
  let sourceManifest;
  let packagedManifest;
  try {
    sourceManifest = JSON.parse(readFileSync(sourceManifestPath, "utf8"));
    packagedManifest = JSON.parse(readFileSync(packagedManifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `could not read the source or packaged release manifest: ${errorMessage(error)}`,
    );
  }

  for (const field of [
    "appVersion",
    "entryBundle",
    "bundleSha256",
    "generatedAt",
  ]) {
    if (packagedManifest[field] !== sourceManifest[field]) {
      throw new Error(
        `packaged release manifest drifted for ${field} (source=${sourceManifest[field]}, packaged=${packagedManifest[field]})`,
      );
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
    throw new Error(
      `packaged release is missing its manifest entry bundle ${packagedManifest.entryBundle}`,
    );
  }
  console.log(
    `[e2e] verified packaged release manifest v${packagedManifest.appVersion}`,
  );
}

async function waitForVisibleText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await page
      .evaluate((targetText) => {
        const needle = targetText.toUpperCase();
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        let node;
        while ((node = walker.nextNode())) {
          if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
          const rect = node.parentElement?.getBoundingClientRect();
          if (rect && rect.width > 0 && rect.height > 0) return true;
        }
        return false;
      }, text)
      .catch(() => false);
    if (visible) return;
    await sleep(300);
  }
  const body = await page
    .evaluate(() => document.body?.innerText?.slice(0, 3000) ?? "(empty)")
    .catch(() => "(renderer unavailable)");
  throw new Error(
    `Timed out waiting for visible text "${text}". Visible text:\n${body}`,
  );
}

async function waitForFixtureRoute(page, fixtureQuery, timeout = 30000) {
  const expectedSearch = `?${fixtureQuery}`;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const current = new URL(page.url());
      if (
        current.pathname.endsWith(`/${FIXTURE_ROUTE}`) &&
        current.search === expectedSearch
      ) {
        return;
      }
    } catch {
      // The Electron document can briefly be unavailable while it loads.
    }
    await sleep(250);
  }
  throw new Error(
    `Packaged wrapper did not forward the utility fixture to /${FIXTURE_ROUTE}?${fixtureQuery}; current URL: ${page.url()}`,
  );
}

async function waitForRoute(page, route, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (new URL(page.url()).pathname.endsWith(route)) return;
    } catch {
      // The Electron document can briefly be unavailable during navigation.
    }
    await sleep(250);
  }
  throw new Error(
    `Packaged wrapper did not navigate to ${route}; current URL: ${page.url()}`,
  );
}

async function clickTestId(page, testId) {
  const clicked = await page.evaluate((target) => {
    const element = document.querySelector(`[data-testid="${target}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, testId);
  if (!clicked) {
    throw new Error(`Could not click packaged utility parity control: ${testId}`);
  }
}

async function assertOverviewUtilityTotals(page) {
  await waitForVisibleText(page, "POWER GRID BREAKDOWN");
  await waitForVisibleText(page, "WATER SUPPLY BREAKDOWN");
  await waitForVisibleText(page, "SUMMER");

  const body = await page.evaluate(() => document.body?.innerText ?? "");
  const compact = body.replace(/\s+/g, " ");
  for (const expected of [
    "7918MW gen",
    "+7657 MW / tick · 7918 generated",
    "+3199 / tick · 3374 produced",
  ]) {
    if (!compact.includes(expected)) {
      throw new Error(
        `Packaged Overview utility breakdown drifted: expected "${expected}" in ${compact}`,
      );
    }
  }
}

async function assertNoVisibleText(page, text) {
  const visible = await page.evaluate((targetText) => {
    const needle = targetText.toUpperCase();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
      const rect = node.parentElement?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }, text);
  if (visible) {
    throw new Error(
      `Packaged quarantined utility fixture rendered a contribution row: ${text}`,
    );
  }
}

async function assertEconomyUtilityRows(page, { quarantined = false } = {}) {
  if (quarantined) {
    await waitForVisibleText(page, "Production Rates / Tick");
    for (const omitted of [
      "Licensed Company Power",
      "Licensed Company Water",
      "Licensed Company Output",
    ]) {
      await assertNoVisibleText(page, omitted);
    }
    return;
  }

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
      throw new Error(
        `Packaged Economy utility breakdown drifted: expected "${expected}" in ${compact}`,
      );
    }
  }
}

async function assertNoPlayerSaveStorage(page) {
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  const saveKeys = keys.filter(
    (key) =>
      key.startsWith("@megacity_slot_") ||
      key === "@megacity_save" ||
      key === "@megacity_profiles_index" ||
      key.startsWith("@megacity_profile_") ||
      key === "@megacity_active_profile",
  );
  if (saveKeys.length) {
    throw new Error(
      `packaged utility parity fixture touched player save storage: ${JSON.stringify(saveKeys)}`,
    );
  }
}

async function runPackagedScenario({
  label,
  fixtureQuery,
  quarantined = false,
}) {
  let browser;
  let userDataDirectory;
  const rendererErrors = [];
  try {
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-packaged-utility-parity-"),
    );
    validateReleaseBundle();
    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SANDBOX: "1",
        MEGACITY_E2E_FIXTURE: "utility-parity",
        MEGACITY_E2E_QUERY: fixtureQuery,
        MEGACITY_E2E_ROUTE: FIXTURE_ROUTE,
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
    page.on("pageerror", (error) => {
      rendererErrors.push(`pageerror: ${errorMessage(error)}`);
    });
    page.on("error", (error) => {
      rendererErrors.push(`renderer crashed: ${errorMessage(error)}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
        rendererErrors.push(`console.error: ${message.text()}`);
      }
    });

    console.log(
      `[e2e] launching packaged ${label} utility parity fixture (${RELEASE_EXECUTABLE ? "Windows release executable" : "Steam Electron shell"})`,
    );
    await waitForFixtureRoute(page, fixtureQuery);
    await assertOverviewUtilityTotals(page);
    await assertNoPlayerSaveStorage(page);
    await clickTestId(page, "top-nav-economy");
    await waitForRoute(page, "/economy");
    await assertEconomyUtilityRows(page, { quarantined });
    await assertNoPlayerSaveStorage(page);

    if (rendererErrors.length) {
      throw new Error(
        `Packaged renderer emitted errors:\n${rendererErrors.join("\n")}`,
      );
    }
    console.log(
      `[e2e] PASS: packaged ${label} Overview remains stable and Economy utility contribution rows are correct`,
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        throw new Error(
          `packaged utility parity smoke test left temporary profile behind: ${userDataDirectory}`,
        );
      }
    }
  }
}

async function runPackaged() {
  validateReleaseBundle();
  await runPackagedScenario({
    label: "operational",
    fixtureQuery: FIXTURE_QUERY,
  });
  await runPackagedScenario({
    label: "quarantined",
    fixtureQuery: QUARANTINED_FIXTURE_QUERY,
    quarantined: true,
  });
}

async function run() {
  if (PACKAGED_MODE) {
    await runPackaged();
    return;
  }
  throw new Error(
    "packaged utility parity smoke test requires MEGACITY_RUN_PACKAGED_UTILITY_PARITY=1 or MEGACITY_RELEASE_EXECUTABLE",
  );
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});