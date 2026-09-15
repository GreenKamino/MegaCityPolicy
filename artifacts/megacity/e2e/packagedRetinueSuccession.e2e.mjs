// Packaged Electron smoke coverage for captain succession. The fixture
// starts with one active captain, one unassigned eligible replacement, and
// two troops already assigned to the same squad.
//
// Run with:
//   pnpm run test:e2e:packaged-retinue-succession
//
// To exercise an unpacked Windows release instead of the local Electron
// runtime, set MEGACITY_RELEASE_EXECUTABLE to its game.exe path.

import { existsSync } from "node:fs";
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
const FIXTURE_QUERY = "fixture=retinue-succession";
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (!existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}. Install Steam shell dependencies or set MEGACITY_RELEASE_EXECUTABLE.`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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
    // Electron can replace the initial document while the app:// protocol
    // finishes loading.
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
      // Prefer the smallest exact text node. This avoids clicking a screen
      // container when both it and its button have the same label.
      .sort((a, b) => {
        const aArea =
          a.control.getBoundingClientRect().width *
          a.control.getBoundingClientRect().height;
        const bArea =
          b.control.getBoundingClientRect().width *
          b.control.getBoundingClientRect().height;
        return aArea - bArea;
      });
    const element = nodes[0]?.control;
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text control: ${text}`);
}

async function clickAriaLabel(page, label) {
  const clicked = await page.evaluate((targetLabel) => {
    const needle = targetLabel.trim().toUpperCase();
    const element = [...document.querySelectorAll("[aria-label]")].find(
      (node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (node.getAttribute("aria-label") ?? "").trim().toUpperCase() === needle
        );
      },
    );
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not click aria-label: ${label}`);
}

async function clickModalButton(page, text) {
  const clicked = await page.evaluate((targetText) => {
    const needle = targetText.trim().toUpperCase();
    const controls = [...document.querySelectorAll("[tabindex='0'], button, [role='button']")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (element.innerText ?? element.textContent ?? "").trim().toUpperCase() ===
            needle
        );
      });
    // React Native Web's Modal does not expose a dialog role here. Its
    // controls are appended after the screen, so the last matching control
    // is the visible modal action rather than the covered screen action.
    const element = controls.at(-1);
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click modal button: ${text}`);
}

