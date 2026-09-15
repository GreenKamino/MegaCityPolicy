// Packaged Electron smoke coverage for the exact 30% communications boundary.
//
// This launches the Steam shell around steam/web-build rather than the Expo
// browser workflow. The same script can target the local Electron runtime or
// an unpacked Windows release:
//
//   pnpm run test:e2e:packaged-communications
//   MEGACITY_REQUIRE_PACKAGED_COMMUNICATIONS_RELEASE=1 \
//   MEGACITY_RELEASE_EXECUTABLE=/path/to/game.exe \
//   node e2e/packagedCommunicationsBreakdown.e2e.mjs
//
// The release runner uses a dedicated preload capability because ordinary
// release builds must not accept arbitrary demo fixtures.
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
const PACKAGED_MODE =
  process.env.MEGACITY_RUN_PACKAGED_COMMUNICATIONS === "1" ||
  Boolean(RELEASE_EXECUTABLE);
const REQUIRE_RELEASE =
  process.env.MEGACITY_REQUIRE_PACKAGED_COMMUNICATIONS_RELEASE === "1";
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const FIXTURE_QUERY = "demo=1&boundarycomms=1";
const FIXTURE_ROUTE = "overview";
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (REQUIRE_RELEASE && process.platform !== "win32") {
  throw new Error(
    "the packaged communications release check requires a Windows runner",
  );
}
if (REQUIRE_RELEASE && !RELEASE_EXECUTABLE) {
  throw new Error(
    "MEGACITY_RELEASE_EXECUTABLE is required for the packaged communications release check",
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
    .evaluate(() => document.body?.innerText?.slice(0, 2500) ?? "(empty)")
    .catch(() => "(renderer unavailable)");
  throw new Error(`Timed out waiting for visible text "${text}". Visible text:\n${body}`);
}

async function readVisibleCommunicationsCard(page) {
  return page.evaluate(() => {
    const title = [...document.querySelectorAll("div, span")].find((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? "").trim() === "COMMUNICATIONS STRENGTH"
      );
    });
    if (!title) return null;

    let card = title;
    while (
      card.parentElement &&
      !(card.innerText ?? "").includes("CONTRIBUTING ASSETS")
    ) {
      card = card.parentElement;
    }
    const rect = card.getBoundingClientRect();
    return {
      text: card.innerText ?? "",
      visible: rect.width > 0 && rect.height > 0,
    };
  });
}

async function assertCommunicationsBreakdown(page, screenTitle) {
  await waitForVisibleText(page, screenTitle);
  const card = await (async () => {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const current = await readVisibleCommunicationsCard(page).catch(() => null);
      if (current?.visible) return current;
      await sleep(300);
    }
    throw new Error("Timed out waiting for the visible communications breakdown card");
  })();

  for (const text of [
    "COMMUNICATIONS STRENGTH",
    "DEGRADED",
    "30% signal integrity",
    "No low-signal corruption penalty at 30% or higher.",
  ]) {
    if (!card.text.includes(text)) {
      throw new Error(
        `packaged ${screenTitle} communications breakdown is missing "${text}". Card text:\n${card.text}`,
      );
    }
  }

  const signalMatch = card.text.match(/(\d+)% signal integrity/);
  const signalStrength = signalMatch ? Number(signalMatch[1]) : Number.NaN;
  if (signalStrength !== 30) {
    throw new Error(
      `packaged ${screenTitle} communications signal is not exactly 30%: ${signalMatch?.[0] ?? "missing signal percentage"}`,
    );
  }
  if (
    card.text.includes("CRITICAL") ||
    card.text.includes("Below 30%: +1 corruption per tick.")
  ) {
    throw new Error(
      `packaged ${screenTitle} exact-30% communications readout still shows a critical or corruption penalty: ${card.text}`,
    );
  }
  console.log(
    `[e2e] packaged ${screenTitle}: exact-30% communications boundary remains degraded without corruption penalty`,
  );
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
      `packaged communications fixture touched player save storage: ${JSON.stringify(saveKeys)}`,
    );
  }
}

async function runPackaged() {
  let browser;
  let userDataDirectory;
  const rendererErrors = [];
  try {
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-packaged-communications-"),
    );
    validateReleaseBundle();
    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SANDBOX: "1",
        MEGACITY_E2E_FIXTURE: "communications-boundary",
        MEGACITY_E2E_QUERY: FIXTURE_QUERY,
        MEGACITY_E2E_ROUTE: FIXTURE_ROUTE,
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
      `[e2e] launching packaged communications fixture (${RELEASE_EXECUTABLE ? "Windows release executable" : "Steam Electron shell"})`,
    );
    await assertCommunicationsBreakdown(page, "CITY STATUS MATRIX");
    await assertNoPlayerSaveStorage(page);

    await clickTestId(page, "top-nav-space");
    await assertCommunicationsBreakdown(page, "SPACE PROGRAM STATUS");
    await assertNoPlayerSaveStorage(page);

    if (rendererErrors.length) {
      throw new Error(
        `Packaged renderer emitted errors:\n${rendererErrors.join("\n")}`,
      );
    }
    console.log(
      "[e2e] PASS: packaged Overview and Space communications breakdowns preserve the exact 30% boundary without a low-signal corruption penalty",
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        throw new Error(
          `packaged communications smoke test left temporary profile behind: ${userDataDirectory}`,
        );
      }
    }
  }
}

async function run() {
  if (PACKAGED_MODE) {
    await runPackaged();
    return;
  }
  throw new Error(
    "packaged communications smoke test requires MEGACITY_RUN_PACKAGED_COMMUNICATIONS=1 or MEGACITY_RELEASE_EXECUTABLE",
  );
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});