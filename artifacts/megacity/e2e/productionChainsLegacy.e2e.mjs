// Packaged Electron smoke coverage for legacy production saves. The fixture
// deliberately omits every civilian production building and military
// installation, then checks the real production-chain screen in the packaged
// renderer.
//
// Run with:
//   pnpm run test:e2e:packaged-production-chains-legacy
//
// To exercise an unpacked Windows release instead of the local Electron
// runtime, set MEGACITY_RELEASE_EXECUTABLE to its game.exe path. The Windows
// runner script sets the release-only guard automatically.

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
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const REQUIRE_RELEASE =
  process.env.MEGACITY_RUN_PACKAGED_PRODUCTION_CHAINS_LEGACY === "1";
const FIXTURE_QUERY = "demo=1&legacyproduction=1&go=production-chains";
const FIXTURE_ROUTE = "production-chains";
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (REQUIRE_RELEASE && process.platform !== "win32") {
  throw new Error(
    "the packaged legacy production release check requires a Windows runner",
  );
}
if (REQUIRE_RELEASE && !RELEASE_EXECUTABLE) {
  throw new Error(
    "MEGACITY_RELEASE_EXECUTABLE is required for the packaged legacy production release check",
  );
}
if (!existsSync(LAUNCH_EXECUTABLE)) {
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
  const entryHash = createHash("sha256")
    .update(readFileSync(entryPath))
    .digest("hex");
  if (entryHash !== packagedManifest.bundleSha256) {
    throw new Error(
      `packaged release entry bundle hash mismatch (expected ${packagedManifest.bundleSha256}, got ${entryHash})`,
    );
  }
  console.log(
    `[e2e] verified packaged release manifest v${packagedManifest.appVersion}: ${packagedManifest.entryBundle}`,
  );
}

async function hasVisibleText(page, text) {
  try {
    return await page.evaluate((targetText) => {
      const needle = targetText.trim().toUpperCase();
      return [...document.querySelectorAll("div, span, button, [role='button']")].some(
        (element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            (element.innerText ?? element.textContent ?? "")
              .trim()
              .toUpperCase()
              .includes(needle)
          );
        },
      );
    }, text);
  } catch {
    // Electron can replace the initial app:// document while it finishes
    // loading. Keep polling the current renderer in that case.
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
  throw new Error(`Timed out waiting for visible text "${text}". Visible text:\n${body}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((targetText) => {
    const needle = targetText.trim().toUpperCase();
    const nodes = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (element.innerText ?? element.textContent ?? "").trim().toUpperCase() ===
            needle
        );
      })
      .map((element) => ({
        element,
        control:
          element.closest("button, [role='button'], [tabindex='0']") ?? element,
      }))
      .filter(
        (candidate, index, candidates) =>
          candidates.findIndex((other) => other.control === candidate.control) ===
          index,
      )
      .sort((a, b) => {
        const aArea =
          a.control.getBoundingClientRect().width *
          a.control.getBoundingClientRect().height;
        const bArea =
          b.control.getBoundingClientRect().width *
          b.control.getBoundingClientRect().height;
        return aArea - bArea;
      })[0];
    if (!element) return false;
    element.control.scrollIntoView({ block: "center", inline: "center" });
    element.control.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text "${text}"`);
}

async function assertNoPlayerSaveStorage(page, economy) {
  const storage = await page.evaluate(() => {
    const keys = Object.keys(window.localStorage);
    return {
      keys,
      realSlot: Boolean(window.localStorage.getItem("@megacity_slot_1")),
      legacySlot: Boolean(window.localStorage.getItem("@megacity_save")),
      profileIndex: Boolean(
        window.localStorage.getItem("@megacity_profiles_index"),
      ),
      profileData: keys.some((key) => key.startsWith("@megacity_profile_")),
      activeProfile: Boolean(
        window.localStorage.getItem("@megacity_active_profile"),
      ),
    };
  });
  if (
    storage.realSlot ||
    storage.legacySlot ||
    storage.profileIndex ||
    storage.profileData ||
    storage.activeProfile
  ) {
    throw new Error(
      `Legacy ${economy} packaged fixture touched player profile or slot storage: ${JSON.stringify(storage)}`,
    );
  }
}

