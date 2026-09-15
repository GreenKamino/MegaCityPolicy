// Packaged Electron smoke coverage for startup cleanup of interrupted
// commander-slot writes.
//
// The first launch is only a fixture setup phase: it opens the normal
// packaged app, writes a complete profile/slot fixture into the disposable
// Electron profile, and exits. The second launch is the behavior under test
// and uses the ordinary desktop startup path with no E2E route/query.
//
//   node e2e/desktopProfileTmpCleanup.e2e.mjs
//
// The test never touches a player's real Electron profile.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
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
const REQUIRE_RELEASE =
  process.env.MEGACITY_RUN_PACKAGED_PROFILE_TMP_CLEANUP === "1";
const PROFILE_ID = "e2e_profile_tmp_cleanup";
const SLOT = 2;
const PROFILE_KEY = `@megacity_profile_${PROFILE_ID}`;
const SLOT_KEY = `${PROFILE_KEY}_slot_${SLOT}`;
const TMP_KEY = `${SLOT_KEY}.tmp`;
const BACKUP_KEY = `${SLOT_KEY}_backup`;
const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (REQUIRE_RELEASE && process.platform !== "win32") {
  throw new Error(
    "the packaged profile cleanup release check requires a Windows runner",
  );
}
if (REQUIRE_RELEASE && !RELEASE_EXECUTABLE) {
  throw new Error(
    "MEGACITY_RELEASE_EXECUTABLE is required for the packaged profile cleanup release check",
  );
}
if (!existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}. Install Steam shell dependencies first.`,
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
      `could not read the release manifest from the source or unpacked app: ${error.message}`,
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
        `unpacked release manifest drifted for ${field} (source=${sourceManifest[field]}, packaged=${packagedManifest[field]})`,
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
      `unpacked release is missing its manifest entry bundle ${packagedManifest.entryBundle}`,
    );
  }
  const entryHash = createHash("sha256")
    .update(readFileSync(entryPath))
    .digest("hex");
  if (entryHash !== packagedManifest.bundleSha256) {
    throw new Error(
      `unpacked release entry bundle hash mismatch (expected ${packagedManifest.bundleSha256}, got ${entryHash})`,
    );
  }
  console.log(
    `[e2e] verified unpacked release manifest v${packagedManifest.appVersion}: ${packagedManifest.entryBundle}`,
  );
}

function makeFixturePayloads() {
  // Generate complete state data from the real engine defaults. This keeps
  // startup's migrate/sanitize/preview path honest instead of relying on a
  // partial hand-written state that the game could never load.
  const generated = execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "-e",
      [
        'import { createInitialState } from "./engine/initialState";',
        "const state = createInitialState();",
        'const primary = { ...state, cityName: "TMP CLEANUP PRIMARY", lastTickTime: 2000, tickPaused: true, hasCompletedOnboarding: true };',
        'const backup = { ...state, cityName: "TMP CLEANUP BACKUP", lastTickTime: 1000, tickPaused: true, hasCompletedOnboarding: true };',
        "process.stdout.write(JSON.stringify({ primary, backup }));",
      ].join(" "),
    ],
    {
      cwd: resolve(STEAM_DIR, ".."),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  const { primary, backup } = JSON.parse(generated);
  const profile = {
    id: PROFILE_ID,
    name: "Interrupted Save Commander",
    age: 35,
    sex: "male",
    portraitId: "player_male_1",
    commanderLevel: 1,
    commanderXP: 0,
    attributes: {
      authority: 5,
      intelligence: 4,
      charisma: 3,
      combat: 6,
      endurance: 5,
    },
    attributePoints: 0,
    traits: [],
    backstory: "",
    careerStats: {},
    createdAt: 1700000000000,
    lastPlayed: 1700000000000,
  };
  return {
    profile,
    profileBackup: { ...profile, name: "Interrupted Save Commander Backup" },
    primary: wrapState(primary),
    backup: wrapState(backup),
  };
}

function makeLaunchEnv() {
  const env = {
    ...process.env,
    ELECTRON_DISABLE_SANDBOX: "1",
  };
  // The behavior-under-test launch must not inherit a fixture route or any
  // other test-only storage behavior from the caller.
  for (const key of [
    "MEGACITY_E2E_QUERY",
    "MEGACITY_E2E_ROUTE",
    "MEGACITY_E2E_SAVE_FAILURE",
    "MEGACITY_E2E_CLOUD_FIXTURE",
    "MEGACITY_E2E_CLOUD_FIXTURE_DIR",
    "MEGACITY_E2E_CLOUD_SEED_DIR",
    "MEGACITY_E2E_CLOUD_SEED_PATH",
  ]) {
    delete env[key];
  }
  return env;
}

async function launchPackagedShell(userDataDirectory) {
  const browser = await puppeteer.launch({
    executablePath: LAUNCH_EXECUTABLE,
    headless: true,
    cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
    env: makeLaunchEnv(),
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

async function hasVisibleText(page, text) {
  try {
    return await page.evaluate((needle) => {
      const target = needle.toUpperCase();
      return [...document.querySelectorAll("div, span, button")].some(
        (element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            (element.innerText ?? element.textContent ?? "")
              .trim()
              .toUpperCase() === target
          );
        },
      );
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
    .evaluate(() => document.body?.innerText?.slice(0, 2000) ?? "(empty)")
    .catch(() => "(renderer unavailable)");
  throw new Error(`Timed out waiting for "${text}". Visible text:\n${body}`);
}

async function waitForStorageKey(page, key, expectedPresent, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const present = await page
      .evaluate(
        (storageKey) => window.localStorage.getItem(storageKey) !== null,
        key,
      )
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

function assertUsableEnvelope(raw, label, expectedCityName) {
  if (!raw)
    throw new Error(`startup cleanup removed the ${label} save envelope`);
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new Error(
      `startup cleanup left invalid JSON in the ${label} save envelope`,
    );
  }
  if (
    envelope?.v !== 2 ||
    typeof envelope.checksum !== "string" ||
    typeof envelope.data !== "string" ||
    envelope.data.length === 0
  ) {
    throw new Error(
      `startup cleanup damaged the ${label} save envelope metadata`,
    );
  }
  const json = decompressFromUTF16(envelope.data);
  if (!json)
    throw new Error(
      `startup cleanup left an undecodable ${label} save envelope`,
    );
  if (envelope.checksum !== computeChecksum(json)) {
    throw new Error(
      `startup cleanup left a checksum-invalid ${label} save envelope`,
    );
  }
  const state = JSON.parse(json);
  if (state.cityName !== expectedCityName) {
    throw new Error(
      `startup cleanup changed the ${label} save data (expected ${expectedCityName}, got ${state.cityName})`,
    );
  }
}

async function seedFixture(page, fixture) {
  await page.evaluate(
    ({ fixture, profileKey, slotKey, backupKey, tmpKey, profileId }) => {
      localStorage.setItem(
        "@megacity_profiles_index",
        JSON.stringify([profileId]),
      );
      localStorage.setItem("@megacity_active_profile", profileId);
      localStorage.setItem(profileKey, JSON.stringify(fixture.profile));
      localStorage.setItem(
        `${profileKey}_backup`,
        JSON.stringify(fixture.profileBackup),
      );
      localStorage.setItem(slotKey, fixture.primary);
      localStorage.setItem(backupKey, fixture.backup);
      // Simulate the process dying after staging the new payload but before
      // phase-3 temporary-key cleanup.
      localStorage.setItem(tmpKey, "stale interrupted save");
    },
    {
      fixture,
      profileKey: PROFILE_KEY,
      slotKey: SLOT_KEY,
      backupKey: BACKUP_KEY,
      tmpKey: TMP_KEY,
      profileId: PROFILE_ID,
    },
  );
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  for (const key of [SLOT_KEY, BACKUP_KEY, TMP_KEY]) {
    if (!keys.includes(key)) throw new Error(`Fixture failed to seed ${key}`);
  }
}

async function run() {
  let userDataDirectory;
  let setupBrowser;
  let testBrowser;
  try {
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-profile-tmp-e2e-"),
    );
    validateReleaseBundle();
    const fixture = makeFixturePayloads();

    // Setup launch: use the actual packaged renderer to seed its persistent
    // app:// localStorage, then terminate before the behavior-under-test
    // relaunch. No fixture query is used by the second launch.
    ({ browser: setupBrowser } = await launchPackagedShell(userDataDirectory));
    const setupPages = await setupBrowser.pages();
    const setupPage = setupPages[0] ?? (await setupBrowser.newPage());
    await waitForVisibleText(setupPage, "IDENTIFY YOURSELF, COMMANDER");
    await seedFixture(setupPage, fixture);
    console.log("[e2e] seeded disposable primary, backup, and stale .tmp keys");
    await setupBrowser.close();
    setupBrowser = null;

    ({ browser: testBrowser } = await launchPackagedShell(userDataDirectory));
    const pages = await testBrowser.pages();
    const page = pages[0] ?? (await testBrowser.newPage());

    // Seeing the real menu with the active commander and CONTINUE means the
    // startup hydration parsed the primary slot; it did not silently discard
    // the profile or treat the save as empty.
    await waitForVisibleText(page, "WELCOME, INTERRUPTED SAVE COMMANDER");
    await waitForVisibleText(page, "CONTINUE");
    await waitForStorageKey(page, TMP_KEY, false);

    const result = await page.evaluate(
      ({ slotKey, backupKey, tmpKey }) => {
        const decode = (key) => {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const envelope = JSON.parse(raw);
          return {
            raw,
            version: envelope.v,
            hasChecksum: typeof envelope.checksum === "string",
            hasData:
              typeof envelope.data === "string" && envelope.data.length > 0,
          };
        };
        return {
          primary: decode(slotKey),
          backup: decode(backupKey),
          tmp: localStorage.getItem(tmpKey),
        };
      },
      { slotKey: SLOT_KEY, backupKey: BACKUP_KEY, tmpKey: TMP_KEY },
    );
    assertUsableEnvelope(result.primary?.raw, "primary", "TMP CLEANUP PRIMARY");
    assertUsableEnvelope(result.backup?.raw, "backup", "TMP CLEANUP BACKUP");
    if (result.tmp !== null) {
      throw new Error(
        "startup cleanup left the interrupted .tmp companion behind",
      );
    }

    console.log(
      "[e2e] PASS: normal desktop relaunch removed the stale profile-slot .tmp while preserving primary and backup saves",
    );
  } finally {
    if (setupBrowser) await setupBrowser.close().catch(() => {});
    if (testBrowser) await testBrowser.close().catch(() => {});
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        throw new Error(
          "desktop profile tmp smoke test left its temporary profile behind",
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
