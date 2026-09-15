// Packaged Steam smoke coverage for train-module persistence. A release-gated
// fixture starts with one completed, staffed corridor; the test installs all
// three modules through the real diplomacy controls, saves the isolated slot,
// closes Electron, and verifies the decoded save plus post-load diagnostics.
//
// Run locally against the Electron shell with:
//   node e2e/packagedRailModulesReload.e2e.mjs
//
// Run the Windows release check through:
//   steam/run-packaged-rail-modules.ps1
import { createHash } from "node:crypto";
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
const REQUIRE_RELEASE = process.env.MEGACITY_REQUIRE_PACKAGED_RAIL_MODULES === "1";
const FIXTURE_KEY = "@megacity_e2e_rail_modules_reload_1";
const MODULES = [
  "armored_train_plating",
  "troop_transport_carriages",
  "weaponized_escort_cars",
];
const MODULE_NAMES = [
  "Armored train plating",
  "Troop-transport carriages",
  "Weaponized escort cars",
];
const RAIL_STAFFING_WARNING =
  "Understaffed corridor: Irongate — missing maintenance crew (1).";
const EXCLUDED_CORRIDORS = {
  incomplete: "rail:irongate:readiness-incomplete",
  understaffed: "rail:irongate:readiness-understaffed",
};
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (REQUIRE_RELEASE && process.platform !== "win32") {
  throw new Error("the packaged rail-module check requires a Windows x64 release runner");
}
if (REQUIRE_RELEASE && !RELEASE_EXECUTABLE) {
  throw new Error(
    "MEGACITY_RELEASE_EXECUTABLE is required for the packaged rail-module release check",
  );
}
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
    throw new Error(`packaged release is missing ${packagedManifest.entryBundle}`);
  }
  const entryHash = createHash("sha256").update(readFileSync(entryPath)).digest("hex");
  if (entryHash !== packagedManifest.bundleSha256) {
    throw new Error(
      `packaged release entry bundle hash mismatch (expected ${packagedManifest.bundleSha256}, got ${entryHash})`,
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
      // Electron can replace the app:// document during startup.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for route ${suffix}; current URL: ${page.url()}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const candidates = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const value = (element.innerText ?? "").replace(/\s+/g, " ").trim().toUpperCase();
        const label = (element.getAttribute("aria-label") ?? "").trim().toUpperCase();
        return rect.width > 0 && rect.height > 0 && (value === needle || label === needle);
      });
    const pressables = candidates.filter((element) =>
      element.tagName === "BUTTON" ||
      element.getAttribute("role") === "button" ||
      element.getAttribute("tabindex") === "0",
    );
    const element = (pressables.length ? pressables : candidates)
      .sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function installModule(page, name) {
  const clicked = await page.evaluate((expected) => {
    const button = [...document.querySelectorAll("button, [role='button']")]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 &&
          rect.height > 0 &&
          (candidate.innerText ?? "").trim().toUpperCase() === "INSTALL" &&
          (candidate.parentElement?.innerText ?? "").includes(expected);
      });
    if (!button) return false;
    button.scrollIntoView({ block: "center", inline: "center" });
    button.click();
    return true;
  }, name);
  if (!clicked) throw new Error(`Could not find install control for ${name}`);
  await page.waitForFunction(
    (expected) => [...document.querySelectorAll("div, span")].some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? "").includes(expected) &&
        (element.parentElement?.innerText ?? "").includes("INSTALLED");
    }),
    { timeout: 30000 },
    name,
  );
}

async function openMilitaryArmyReadiness(page) {
  await clickVisibleText(page, "MILITARY");
  await waitForRoute(page, "/military");
  await clickVisibleText(page, "ARMY");
  await waitForVisibleText(page, "STANDING ARMY");
  await waitForVisibleText(page, "OPERATIONAL RAIL MODULES");
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-testid="military-rail-readiness-breakdown"]');
    const rect = card?.getBoundingClientRect();
    return Boolean(card && rect && rect.width > 0 && rect.height > 0 && card.textContent?.trim());
  }, { timeout: 120000 });
  return page.evaluate(() =>
    document.querySelector('[data-testid="military-rail-readiness-breakdown"]')?.textContent
      ?.replace(/\s+/g, " ")
      .trim() ?? "",
  );
}

async function readOverviewRailWarnings(page) {
  await clickVisibleText(page, "CITY");
  await waitForRoute(page, "/overview");
  await waitForVisibleText(page, "RAIL NETWORK ALERTS");
  return page.evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "");
}

function assertRailStaffingWarning(bodyText, label) {
  if (!bodyText.includes(RAIL_STAFFING_WARNING)) {
    throw new Error(`${label} overview omitted "${RAIL_STAFFING_WARNING}": ${bodyText}`);
  }
  if (bodyText.includes("Understaffed corridor: rail:irongate:readiness-understaffed")) {
    throw new Error(`${label} overview used the corridor-ID fallback for a live Irongate endpoint`);
  }
  return RAIL_STAFFING_WARNING;
}

