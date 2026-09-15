// Packaged Electron regression for loading a legacy Iron Khanate slot through
// the real Steam wrapper, profile storage, and save-envelope path.
//
// Run locally with:
//   pnpm run test:e2e:packaged-la-city-legacy-save
//
// To exercise an unpacked Windows release instead of the local Electron shell,
// set MEGACITY_RELEASE_EXECUTABLE to its game.exe path.
//
// To check release-runner availability without launching Puppeteer or creating
// a temporary profile:
//   MEGACITY_RELEASE_PREFLIGHT=1 node e2e/packagedLaCityLegacySave.e2e.mjs

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import LZString from "lz-string";

const STEAM_DIR = resolve(import.meta.dirname, "..", "steam");
const ELECTRON_PATH =
  process.env.ELECTRON_PATH ??
  resolve(STEAM_DIR, "node_modules", "electron", "dist", "electron");
const RELEASE_EXECUTABLE = process.env.MEGACITY_RELEASE_EXECUTABLE
  ? resolve(process.env.MEGACITY_RELEASE_EXECUTABLE)
  : null;
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const REQUIRE_RELEASE =
  process.env.MEGACITY_REQUIRE_PACKAGED_LA_CITY_LEGACY_SAVE === "1";
const RELEASE_PREFLIGHT = process.env.MEGACITY_RELEASE_PREFLIGHT === "1";
const MIGRATION_SUMMARY_PATH = process.env.MEGACITY_MIGRATION_SUMMARY_PATH
  ? resolve(process.env.MEGACITY_MIGRATION_SUMMARY_PATH)
  : null;
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const PROFILE_ID = "legacy-la-city-packaged-regression";
const SLOT_KEY = `@megacity_profile_${PROFILE_ID}_slot_1`;
const LEGACY_CITY_ID = "iron-khanate";
const RETIRED_PROSE = ["KHANATE", "TORGRIM"];
const EXPECTED = {
  name: "LA CITY",
  influence: 81,
  loyalty: 17,
  threat: 93,
  faith: "ancestor-cult",
  tradeInventory: { steel_plates: 987, fuel_cells: 4 },
  war: {
    id: "legacy-border-war",
    belligerents: ["iron-khanate", "nova-pacifica"],
    belligerentNames: ["LA CITY", "NOVA PACIFICA"],
    stage: "skirmishes",
    intensity: 37,
    startTick: 300,
    lastEscalationTick: 318,
    playerInitiated: false,
    casualties: { a: 12, b: 8 },
    infrastructureDamage: { a: 3, b: 1 },
    warWeariness: 4,
    peaceOffered: false,
    timeline: {
      stages: [{ stage: "tensions", tick: 300 }, { stage: "skirmishes", tick: 318 }],
      reports: [{ tick: 318, label: "Southern corridor remains contested" }],
    },
  },
  activeEvent: {
    id: "legacy-southern-logistics",
    title: "SOUTHERN LOGISTICS REVIEW",
    description: "A freight convoy needs a routing decision before the next dispatch.",
    severity: "medium",
    effects: { credits: 250 },
    timestamp: 321,
    resolved: false,
    responseOptions: [{
      id: "hold-course",
      label: "HOLD COURSE",
      description: "Keep the convoy on its current route.",
      effects: {},
    }],
    maxResponses: 1,
  },
};
const migrationSummary = {
  schemaVersion: 1,
  test: "packaged-la-city-legacy-save",
  status: "not-run",
  release: {
    executable: RELEASE_EXECUTABLE,
    manifest: null,
  },
  migration: {
    cityId: LEGACY_CITY_ID,
    expected: {
      name: EXPECTED.name,
      influence: EXPECTED.influence,
      loyalty: EXPECTED.loyalty,
      threat: EXPECTED.threat,
      faith: EXPECTED.faith,
      tradeInventory: EXPECTED.tradeInventory,
    },
    resavedSlot: null,
    reloadedSlot: null,
    resavedEnvelopeVersion: null,
    reloadedEnvelopeVersion: null,
  },
  retiredProse: {
    tokens: RETIRED_PROSE,
    checks: [],
    allPassed: false,
  },
  disposableProfileCleanup: {
    created: false,
    removed: false,
    path: null,
  },
  rendererErrors: [],
  error: null,
  startedAt: new Date().toISOString(),
  completedAt: null,
};

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function readSourceReleaseManifest() {
  try {
    return JSON.parse(
      readFileSync(join(STEAM_DIR, "release-manifest.json"), "utf8"),
    );
  } catch (error) {
    throw new Error(
      `could not read the Steam release manifest: ${errorMessage(error)}`,
    );
  }
}

