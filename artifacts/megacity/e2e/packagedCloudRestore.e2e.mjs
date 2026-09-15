// Packaged Electron smoke coverage for the Steam Cloud restore bridge.
//
// This is intentionally opt-in because it launches a real Electron process.
// Run with:
//
//   pnpm run test:e2e:packaged-cloud-restore
//
// The test seeds a disposable profile bundle and slot envelope, including an
// active deployed squad operation, then restores them through the normal menu
// using the actual steam/preload.js bridge and main-process IPC handlers. It
// never uses a player's normal Electron profile or Steam Cloud files.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer";
import lzString from "lz-string";

const STEAM_DIR = resolve(import.meta.dirname, "..", "steam");
const ELECTRON_PATH =
  process.env.ELECTRON_PATH ??
  resolve(STEAM_DIR, "node_modules", "electron", "dist", "electron");
const RELEASE_EXECUTABLE = process.env.MEGACITY_RELEASE_EXECUTABLE
  ? resolve(process.env.MEGACITY_RELEASE_EXECUTABLE)
  : null;
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const RUN_FLAG = "MEGACITY_RUN_PACKAGED_CLOUD_RESTORE";
const REQUIRE_STEAMWORKS = process.env.MEGACITY_E2E_REQUIRE_STEAMWORKS === "1";
// Keep the normal opt-in command runnable on Linux. The release runner opts
// into the real SDK explicitly through MEGACITY_E2E_REQUIRE_STEAMWORKS.
const USE_CLOUD_FIXTURE =
  !REQUIRE_STEAMWORKS || process.env.MEGACITY_E2E_CLOUD_FIXTURE === "1";
const PROFILE_ID = "e2e_packaged_restore";
const PROFILE_FILENAME = "megacity_profiles.json";
const profileSlotKey = (slot) => `@megacity_profile_${PROFILE_ID}_slot_${slot}`;
const cloudFilenameForSlot = (slot) =>
  `megacity_save_${profileSlotKey(slot).replace(/[^a-zA-Z0-9_]/g, "_")}.json`;
const SLOT_FILENAME = cloudFilenameForSlot(1);
const NORMAL_SAVE_KEY_PREFIX = "@megacity_slot_";
const NORMAL_PROFILE_KEY_PREFIX = "@megacity_profile_";
const EXPECTED_MISSION_ID =
  "mission-success-trade_negotiation-42-Ada Vance";
const EXPECTED_MILITARY_BALANCES = {
  resourcesAmmo: 111,
  resourcesFuel: 222,
  resourcesFood: 333,
  stockpileAmmo: 1_111,
  stockpileFuel: 2_222,
  stockpileVehicleParts: 3_333,
};
const EXPECTED_TRAIN_MODULES = [
  "armored_train_plating",
  "troop_transport_carriages",
  "weaponized_escort_cars",
];
const MEDICAL_REPORT = {
  label: "Medical Supplies",
  delta: 100,
  unit: "medical supplies",
  reason:
    "+100 medical supplies stored; +300 rejected because the reserve is full. Open Economy to check the medical storage readout.",
  severity: "warning",
};
const MEDICAL_REPORT_FRAGMENTS = [
  "MEDICAL SUPPLIES STORED",
  "REJECTED BECAUSE THE RESERVE IS FULL",
  "OPEN ECONOMY TO CHECK THE MEDICAL STORAGE READOUT",
];
const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (process.env[RUN_FLAG] !== "1") {
  console.log(
    `[e2e] SKIP: packaged cloud restore is opt-in; set ${RUN_FLAG}=1 to run it`,
  );
  process.exit(0);
}

if (!existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `Electron runtime not found at ${LAUNCH_EXECUTABLE}. Install Steam shell dependencies first.`,
  );
}

function computeChecksum(json) {
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) - hash + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function decodeEnvelopeJson(envelope) {
  if (envelope?.v === 1) return envelope.data ?? null;
  return lzString.decompressFromUTF16(envelope?.data ?? "");
}

