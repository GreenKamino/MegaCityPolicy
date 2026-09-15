// Packaged Electron smoke coverage for the high-crime City overview's recovery
// links.
//
// This launches the Steam shell around steam/web-build rather than the Expo
// browser workflow. The crime-recovery fixture is release-safe and only
// unlocks when the Electron preload explicitly opts into it.
//
// Run with:
//   pnpm run test:e2e:packaged-crime-recovery
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
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const VIEWPORTS = [
  { name: "standard desktop", width: 1280, height: 720, deviceScaleFactor: 1 },
  { name: "high-DPI desktop", width: 1280, height: 720, deviceScaleFactor: 2 },
  { name: "Steam Deck", width: 1280, height: 800, deviceScaleFactor: 1 },
];
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (!existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}. Install Steam shell dependencies or set MEGACITY_RELEASE_EXECUTABLE.`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function hasVisibleText(page, text) {
  try {
    return await page.evaluate((targetText) => {
      const needle = targetText.trim().toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    }, text);
  } catch {
    // Electron may replace the app:// document while Expo Router mounts.
    return false;
  }
}

async function waitForVisibleText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasVisibleText(page, text)) return;
    await sleep(300);
  }
  const body = await page
    .evaluate(() => document.body?.innerText?.slice(0, 3000) ?? "(empty)")
    .catch(() => "(renderer unavailable)");
  throw new Error(`Timed out waiting for "${text}". Visible text:\n${body}`);
}

async function waitForRoute(page, expected, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const url = new URL(page.url());
    if (
      url.pathname.endsWith(expected.path) &&
      Object.entries(expected.search ?? {}).every(
        ([key, value]) => url.searchParams.get(key) === value,
      )
    ) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for route ${expected.path}; current URL: ${page.url()}`);
}