function releaseRunnerStatus() {
  const manifest = readSourceReleaseManifest();
  const windowsRelease = manifest.windowsRelease;
  if (
    !windowsRelease ||
    !Array.isArray(windowsRelease.runnerLabels) ||
    !windowsRelease.runnerLabels.length ||
    typeof windowsRelease.executable !== "string" ||
    !windowsRelease.executable
  ) {
    return {
      ok: false,
      message:
        "BLOCKED: release manifest is missing the Windows x64 runner handoff. " +
        "Refresh the Steam release manifest before scheduling the LA CITY smoke test.",
    };
  }

  const runner = windowsRelease.runnerLabels.join(", ");
  if (process.platform !== "win32" || process.arch !== "x64") {
    return {
      ok: false,
      message:
        `BLOCKED: LA CITY packaged smoke test requires the dedicated Windows x64 ` +
        `Steam runner (${runner}). Hand off this check to that runner; Puppeteer ` +
        "was not launched.",
    };
  }

  const expectedExecutable = RELEASE_EXECUTABLE
    ? RELEASE_EXECUTABLE
    : resolve(STEAM_DIR, windowsRelease.executable);
  if (!existsSync(expectedExecutable)) {
    return {
      ok: false,
      message:
        `BLOCKED: the dedicated Windows x64 Steam runner is available, but ` +
        `the release executable is missing at ${expectedExecutable}. Build the ` +
        `Windows release on that runner and set MEGACITY_RELEASE_EXECUTABLE ` +
        `before scheduling the LA CITY smoke test.`,
    };
  }

  return {
    ok: true,
    message:
      `READY: dedicated Windows x64 Steam runner and release executable are ` +
      `available at ${expectedExecutable}.`,
  };
}

function runReleasePreflight() {
  const status = releaseRunnerStatus();
  console.log(`[release-preflight] ${status.message}`);
  if (!status.ok) process.exitCode = 1;
}

if (!RELEASE_PREFLIGHT && REQUIRE_RELEASE) {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error(
      "the packaged LA CITY release check requires the dedicated Windows x64 Steam runner",
    );
  }
  if (!RELEASE_EXECUTABLE) {
    throw new Error(
      "MEGACITY_RELEASE_EXECUTABLE is required for the packaged LA CITY release check",
    );
  }
}

