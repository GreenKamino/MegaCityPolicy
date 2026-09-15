// Packaged Electron smoke coverage for the housing recommendation blockers.
// Each case saves through the isolated AsyncStorage slot, closes Electron,
// reloads the same disposable profile, and checks the restored Overview copy.
//
// Run locally against the Steam Electron shell with:
//   pnpm run test:e2e:packaged-housing-blocker-reload
//
// To exercise an unpacked Windows release instead of the local Electron
// runtime, set MEGACITY_RELEASE_EXECUTABLE to its game.exe path.
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer";
import LZString from "lz-string";

const { decompressFromUTF16 } = LZString;
const STEAM_DIR = resolve(import.meta.dirname, "..", "steam");
const ELECTRON_PATH =
  process.env.ELECTRON_PATH ??
  resolve(STEAM_DIR, "node_modules", "electron", "dist", "electron");
const RELEASE_EXECUTABLE = process.env.MEGACITY_RELEASE_EXECUTABLE
  ? resolve(process.env.MEGACITY_RELEASE_EXECUTABLE)
  : null;
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const FIXTURE_KEY = "@megacity_e2e_housing_blocker_reload_1";
const CASES = [
  { name: "credits", expected: "MORE CREDITS ARE REQUIRED" },
  { name: "queue", expected: "TIMED-ORDER QUEUE IS FULL" },
];
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (!existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}.`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function validateReleaseBundle() {
  if (!RELEASE_EXECUTABLE) return;

  const packagedAppDirectory = resolve(RELEASE_EXECUTABLE, "..", "resources", "app");
  const sourceManifest = JSON.parse(
    readFileSync(join(STEAM_DIR, "release-manifest.json"), "utf8"),
  );
  const packagedManifest = JSON.parse(
    readFileSync(join(packagedAppDirectory, "release-manifest.json"), "utf8"),
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
  console.log(`[e2e] verified packaged release manifest v${packagedManifest.appVersion}`);
}

async function hasVisibleText(page, text) {
  try {
    return await page.evaluate((targetText) => {
      const needle = targetText.toUpperCase();
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

async function waitForRoute(page, suffix, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (new URL(page.url()).pathname.endsWith(suffix)) return;
    } catch {
      // Electron can briefly replace the app:// document during startup.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for route ${suffix}; current URL: ${page.url()}`);
}

function decodePersistedState(raw) {
  if (!raw) throw new Error("the housing fixture did not write its isolated save");
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string" ? decompressFromUTF16(envelope.data) : raw;
  if (!json) throw new Error("the housing save envelope could not be decompressed");
  return JSON.parse(json);
}

async function readPersistedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_KEY);
  return decodePersistedState(raw);
}

async function readHousingDetail(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const heading = [...document.querySelectorAll("div, span, p")].find(
      (element) =>
        visible(element) &&
        (element.innerText ?? "").trim().toUpperCase() === "HOUSING CAPACITY DETAIL",
    );
    if (!heading) return null;
    let panel = heading.parentElement;
    for (let depth = 0; panel && depth < 8; depth += 1, panel = panel.parentElement) {
      const text = (panel.innerText ?? "").replace(/\s+/g, " ").trim();
      if (text.includes("CAPACITY RECOMMENDATION")) return text.toUpperCase();
    }
    return null;
  });
}

async function assertHousingOverview(page, expected, stage) {
  await waitForVisibleText(page, "CITY STATUS MATRIX");
  await waitForVisibleText(page, "HOUSING CAPACITY DETAIL");
  await waitForVisibleText(page, expected);
  const detail = await readHousingDetail(page);
  if (!detail?.includes(expected)) {
    throw new Error(`${stage}: housing detail did not contain "${expected}": ${detail ?? "(missing)"}`);
  }
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
      `${stage}: packaged housing fixture touched player save storage: ${JSON.stringify(playerKeys)}`,
    );
  }
}

async function launch(caseName, phase, userDataDirectory, rendererErrors, loadObserved) {
  const query =
    `demo=1&fixture=housing-blocker&housing=1&housingcase=${caseName}` +
    `&housingreload=${phase}&go=overview`;
  const browser = await puppeteer.launch({
    executablePath: LAUNCH_EXECUTABLE,
    headless: true,
    cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: "1",
      MEGACITY_E2E_FIXTURE: "housing-blocker",
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
  await page.setViewport(VIEWPORT);
  page.on("pageerror", (error) => rendererErrors.push(`pageerror: ${errorMessage(error)}`));
  page.on("error", (error) => rendererErrors.push(`renderer crashed: ${errorMessage(error)}`));
  page.on("console", (message) => {
    if (loadObserved && message.text().includes("[housingBlockerReloadE2E] fixture load complete")) {
      loadObserved.value = true;
    }
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      rendererErrors.push(`console.error: ${message.text()}`);
    }
  });
  await waitForRoute(page, "/overview");
  return { browser, page };
}

async function runCase({ name, expected }) {
  const userDataDirectory = await mkdtemp(
    join(tmpdir(), `megacity-packaged-housing-${name}-`),
  );
  let browser;
  let page;
  const rendererErrors = [];
  const loadObserved = { value: false };
  try {
    ({ browser, page } = await launch(name, "save", userDataDirectory, rendererErrors));
    await assertHousingOverview(page, expected, `${name} save`);
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      FIXTURE_KEY,
    );
    const savedState = await readPersistedState(page);
    if (name === "credits" && savedState.resources?.credits !== 0) {
      throw new Error(`${name} save retained unexpected credits: ${savedState.resources?.credits}`);
    }
    if (name === "queue" && savedState.pendingConstructions?.length !== 100) {
      throw new Error(
        `${name} save retained ${savedState.pendingConstructions?.length ?? 0} pending orders instead of a full queue`,
      );
    }
    await assertNoPlayerSaveStorage(page, `${name} save`);
    await browser.close();
    browser = null;

    ({ browser, page } = await launch(
      name,
      "load",
      userDataDirectory,
      rendererErrors,
      loadObserved,
    ));
    const loadDeadline = Date.now() + 120000;
    while (!loadObserved.value && Date.now() < loadDeadline) await sleep(250);
    if (!loadObserved.value) {
      throw new Error(`${name} reload did not report fixture load completion`);
    }
    await assertHousingOverview(page, expected, `${name} reload`);
    const reloadedState = await readPersistedState(page);
    if (name === "credits" && reloadedState.resources?.credits !== 0) {
      throw new Error(`${name} reload changed the persisted credit shortage`);
    }
    if (name === "queue" && reloadedState.pendingConstructions?.length !== 100) {
      throw new Error(
        `${name} reload changed the full queue: ${reloadedState.pendingConstructions?.length ?? 0}`,
      );
    }
    await assertNoPlayerSaveStorage(page, `${name} reload`);
    if (rendererErrors.length) {
      throw new Error(`Packaged housing renderer emitted errors:\n${rendererErrors.join("\n")}`);
    }
    console.log(`PASS [${name}] packaged housing blocker copy survived save/reload`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await rm(userDataDirectory, { recursive: true, force: true });
    if (existsSync(userDataDirectory)) {
      throw new Error(`packaged housing smoke left its temporary profile behind: ${userDataDirectory}`);
    }
  }
}

async function run() {
  validateReleaseBundle();
  for (const housingCase of CASES) await runCase(housingCase);
  console.log(
    "[e2e] PASS: packaged credit-shortage and full-queue housing blockers survived isolated save/reload",
  );
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});