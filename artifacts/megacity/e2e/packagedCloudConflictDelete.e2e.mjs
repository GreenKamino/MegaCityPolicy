// Packaged Electron smoke coverage for deleting a slot while its Steam Cloud
// conflict resolution is still in flight.
//
// The test uses a disposable filesystem-backed cloud fixture, but all
// interactions cross the real Electron main/preload bridge. It seeds a local
// save and a different cloud save with a shared ancestor baseline, opens the
// real conflict banner, chooses the local copy, and immediately deletes the
// slot through SAVE SLOTS. The first cloud delete is intentionally failed so a
// second packaged launch must reconcile the tombstone and remove the stale
// cloud copy instead of pulling the city back down.
//
// Run with:
//
//   MEGACITY_RUN_PACKAGED_CLOUD_CONFLICT_DELETE=1 \
//     pnpm run test:e2e:packaged-cloud-conflict-delete
//
// The default command is opt-in because it launches a real Electron process.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer";
import lzString from "lz-string";

const { compressToUTF16, decompressFromUTF16 } = lzString;

const STEAM_DIR = resolve(import.meta.dirname, "..", "steam");
const ELECTRON_PATH =
  process.env.ELECTRON_PATH ??
  resolve(STEAM_DIR, "node_modules", "electron", "dist", "electron");
const RELEASE_EXECUTABLE = process.env.MEGACITY_RELEASE_EXECUTABLE
  ? resolve(process.env.MEGACITY_RELEASE_EXECUTABLE)
  : null;
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const RUN_FLAG = "MEGACITY_RUN_PACKAGED_CLOUD_CONFLICT_DELETE";
const PROFILE_ID = "e2e_cloud_conflict_delete";
const SLOT = 1;
const PROFILE_KEY = `@megacity_profile_${PROFILE_ID}`;
const SLOT_KEY = `${PROFILE_KEY}_slot_${SLOT}`;
const BASELINE_KEY = "@megacity_cloud_sync_baseline";
const EXPECTED_TRAIN_MODULES = [
  "armored_train_plating",
  "troop_transport_carriages",
  "weaponized_escort_cars",
];
const PROFILE_FILENAME = "megacity_profiles.json";
const cloudFilenameForSlot = (slotKey) =>
  `megacity_save_${slotKey.replace(/[^a-zA-Z0-9_]/g, "_")}.json`;