async function waitForTextToDisappear(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await hasVisibleText(page, text))) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for "${text}" to disappear`);
}

async function run() {
  let browser;
  const userDataDirectories = [];
  const rendererErrors = [];

  try {
    const firstUserDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-packaged-retinue-succession-"),
    );
    userDataDirectories.push(firstUserDataDirectory);
    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: {
        ...process.env,
        MEGACITY_E2E_QUERY: FIXTURE_QUERY,
        MEGACITY_E2E_ROUTE: "retinue",
        MEGACITY_E2E_FIXTURE: "retinue-succession",
        ELECTRON_DISABLE_SANDBOX: "1",
      },
      args: [
        ...(RELEASE_EXECUTABLE ? [] : [STEAM_DIR]),
        "--no-sandbox",
        "--disable-dev-shm-usage",
        `--user-data-dir=${firstUserDataDirectory}`,
      ],
      dumpio: false,
    });
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
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
      `[e2e] launching packaged succession fixture (${RELEASE_EXECUTABLE ? "release executable" : "Steam Electron shell"})`,
    );
    await waitForVisibleText(page, "RETINUE COMMAND");
    await clickAriaLabel(page, "SQUADS");
    await waitForVisibleText(page, "SUCCESSION WATCH");
    await waitForVisibleText(page, "2/6 troops");
    await waitForVisibleText(page, "CAPTAIN VOSS");
    await clickAriaLabel(page, "Assign a deputy for SUCCESSION WATCH");
    await waitForVisibleText(page, "ASSIGN DEPUTY");
    await clickVisibleText(page, "CAPTAIN ORIN — LV.1");
    await waitForVisibleText(page, "DEPUTY: CAPTAIN ORIN");
    console.log("[e2e] deputy assignment is visible on the squad");

    await clickAriaLabel(page, "OVERVIEW");
    await clickAriaLabel(page, "Dismiss captain CAPTAIN VOSS");
    await waitForVisibleText(page, "DISMISS CAPTAIN?");
    await clickModalButton(page, "DISMISS");
    await clickAriaLabel(page, "SQUADS");
    await waitForVisibleText(page, "CAPTAIN ORIN");
    await waitForVisibleText(page, "2/6 troops");
    await waitForVisibleText(page, "Infantry");
    await waitForVisibleText(page, "Heavy Gunner");
    await waitForTextToDisappear(page, "LEADERLESS");
    console.log("[e2e] dismissing the captain promotes the deputy and keeps both troops");

    // Use a fresh disposable profile for the no-deputy branch so the two
    // succession outcomes remain independent and deterministic.
    await browser.close();
    browser = null;

    await rm(firstUserDataDirectory, { recursive: true, force: true });
    const secondUserDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-packaged-retinue-leaderless-"),
    );
    userDataDirectories.push(secondUserDataDirectory);
    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: {
        ...process.env,
        MEGACITY_E2E_QUERY: FIXTURE_QUERY,
        MEGACITY_E2E_ROUTE: "retinue",
        MEGACITY_E2E_FIXTURE: "retinue-succession",
        ELECTRON_DISABLE_SANDBOX: "1",
      },
      args: [
        ...(RELEASE_EXECUTABLE ? [] : [STEAM_DIR]),
        "--no-sandbox",
        "--disable-dev-shm-usage",
        `--user-data-dir=${secondUserDataDirectory}`,
      ],
      dumpio: false,
    });
    const secondPage = (await browser.pages())[0] ?? (await browser.newPage());
    await secondPage.setViewport(VIEWPORT);
    secondPage.on("pageerror", (error) => {
      rendererErrors.push(`pageerror: ${errorMessage(error)}`);
    });
    secondPage.on("error", (error) => {
      rendererErrors.push(`renderer crashed: ${errorMessage(error)}`);
    });
    secondPage.on("console", (message) => {
      if (message.type() === "error") {
        rendererErrors.push(`console.error: ${message.text()}`);
      }
    });

    await waitForVisibleText(secondPage, "RETINUE COMMAND");
    await clickAriaLabel(secondPage, "SQUADS");
    await clickAriaLabel(secondPage, "Assign a deputy for SUCCESSION WATCH");
    await waitForVisibleText(secondPage, "ASSIGN DEPUTY");
    await clickVisibleText(secondPage, "CAPTAIN ORIN — LV.1");
    await clickAriaLabel(secondPage, "OVERVIEW");
    await clickAriaLabel(secondPage, "Dismiss captain CAPTAIN VOSS");
    await waitForVisibleText(secondPage, "DISMISS CAPTAIN?");
    await clickModalButton(secondPage, "DISMISS");
    await clickAriaLabel(secondPage, "Dismiss captain CAPTAIN ORIN");
    await waitForVisibleText(secondPage, "DISMISS CAPTAIN?");
    await clickModalButton(secondPage, "DISMISS");
    await clickAriaLabel(secondPage, "SQUADS");
    // This is the no-deputy branch after the first dismissal promoted the
    // deputy and the second dismissal removed the promoted captain.
    await waitForVisibleText(secondPage, "LEADERLESS");
    await waitForVisibleText(secondPage, "20 × 1 doctrine × 0.75 leaderless = 15 combat power");
    await waitForVisibleText(secondPage, "2/6 troops");
    console.log("[e2e] leaderless squad shows the bounded 25% power penalty");

    await clickAriaLabel(secondPage, "Appoint a captain for SUCCESSION WATCH");
    await waitForVisibleText(secondPage, "APPOINT CAPTAIN");
    await clickVisibleText(secondPage, "CAPTAIN HALE — LV.1");
    await waitForVisibleText(secondPage, "CAPTAIN HALE");
    await waitForTextToDisappear(secondPage, "LEADERLESS");
    await waitForVisibleText(secondPage, "43 × 1 doctrine = 43 combat power");
    await waitForVisibleText(secondPage, "2/6 troops");

    await clickAriaLabel(secondPage, "Disband squad SUCCESSION WATCH");
    await waitForVisibleText(secondPage, "DISBAND SQUAD?");
    await clickModalButton(secondPage, "DISBAND");
    await waitForVisibleText(secondPage, "No squads formed");
    await clickAriaLabel(secondPage, "ROSTER");
    await waitForVisibleText(secondPage, "ALL TROOPS (2)");
    await waitForVisibleText(secondPage, "Standing by — awaiting orders");
    await waitForVisibleText(secondPage, "Infantry");
    await waitForVisibleText(secondPage, "Heavy Gunner");
    await waitForTextToDisappear(secondPage, "[SUCCESSION WATCH]");
    console.log("[e2e] restored squad can be intentionally disbanded without losing troops");

    if (rendererErrors.length) {
      throw new Error(
        `Packaged renderer emitted errors:\n${rendererErrors.join("\n")}`,
      );
    }
    console.log(
      "[e2e] PASS: packaged captain succession preserves the squad roster and leaderless penalty",
    );
  } catch (error) {
    const details = rendererErrors.length
      ? `\nRenderer errors:\n${rendererErrors.join("\n")}`
      : "";
    console.error(`[e2e] FAIL: ${errorMessage(error)}${details}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    for (const userDataDirectory of userDataDirectories) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        console.error(
          `[e2e] FAIL: packaged succession smoke test left temporary profile behind: ${userDataDirectory}`,
        );
        process.exitCode = 1;
      }
    }
  }
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});