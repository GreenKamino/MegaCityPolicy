// Packaged Electron smoke coverage for the storage labels shown on Economy and
// Construction. This uses the Steam shell's real 150% zoom path and keeps the
// fixture read-only: only a disposable Electron profile is created.
//
// Run locally against the Steam Electron shell with:
//   pnpm run test:e2e:packaged-storage-plan
//
// To exercise an unpacked Windows release instead of the local Electron
// runtime, set MEGACITY_RELEASE_EXECUTABLE to its game.exe path.

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
  process.env.MEGACITY_RUN_PACKAGED_STORAGE_PLAN === "1" ||
  Boolean(RELEASE_EXECUTABLE);
const REQUIRE_RELEASE =
  process.env.MEGACITY_REQUIRE_PACKAGED_STORAGE_PLAN === "1";
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const ZOOM_FACTOR = 1.5;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const ECONOMY_QUERY =
  "demo=1&storageplan=1&medicalstorage=1&medicalstoragecase=economy&mode=turnbased&go=economy";
const CONSTRUCTION_QUERY =
  "demo=1&storageplan=1&medicalstorage=1&medicalstoragecase=economy&mode=turnbased&go=construction";

const ECONOMY_LABELS = [
  "STORAGE PLAN",
  "Food",
  "Steel",
  "Goods",
  "Fuel",
  "Medical Supplies",
  "Power",
  "Water, Credits, city Ammo",
];
const ECONOMY_BALANCE_PATTERNS = [
  /Food\s+[\d,.]+\s*\/\s*[\d,.]+/i,
  /Steel\s+[\d,.]+\s*\/\s*[\d,.]+/i,
  /Goods\s+[\d,.]+\s*\/\s*[\d,.]+/i,
  /Fuel\s+[\d,.]+\s*\/\s*[\d,.]+/i,
  /Medical Supplies\s+[\d,.]+\s*\/\s*[\d,.]+/i,
  /Power\s+[\d,.]+\s*\/\s*[\d,.]+/i,
];
const ECONOMY_CAPACITY_EFFECTS = [
  "structural max",
  "Next:",
  "positive gains rejected",
];
const CONSTRUCTION_CASES = [
  {
    category: "ENERGY",
    label: "ENERGY STORAGE VAULT",
    effect: "+200 power buffer",
  },
  {
    category: "INDUSTRIAL",
    label: "FUEL RESERVE TANK",
    effect: "+2,000 Fuel storage",
  },
  {
    category: "EXPANSION",
    label: "AGRICULTURAL DOME",
    effect: "+1,000 Food storage",
  },
];

if (REQUIRE_RELEASE && process.platform !== "win32") {
  throw new Error("the packaged storage-plan check requires a Windows runner");
}
if (REQUIRE_RELEASE && !RELEASE_EXECUTABLE) {
  throw new Error(
    "MEGACITY_RELEASE_EXECUTABLE is required for the packaged storage-plan check",
  );
}
if (PACKAGED_MODE && !existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}.`,
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
  const sourceManifest = JSON.parse(
    readFileSync(join(STEAM_DIR, "release-manifest.json"), "utf8"),
  );
  const packagedManifest = JSON.parse(
    readFileSync(
      join(packagedAppDirectory, "release-manifest.json"),
      "utf8",
    ),
  );
  for (const field of ["appVersion", "entryBundle", "bundleSha256", "generatedAt"]) {
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
  throw new Error(`Timed out waiting for visible text "${text}". Visible text:\n${body}`);
}

async function waitForRoute(page, route, query, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const current = new URL(page.url());
      if (current.pathname.endsWith(`/${route}`) && current.search === `?${query}`) {
        return;
      }
    } catch {
      // Electron can replace the app:// document while the bundle loads.
    }
    await sleep(250);
  }
  throw new Error(
    `Packaged storage fixture did not reach /${route}?${query}; current URL: ${page.url()}`,
  );
}

async function assertNoPlayerSaveStorage(page, stage) {
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
      `${stage} touched player save storage: ${JSON.stringify(playerKeys)}`,
    );
  }
}

async function assertStorageContent(
  page,
  stage,
  labels,
  patterns,
  effects,
  { checkDocumentOverflow = true } = {},
) {
  const result = await page.evaluate(
    ({ labels: needles, patterns: patternSources, effects: effectNeedles }) => {
      const viewportWidth = document.documentElement.clientWidth;
      const findVisibleText = (needle) => {
        const wanted = needle.toUpperCase();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (!(node.textContent ?? "").toUpperCase().includes(wanted)) continue;
          const element = node.parentElement;
          const rect = element?.getBoundingClientRect();
          if (!element || !rect || rect.width <= 0 || rect.height <= 0) continue;
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        }
        return null;
      };
      const matches = needles.map((needle) => ({
        needle,
        match: findVisibleText(needle),
      }));
      const patternMatches = patternSources.map((source) => ({
        source,
        match: new RegExp(source, "i").test(document.body.innerText ?? ""),
      }));
      const effectMatches = effectNeedles.map((needle) => ({
        needle,
        match: findVisibleText(needle),
      }));
      return {
        missing: matches.filter(({ match }) => !match).map(({ needle }) => needle),
        clipped: matches
          .filter(
            ({ match }) =>
              match &&
              (match.left < -1 ||
                match.right > viewportWidth + 1 ||
                match.top < -1 ||
                match.bottom > window.innerHeight + 1),
          )
          .map(({ needle, match }) => ({ needle, ...match })),
        missingPatterns: patternMatches
          .filter(({ match }) => !match)
          .map(({ source }) => source),
        missingEffects: effectMatches
          .filter(({ match }) => !match)
          .map(({ needle }) => needle),
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewportWidth,
      };
    },
    {
      labels,
      patterns: patterns.map((pattern) => pattern.source),
      effects,
    },
  );

  if (result.missing.length) {
    throw new Error(`${stage} is missing visible storage labels: ${result.missing.join(", ")}`);
  }
  if (result.missingPatterns.length) {
    throw new Error(
      `${stage} is missing visible storage balances: ${result.missingPatterns.join(", ")}`,
    );
  }
  if (result.missingEffects.length) {
    throw new Error(
      `${stage} is missing visible capacity effects: ${result.missingEffects.join(", ")}`,
    );
  }
  if (result.clipped.length) {
    throw new Error(`${stage} has clipped storage content: ${JSON.stringify(result.clipped)}`);
  }
  if (
    checkDocumentOverflow &&
    result.documentWidth > result.viewportWidth + 2 ||
    checkDocumentOverflow &&
    result.bodyWidth > result.viewportWidth + 2
  ) {
    throw new Error(`${stage} overflows horizontally: ${JSON.stringify(result)}`);
  }
}

async function setPackagedZoom(page, stage) {
  const bridgeAvailable = await page.evaluate(
    () => typeof window.desktop?.setZoomFactor === "function",
  );
  if (!bridgeAvailable) {
    throw new Error(`${stage} is missing the packaged desktop zoom bridge`);
  }
  await page.evaluate((factor) => window.desktop.setZoomFactor(factor), ZOOM_FACTOR);
  await sleep(500);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((targetText) => {
    const needle = targetText.trim().toUpperCase();
    const candidates = [...document.querySelectorAll("button, [role='button'], div, span")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (element.innerText ?? element.textContent ?? "").trim().toUpperCase() === needle
        );
      })
      .sort(
        (a, b) =>
          (a.innerText ?? a.textContent ?? "").length -
          (b.innerText ?? b.textContent ?? "").length,
      );
    const target = candidates[0];
    if (!target) return false;
    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible Construction category "${text}"`);
}

