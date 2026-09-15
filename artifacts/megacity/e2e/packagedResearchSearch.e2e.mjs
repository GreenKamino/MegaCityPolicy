// Packaged Electron smoke coverage for the research screen's cross-category
// search. This launches the Steam shell around the prepared web-build rather
// than the Expo browser workflow.
//
// Run with:
//   pnpm run test:e2e:packaged-research-search
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
const FIXTURE_QUERY = "demo=1&go=research";
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
    }, text);
  } catch {
    // Electron can replace the document while the app:// protocol finishes
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
    .evaluate(() => document.body?.innerText?.slice(0, 2000) ?? "(empty)")
    .catch(() => "(renderer unavailable)");
  throw new Error(`Timed out waiting for visible text "${text}". Visible text:\n${body}`);
}

async function clickEnergyCategory(page) {
  const clicked = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll('div, span, button, [role="button"]'),
    );
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const textOf = (node) =>
      ((node.innerText ?? node.textContent) || "").trim().toUpperCase();
    const matches = nodes.filter(
      (node) =>
        isVisible(node) && /^ENERGY\s+\d+\/\d+$/.test(textOf(node)),
    );
    const element = matches.sort(
      (a, b) => textOf(a).length - textOf(b).length,
    )[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  });
  if (!clicked) throw new Error("Could not click the visible ENERGY category chip");
}

async function waitForInputValue(page, expected, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await page
      .$eval(
        'input[aria-label="SEARCH TECHNOLOGIES..."]',
        (input) => input.value,
      )
      .catch(() => null);
    if (value === expected) return;
    await sleep(200);
  }
  throw new Error(`Search input did not reach expected value: ${expected}`);
}

async function readResearchBreakdown(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const formula = text.match(
      /OUTPUT BREAKDOWN\s+([\d.]+) base pts\s+×\s+([\d.]+)\s*=\s*([\d.]+) applied/,
    );
    const researchRate = text.match(/Research Rate\s+([\d.]+) pts\/tick/);
    const facilities = text.match(/Research facilities\s+\+([\d.]+) pts/);
    const corporations = text.match(/Licensed corporations\s+\+([\d.]+) pts/);
    const specialists = text.match(/Research specialists\s+\+([\d.]+) pts/);
    if (
      !formula ||
      !researchRate ||
      !facilities ||
      !corporations ||
      !specialists
    ) {
      return null;
    }
    return {
      rawPoints: Number(formula[1]),
      multiplier: Number(formula[2]),
      applied: Number(formula[3]),
      researchRate: Number(researchRate[1]),
      facilities: Number(facilities[1]),
      corporations: Number(corporations[1]),
      specialists: Number(specialists[1]),
    };
  });
}

async function assertResearchBreakdown(page) {
  await waitForVisibleText(page, "OUTPUT BREAKDOWN");
  const breakdown = await readResearchBreakdown(page);
  if (!breakdown) {
    throw new Error(
      "research breakdown labels or formula were not readable in the packaged renderer",
    );
  }

  const contributorTotal =
    breakdown.facilities + breakdown.corporations + breakdown.specialists;
  if (Math.abs(contributorTotal - breakdown.rawPoints) > 0.011) {
    throw new Error(
      "packaged research contributor rows do not match base output: " +
        `${contributorTotal} !== ${breakdown.rawPoints}`,
    );
  }
  if (breakdown.applied !== breakdown.researchRate) {
    throw new Error(
      "packaged research applied output does not match Research Rate: " +
        `${breakdown.applied} !== ${breakdown.researchRate}`,
    );
  }
  if (
    breakdown.rawPoints < 0 ||
    breakdown.multiplier < 0 ||
    breakdown.applied < 0 ||
    Math.abs(breakdown.rawPoints * breakdown.multiplier - breakdown.applied) >=
      1.5
  ) {
    throw new Error(
      "packaged research formula is not numerically coherent: " +
        `${breakdown.rawPoints} × ${breakdown.multiplier} != ${breakdown.applied}`,
    );
  }
  console.log(
    "[e2e] packaged research breakdown is coherent: " +
      `${breakdown.rawPoints} × ${breakdown.multiplier} = ${breakdown.applied}; ` +
      `contributors=${contributorTotal}`,
  );
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
      `packaged research fixture touched player save storage: ${JSON.stringify(saveKeys)}`,
    );
  }
}

async function run() {
  let userDataDirectory;
  let browser;
  let page;
  const rendererErrors = [];

  try {
    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-packaged-research-search-"),
    );
    const launchEnv = {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: "1",
      MEGACITY_E2E_QUERY: FIXTURE_QUERY,
    };
    for (const key of [
      "MEGACITY_E2E_ROUTE",
      "MEGACITY_E2E_CLOUD_FIXTURE",
      "MEGACITY_E2E_CLOUD_FIXTURE_DIR",
      "MEGACITY_E2E_CLOUD_SEED_DIR",
      "MEGACITY_E2E_CLOUD_SEED_PATH",
      "MEGACITY_E2E_CLOUD_SEED_FILENAME",
      "MEGACITY_E2E_SAVE_FAILURE",
    ]) {
      delete launchEnv[key];
    }
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
    const pages = await browser.pages();
    page = pages[0] ?? (await browser.newPage());
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
      `[e2e] launching packaged research fixture (${RELEASE_EXECUTABLE ? "release executable" : "Steam Electron shell"})`,
    );
    await waitForVisibleText(page, "TECHNOLOGY TREE");
    await page.waitForSelector(
      'input[aria-label="SEARCH TECHNOLOGIES..."]',
      { timeout: 30000 },
    );
    await assertResearchBreakdown(page);
    await assertNoPlayerSaveStorage(page);
    console.log(
      "[e2e] packaged research fixture shows output breakdown, applied rate, corporation, and specialist rows without a player save",
    );

    await clickEnergyCategory(page);
    await waitForVisibleText(page, "Advanced Fusion Reactors");
    console.log("[e2e] selected ENERGY category shows an energy technology");

    const searchInput = await page.$(
      'input[aria-label="SEARCH TECHNOLOGIES..."]',
    );
    if (!searchInput) throw new Error("Research search input was not found");
    await searchInput.click();
    await searchInput.type("Magnetic Rail Transit");
    await waitForInputValue(page, "Magnetic Rail Transit");
    await waitForVisibleText(page, "Magnetic Rail Transit");
    await waitForVisibleText(page, "TRANSPORTATION");
    console.log("[e2e] cross-category search shows the result and category label");

    const clearButton = await page.$('[aria-label="Clear search"]');
    if (!clearButton) throw new Error("Clear search button did not appear");
    await clearButton.click();
    await waitForInputValue(page, "");
    await waitForVisibleText(page, "Advanced Fusion Reactors");

    if (await hasVisibleText(page, "Magnetic Rail Transit")) {
      throw new Error(
        "Clearing search did not restore the selected ENERGY category",
      );
    }
    await assertNoPlayerSaveStorage(page);
    console.log(
      "[e2e] clearing search restores ENERGY and removes the transport result",
    );

    if (rendererErrors.length) {
      throw new Error(
        `Packaged renderer emitted errors:\n${rendererErrors.join("\n")}`,
      );
    }
    console.log("[e2e] PASS: packaged research search completed without renderer errors");
  } catch (error) {
    const details = rendererErrors.length
      ? `\nRenderer errors:\n${rendererErrors.join("\n")}`
      : "";
    console.error(`[e2e] FAIL: ${errorMessage(error)}${details}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        console.error(
          `[e2e] FAIL: packaged research smoke test left temporary profile behind: ${userDataDirectory}`,
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