// Packaged Electron smoke coverage for both save-and-quit outcomes.
// This launches the actual Steam shell around the checked-in web-build, then
// exercises the real save path and the test-only failure path through the
// preload bridge.
//
//   node e2e/desktopSaveFailure.e2e.mjs
//
// The Electron runtime is installed in steam/node_modules by the Steam build
// setup. The test intentionally does not use the browser preview workflow.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import puppeteer from "puppeteer";

const STEAM_DIR = resolve(import.meta.dirname, "..", "steam");
const ELECTRON_PATH =
  process.env.ELECTRON_PATH ??
  resolve(STEAM_DIR, "node_modules", "electron", "dist", "electron");

if (!existsSync(ELECTRON_PATH)) {
  throw new Error(
    `Electron runtime not found at ${ELECTRON_PATH}. Install Steam shell dependencies first.`,
  );
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function hasVisibleText(page, text) {
  return page.evaluate((needle) => {
    const target = needle.toUpperCase();
    return [...document.querySelectorAll("div, span, button")].some((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? element.textContent ?? "").trim().toUpperCase() === target
      );
    });
  }, text);
}

async function waitForVisibleText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await hasVisibleText(page, text)) return;
    } catch {
      // The app can replace the initial document while Expo Router redirects.
    }
    await sleep(300);
  }
  const body = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) ?? "(empty)");
  throw new Error(`Timed out waiting for "${text}". Visible text:\n${body}`);
}

async function clickVisibleText(page, text, { allowContextDestroyed = false } = {}) {
  try {
    await page.locator(`::-p-text(${JSON.stringify(text)})`).click();
  } catch (error) {
    // A successful SAVE & QUIT closes the native window synchronously from
    // inside the click handler, so Chromium can destroy this execution
    // context before page.evaluate resolves. That is the expected terminal
    // result for this one click, not a failed interaction.
    if (/execution context was destroyed/i.test(error?.message ?? "")) {
      return;
    }
    throw error;
  }
}

async function launchPackagedShell({ saveFailure }) {
  console.log(
    `[e2e] launching packaged shell (${saveFailure ? "save failure" : "save success"}): ${ELECTRON_PATH}`,
  );
  const userDataDir = mkdtempSync(join(tmpdir(), "megacity-save-e2e-"));
  try {
    const browser = await puppeteer.launch({
      executablePath: ELECTRON_PATH,
      headless: true,
      cwd: STEAM_DIR,
      userDataDir,
      env: {
        ...process.env,
        MEGACITY_E2E_QUERY: "fixture=save-and-quit",
        MEGACITY_E2E_ROUTE: "more",
        MEGACITY_E2E_FIXTURE: "save-and-quit",
        MEGACITY_E2E_SAVE_FAILURE: saveFailure ? "1" : "0",
        ELECTRON_DISABLE_SANDBOX: "1",
      },
      args: [STEAM_DIR, "--no-sandbox", "--disable-dev-shm-usage"],
      dumpio: false,
    });
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
    page.on("pageerror", (error) => console.error(`[e2e] page error: ${error.message}`));
    return { browser, page, userDataDir };
  } catch (error) {
    rmSync(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

async function waitForWindowClose(page, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!page.isClosed() && Date.now() < deadline) await sleep(100);
  if (!page.isClosed()) throw new Error("SAVE & QUIT did not close the packaged window");
}

async function runSuccessfulSaveAndQuit() {
  const { browser, page, userDataDir } = await launchPackagedShell({ saveFailure: false });

  try {
    await waitForVisibleText(page, "QUIT TO DESKTOP");
    await clickVisibleText(page, "QUIT TO DESKTOP");
    await waitForVisibleText(page, "SAVE & QUIT");
    await clickVisibleText(page, "SAVE & QUIT", { allowContextDestroyed: true });

    // A real save must reach the Electron quit bridge without presenting the
    // failure decision prompt.
    const deadline = Date.now() + 120000;
    while (!page.isClosed() && Date.now() < deadline) {
      let saveFailed = false;
      try {
        saveFailed = await hasVisibleText(page, "SAVE FAILED");
      } catch {
        // The page can close between the loop condition and evaluation after
        // the quit bridge receives the successful save result.
        if (page.isClosed()) break;
        // Electron can destroy the renderer execution context a few moments
        // before Puppeteer observes the BrowserWindow closing. Keep polling
        // during that narrow teardown window instead of reporting a false
        // save failure.
      }
      if (saveFailed) {
        throw new Error("SAVE & QUIT showed SAVE FAILED after a successful save");
      }
      await sleep(100);
    }
    if (!page.isClosed()) throw new Error("SAVE & QUIT did not close the packaged window");
    console.log("[e2e] PASS: packaged successful SAVE & QUIT flow");
  } finally {
    await browser.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function runSaveFailureDecisionFlow() {
  const { browser, page, userDataDir } = await launchPackagedShell({ saveFailure: true });

  try {
    await waitForVisibleText(page, "QUIT TO DESKTOP");
    await clickVisibleText(page, "QUIT TO DESKTOP");
    await waitForVisibleText(page, "SAVE & QUIT");
    await clickVisibleText(page, "SAVE & QUIT");

    // The failed save must keep the native window alive and replace the first
    // modal with the destructive decision prompt.
    await waitForVisibleText(page, "SAVE FAILED");
    if (page.isClosed()) throw new Error("Window closed after the simulated save failure");
    console.log("[e2e] SAVE & QUIT kept the packaged window open");

    await clickVisibleText(page, "CANCEL");
    await waitForVisibleText(page, "QUIT TO DESKTOP");
    if (page.isClosed()) throw new Error("CANCEL closed the packaged window");
    console.log("[e2e] CANCEL kept the packaged window open");

    await clickVisibleText(page, "QUIT TO DESKTOP");
    await waitForVisibleText(page, "SAVE & QUIT");
    await clickVisibleText(page, "SAVE & QUIT");
    await waitForVisibleText(page, "SAVE FAILED");
    await clickVisibleText(page, "QUIT ANYWAY");

    await waitForWindowClose(page);
    console.log("[e2e] PASS: packaged save-failure prompt decision flow");
  } finally {
    await browser.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function run() {
  await runSuccessfulSaveAndQuit();
  await runSaveFailureDecisionFlow();
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${error.message}`);
  process.exitCode = 1;
});