function makeFixturePayloads() {
  // Generate the save from the real engine defaults rather than hand-writing
  // a partial GameState. The packaged app then exercises its normal
  // migrate/sanitize path, and the overview has every field it expects.
  const generated = execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "-e",
      [
        'import { createInitialState } from "./engine/initialState";',
        'import { createDemoSeededStateIfRequested } from "./engine/demoSeeder";',
        'import { biosphereCrisisRiskRisingNews } from "./engine/newsFeed";',
        'import { generateMissionMessage, missionMessageId } from "./engine/officerMissions";',
        'import { createDefaultProfile } from "./engine/profiles";',
        'import { launchSquadOperation } from "./engine/retinue";',
         'globalThis.window = { location: { search: "?demo=1&retinueoperation=1&mode=turnbased&railcompletion=upgrades" } };',
        "const state = createDemoSeededStateIfRequested();",
         'if (JSON.stringify(state.railCorridors?.[0]?.installedTrainUpgrades ?? []) !== JSON.stringify(["armored_train_plating", "troop_transport_carriages", "weaponized_escort_cars"])) throw new Error("Cloud restore fixture did not seed all train modules");',
        'const warning = biosphereCrisisRiskRisingNews({ ...state, totalTicks: 42 }, "easing");',
        'const missionResult = { missionId: "trade_negotiation", officerName: "Ada Vance", success: true, message: "Ada Vance completed Trade Negotiation successfully!", rewards: ["+60,000 credits"] };',
        'const missionDate = { year: 2030, month: 2, day: 3, hour: 4 };',
        'const missionMessage = generateMissionMessage(missionResult, missionDate, 42);',
        'if (missionMessage.id !== missionMessageId("trade_negotiation", true, 42, "Ada Vance")) throw new Error("Mission fixture did not use the canonical completion ID");',
        'const fixtureState = { ...state, cityName: "PACKAGED CLOUD RESTORE", totalTicks: 42, lastTickTime: Date.now(), tickPaused: true, gameplayMode: "turnbased", calmStartTicks: Number.MAX_SAFE_INTEGER, hasCompletedOnboarding: true, messages: [], dismissedMessageIds: [missionMessage.id], newsFeed: [warning], militaryOverhaul: undefined, resources: { ...state.resources, ammo: 111, fuel: 222, food: 333 }, stockpiles: { ...state.stockpiles, ammo: 1111, fuel: 2222, vehicleParts: 3333 } };',
        'fixtureState.tickLog = [{ label: "Medical Supplies", delta: 100, unit: "medical supplies", reason: "+100 medical supplies stored; +300 rejected because the reserve is full. Open Economy to check the medical storage readout.", severity: "warning" }];',
        'const launch = launchSquadOperation(fixtureState, "demo-operation-squad", "supply_recovery", () => 0);',
        'if (!launch.success || !fixtureState.retinue?.activeOperation) throw new Error(launch.error ?? "Could not seed the packaged squad operation");',
        'const profile = { ...createDefaultProfile("Cloud Restore Commander", 35, "male"), id: "e2e_packaged_restore", createdAt: 1700000000000, lastPlayed: 1700000000000 };',
        "process.stdout.write(JSON.stringify({ fixtureState, profile, missionMailId: missionMessage.id, missionMailTitle: missionMessage.title }));",
      ].join(" "),
    ],
    {
      cwd: resolve(STEAM_DIR, ".."),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  const {
    fixtureState,
    profile,
    missionMailId,
    missionMailTitle,
  } = JSON.parse(generated);
  const json = JSON.stringify(fixtureState);
  const envelope = JSON.stringify({
    // Legacy saves used a v1 envelope with plain JSON. Keep military
    // reserves in the old top-level shape so cloud restore exercises the
    // same migration boundary as a returning local save.
    v: 1,
    checksum: computeChecksum(json),
    data: json,
  });
  return {
    profileBundle: JSON.stringify({
      version: 1,
      profiles: [profile],
      activeProfileId: PROFILE_ID,
      exportedAt: 1700000000000,
    }),
    envelope,
    warningId: fixtureState.newsFeed[0].id,
    operationId: fixtureState.retinue.activeOperation.id,
    medicalReport: fixtureState.tickLog[0],
    missionMailId: missionMessageId,
    missionMailTitle: missionMailTitle,
  };
}