const SLOT_FILENAME = cloudFilenameForSlot(SLOT_KEY);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (process.env[RUN_FLAG] !== "1") {
  console.log(
    `[e2e] SKIP: packaged cloud conflict/delete is opt-in; set ${RUN_FLAG}=1 to run it`,
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

function wrapState(state) {
  const json = JSON.stringify(state);
  return JSON.stringify({
    v: 2,
    checksum: computeChecksum(json),
    data: compressToUTF16(json),
  });
}

function makeFixturePayloads() {
  // Generate complete states from the real engine defaults. The packaged app
  // therefore exercises its normal migrate/sanitize path instead of loading a
  // hand-written partial state.
  const generated = execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "-e",
      [
        'import { createInitialState } from "./engine/initialState";',
        'import { createDemoSeededStateIfRequested } from "./engine/demoSeeder";',
        'import { createDefaultProfile } from "./engine/profiles";',
        'globalThis.window = { location: { search: "?demo=1&railcompletion=upgrades" } };',
        "const state = createDemoSeededStateIfRequested();",
        'if (JSON.stringify(state.railCorridors?.[0]?.installedTrainUpgrades ?? []) !== JSON.stringify(["armored_train_plating", "troop_transport_carriages", "weaponized_escort_cars"])) throw new Error("Cloud conflict fixture did not seed all train modules");',
        'const ancestor = { ...state, cityName: "CONFLICT ANCESTOR", totalTicks: 10, lastTickTime: 1000, tickPaused: true, hasCompletedOnboarding: true };',
        'const local = { ...ancestor, cityName: "LOCAL DELETE CITY", totalTicks: 20, lastTickTime: 2000 };',
        'const cloud = { ...ancestor, cityName: "CLOUD CONFLICT CITY", totalTicks: 30, lastTickTime: 3000 };',
        'const profile = { ...createDefaultProfile("Conflict Delete Commander", 35, "male"), id: "e2e_cloud_conflict_delete", createdAt: 1700000000000, lastPlayed: 1700000000000 };',
        "process.stdout.write(JSON.stringify({ ancestor, local, cloud, profile }));",
      ].join(" "),
    ],
    {
      cwd: resolve(STEAM_DIR, ".."),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  const { ancestor, local, cloud, profile } = JSON.parse(generated);
  const ancestorJson = JSON.stringify(ancestor);
  return {
    profileBundle: JSON.stringify({
      version: 1,
      profiles: [profile],
      activeProfileId: PROFILE_ID,
      exportedAt: 1700000000000,
    }),
    profile,
    localEnvelope: wrapState(local),
    cloudEnvelope: wrapState(cloud),
    ancestorChecksum: computeChecksum(ancestorJson),
  };
}

async function waitForVisibleText(page, text, timeout = 120000) {
  const target = text.toUpperCase();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await page
      .evaluate((needle) => {
        const wanted = needle.toUpperCase();
        return [...document.querySelectorAll("body *")].some((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            (element.innerText ?? element.textContent ?? "")
              .toUpperCase()
              .includes(wanted)
          );
        });
      }, target)
      .catch(() => false);
    if (visible) return;
    await sleep(300);
  }
  const body = await page
    .evaluate(() => document.body?.innerText?.slice(0, 3000) ?? "(empty)")
    .catch(() => "(renderer unavailable)");
  throw new Error(`Timed out waiting for "${text}". Visible text:\n${body}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((label) => {
    const wanted = label.trim().toUpperCase();
    const candidates = [
      ...document.querySelectorAll('[role="button"], button'),
    ].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? element.textContent ?? "")
          .trim()
          .toUpperCase()
          .includes(wanted)
      );
    });
    const button = candidates[0];
    if (!button) return false;
    button.scrollIntoView({ block: "center", inline: "center" });
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not find the visible ${text} button`);
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

async function waitForStorageKey(page, key, expectedPresent, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const present = await page
      .evaluate((storageKey) => window.localStorage.getItem(storageKey) !== null, key)
      .catch(() => false);
    if (present === expectedPresent) return;
    await sleep(250);
  }
  throw new Error(
    `Timed out waiting for localStorage key ${key} to be ${
      expectedPresent ? "present" : "removed"
    }`,
  );
}

async function readStorage(page, key) {
  return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
}

function decodeState(raw) {
  if (!raw) return null;
  const envelope = JSON.parse(raw);
  const json = decompressFromUTF16(envelope.data ?? "");
  return json ? JSON.parse(json) : null;
}

function assertTrainModules(state, label) {
  const corridor = state?.railCorridors?.[0];
  if (!corridor || corridor.status !== "completed") {
    throw new Error(`${label}: completed rail corridor was not retained`);
  }
  const installed = [...(corridor.installedTrainUpgrades ?? [])].sort();
  if (JSON.stringify(installed) !== JSON.stringify([...EXPECTED_TRAIN_MODULES].sort())) {
    throw new Error(
      `${label}: installed train modules drifted: ${JSON.stringify(corridor.installedTrainUpgrades)}`,
    );
  }
}