function assertRailReadinessCard(card, label) {
  const expected = [
    "OPERATIONAL RAIL MODULES",
    "Armored train plating",
    "+20 rail safety resilience",
    "Troop-transport carriages",
    "+40 troop movement capacity",
    "Weaponized escort cars",
    "+16 armed security",
    "+5 rail safety resilience",
  ];
  for (const value of expected) {
    if (!card.includes(value)) {
      throw new Error(`${label} readiness card omitted "${value}": ${card}`);
    }
  }
  for (const name of MODULE_NAMES) {
    const occurrences = card.split(name).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `${label} readiness card rendered ${occurrences} copies of ${name}; ` +
          "incomplete and understaffed corridors must stay absent",
      );
    }
  }
  return card;
}

function decodePersistedState(raw) {
  if (!raw) throw new Error("the rail-module fixture did not write its isolated save");
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string" ? decompressFromUTF16(envelope.data) : raw;
  if (!json) throw new Error("the rail-module save envelope could not be decompressed");
  return JSON.parse(json);
}

async function readPersistedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_KEY);
  return decodePersistedState(raw);
}

async function snapshotNormalSlotKeys(page) {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .filter((key) =>
        key === "@megacity_save" ||
        key.startsWith("@megacity_slot_") ||
        key === "@megacity_profiles_index" ||
        key.startsWith("@megacity_profile_") ||
        key === "@megacity_active_profile",
      )
      .sort()
      .map((key) => [key, window.localStorage.getItem(key)]),
  ));
}

async function readDemoRow(page, label) {
  return page.evaluate((expected) => {
    const labelNode = [...document.querySelectorAll("div, span")].find(
      (element) => (element.textContent ?? "").trim() === expected,
    );
    return labelNode?.parentElement?.innerText?.replace(/\s+/g, " ").trim() ?? null;
  }, label);
}

function assertRow(rows, label, expectedValue) {
  const row = rows[label];
  if (!row || !new RegExp(`\\b${expectedValue}\\b`).test(row)) {
    throw new Error(`${label} expected ${expectedValue}, got ${row ?? "(missing)"}`);
  }
}

function assertRailModules(state, label) {
  const corridor = state?.railCorridors?.[0];
  if (!corridor) throw new Error(`${label}: no rail corridor persisted`);
  if (corridor.status !== "completed") {
    throw new Error(`${label}: expected completed corridor, got ${corridor.status}`);
  }
  const installed = [...(corridor.installedTrainUpgrades ?? [])].sort();
  if (JSON.stringify(installed) !== JSON.stringify([...MODULES].sort())) {
    throw new Error(
      `${label}: installed train modules drifted: ${JSON.stringify(corridor.installedTrainUpgrades)}`,
    );
  }
  return corridor;
}

function assertExcludedRailCorridors(state, label) {
  const corridors = state?.railCorridors ?? [];
  const incomplete = corridors.find((corridor) => corridor.id === EXCLUDED_CORRIDORS.incomplete);
  const understaffed = corridors.find((corridor) => corridor.id === EXCLUDED_CORRIDORS.understaffed);
  if (incomplete?.status !== "under_construction") {
    throw new Error(`${label}: incomplete readiness corridor was not retained`);
  }
  if (understaffed?.status !== "completed" || understaffed.staffing?.maintenance !== 0) {
    throw new Error(`${label}: understaffed readiness corridor was not retained`);
  }
  for (const corridor of [incomplete, understaffed]) {
    if (!MODULES.every((id) => corridor.installedTrainUpgrades?.includes(id))) {
      throw new Error(`${label}: excluded corridor lost its installed module IDs`);
    }
  }
}