async function waitForBridge(page, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(() => Boolean(window.steamworks?.cloud))) return;
    } catch {
      // The app can replace the initial document while the app:// protocol
      // and Expo bundle finish loading.
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for the real Steam preload bridge");
}

async function waitForPath(page, suffix, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith(suffix)) return;
    await sleep(250);
  }
  throw new Error(
    `Timed out waiting for path ${suffix}; current URL: ${page.url()}`,
  );
}

async function waitForVisibleText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await page.evaluate((needle) => {
      const target = needle.toUpperCase();
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      let node;
      while ((node = walker.nextNode())) {
        if (!(node.textContent ?? "").toUpperCase().includes(target)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    }, text);
    if (visible) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((label) => {
    const target = label.toUpperCase();
    const candidates = [
      ...document.querySelectorAll('[role="button"], button'),
    ].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.textContent ?? "").trim().toUpperCase().includes(target)
      );
    });
    const button = candidates[0];
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not find the visible ${text} button`);
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
  if (!clicked) throw new Error(`Could not find the visible ${testId} control`);
}

async function clickAriaLabel(page, label) {
  const clicked = await page.evaluate((target) => {
    const wanted = target.trim().toUpperCase();
    const element = [...document.querySelectorAll("[aria-label]")].find(
      (candidate) =>
        candidate.getAttribute("aria-label")?.trim().toUpperCase() === wanted &&
        candidate.getBoundingClientRect().width > 0 &&
        candidate.getBoundingClientRect().height > 0,
    );
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not find the visible ${label} control`);
}

async function readTicker(page, warningFragment) {
  return page.evaluate((warning) => {
    const ticker = document.querySelector('[data-testid="news-ticker"]');
    if (!ticker) return { found: false };
    const rect = ticker.getBoundingClientRect();
    const accessible = ticker.getAttribute("aria-label") ?? "";
    const normalized = accessible.toUpperCase();
    return {
      found: true,
      visible: rect.width > 0 && rect.height > 0,
      accessible,
      matches: normalized.split(warning).length - 1,
    };
  }, warningFragment);
}