async function inspectLegacyProductionFacts(page, economy) {
  const facts = await page.evaluate((expectedEconomy) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const balance =
      [...document.querySelectorAll('[data-testid="production-balance-card"]')]
        .filter(visible)
        .map((card) => (card.innerText ?? "").trim())[0] ?? null;
    const cards = [
      ...document.querySelectorAll(
        '[data-testid="production-producer-card"], [data-testid="production-consumer-card"]',
      ),
    ]
      .filter(visible)
      .map((card) => (card.innerText ?? "").trim());
    return { expectedEconomy, balance, cards };
  }, economy);

  if (facts.cards.length === 0) {
    throw new Error(
      `Legacy ${economy} packaged fixture rendered no production cards: ${JSON.stringify(facts)}`,
    );
  }
  if (facts.cards.some((text) => !text.includes("NOT BUILT"))) {
    throw new Error(
      `Legacy ${economy} packaged fixture has a live production status: ${JSON.stringify(facts)}`,
    );
  }
  if (
    facts.cards.some((text) =>
      /(?:^|\n)\s*\d+ building(?:s)? built/i.test(text),
    )
  ) {
    throw new Error(
      `Legacy ${economy} packaged fixture invented a built-building total: ${JSON.stringify(facts)}`,
    );
  }

  if (economy === "civilian") {
    if (!facts.balance) {
      throw new Error(
        `Legacy civilian packaged fixture is missing its balance card: ${JSON.stringify(facts)}`,
      );
    }
    if (
      !/SUPPLY[\s\S]*~0\.0× per cycle/i.test(facts.balance) ||
      !/DEMAND[\s\S]*~0\.0× per cycle/i.test(facts.balance)
    ) {
      throw new Error(
        `Legacy civilian packaged fixture has non-zero supply/demand: ${JSON.stringify(facts)}`,
      );
    }
  } else if (facts.balance) {
    throw new Error(
      `Legacy military packaged fixture incorrectly rendered a civilian balance: ${JSON.stringify(facts)}`,
    );
  }

  return facts;
}

function launchEnvironment() {
  const env = {
    ...process.env,
    ELECTRON_DISABLE_SANDBOX: "1",
    MEGACITY_E2E_QUERY: FIXTURE_QUERY,
    MEGACITY_E2E_ROUTE: FIXTURE_ROUTE,
  };
  for (const key of [
    "MEGACITY_E2E_FIXTURE",
    "MEGACITY_E2E_CLOUD_FIXTURE",
    "MEGACITY_E2E_CLOUD_FIXTURE_DIR",
    "MEGACITY_E2E_CLOUD_SEED_DIR",
    "MEGACITY_E2E_CLOUD_SEED_PATH",
    "MEGACITY_E2E_CLOUD_SEED_FILENAME",
    "MEGACITY_E2E_SAVE_FAILURE",
  ]) {
    delete env[key];
  }
  return env;
}

async function run() {
  let browser;
  let userDataDirectory;
  const rendererErrors = [];
  try {
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-production-chains-legacy-"),
    );
    validateReleaseBundle();

    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: launchEnvironment(),
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
      if (message.type() === "error") {
        rendererErrors.push(`console.error: ${message.text()}`);
      }
    });

    console.log(
      `[e2e] launching packaged legacy production fixture (${RELEASE_EXECUTABLE ? "Windows release executable" : "Steam Electron shell"})`,
    );
    await waitForVisibleText(page, "PRODUCTION CHAINS");
    await assertNoPlayerSaveStorage(page, "civilian");
    await clickVisibleText(page, "Steel Ingot");
    await waitForVisibleText(page, "CIVILIAN STOCKPILE BALANCE");
    await waitForVisibleText(page, "NOT BUILT");
    const civilianFacts = await inspectLegacyProductionFacts(page, "civilian");
    await assertNoPlayerSaveStorage(page, "civilian");

    // Reload the same isolated fixture before checking military production so
    // the two economies remain independent.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForVisibleText(page, "PRODUCTION CHAINS");
    await assertNoPlayerSaveStorage(page, "military");
    await clickVisibleText(page, "Ammunition (Army)");
    await waitForVisibleText(page, "PRODUCED BY");
    await waitForVisibleText(page, "NOT BUILT");
    const militaryFacts = await inspectLegacyProductionFacts(page, "military");
    await assertNoPlayerSaveStorage(page, "military");

    console.log(
      `PASS: packaged legacy civilian supply and demand stay at zero with NOT BUILT cards (${civilianFacts.cards.length} cards)`,
    );
    console.log(
      `PASS: packaged legacy military production stays at zero with NOT BUILT cards (${militaryFacts.cards.length} cards)`,
    );
    console.log(
      "PASS: packaged legacy fixture left the real player profile and slots untouched",
    );
  } catch (error) {
    const details = rendererErrors.length
      ? `\nPackaged wrapper/renderer errors:\n${rendererErrors.join("\n")}`
      : "";
    throw new Error(`${errorMessage(error)}${details}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        throw new Error(
          `packaged legacy production smoke test left temporary profile behind: ${userDataDirectory}`,
        );
      }
    }
  }
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});