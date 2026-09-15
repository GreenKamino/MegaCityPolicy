// Packaged Electron smoke coverage for district-command lock explanations.
//
// This launches the Steam shell around steam/web-build rather than the Expo
// browser workflow. The fixture is release-safe and only unlocks when the
// Electron preload explicitly opts into it.
//
// Run with:
//   pnpm run test:e2e:packaged-district-commands
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
  process.env.MEGACITY_RUN_PACKAGED_DISTRICT_COMMANDS === "1" ||
  Boolean(RELEASE_EXECUTABLE);
const REQUIRE_RELEASE =
  process.env.MEGACITY_REQUIRE_PACKAGED_DISTRICT_COMMANDS_RELEASE === "1";
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const FIXTURE_QUERY =
  "demo=1&districtcommands=1&districtcommandscase=gates&go=districts";
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (REQUIRE_RELEASE && process.platform !== "win32") {
  throw new Error(
    "the packaged district-command release check requires a Windows runner",
  );
}
if (REQUIRE_RELEASE && !RELEASE_EXECUTABLE) {
  throw new Error(
    "MEGACITY_RELEASE_EXECUTABLE is required for the packaged district-command release check",
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
        `packaged release manifest drifted for ${field} (source=${JSON.stringify(sourceManifest[field])}, packaged=${JSON.stringify(packagedManifest[field])})`,
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
  const marker = packagedManifest.fixtureMarkers?.districtCommands;
  if (typeof marker !== "string" || !entryText.includes(marker)) {
    throw new Error(
      `packaged release entry ${packagedManifest.entryBundle} is missing the district-command fixture marker ${JSON.stringify(marker)}; refresh with pnpm run steam:refresh-web`,
    );
  }
  console.log(
    `[e2e] verified packaged release manifest v${packagedManifest.appVersion} and district-command fixture marker`,
  );
}

async function hasVisibleText(page, text) {
  try {
    return await page.evaluate((targetText) => {
      const needle = targetText.trim().toUpperCase();
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      let node;
      while (node = walker.nextNode()) {
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
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        styles.display !== "none" &&
        styles.visibility !== "hidden"
      );
    };
    const matches = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter(visible)
      .filter(
        (element) =>
          ((element.innerText ?? element.textContent) ?? "")
            .trim()
            .toUpperCase() === needle,
      );
    const textElement = matches.sort(
      (a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length,
    )[0];
    if (!textElement) return false;
    let element = textElement;
    while (
      element &&
      element !== document.body &&
      element.getAttribute("aria-disabled") !== "true" &&
      element.getAttribute("role") !== "button" &&
      element.tagName !== "BUTTON"
    ) {
      element = element.parentElement;
    }
    if (!element || element === document.body) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function readDistrictCommandOption(page, label) {
  return page.evaluate((target) => {
    const exact = [...document.querySelectorAll("div, span, button")].find(
      (element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (element.innerText ?? "").trim().toUpperCase() ===
            target.toUpperCase()
        );
      },
    );
    if (!exact) return null;
    let element = exact;
    for (let i = 0; i < 12 && element; i += 1, element = element.parentElement) {
      const style = getComputedStyle(element);
      const text = (element.innerText ?? "").replace(/\s+/g, " ").trim();
      const isInteractive =
        element.getAttribute("aria-disabled") === "true" ||
        element.getAttribute("role") === "button" ||
        element.getAttribute("tabindex") === "0";
      if (isInteractive) {
        return {
          text,
          disabled:
            element.getAttribute("aria-disabled") === "true" ||
            Number.parseFloat(style.opacity) <= 0.5,
        };
      }
    }
    return {
      text: (exact.parentElement?.innerText ?? "").replace(/\s+/g, " ").trim(),
      disabled: false,
    };
  }, label);
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
      `packaged district-command fixture touched player save storage: ${JSON.stringify(saveKeys)}`,
    );
  }
}

async function runPackaged() {
  let browser;
  let userDataDirectory;
  const rendererErrors = [];
  try {
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-packaged-district-commands-"),
    );
    validateReleaseBundle();
    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SANDBOX: "1",
        MEGACITY_E2E_FIXTURE: "district-commands",
        MEGACITY_E2E_QUERY: FIXTURE_QUERY,
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
      `[e2e] launching packaged district-command fixture (${RELEASE_EXECUTABLE ? "Windows release executable" : "Steam Electron shell"})`,
    );
    await waitForVisibleText(page, "DISTRICTS");
    await clickVisibleText(page, "Worker Housing Sector");
    await waitForVisibleText(page, "GANG INFLUENCE");
    await clickVisibleText(page, "OPEN DISTRICT COMMANDS");
    await waitForVisibleText(page, "DISTRICT COMMANDS");

    const blockedReasons = [
      ["SEAL THE BLOCK", "Needs crime ≥ 60 or unrest ≥ 60 (current: crime 20, unrest 10)"],
      [
        "RELIEF ALLOCATION",
        "Needs unrest ≥ 30 or wealth ≤ 25 or loyalty ≤ 35 or infrastructure ≤ 40 (current: unrest 10, wealth 50, loyalty 50, infrastructure 49)",
      ],
      [
        "GRID SWEEP",
        "Needs infrastructure ≥ 50 (current: infrastructure 49); Needs crime ≥ 30 or gang influence ≥ 30 (current: crime 20, gang influence 29)",
      ],
      ["CASEFILE AMNESTY", "Needs crime ≥ 30 or unrest ≥ 30 (current: crime 20, unrest 10)"],
    ];
    for (const [label, reason] of blockedReasons) {
      const option = await readDistrictCommandOption(page, label);
      if (!option?.disabled || !option.text.includes(reason)) {
        throw new Error(
          `packaged ${label} lock explanation is missing or incorrect. ` +
            `Expected "${reason}", got ${JSON.stringify(option)}`,
        );
      }
      console.log(`[e2e] packaged ${label}: locked with local values`);
    }

    await assertNoPlayerSaveStorage(page);
    if (rendererErrors.length) {
      throw new Error(
        `Packaged renderer emitted errors:\n${rendererErrors.join("\n")}`,
      );
    }
    console.log(
      "[e2e] PASS: packaged district commands preserve all four local lock explanations without writing a player save",
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        throw new Error(
          `packaged district-command smoke test left temporary profile behind: ${userDataDirectory}`,
        );
      }
    }
  }
}

async function run() {
  if (!PACKAGED_MODE) {
    throw new Error(
      "packaged district-command smoke test requires MEGACITY_RUN_PACKAGED_DISTRICT_COMMANDS=1 or MEGACITY_RELEASE_EXECUTABLE",
    );
  }
  await runPackaged();
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});