async function runScenario({ route, query, label, assertContent }) {
  const userDataDirectory = await mkdtemp(
    join(tmpdir(), `megacity-packaged-storage-plan-${route}-`),
  );
  let browser;
  const rendererErrors = [];
  try {
    validateReleaseBundle();
    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SANDBOX: "1",
        MEGACITY_E2E_FIXTURE: "storage-plan",
        MEGACITY_E2E_QUERY: query,
        MEGACITY_E2E_ROUTE: route,
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
      `[e2e] launching packaged ${label} storage fixture (${RELEASE_EXECUTABLE ? "Windows release executable" : "Steam Electron shell"})`,
    );
    await waitForRoute(page, route, query);
    await assertContent(page, label, { checkDocumentOverflow: true });
    await assertNoPlayerSaveStorage(page, `${label} at 100%`);
    await setPackagedZoom(page, label);
    await assertContent(page, `${label} at 150%`, { checkDocumentOverflow: false });
    await assertNoPlayerSaveStorage(page, `${label} at 150%`);

    if (rendererErrors.length) {
      throw new Error(`Packaged renderer emitted errors:\n${rendererErrors.join("\n")}`);
    }
    console.log(`[e2e] PASS: packaged ${label} storage content stays readable at 100% and 150%`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await rm(userDataDirectory, { recursive: true, force: true });
    if (existsSync(userDataDirectory)) {
      throw new Error(`packaged storage smoke left temporary profile behind: ${userDataDirectory}`);
    }
  }
}

async function assertEconomy(page, stage, options) {
  await waitForVisibleText(page, "STORAGE PLAN");
  await assertStorageContent(
    page,
    stage,
    ECONOMY_LABELS,
    ECONOMY_BALANCE_PATTERNS,
    ECONOMY_CAPACITY_EFFECTS,
    options,
  );
}

async function assertConstruction(page, stage, options) {
  await waitForVisibleText(page, "ENERGY STORAGE VAULT");
  for (const [index, entry] of CONSTRUCTION_CASES.entries()) {
    if (index > 0) {
      await clickVisibleText(page, entry.category);
      await waitForVisibleText(page, entry.label);
    }
    await assertStorageContent(
      page,
      `${stage} ${entry.category}`,
      [entry.label],
      [],
      [entry.effect],
      options,
    );
  }
}

async function run() {
  if (!PACKAGED_MODE) {
    throw new Error(
      "packaged storage smoke test requires MEGACITY_RUN_PACKAGED_STORAGE_PLAN=1 or MEGACITY_RELEASE_EXECUTABLE",
    );
  }
  await runScenario({
    route: "economy",
    query: ECONOMY_QUERY,
    label: "Economy",
    assertContent: assertEconomy,
  });
  await runScenario({
    route: "construction",
    query: CONSTRUCTION_QUERY,
    label: "Construction",
    assertContent: assertConstruction,
  });
  console.log(
    "PASS: packaged Steam Economy and Construction storage labels, balances, capacity effects, and read-only save isolation",
  );
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});