async function launchPackagedShell(userDataDirectory, cloudDirectory, deleteFailures) {
  const browser = await puppeteer.launch({
    executablePath: LAUNCH_EXECUTABLE,
    headless: true,
    cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
    env: {
      ...process.env,
      MEGACITY_E2E_CLOUD_FIXTURE: "1",
      MEGACITY_E2E_CLOUD_FIXTURE_DIR: cloudDirectory,
      MEGACITY_E2E_CLOUD_WRITE_DELAY_MS: "1200",
      MEGACITY_E2E_CLOUD_DELETE_FAILURES: String(deleteFailures),
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
  const page = pages[0] ?? (await browser.newPage());
  page.on("pageerror", (error) =>
    console.error(`[e2e] page error: ${error.message}`),
  );
  return { browser, page };
}

async function seedLocalConflict(page, fixture) {
  await page.evaluate(
    ({ fixture, profileKey, slotKey, baselineKey, profileId }) => {
      localStorage.setItem(
        "@megacity_profiles_index",
        JSON.stringify([profileId]),
      );
      localStorage.setItem("@megacity_active_profile", profileId);
      localStorage.setItem(profileKey, JSON.stringify(fixture.profile));
      localStorage.setItem(slotKey, fixture.localEnvelope);
      localStorage.setItem(
        baselineKey,
        JSON.stringify({
          [slotKey]: {
            checksum: fixture.ancestorChecksum,
            syncedAt: 1700000000000,
          },
        }),
      );
    },
    {
      fixture,
      profileKey: PROFILE_KEY,
      slotKey: SLOT_KEY,
      baselineKey: BASELINE_KEY,
      profileId: PROFILE_ID,
    },
  );
  for (const key of [SLOT_KEY, BASELINE_KEY]) {
    if ((await readStorage(page, key)) === null) {
      throw new Error(`Fixture failed to seed ${key}`);
    }
  }
}

async function assertCloudFile(page, expectedPresent, label) {
  const present = await page.evaluate(
    (filename) => window.steamworks.cloud.fileExists(filename),
    SLOT_FILENAME,
  );
  if (present !== expectedPresent) {
    throw new Error(
      `${label}: expected cloud slot ${expectedPresent ? "present" : "absent"}`,
    );
  }
}

async function assertLocalSlot(page, expectedPresent, label) {
  const raw = await readStorage(page, SLOT_KEY);
  if ((raw !== null) !== expectedPresent) {
    throw new Error(
      `${label}: expected local slot ${expectedPresent ? "present" : "absent"}`,
    );
  }
  if (raw) {
    const state = decodeState(raw);
    if (state?.cityName !== "LOCAL DELETE CITY") {
      throw new Error(
        `${label}: local slot changed unexpectedly to ${state?.cityName ?? "unknown city"}`,
      );
    }
    assertTrainModules(state, label);
  }
}

async function assertCloudSlot(page, expectedCity, label) {
  const raw = await page.evaluate(
    (filename) => window.steamworks.cloud.readFile(filename),
    SLOT_FILENAME,
  );
  const state = decodeState(raw);
  if (state?.cityName !== expectedCity) {
    throw new Error(
      `${label}: cloud slot changed unexpectedly to ${state?.cityName ?? "unknown city"}`,
    );
  }
  assertTrainModules(state, label);
}

async function run() {
  let cloudDirectory;
  let userDataDirectory;
  let setupBrowser;
  let testBrowser;
  try {
    cloudDirectory = await mkdtemp(join(tmpdir(), "megacity-cloud-conflict-delete-"));
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-electron-cloud-conflict-delete-"),
    );
    const fixture = makeFixturePayloads();
    await writeFile(join(cloudDirectory, PROFILE_FILENAME), fixture.profileBundle, "utf8");
    await writeFile(join(cloudDirectory, SLOT_FILENAME), fixture.cloudEnvelope, "utf8");

    // Setup launch: seed the local conflict into the same persistent
    // app:// profile that the behavior-under-test launch will reuse.
    ({ browser: setupBrowser } = await launchPackagedShell(
      userDataDirectory,
      cloudDirectory,
      0,
    ));
    const setupPage = (await setupBrowser.pages())[0] ?? (await setupBrowser.newPage());
    await waitForVisibleText(setupPage, "SAVE SLOTS");
    await seedLocalConflict(setupPage, fixture);
    console.log("[e2e] seeded local/cloud conflict and shared ancestor baseline");
    await setupBrowser.close();
    setupBrowser = null;

    // The first behavior launch must surface the real conflict prompt.
    ({ browser: testBrowser } = await launchPackagedShell(
      userDataDirectory,
      cloudDirectory,
      1,
    ));
    let page = (await testBrowser.pages())[0] ?? (await testBrowser.newPage());
    await waitForVisibleText(page, "CLOUD SAVE CONFLICT — SLOT 1");
    await waitForVisibleText(page, "KEEP THIS DEVICE");
    await assertLocalSlot(page, true, "conflict prompt");
    await assertCloudFile(page, true, "conflict prompt");
    await assertCloudSlot(page, "CLOUD CONFLICT CITY", "conflict prompt");

    // Resolve in the background and immediately take the real delete path.
    // The fixture's delayed write keeps resolution pending while the player
    // opens SAVE SLOTS and confirms DELETE.
    await clickVisibleText(page, "KEEP THIS DEVICE");
    await sleep(100);
    await waitForVisibleText(page, "CLOUD SAVE CONFLICT — SLOT 1");
    await clickAriaLabel(page, "Open save slots");
    await waitForVisibleText(page, "DELETE");
    await clickVisibleText(page, "DELETE");
    await waitForVisibleText(page, "DELETE SAVE?");
    await clickVisibleText(page, "DELETE");
    await waitForStorageKey(page, SLOT_KEY, false);
    await assertLocalSlot(page, false, "after delete confirmation");
    await assertCloudFile(page, true, "after intentionally failed first cloud delete");

    const tombstoneRaw = await readStorage(page, BASELINE_KEY);
    const tombstoneMap = tombstoneRaw ? JSON.parse(tombstoneRaw) : {};
    if (!tombstoneMap[SLOT_KEY]?.deleted) {
      throw new Error(
        "deleting during pending conflict resolution did not retain the deletion tombstone",
      );
    }
    console.log(
      "[e2e] PASS: delete confirmation removed the local slot while the competing resolution completed, leaving a tombstone and stale cloud copy",
    );
    await testBrowser.close();
    testBrowser = null;

    // Follow-up reconcile: with the first cloud delete failed, startup must
    // choose push-delete from the tombstone rather than pull-cloud.
    ({ browser: testBrowser } = await launchPackagedShell(
      userDataDirectory,
      cloudDirectory,
      0,
    ));
    page = (await testBrowser.pages())[0] ?? (await testBrowser.newPage());
    await waitForVisibleText(page, "SAVE SLOTS");
    await waitForVisibleText(page, "EMPTY SLOT");
    await waitForStorageKey(page, SLOT_KEY, false);
    await assertLocalSlot(page, false, "after follow-up reconcile");
    await assertCloudFile(page, false, "after follow-up reconcile");
    const reconciledBaselineRaw = await readStorage(page, BASELINE_KEY);
    const reconciledBaseline = reconciledBaselineRaw
      ? JSON.parse(reconciledBaselineRaw)
      : {};
    if (reconciledBaseline[SLOT_KEY]) {
      throw new Error(
        "follow-up reconcile removed the stale cloud copy but left an orphaned tombstone",
      );
    }

    console.log(
      "[e2e] PASS: follow-up reconcile deleted the stale cloud slot without restoring the deleted city",
    );
  } finally {
    if (setupBrowser) await setupBrowser.close().catch(() => {});
    if (testBrowser) await testBrowser.close().catch(() => {});
    if (cloudDirectory) {
      await rm(cloudDirectory, { recursive: true, force: true });
      if (existsSync(cloudDirectory)) {
        throw new Error("cloud conflict/delete smoke test left its fixture behind");
      }
    }
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        throw new Error(
          "cloud conflict/delete smoke test left its temporary Electron profile behind",
        );
      }
    }
  }
}

run().catch((error) => {
  console.error(
    `[e2e] FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});