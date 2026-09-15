// Browser regression coverage for active-contract recovery guidance on the
// real Expo screen. The contracts fixture supplies a stalled housing award at
// 30% progress; with a 3,000-credit upfront deposit and the 25% expiry policy,
// the visible projection must be +525 cr. This is a read-only fixture and must
// not create a player save slot.
//
// Requires the "artifacts/megacity: expo" workflow for browser mode.
//   node e2e/contractRecoveryGuidance.e2e.mjs
//
// Packaged mode uses the Steam Electron shell when
// MEGACITY_RUN_PACKAGED_CONTRACT_RECOVERY=1 and optionally launches an unpacked
// Windows release when MEGACITY_RELEASE_EXECUTABLE points at game.exe.

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
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
const REQUIRE_RELEASE =
  process.env.MEGACITY_RUN_PACKAGED_CONTRACT_RECOVERY === "1";
const PACKAGED_MODE = Boolean(
  RELEASE_EXECUTABLE || process.env.MEGACITY_RUN_PACKAGED_CONTRACT_RECOVERY === "1",
);
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const CONTRACTS_URL = `${BASE_URL}/?demo=1&contracts=1&go=contracts`;
const FIXTURE_QUERY = "demo=1&contracts=1&go=contracts";
const EXPECTED_RECOVERY = "+525 cr";
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };

if (REQUIRE_RELEASE && process.platform !== "win32") {
  throw new Error(
    "the packaged contract recovery release check requires a Windows runner",
  );
}
if (REQUIRE_RELEASE && !RELEASE_EXECUTABLE) {
  throw new Error(
    "MEGACITY_RELEASE_EXECUTABLE is required for the packaged contract recovery release check",
  );
}

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPath(page, suffix, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith(suffix)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for path ${suffix}; current URL: ${page.url()}`);
}

async function waitForVisibleText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await page.evaluate((target) => {
      const needle = target.toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    }, text).catch(() => false);
    if (visible) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForVisibleElementText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await page.evaluate((target) => {
      const needle = target.toUpperCase();
      return [...document.querySelectorAll("div, span, button, [role='button']")].some((element) => {
        const rect = element.getBoundingClientRect();
        return (
          (element.innerText ?? element.textContent ?? "").trim().toUpperCase() === needle &&
          rect.width > 0 &&
          rect.height > 0
        );
      });
    }, text).catch(() => false);
    if (visible) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible element text: ${text}`);
}

async function scrollTextIntoView(page, text) {
  const found = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
      const element = node.parentElement;
      if (!element) continue;
      element.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
    }
    return false;
  }, text);
  if (!found) throw new Error(`Could not scroll visible text into view: ${text}`);
}