if (!RELEASE_PREFLIGHT && !existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}. Install Steam shell dependencies or set MEGACITY_RELEASE_EXECUTABLE.`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function writeMigrationSummary() {
  if (!MIGRATION_SUMMARY_PATH) return;
  await mkdir(dirname(MIGRATION_SUMMARY_PATH), { recursive: true });
  await writeFile(
    MIGRATION_SUMMARY_PATH,
    `${JSON.stringify(migrationSummary, null, 2)}\n`,
    "utf8",
  );
}

function recordReleaseManifest(manifest) {
  migrationSummary.release.manifest = {
    appVersion: manifest.appVersion,
    entryBundle: manifest.entryBundle,
    bundleSha256: manifest.bundleSha256,
    generatedAt: manifest.generatedAt,
  };
}

function validateReleaseBundle() {
  const sourceManifest = readSourceReleaseManifest();
  recordReleaseManifest(sourceManifest);
  if (!RELEASE_EXECUTABLE) return sourceManifest;

  const packagedAppDirectory = resolve(RELEASE_EXECUTABLE, "..", "resources", "app");
  const packagedManifest = JSON.parse(
    readFileSync(join(packagedAppDirectory, "release-manifest.json"), "utf8"),
  );
  for (const field of [
    "appVersion",
    "entryBundle",
    "bundleSha256",
    "windowsRelease",
    "generatedAt",
  ]) {
    if (JSON.stringify(packagedManifest[field]) !== JSON.stringify(sourceManifest[field])) {
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
  console.log(`[e2e] verified packaged release manifest v${packagedManifest.appVersion}`);
  return packagedManifest;
}

function buildLegacyFixture() {
  const fixtureScript = String.raw`
    import { createInitialState } from "./engine/initialState";
    import { getDefaultAdvancedState } from "./engine/diplomacyAdvanced";
    import { createDefaultProfile } from "./engine/profiles";
    import { computeChecksum } from "./engine/saveLoad";

    const state = createInitialState();
    const city = state.externalMegacities.find((entry) => entry.id === "iron-khanate");
    if (!city) throw new Error("initial state is missing the durable LA CITY id");

    Object.assign(city, {
      name: "The Iron Khanate",
      description: "The Iron Khanate controls the southern freight corridor.",
      influence: 81,
      loyalty: 17,
      threat: 93,
      isActive: true,
      tradeInventory: { steel_plates: 987, fuel_cells: 4 },
      lastRefreshTick: 321,
      dominantFaithId: "ancestor-cult",
      leader: {
        name: "Khan Torgrim",
        title: "Khan",
        attitude: "hostile",
        goals: [],
        personalityTraits: [],
        portraitId: "khan_torgrim",
      },
    });

    state.diplomacyAdvanced = {
      ...getDefaultAdvancedState(),
      wars: [{
        id: "legacy-border-war",
        belligerents: ["iron-khanate", "nova-pacifica"],
        belligerentNames: ["LA CITY", "NOVA PACIFICA"],
        stage: "skirmishes",
        intensity: 37,
        startTick: 300,
        lastEscalationTick: 318,
        playerInitiated: false,
        casualties: { a: 12, b: 8 },
        infrastructureDamage: { a: 3, b: 1 },
        warWeariness: 4,
        peaceOffered: false,
        timeline: {
          stages: [{ stage: "tensions", tick: 300 }, { stage: "skirmishes", tick: 318 }],
          reports: [{ tick: 318, label: "Southern corridor remains contested" }],
        },
      }],
      totalWars: 1,
    };

    state.activeEvents = [{
      id: "legacy-southern-logistics",
      title: "SOUTHERN LOGISTICS REVIEW",
      description: "A freight convoy needs a routing decision before the next dispatch.",
      severity: "medium",
      effects: { credits: 250 },
      timestamp: 321,
      resolved: false,
      responseOptions: [{
        id: "hold-course",
        label: "HOLD COURSE",
        description: "Keep the convoy on its current route.",
        effects: {},
      }],
      maxResponses: 1,
    }];
    state.totalTicks = 321;
    state.tickPaused = true;
    state.lastTickTime = Date.now();
    delete state.hasCompletedOnboarding;

    const profile = {
      ...createDefaultProfile("Legacy LA City Packaged Commander", 40, "other"),
      id: "legacy-la-city-packaged-regression",
    };
    const legacyEnvelope = JSON.stringify({
      v: 1,
      checksum: computeChecksum(JSON.stringify(state)),
      data: JSON.stringify(state),
    });
    console.log(JSON.stringify({
      profile,
      profilesIndex: ["legacy-la-city-packaged-regression"],
      legacyEnvelope,
    }));
  `;

  const output = execFileSync(
    "pnpm",
    ["exec", "tsx", "-e", fixtureScript],
    { cwd: resolve(fileURLToPath(new URL("..", import.meta.url))), encoding: "utf8" },
  ).trim();
  return JSON.parse(output.split("\n").at(-1));
}

async function hasVisibleText(page, text) {
  try {
    return await page.evaluate((target) => {
      const needle = target.trim().toUpperCase();
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

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.trim().toUpperCase();
    const nodes = [
      ...document.querySelectorAll("button, [role='button'], div, span, a"),
    ].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? element.textContent ?? "").trim().toUpperCase() === needle
      );
    });
    const element = nodes.sort(
      (a, b) =>
        (a.innerText ?? a.textContent ?? "").length -
        (b.innerText ?? b.textContent ?? "").length,
    )[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not find visible text to click: ${text}`);
}