async function assertViewportScale(page, viewport) {
  const actual = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  }));
  if (
    actual.width !== viewport.width ||
    actual.height !== viewport.height ||
    actual.devicePixelRatio !== viewport.deviceScaleFactor
  ) {
    throw new Error(
      `Packaged browser did not apply ${viewport.name}: ` +
      `expected ${JSON.stringify({
        width: viewport.width,
        height: viewport.height,
        devicePixelRatio: viewport.deviceScaleFactor,
      })}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function activateRecoveryHint(page, labelFragment, viewport) {
  const action = await page.evaluate((fragment) => {
    const needle = fragment.trim().toUpperCase();
    const controls = [...document.querySelectorAll("button[aria-label], [role='button'][aria-label]")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (element.getAttribute("aria-label") ?? "").toUpperCase().includes(needle)
        );
      });
    const target = controls[0];
    if (!target) return null;
    target.scrollIntoView({ block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const label = target.getAttribute("aria-label") ?? "";
    const role = target.getAttribute("role");
    const clipped =
      !label.toUpperCase().includes("TAP TO GO THERE") ||
      (role !== "button" && target.tagName !== "BUTTON") ||
      target.tabIndex < 0 ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.left < 0 ||
      rect.top < 0 ||
      rect.right > viewport.width ||
      rect.bottom > viewport.height;
    const result = {
      label,
      role,
      tag: target.tagName,
      tabIndex: target.tabIndex,
      rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      viewport,
      clipped,
    };
    if (clipped) return result;
    target.focus();
    result.focused = document.activeElement === target;
    return result;
  }, labelFragment);
  if (!action) {
    throw new Error(`Could not find packaged crime recovery hint: ${labelFragment}`);
  }
  if (action.clipped) {
    throw new Error(
      `Packaged crime recovery hint is clipped or not keyboard reachable at ${viewport.name}: ` +
      `${labelFragment} ${JSON.stringify(action)}`,
    );
  }
  if (!action.focused) {
    throw new Error(
      `Packaged crime recovery hint could not receive focus at ${viewport.name}: ` +
      `${labelFragment} ${JSON.stringify(action)}`,
    );
  }
  if (viewport.name === "Steam Deck") {
      // Enter is the browser-equivalent activation for the focused control;
      // Steam Deck's confirm button follows this same focused Pressable path.
    await page.keyboard.press("Enter");
  } else {
    await page.evaluate((fragment) => {
      const needle = fragment.trim().toUpperCase();
      const target = [...document.querySelectorAll("button[aria-label], [role='button'][aria-label]")]
        .find((element) =>
          (element.getAttribute("aria-label") ?? "").toUpperCase().includes(needle),
        );
      target?.click();
    }, labelFragment);
  }
  return action;
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
      `Packaged crime fixture touched player save storage: ${JSON.stringify(saveKeys)}`,
    );
  }
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
  for (const field of [
    "appVersion",
    "entryBundle",
    "bundleSha256",
    "fixtureMarkers",
    "generatedAt",
  ]) {
    if (
      JSON.stringify(packagedManifest[field]) !==
      JSON.stringify(sourceManifest[field])
    ) {
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
  const entryText = readFileSync(entryPath, "utf8");
  for (const [name, marker] of Object.entries(sourceManifest.fixtureMarkers ?? {})) {
    if (typeof marker !== "string" || !entryText.includes(marker)) {
      throw new Error(
        `packaged release entry ${packagedManifest.entryBundle} is missing ${name} fixture marker ${JSON.stringify(marker)}; ` +
          "refresh with pnpm run steam:refresh-web",
      );
    }
  }
  console.log(`[e2e] verified packaged release manifest v${packagedManifest.appVersion}`);
}

async function launchFixture(userDataDirectory, query, viewport) {
  const browser = await puppeteer.launch({
    executablePath: LAUNCH_EXECUTABLE,
    headless: true,
    cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: "1",
      MEGACITY_E2E_FIXTURE: "crime-recovery",
      MEGACITY_E2E_QUERY: query,
      MEGACITY_E2E_ROUTE: "overview",
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
  await page.setViewport(viewport);
  return { browser, page };
}

async function runScenario({
  name,
  query,
  viewport,
  action,
  expected,
  expectedText,
  verify,
}) {
  const userDataDirectory = await mkdtemp(
    join(tmpdir(), `megacity-packaged-crime-${name}-${viewport.name.replaceAll(" ", "-")}-`),
  );
  let browser;
  let page;
  const rendererErrors = [];
  try {
    ({ browser, page } = await launchFixture(userDataDirectory, query, viewport));
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
      `[e2e] launching packaged high-crime overview fixture (${name}, ${viewport.name}, ` +
      `${viewport.deviceScaleFactor}x device scale)`,
    );
    await waitForVisibleText(page, "CITY STATUS MATRIX");
    await waitForVisibleText(page, "CRIME 80");
    await assertViewportScale(page, viewport);
    await verify?.(page);
    const actionMetrics = await activateRecoveryHint(page, action, viewport);
    await waitForRoute(page, expected);
    await waitForVisibleText(page, expectedText);
    await assertNoPlayerSaveStorage(page);
    if (rendererErrors.length) {
      throw new Error(`Packaged renderer emitted errors:\n${rendererErrors.join("\n")}`);
    }
    console.log(
      `[e2e] PASS: packaged crime hint reaches ${expected.path.slice(1)} ` +
      `(${name}, ${viewport.name}; ${JSON.stringify(actionMetrics.rect)})`,
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    await rm(userDataDirectory, { recursive: true, force: true });
    if (existsSync(userDataDirectory)) {
      throw new Error(`Packaged crime smoke left its temporary profile behind: ${userDataDirectory}`);
    }
  }
}

async function run() {
  validateReleaseBundle();
  const commonQuery = "fixture=crime-recovery&crime=1";

  const scenarios = [
    {
      name: "construction",
      action: "Build enforcement infrastructure",
      expected: {
        path: "/construction",
        search: { category: "security", highlight: "sectorHouseHQ" },
      },
      expectedText: "CONSTRUCTION",
      verify: async (page) => {
        await waitForVisibleText(page, "Enable a public-order policy");
      },
    },
    {
      name: "military",
      action: "Deploy more enforcers",
      expected: { path: "/military" },
      expectedText: "MILITARY",
    },
    {
      name: "law",
      action: "Enable a public-order policy",
      expected: { path: "/law" },
      expectedText: "LAW / JUSTICE / SECURITY",
    },
    {
      name: "mining",
      action: "Repeal the black-market ore mining policy",
      expected: { path: "/mining" },
      expectedText: "MINING",
    },
  ];

  for (const viewport of VIEWPORTS) {
    for (const scenario of scenarios) {
      await runScenario({ ...scenario, query: commonQuery, viewport });
    }
  }

  console.log(
    "[e2e] PASS: packaged high-crime overview actions stay visible and reach all four " +
    "destinations at desktop, high-DPI, and Steam Deck sizes",
  );
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});