async function readGuidance(page) {
  return page.evaluate((expectedRecovery) => {
    const targetFragment = "AT CURRENT PROGRESS";
    const candidates = [...document.querySelectorAll("div, span")].filter((element) => {
      const text = (element.innerText ?? element.textContent ?? "").toUpperCase();
      const rect = element.getBoundingClientRect();
      return (
        text.includes(targetFragment) &&
        text.includes(expectedRecovery.toUpperCase()) &&
        text.includes("VOLUNTARY CANCELLATION REMAINS NON-REFUNDABLE") &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    const element = candidates.sort(
      (a, b) => (a.innerText ?? a.textContent ?? "").length - (b.innerText ?? b.textContent ?? "").length,
    )[0];
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      text: (element.innerText ?? element.textContent ?? "").trim(),
      rect: {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }, EXPECTED_RECOVERY);
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
    throw new Error(`Contracts fixture touched player save storage: ${JSON.stringify(saveKeys)}`);
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
      `could not read the source or packaged release manifest: ${error.message}`,
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
    `[e2e] verified unpacked release manifest v${packagedManifest.appVersion}: ${packagedManifest.entryBundle}`,
  );
}

function attachRendererErrorHandlers(page, rendererErrors) {
  page.on("pageerror", (error) => {
    rendererErrors.push(`pageerror: ${String(error)}`);
  });
  page.on("error", (error) => {
    rendererErrors.push(`renderer crashed: ${String(error)}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      rendererErrors.push(`console.error: ${message.text()}`);
    }
  });
}

async function assertContractGuidance(page, { packaged, rendererErrors }) {
  if (packaged) {
    await waitForVisibleText(page, "CONTRACTS / PROCUREMENT", 120000);
  } else {
    await page.setViewport({ width: 400, height: 720, deviceScaleFactor: 1 });
    await page.goto(CONTRACTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForPath(page, "/contracts");
  }
  await page.setViewport({ width: 400, height: 720, deviceScaleFactor: 1 });
  await waitForVisibleText(page, "CONTRACTS / PROCUREMENT");
  await waitForVisibleElementText(page, "ACTIVE (2)");
  await waitForVisibleText(page, "STALLED — CREWS AWAITING MATERIALS");

  await scrollTextIntoView(page, "At current progress, recovery would be");
  const guidance = await readGuidance(page);
  if (!guidance) {
    throw new Error("The stalled active-contract card did not render complete recovery guidance");
  }
  if (
    guidance.rect.left < -1 ||
    guidance.rect.right > guidance.viewport.width + 1 ||
    guidance.rect.top < 0 ||
    guidance.rect.bottom > guidance.viewport.height
  ) {
    throw new Error(`Recovery guidance was clipped or off-screen: ${JSON.stringify(guidance)}`);
  }
  if (!guidance.text.includes(EXPECTED_RECOVERY)) {
    throw new Error(`Recovery projection was incorrect: ${guidance.text}`);
  }
  if (!/voluntary cancellation remains non-refundable/i.test(guidance.text)) {
    throw new Error(`Cancellation guidance was missing: ${guidance.text}`);
  }
  await assertNoPlayerSaveStorage(page);

  if (rendererErrors.length) {
    throw new Error(
      `${packaged ? "Packaged renderer" : "Browser"} errors during contract guidance check:\n${rendererErrors.join("\n")}`,
    );
  }
  console.log(
    `[e2e] PASS: ${packaged ? "packaged " : ""}stalled active contract visibly shows ${EXPECTED_RECOVERY} projected scrap recovery and non-refundable cancellation without touching a player save`,
  );
}

async function runBrowser() {
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context =
    typeof browser.createBrowserContext === "function"
      ? await browser.createBrowserContext()
      : await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  const browserErrors = [];
  attachRendererErrorHandlers(page, browserErrors);
  try {
    await assertContractGuidance(page, {
      packaged: false,
      rendererErrors: browserErrors,
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function runPackaged() {
  let userDataDirectory;
  let browser;
  try {
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-packaged-contract-recovery-"),
    );
    validateReleaseBundle();
    const launchEnv = {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: "1",
      MEGACITY_E2E_QUERY: FIXTURE_QUERY,
    };
    for (const key of [
      "MEGACITY_E2E_ROUTE",
      "MEGACITY_E2E_FIXTURE",
      "MEGACITY_E2E_CLOUD_FIXTURE",
      "MEGACITY_E2E_CLOUD_FIXTURE_DIR",
      "MEGACITY_E2E_CLOUD_SEED_DIR",
      "MEGACITY_E2E_CLOUD_SEED_PATH",
      "MEGACITY_E2E_SAVE_FAILURE",
    ]) {
      delete launchEnv[key];
    }

    const rendererErrors = [];
    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: launchEnv,
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
    attachRendererErrorHandlers(page, rendererErrors);

    console.log(
      `[e2e] launching packaged contract fixture (${RELEASE_EXECUTABLE ? "release executable" : "Steam Electron shell"})`,
    );
    await assertContractGuidance(page, {
      packaged: true,
      rendererErrors,
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        throw new Error(
          `packaged contract recovery smoke test left its temporary profile behind: ${userDataDirectory}`,
        );
      }
    }
  }
}

async function run() {
  if (PACKAGED_MODE && !existsSync(LAUNCH_EXECUTABLE)) {
    throw new Error(
      `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}. Install Steam shell dependencies or set MEGACITY_RELEASE_EXECUTABLE.`,
    );
  }
  if (PACKAGED_MODE) {
    await runPackaged();
  } else {
    await runBrowser();
  }
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