async function clickAccessibleNode(page, label) {
  const clicked = await page.evaluate((target) => {
    const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not click visible accessibility label: ${label}`);
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function recordRetiredProseChecks(serialized, phase) {
  const checks = RETIRED_PROSE.map((token) => ({
    phase,
    token,
    found: serialized.includes(token),
    passed: !serialized.includes(token),
  }));
  migrationSummary.retiredProse.checks.push(...checks);
  migrationSummary.retiredProse.allPassed = migrationSummary.retiredProse.checks.every(
    (check) => check.passed,
  );
  return checks;
}

function migrationValues(state) {
  const city = state.externalMegacities?.find((entry) => entry.id === LEGACY_CITY_ID);
  if (!city) return null;
  return {
    id: city.id,
    name: city.name,
    influence: city.influence,
    loyalty: city.loyalty,
    threat: city.threat,
    faith: city.dominantFaithId,
    tradeInventory: city.tradeInventory,
  };
}

function assertMigratedState(state, label) {
  const city = state.externalMegacities?.find((entry) => entry.id === LEGACY_CITY_ID);
  if (!city) throw new Error(`${label}: durable LA CITY entity is missing`);
  assertEqual(city.name, EXPECTED.name, `${label} city name`);
  assertEqual(city.influence, EXPECTED.influence, `${label} influence`);
  assertEqual(city.loyalty, EXPECTED.loyalty, `${label} loyalty`);
  assertEqual(city.threat, EXPECTED.threat, `${label} threat`);
  assertEqual(city.dominantFaithId, EXPECTED.faith, `${label} faith`);
  assertEqual(city.tradeInventory, EXPECTED.tradeInventory, `${label} trade inventory`);
  assertEqual(state.diplomacyAdvanced.wars, [EXPECTED.war], `${label} wars`);
  assertEqual(state.activeEvents, [EXPECTED.activeEvent], `${label} active events`);

  const serialized = JSON.stringify(state)
    .toUpperCase()
    .replaceAll(LEGACY_CITY_ID.toUpperCase(), "");
  const retiredChecks = recordRetiredProseChecks(serialized, label);
  for (const check of retiredChecks) {
    if (!check.passed) {
      throw new Error(
        `${label}: retired presentation prose survived migration (${check.token})`,
      );
    }
  }
  return migrationValues(state);
}

function decodeEnvelope(raw) {
  const envelope = JSON.parse(raw);
  if (envelope.v === 1) return JSON.parse(envelope.data);
  if (envelope.v === 2) {
    const json = LZString.decompressFromUTF16(envelope.data);
    if (!json) throw new Error("could not decompress the resaved v2 slot");
    return JSON.parse(json);
  }
  throw new Error(`unexpected save envelope version: ${String(envelope.version ?? envelope.v)}`);
}

function attachRendererListeners(page, rendererErrors) {
  page.on("pageerror", (error) => {
    rendererErrors.push(`pageerror: ${errorMessage(error)}`);
  });
  page.on("error", (error) => {
    rendererErrors.push(`renderer crashed: ${errorMessage(error)}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404|AbortError/.test(message.text())) {
      rendererErrors.push(`console.error: ${message.text()}`);
    }
  });
}