async function launch(phase, userDataDirectory, rendererErrors) {
  const query =
    `demo=1&railmodules=1&railModulesReload=${phase}&go=diplomacy`;
  const browser = await puppeteer.launch({
    executablePath: LAUNCH_EXECUTABLE,
    headless: true,
    cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: "1",
      MEGACITY_E2E_FIXTURE: "rail-modules",
      MEGACITY_E2E_QUERY: query,
      MEGACITY_E2E_ROUTE: "diplomacy",
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
  await waitForRoute(page, "/diplomacy");
  await waitForVisibleText(page, "DIPLOMACY TERMINAL");
  return { browser, page };
}

async function run() {
  validateReleaseBundle();
  const userDataDirectory = await mkdtemp(join(tmpdir(), "megacity-packaged-rail-modules-"));
  let browser;
  let page;
  const rendererErrors = [];
  let normalSlotKeysBefore;
  let savedState;
  let readinessBeforeReload;
  try {
    ({ browser, page } = await launch("save", userDataDirectory, rendererErrors));
    normalSlotKeysBefore = await snapshotNormalSlotKeys(page);
    await clickVisibleText(page, "PACTS");
    await waitForVisibleText(page, "RAIL CORRIDORS");
    page.on("dialog", (dialog) => dialog.accept());
    for (const name of MODULE_NAMES) {
      await installModule(page, name);
    }
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      FIXTURE_KEY,
    );
    savedState = await readPersistedState(page);
    const savedCorridor = assertRailModules(savedState, "saved state");
    assertExcludedRailCorridors(savedState, "saved state");
    console.log(
      `[e2e] persisted module IDs: ${[...savedCorridor.installedTrainUpgrades].sort().join(", ")}`,
    );
    const normalSlotKeysAfterSave = await snapshotNormalSlotKeys(page);
    if (JSON.stringify(normalSlotKeysAfterSave) !== JSON.stringify(normalSlotKeysBefore)) {
      throw new Error("rail-module fixture changed normal player save/profile keys");
    }
    readinessBeforeReload = assertRailReadinessCard(
      await openMilitaryArmyReadiness(page),
      "pre-reload",
    );
    const staffingWarningBeforeReload = assertRailStaffingWarning(
      await readOverviewRailWarnings(page),
      "pre-reload",
    );
    await browser.close();
    browser = null;

    ({ browser, page } = await launch("load", userDataDirectory, rendererErrors));
    const pageAfterReload = page;
    await pageAfterReload.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      FIXTURE_KEY,
    );
    await pageAfterReload.waitForFunction(
      (names) => names.every((name) => [...document.querySelectorAll("div, span")].some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 &&
          rect.height > 0 &&
          (element.innerText ?? "").includes(name) &&
          (element.parentElement?.innerText ?? "").includes("INSTALLED");
      })),
      { timeout: 120000 },
      MODULE_NAMES,
    );
    const reloadedState = await readPersistedState(pageAfterReload);
    const reloadedCorridor = assertRailModules(reloadedState, "reloaded state");
    assertExcludedRailCorridors(reloadedState, "reloaded state");
    if (JSON.stringify([...reloadedCorridor.installedTrainUpgrades].sort()) !==
        JSON.stringify([...savedState.railCorridors[0].installedTrainUpgrades].sort())) {
      throw new Error("reload changed the installed train module IDs");
    }

    const staffingWarningAfterReload = assertRailStaffingWarning(
      await readOverviewRailWarnings(pageAfterReload),
      "post-reload",
    );
    if (staffingWarningAfterReload !== staffingWarningBeforeReload) {
      throw new Error(
        `rail staffing warning changed across reload:\n` +
          `before: ${staffingWarningBeforeReload}\nafter: ${staffingWarningAfterReload}`,
      );
    }

    await clickVisibleText(pageAfterReload, "DEMOGRAPHICS");
    await waitForVisibleText(pageAfterReload, "RAIL NETWORK & CORRIDORS");
    const diagnostics = Object.fromEntries(
      await Promise.all(
        ["Troop Transport Capacity", "Armed Security Benefit", "Safety Resilience"]
          .map(async (label) => [label, await readDemoRow(pageAfterReload, label)]),
      ),
    );
    assertRow(diagnostics, "Troop Transport Capacity", 40);
    assertRow(diagnostics, "Armed Security Benefit", 16);
    assertRow(diagnostics, "Safety Resilience", 25);
    for (const label of ["Troop Transport Capacity", "Armed Security Benefit", "Safety Resilience"]) {
      console.log(`[e2e] post-reload diagnostic: ${diagnostics[label]}`);
    }
    const readinessAfterReload = assertRailReadinessCard(
      await openMilitaryArmyReadiness(pageAfterReload),
      "post-reload",
    );
    if (readinessAfterReload !== readinessBeforeReload) {
      throw new Error(
        `rail readiness card changed across reload:\n` +
          `before: ${readinessBeforeReload}\nafter: ${readinessAfterReload}`,
      );
    }
    console.log(`[e2e] readiness card before reload: ${readinessBeforeReload}`);
    console.log(`[e2e] readiness card after reload: ${readinessAfterReload}`);

    const normalSlotKeysAfterReload = await snapshotNormalSlotKeys(pageAfterReload);
    if (JSON.stringify(normalSlotKeysAfterReload) !== JSON.stringify(normalSlotKeysBefore)) {
      throw new Error("rail-module reload changed normal player save/profile keys");
    }
    console.log(
      `[e2e] normal Steam save/profile keys unchanged across save and reload (${Object.keys(normalSlotKeysBefore).length} keys)`,
    );
    if (rendererErrors.length) {
      throw new Error(`Packaged rail-module renderer emitted errors:\n${rendererErrors.join("\n")}`);
    }
    console.log(
      "[e2e] PASS: packaged completed rail corridor saved armored plating, troop carriages, " +
        "and escort cars; reload retained +25 safety, +16 armed security, and 40 troop transport",
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    await rm(userDataDirectory, { recursive: true, force: true });
    if (existsSync(userDataDirectory)) {
      throw new Error(`rail-module smoke left its temporary profile behind: ${userDataDirectory}`);
    }
    console.log(`[e2e] temporary profile removed: ${userDataDirectory}`);
  }
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});