async function assertMilitaryBalances(page, stage) {
  const balances = await page.evaluate(() => {
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
  const expected = {
    resourcesAmmo: "111",
    resourcesFuel: "222 / 5,000",
    resourcesFood: "333 / 1,000",
    stockpileAmmo: "1,111",
    stockpileFuel: "2,222",
    stockpileVehicleParts: "3,333",
    rations: "333 FOOD",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (!balances[key].includes(value)) {
      throw new Error(
        `${stage} military balance ${key} drifted: expected "${value}" in "${balances[key]}"`,
      );
    }
  }
  if (!balances.rations.toUpperCase().includes("FOOD POOL")) {
    throw new Error(`${stage} RATIONS no longer identifies the shared FOOD POOL`);
  }
}

async function readDemoRow(page, label) {
  return page.evaluate((expected) => {
    const labelNode = [...document.querySelectorAll("div, span")].find(
      (element) => (element.textContent ?? "").trim() === expected,
    );
    return labelNode?.parentElement?.innerText?.replace(/\s+/g, " ").trim() ?? null;
  }, label);
}

function assertDemoRow(rows, label, expectedValue, stage) {
  const row = rows[label];
  if (!row || !new RegExp(`\\b${expectedValue}\\b`).test(row)) {
    throw new Error(
      `${stage} ${label} expected ${expectedValue}, got ${row ?? "(missing)"}`,
    );
  }
}

function assertTrainModules(state, stage) {
  const corridor = state?.railCorridors?.[0];
  if (!corridor || corridor.status !== "completed") {
    throw new Error(
      `${stage} did not retain a completed rail corridor`,
    );
  }
  const installed = [...(corridor.installedTrainUpgrades ?? [])].sort();
  if (JSON.stringify(installed) !== JSON.stringify([...EXPECTED_TRAIN_MODULES].sort())) {
    throw new Error(
      `${stage} train modules drifted: ${JSON.stringify(corridor.installedTrainUpgrades)}`,
    );
  }
}

async function run() {
  let fixtureDirectory;
  let userDataDirectory;
  let browser;
  let page;
  let missionReplayMarkerResolve;
  const missionReplayMarker = new Promise((resolve) => {
    missionReplayMarkerResolve = resolve;
  });
  const cloudFiles = [PROFILE_FILENAME, SLOT_FILENAME];
  try {
    fixtureDirectory = await mkdtemp(join(tmpdir(), "megacity-cloud-fixture-"));
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-electron-profile-"),
    );
    const {
      profileBundle: profileBundleRaw,
      envelope,
      warningId,
      operationId,
      medicalReport,
      missionMailId,
      missionMailTitle,
    } = makeFixturePayloads();
    await writeFile(
      join(fixtureDirectory, PROFILE_FILENAME),
      profileBundleRaw,
      "utf8",
    );
    await writeFile(join(fixtureDirectory, SLOT_FILENAME), envelope, "utf8");

    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: {
        ...process.env,
        MEGACITY_E2E_FIXTURE: "mission-mail",
        MEGACITY_E2E_QUERY: "missionmail=1&missionMailReload=cloud-load",
        ...(USE_CLOUD_FIXTURE
          ? {
              MEGACITY_E2E_CLOUD_FIXTURE: "1",
              MEGACITY_E2E_CLOUD_FIXTURE_DIR: fixtureDirectory,
            }
          : {
              MEGACITY_E2E_CLOUD_SEED_DIR: fixtureDirectory,
            }),
        ELECTRON_DISABLE_SANDBOX: "1",
      },
      args: [
        ...(RELEASE_EXECUTABLE ? [] : [STEAM_DIR]),
        "--no-sandbox",
        "--disable-dev-shm-usage",
        `--user-data-dir=${userDataDirectory}`,
      ],
      dumpio: false,
    });
    const pages = await browser.pages();
    page = pages[0] ?? (await browser.newPage());
    page.on("pageerror", (error) => {
      console.error(`[e2e] page error: ${error.message}`);
    });
    page.on("console", (message) => {
      if (
        message.text().includes(
          "[missionMailE2E] cloud restore replay preserved dismissed mission mail",
        )
      ) {
        missionReplayMarkerResolve();
      }
    });

    await waitForBridge(page);
    const result = await page.evaluate(async (filenames) => {
      const bridge = window.steamworks;
      const result = {
        initialized: await bridge.isInitialized(),
        cloudEnabled: await bridge.cloud.isCloudEnabled(),
        fileCount: await bridge.cloud.getFileCount(),
        files: {},
      };
      for (const filename of filenames) {
        result.files[filename] = {
          exists: await bridge.cloud.fileExists(filename),
          raw: await bridge.cloud.readFile(filename),
        };
      }
      return result;
    }, cloudFiles);
    console.log(
      `[e2e] Steam status: initialized=${result.initialized} cloudEnabled=${result.cloudEnabled}`,
    );
    console.log(
      `[e2e] disposable cloud file count: before=${result.fileCount}`,
    );
    console.log(
      `[e2e] disposable cloud files: ${JSON.stringify(
        Object.fromEntries(
          Object.entries(result.files).map(([filename, value]) => [
            filename,
            {
              exists: value.exists,
              bytes: Buffer.byteLength(value.raw ?? "", "utf8"),
            },
          ]),
        ),
      )}`,
    );
    if (!result.initialized)
      throw new Error("packaged preload reported Steam as uninitialized");
    if (!result.cloudEnabled)
      throw new Error("packaged preload reported Steam Cloud as disabled");
    if (result.fileCount !== cloudFiles.length) {
      throw new Error(
        `expected ${cloudFiles.length} disposable cloud files, found ${result.fileCount}`,
      );
    }
    for (const filename of cloudFiles) {
      if (!result.files[filename]?.exists || !result.files[filename]?.raw) {
        throw new Error(
          `packaged preload could not see disposable cloud file ${filename}`,
        );
      }
    }

    const profileBundle = JSON.parse(result.files[PROFILE_FILENAME].raw);
    if (
      profileBundle.version !== 1 ||
      profileBundle.activeProfileId !== PROFILE_ID ||
      !profileBundle.profiles?.some((profile) => profile.id === PROFILE_ID)
    ) {
      throw new Error("Steam Cloud restore returned an invalid profile bundle");
    }

    const slotEnvelope = JSON.parse(result.files[SLOT_FILENAME].raw);
    const restoredJson = decodeEnvelopeJson(slotEnvelope);
    const restoredState = restoredJson ? JSON.parse(restoredJson) : null;
    if (
      slotEnvelope.v !== 1 ||
      typeof slotEnvelope.checksum !== "string" ||
      typeof slotEnvelope.data !== "string" ||
      !restoredState ||
      restoredState.cityName !== "PACKAGED CLOUD RESTORE" ||
      slotEnvelope.checksum !== computeChecksum(restoredJson)
    ) {
      throw new Error("Steam Cloud restore returned an invalid save envelope");
    }
    if (
      restoredState.resources?.ammo !== EXPECTED_MILITARY_BALANCES.resourcesAmmo ||
      restoredState.resources?.fuel !== EXPECTED_MILITARY_BALANCES.resourcesFuel ||
      restoredState.resources?.food !== EXPECTED_MILITARY_BALANCES.resourcesFood ||
      restoredState.stockpiles?.ammo !== EXPECTED_MILITARY_BALANCES.stockpileAmmo ||
      restoredState.stockpiles?.fuel !== EXPECTED_MILITARY_BALANCES.stockpileFuel ||
      restoredState.stockpiles?.vehicleParts !== EXPECTED_MILITARY_BALANCES.stockpileVehicleParts ||
      restoredState.stockpiles?.food !== undefined
    ) {
      throw new Error(
        "Legacy Steam Cloud envelope did not retain distinct military reserves and stockpiles",
      );
    }
    if (
      JSON.stringify(
        restoredState.tickLog?.find((entry) => entry.label === MEDICAL_REPORT.label),
      ) !== JSON.stringify(medicalReport)
    ) {
      throw new Error(
        "Steam Cloud restore did not retain the populated medical last-tick report",
      );
    }
    if (
      missionMailId !== EXPECTED_MISSION_ID ||
      restoredState.dismissedMessageIds?.includes(missionMailId) !== true ||
      restoredState.messages?.some((message) => message.id === missionMailId) ||
      restoredState.messages?.some((message) => message.title === missionMailTitle)
    ) {
      throw new Error(
        "Steam Cloud restore did not retain the canonical dismissed mission mail tombstone without a live message",
      );
    }
    const restoredOperation = restoredState.retinue?.activeOperation;
    const restoredSquad = restoredState.retinue?.squads?.find(
      (squad) => squad.id === "demo-operation-squad",
    );
    const restoredTroops = restoredState.retinue?.troops?.filter((troop) =>
      ["demo-operation-infantry", "demo-operation-gunner"].includes(troop.id),
    );
    if (
      restoredOperation?.id !== operationId ||
      restoredOperation.operationId !== "supply_recovery" ||
      restoredOperation.squadId !== "demo-operation-squad" ||
      restoredOperation.ticksRemaining !== 11 ||
      restoredOperation.resolution?.duration !== 11 ||
      restoredOperation.resolution?.successChance !== 95 ||
      restoredOperation.resolution?.doctrineModifiers?.powerMultiplier !== 1.15 ||
      restoredOperation.resolution?.doctrineModifiers?.casualtyRiskMultiplier !== 1.2 ||
      restoredOperation.resolution?.doctrineModifiers?.operationSpeedMultiplier !== 1.1 ||
      restoredSquad?.doctrine !== "assault" ||
      restoredTroops?.length !== 2 ||
      restoredTroops.some((troop) => troop.status !== "deployed")
    ) {
      throw new Error(
        "Steam Cloud restore did not retain the active operation, doctrine modifiers, or deployed troops",
      );
    }
    assertTrainModules(restoredState, "Steam Cloud restore");

    await waitForVisibleText(page, "CONTINUE");
    await clickVisibleText(page, "CONTINUE");
    await waitForPath(page, "/overview");
    await waitForVisibleText(page, "PACKAGED CLOUD RESTORE");
    await Promise.race([
      missionReplayMarker,
      sleep(30000).then(() => {
        throw new Error(
          "Timed out waiting for the repeated mission completion callback after Steam Cloud restore",
        );
      }),
    ]);
    const restoredMailState = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const envelope = JSON.parse(raw);
      const json = decodeEnvelopeJson(envelope);
      return json ? JSON.parse(json) : null;
    }, profileSlotKey(1));
    if (
      restoredMailState?.dismissedMessageIds?.includes(missionMailId) !== true ||
      restoredMailState?.messages?.some((message) => message.id === missionMailId) ||
      restoredMailState?.messages?.some((message) => message.title === missionMailTitle)
    ) {
      throw new Error(
        "Repeated mission completion callback recreated dismissed mail after Steam Cloud restore",
      );
    }
    console.log(
      "[e2e] PASS: cloud restore retained the canonical mission-mail dismissal and replay stayed idempotent",
    );
    await clickAriaLabel(page, "Open tick log");
    await waitForVisibleText(page, "SECTOR REPORT");
    const medicalReportText = await page.evaluate(() =>
      (document.body.innerText ?? "").toUpperCase(),
    );
    for (const fragment of MEDICAL_REPORT_FRAGMENTS) {
      if (!medicalReportText.includes(fragment)) {
        throw new Error(
          `Packaged Steam Cloud restore did not render medical report wording: ${fragment}`,
        );
      }
    }
    await clickAriaLabel(page, "Close sector report");
    const localRestoredBeforeOperation = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw ? { raw, keys: Object.keys(window.localStorage) } : null;
    }, profileSlotKey(1));
    if (!localRestoredBeforeOperation?.raw) {
      throw new Error("Steam Cloud restore did not retain the restored local operation slot");
    }
    const localRestoredEnvelope = JSON.parse(localRestoredBeforeOperation.raw);
    const localRestoredJson = decodeEnvelopeJson(localRestoredEnvelope);
    const localRestoredState = localRestoredJson
      ? JSON.parse(localRestoredJson)
      : null;
    if (
      localRestoredState?.retinue?.activeOperation?.id !== operationId ||
      localRestoredState.retinue.activeOperation.ticksRemaining !== 11
    ) {
      throw new Error("The restored local slot did not retain the in-flight operation");
    }
    if (
      JSON.stringify(
        localRestoredState.tickLog?.find((entry) => entry.label === MEDICAL_REPORT.label),
      ) !== JSON.stringify(medicalReport)
    ) {
      throw new Error(
        "The restored local slot did not retain the populated medical last-tick report",
      );
    }
    if (
      localRestoredState.resources?.ammo !== EXPECTED_MILITARY_BALANCES.resourcesAmmo ||
      localRestoredState.resources?.fuel !== EXPECTED_MILITARY_BALANCES.resourcesFuel ||
      localRestoredState.resources?.food !== EXPECTED_MILITARY_BALANCES.resourcesFood ||
      localRestoredState.stockpiles?.ammo !== EXPECTED_MILITARY_BALANCES.stockpileAmmo ||
      localRestoredState.stockpiles?.fuel !== EXPECTED_MILITARY_BALANCES.stockpileFuel ||
      localRestoredState.stockpiles?.vehicleParts !== EXPECTED_MILITARY_BALANCES.stockpileVehicleParts ||
      localRestoredState.stockpiles?.food !== undefined
    ) {
      throw new Error(
        "Migrated local Cloud restore mixed military reserves with logistics stockpiles",
      );
    }

    await clickTestId(page, "top-nav-more");
    await waitForVisibleText(page, "MILITARY / ARMORY");
    await clickVisibleText(page, "MILITARY / ARMORY");
    await waitForPath(page, "/military");
    await waitForVisibleText(page, "TOP-LEVEL CITY RESERVES");
    await waitForVisibleText(page, "SEPARATE LOGISTICS STOCKPILES");
    await waitForVisibleText(page, "RATIONS");
    await waitForVisibleText(page, "FOOD POOL");
    await assertMilitaryBalances(page, "cloud-restored state");

    await clickTestId(page, "top-nav-more");
    await waitForVisibleText(page, "RETINUE COMMAND");
    await clickVisibleText(page, "RETINUE COMMAND");
    await waitForPath(page, "/retinue");
    await waitForVisibleText(page, "ACTIVE OPERATION");
    await waitForVisibleText(page, "Supply Recovery · FIELD RESPONSE");
    await waitForVisibleText(page, "11 ticks remaining");
    await waitForVisibleText(page, "troops are deployed and unavailable");

    await clickTestId(page, "top-nav-overview");
    await waitForPath(page, "/overview");
    await clickVisibleText(page, "DEMOGRAPHICS");
    await waitForVisibleText(page, "RAIL NETWORK & CORRIDORS");
    const restoredRailDiagnostics = Object.fromEntries(
      await Promise.all(
        ["Troop Transport Capacity", "Armed Security Benefit", "Safety Resilience"]
          .map(async (label) => [label, await readDemoRow(page, label)]),
      ),
    );
    assertDemoRow(
      restoredRailDiagnostics,
      "Troop Transport Capacity",
      40,
      "Cloud-restored overview",
    );
    assertDemoRow(
      restoredRailDiagnostics,
      "Armed Security Benefit",
      16,
      "Cloud-restored overview",
    );
    assertDemoRow(
      restoredRailDiagnostics,
      "Safety Resilience",
      25,
      "Cloud-restored overview",
    );
    await waitForVisibleText(page, "END TURN");
    await clickAriaLabel(page, "End turn");
    await clickAriaLabel(page, "End turn");
    await clickAriaLabel(page, "End turn");

    await clickTestId(page, "top-nav-more");
    await waitForVisibleText(page, "RETINUE COMMAND");
    await clickVisibleText(page, "RETINUE COMMAND");
    await waitForPath(page, "/retinue");
    await waitForVisibleText(page, "OPERATION HISTORY");
    await waitForVisibleText(page, "Supply Recovery · FIELD RESPONSE");
    await waitForVisibleText(page, "SUCCESS · 11 ticks · 0 wounded · 0 KIA");
    await clickVisibleText(page, "SQUADS");
    await waitForVisibleText(page, "2/4 troops");
    const deployedAfterCompletion = await page.evaluate(() =>
      [...document.querySelectorAll("body *")].some((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (element.textContent ?? "").toUpperCase().includes("DEPLOYED · SUPPLY RECOVERY")
        );
      }),
    );
    if (deployedAfterCompletion) {
      throw new Error("Completed Cloud-restored operation left troops deployed");
    }
    await sleep(2500);

    const ticker = await readTicker(
      page,
      "NATURE DESK: NATURE CRISIS RISK RISING",
    );
    if (!ticker.found || !ticker.visible) {
      throw new Error(
        `NewsTicker was not visible after Steam Cloud restore: ${JSON.stringify(ticker)}`,
      );
    }
    if (ticker.matches !== 0) {
      throw new Error(
        `Expected the restored nature-risk warning to stay out of the ticker, got ${ticker.matches}: ${ticker.accessible}`,
      );
    }

    const localState = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw ? { raw, keys: Object.keys(window.localStorage) } : null;
    }, profileSlotKey(1));
    if (!localState?.raw) {
      throw new Error(
        "Steam Cloud restore did not retain the restored local slot",
      );
    }
    const localEnvelope = JSON.parse(localState.raw);
    const localJson = decodeEnvelopeJson(localEnvelope);
    const localStateValue = localJson ? JSON.parse(localJson) : null;
    if (
      localStateValue?.retinue?.activeOperation ||
      localStateValue?.retinue?.operationHistory?.[0]?.id !== operationId ||
      localStateValue?.retinue?.operationHistory?.[0]?.success !== true ||
      localStateValue?.retinue?.troops?.some((troop) =>
        ["demo-operation-infantry", "demo-operation-gunner"].includes(troop.id) &&
        troop.status !== "ready",
      )
    ) {
      throw new Error(
        "The completed Cloud-restored operation did not record history or return its troops to ready",
      );
    }
    const restoredWarning = localStateValue?.newsFeed?.find(
      (item) => item.id === warningId,
    );
    if (!restoredWarning) {
      throw new Error(
        "The restored local save no longer retained the nature-risk news-feed warning",
      );
    }
    const disposableLocalArtifacts = localState.keys.filter((key) =>
      [
        `${profileSlotKey(1)}_backup`,
        `${profileSlotKey(1)}.tmp`,
        "@megacity_cloud_sync_baseline",
      ].includes(key),
    );
    if (disposableLocalArtifacts.length > 0) {
      throw new Error(
        `packaged cloud restore smoke test left disposable local artifacts before cleanup: ${JSON.stringify(disposableLocalArtifacts)}`,
      );
    }
    const normalLocalKeys = localState.keys.filter(
      (key) =>
        (key.startsWith(NORMAL_SAVE_KEY_PREFIX) ||
          key.startsWith(NORMAL_PROFILE_KEY_PREFIX) ||
          key === "@megacity_save") &&
        key !== profileSlotKey(1) &&
        key !== `@megacity_profile_${PROFILE_ID}`,
    );
    if (normalLocalKeys.length > 0) {
      throw new Error(
        `cloud restore smoke test touched an unrelated player save/profile key: ${JSON.stringify(normalLocalKeys)}`,
      );
    }

    console.log(
      "[e2e] PASS: packaged Steam preload restored the medical last-tick report and in-flight squad operation, completed it, and preserved the nature-risk ticker behavior",
    );
  } finally {
    let remainingCloudFiles = [];
    let remainingLocalArtifacts = [];
    if (page) {
      const cleanupResult = await page
        .evaluate(async ({ filenames, localKeys }) => {
          const cloud = window.steamworks?.cloud;
          if (cloud) {
            for (const filename of filenames) {
              await cloud.deleteFile(filename).catch(() => false);
            }
          }
          for (const key of localKeys) {
            window.localStorage.removeItem(key);
          }
          return {
            cloud: cloud
              ? (await Promise.all(
                  filenames.map(async (filename) => ({
                    filename,
                    exists: await cloud.fileExists(filename).catch(() => true),
                  })),
                )).filter((file) => file.exists)
              : filenames.map((filename) => ({ filename, exists: true })),
            local: localKeys.filter((key) => window.localStorage.getItem(key) !== null),
          };
        }, {
          filenames: cloudFiles,
          localKeys: [
            profileSlotKey(1),
            `${profileSlotKey(1)}_backup`,
            `${profileSlotKey(1)}.tmp`,
            "@megacity_cloud_sync_baseline",
          ],
        })
        .catch(() => ({
          cloud: cloudFiles.map((filename) => ({ filename, exists: true })),
          local: ["cleanup evaluation failed"],
        }));
      remainingCloudFiles = cleanupResult.cloud;
      remainingLocalArtifacts = cleanupResult.local;
    }
    if (browser) await browser.close().catch(() => {});
    if (fixtureDirectory)
      await rm(fixtureDirectory, { recursive: true, force: true });
    if (userDataDirectory)
      await rm(userDataDirectory, { recursive: true, force: true });
    const fixtureRemoved = !fixtureDirectory || !existsSync(fixtureDirectory);
    const userDataRemoved =
      !userDataDirectory || !existsSync(userDataDirectory);
    console.log(
      `[e2e] temporary directories removed: fixture=${fixtureRemoved} userData=${userDataRemoved}`,
    );
    if (!fixtureRemoved || !userDataRemoved) {
      throw new Error(
        "packaged cloud smoke test left a temporary fixture behind",
      );
    }
    if (remainingCloudFiles.length > 0 || remainingLocalArtifacts.length > 0) {
      throw new Error(
        `packaged cloud smoke test cleanup left artifacts: cloud=${JSON.stringify(remainingCloudFiles)} local=${JSON.stringify(remainingLocalArtifacts)}`,
      );
    }
  }
}

run().catch((error) => {
  console.error(
    `[e2e] FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