async function launchPackaged({
  phase,
  userDataDirectory,
  storageFixturePath,
  rendererErrors,
}) {
  const env = {
    ...process.env,
    ELECTRON_DISABLE_SANDBOX: "1",
  };
  if (storageFixturePath) {
    env.MEGACITY_E2E_LOCAL_STORAGE_FIXTURE = storageFixturePath;
  } else {
    delete env.MEGACITY_E2E_LOCAL_STORAGE_FIXTURE;
  }
  const browser = await puppeteer.launch({
    executablePath: LAUNCH_EXECUTABLE,
    headless: true,
    cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
    env,
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
  attachRendererListeners(page, rendererErrors);
  console.log(
    `[e2e] launching packaged LA CITY legacy fixture ${phase} ` +
      `(${RELEASE_EXECUTABLE ? "Windows release executable" : "Steam Electron shell"})`,
  );
  return { browser, page };
}

async function assertLaCitySurfaces(page, phase) {
  await waitForVisibleText(page, "CONTINUE");
  await clickVisibleText(page, "CONTINUE");
  await waitForVisibleText(page, "MAP");
  await waitForVisibleText(page, "SOUTHERN LOGISTICS REVIEW");

  await clickVisibleText(page, "MAP");
  await clickAccessibleNode(page, "LA CITY, megacity");
  await clickAccessibleNode(page, "LA CITY, megacity");
  await waitForVisibleText(page, "AA25");
  await waitForVisibleText(page, "LA CITY");

  await clickVisibleText(page, "DIPLO");
  await waitForVisibleText(page, "MEGACITIES");
  await clickVisibleText(page, "MEGACITIES");
  await waitForVisibleText(page, "LA CITY");
  await waitForVisibleText(page, "81");
  await waitForVisibleText(page, "17");
  await waitForVisibleText(page, "HOSTILE");
  await clickVisibleText(page, "LA CITY");
  await waitForVisibleText(page, "RELATIONSHIP MATRIX");

  const pageText = await page.evaluate(() => document.body.innerText.toUpperCase());
  const retiredChecks = recordRetiredProseChecks(pageText, phase);
  for (const check of retiredChecks) {
    if (!check.passed) {
      throw new Error(
        `${phase}: retired player-facing prose is visible after packaged load (${check.token})`,
      );
    }
  }
  return retiredChecks;
}

async function run() {
  let userDataDirectory;
  let browser;
  const rendererErrors = [];

  try {
    validateReleaseBundle();
    const fixture = buildLegacyFixture();
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-packaged-la-city-"),
    );
    migrationSummary.disposableProfileCleanup.created = true;
    migrationSummary.disposableProfileCleanup.path = userDataDirectory;
    const storageFixturePath = join(userDataDirectory, "legacy-local-storage.json");
    await writeFile(
      storageFixturePath,
      JSON.stringify({
        clear: true,
        entries: {
          "@megacity_profiles_index": JSON.stringify(fixture.profilesIndex),
          "@megacity_active_profile": fixture.profile.id,
          [`@megacity_profile_${fixture.profile.id}`]: JSON.stringify(fixture.profile),
          [`@megacity_profile_${fixture.profile.id}_slot_1`]: fixture.legacyEnvelope,
        },
      }),
      "utf8",
    );
    let page;
    ({ browser, page } = await launchPackaged({
      phase: "for the legacy migration",
      userDataDirectory,
      storageFixturePath,
      rendererErrors,
    }));
    await assertLaCitySurfaces(page, "initial packaged load");

    await page.keyboard.down("Control");
    await page.keyboard.press("s");
    await page.keyboard.up("Control");
    await sleep(1000);

    const resaved = await page.evaluate((key) => localStorage.getItem(key), SLOT_KEY);
    if (!resaved) throw new Error("packaged quick-save did not write the profile slot");
    const migratedState = decodeEnvelope(resaved);
    migrationSummary.migration.resavedSlot = assertMigratedState(
      migratedState,
      "packaged resaved slot",
    );

    const resavedEnvelope = JSON.parse(resaved);
    migrationSummary.migration.resavedEnvelopeVersion = resavedEnvelope.v;
    if (resavedEnvelope.v !== 2) {
      throw new Error(
        `packaged quick-save did not persist the migrated v2 envelope (v=${String(resavedEnvelope.v)})`,
      );
    }

    await browser.close();
    browser = null;

    ({ browser, page } = await launchPackaged({
      phase: "after process restart",
      userDataDirectory,
      rendererErrors,
    }));
    await assertLaCitySurfaces(page, "packaged process restart");

    const reloadedRaw = await page.evaluate((key) => localStorage.getItem(key), SLOT_KEY);
    if (!reloadedRaw) {
      throw new Error("packaged process restart lost the migrated profile slot");
    }
    const reloadedEnvelope = JSON.parse(reloadedRaw);
    if (reloadedEnvelope.v !== 2) {
      throw new Error(
        `packaged process restart loaded a non-v2 envelope (v=${String(reloadedEnvelope.v)})`,
      );
    }
    const reloadedState = decodeEnvelope(reloadedRaw);
    migrationSummary.migration.reloadedEnvelopeVersion = reloadedEnvelope.v;
    migrationSummary.migration.reloadedSlot = assertMigratedState(
      reloadedState,
      "packaged reloaded slot",
    );

    if (rendererErrors.length) {
      throw new Error(`Packaged renderer emitted errors:\n${rendererErrors.join("\n")}`);
    }
    migrationSummary.status = "passed";
    console.log(
      "PASS: packaged Steam legacy slot loads as LA CITY across migration, process restart, " +
        "map, diplomacy, and v2 resave",
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (userDataDirectory) {
      let cleanupError;
      try {
        await rm(userDataDirectory, { recursive: true, force: true });
      } catch (error) {
        cleanupError = error;
      }
      const remains = existsSync(userDataDirectory);
      migrationSummary.disposableProfileCleanup.removed = !remains;
      if (remains && !cleanupError) {
        cleanupError = new Error(
          `packaged LA CITY smoke test left temporary profile behind: ${userDataDirectory}`,
        );
      }
      if (cleanupError && migrationSummary.status === "passed") {
        migrationSummary.status = "failed";
        migrationSummary.error = errorMessage(cleanupError);
      }
    }
    migrationSummary.rendererErrors = rendererErrors;
    migrationSummary.completedAt = new Date().toISOString();
    await writeMigrationSummary();
    if (userDataDirectory && !migrationSummary.disposableProfileCleanup.removed) {
      throw new Error(
        `packaged LA CITY smoke test left temporary profile behind: ${userDataDirectory}`,
      );
    }
  }
}

if (RELEASE_PREFLIGHT) {
  try {
    runReleasePreflight();
  } catch (error) {
    console.error(`[release-preflight] BLOCKED: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
} else {
  run().catch(async (error) => {
    migrationSummary.status = "failed";
    migrationSummary.error = errorMessage(error);
    await writeMigrationSummary();
    console.error(`[e2e] FAIL: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}