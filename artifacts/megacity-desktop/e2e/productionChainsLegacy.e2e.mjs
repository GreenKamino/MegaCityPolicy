// Desktop-wrapper regression for legacy saves that omit production building
// keys. The fixture is intentionally opened in a disposable browser context:
// it must exercise the packaged desktop route without creating a real player
// profile or slot.
//
// Run with:
//   E2E_BASE_URL=http://localhost:80/desktop node e2e/productionChainsLegacy.e2e.mjs
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:80/desktop";
const BASE_PATH = BASE_URL.replace(/\/$/, "");
const FIXTURE_URL =
  `${BASE_PATH}/?demo=1&legacyproduction=1&go=production-chains`;
const DESKTOP_VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1 };
const READY_TIMEOUT_MS =
  Number(process.env.E2E_DESKTOP_READY_TIMEOUT_MS) || 120000;
const POLL_INTERVAL_MS = 500;

function resolveChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return execSync("which chromium-browser", { encoding: "utf8" }).trim();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

async function readDesktopDiagnostics(page) {
  return page.evaluate(() => {
    const overlays = [
      ...document.querySelectorAll('[role="alert"], [role="status"]'),
    ]
      .map((element) => (element.innerText ?? "").trim())
      .filter(Boolean);
    const iframe = document.querySelector("iframe");
    return {
      overlays,
      iframeSrc: iframe?.getAttribute("src") ?? null,
      iframeReadyState: iframe?.contentDocument?.readyState ?? null,
    };
  });
}

async function waitFor(predicate, step, page, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let lastFailure = "";
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastFailure = errorMessage(error);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  let diagnostics = "";
  try {
    diagnostics = ` State: ${JSON.stringify(await readDesktopDiagnostics(page))}`;
  } catch (error) {
    diagnostics = ` Could not read wrapper state: ${errorMessage(error)}`;
  }
  throw new Error(
    `Timed out after ${timeout}ms while ${step}.${lastFailure ? ` Last probe error: ${lastFailure}.` : ""}${diagnostics}`,
  );
}

async function findGameFrame(page, step = "waiting for the embedded game frame") {
  return waitFor(
    () =>
      page.frames().find((candidate) => candidate !== page.mainFrame()) ?? null,
    step,
    page,
  );
}

async function waitForVisibleText(page, text) {
  const needle = text.toUpperCase();
  await waitFor(
    async () => {
      const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
      if (!frame) return false;
      const bodyText = await frame.evaluate(() => document.body?.innerText ?? "");
      return bodyText.toUpperCase().includes(needle);
    },
    `waiting for visible game text "${text}"`,
    page,
  );
}

async function clickVisibleText(page, text) {
  await waitFor(
    async () => {
      const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
      if (!frame) return false;
      return frame.evaluate((targetText) => {
        const needle = targetText.toUpperCase();
        const matches = [...document.querySelectorAll("div, span, button")].filter(
          (element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              (element.innerText ?? "").trim().toUpperCase() === needle
            );
          },
        );
        const target = matches.sort(
          (a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length,
        )[0];
        if (!target) return false;
        target.scrollIntoView({ block: "center", inline: "center" });
        target.click();
        return true;
      }, text);
    },
    `clicking visible game text "${text}"`,
    page,
  );
}

async function assertNoPlayerSaveStorage(page, economy) {
  const frame = await findGameFrame(page);
  const storage = await frame.evaluate(() => {
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
      `Legacy ${economy} desktop fixture touched player save storage: ${JSON.stringify(storage)}`,
    );
  }
}

async function inspectLegacyProductionFacts(economy) {
  const frame = await findGameFrame(page);
  const facts = await frame.evaluate((expectedEconomy) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const balance = [...document.querySelectorAll(
      '[data-testid="production-balance-card"]',
    )]
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
      `Legacy ${economy} desktop fixture rendered no production cards: ${JSON.stringify(facts)}`,
    );
  }
  if (facts.cards.some((text) => !text.includes("NOT BUILT"))) {
    throw new Error(
      `Legacy ${economy} desktop fixture has a live production status: ${JSON.stringify(facts)}`,
    );
  }
  if (facts.cards.some((text) => /(?:^|\n)\s*\d+ building(?:s)? built/i.test(text))) {
    throw new Error(
      `Legacy ${economy} desktop fixture invented a built-building total: ${JSON.stringify(facts)}`,
    );
  }

  if (economy === "civilian") {
    if (!facts.balance) {
      throw new Error(
        `Legacy civilian desktop fixture is missing its balance card: ${JSON.stringify(facts)}`,
      );
    }
    if (
      !/SUPPLY[\s\S]*~0\.0× per cycle/i.test(facts.balance) ||
      !/DEMAND[\s\S]*~0\.0× per cycle/i.test(facts.balance)
    ) {
      throw new Error(
        `Legacy civilian desktop fixture has non-zero supply/demand: ${JSON.stringify(facts)}`,
      );
    }
  } else if (facts.balance) {
    throw new Error(
      `Legacy military desktop fixture incorrectly rendered a civilian balance: ${JSON.stringify(facts)}`,
    );
  }

  return facts;
}

async function assertFixtureForwarded() {
  const iframeSrc = await waitFor(
    () =>
      page.$eval("iframe", (iframe) => iframe.getAttribute("src") ?? "").catch(
        () => "",
      ),
    "checking that the desktop wrapper forwards the fixture query",
    page,
  );
  const forwarded = new URL(iframeSrc);
  for (const [key, value] of [
    ["demo", "1"],
    ["legacyproduction", "1"],
    ["go", "production-chains"],
  ]) {
    if (forwarded.searchParams.get(key) !== value) {
      throw new Error(
        `Desktop wrapper did not forward ${key}=${value} to the game iframe: ${iframeSrc}`,
      );
    }
  }
}

let page;
async function run() {
  console.log(`[e2e] desktop legacy production fixture: ${FIXTURE_URL}`);
  await ensureDesktopWrapperReady();

  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const context =
    typeof browser.createBrowserContext === "function"
      ? await browser.createBrowserContext()
      : await browser.createIncognitoBrowserContext();
  page = await context.newPage();
  await page.setViewport(DESKTOP_VIEWPORT);

  const pageErrors = [];
  const recordPageError = (error) => {
    pageErrors.push(String(error));
  };
  page.on("pageerror", recordPageError);
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      recordPageError(message.text());
    }
  });

  try {
    await page.goto(FIXTURE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await assertFixtureForwarded();
    await waitForVisibleText(page, "PRODUCTION CHAINS");
    await assertNoPlayerSaveStorage(page, "civilian");
    await clickVisibleText(page, "Steel Ingot");
    await waitForVisibleText(page, "CIVILIAN STOCKPILE BALANCE");
    await waitForVisibleText(page, "NOT BUILT");
    const civilianFacts = await inspectLegacyProductionFacts("civilian");
    await assertNoPlayerSaveStorage(page, "civilian");

    // Reload the same disposable fixture before checking military supply so
    // the two economies remain independent and no back-navigation behavior is
    // part of this regression.
    await page.goto(FIXTURE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await assertFixtureForwarded();
    await waitForVisibleText(page, "PRODUCTION CHAINS");
    await assertNoPlayerSaveStorage(page, "military");
    await clickVisibleText(page, "Ammunition (Army)");
    await waitForVisibleText(page, "PRODUCED BY");
    await waitForVisibleText(page, "NOT BUILT");
    const militaryFacts = await inspectLegacyProductionFacts("military");
    await assertNoPlayerSaveStorage(page, "military");

    if (pageErrors.length) {
      throw new Error(
        `wrapper/browser errors during desktop legacy production smoke test:\n${pageErrors.join("\n")}`,
      );
    }
    console.log(
      `PASS: desktop legacy civilian production stays at zero with NOT BUILT cards (${civilianFacts.cards.length} cards)`,
    );
    console.log(
      `PASS: desktop legacy military production stays at zero with NOT BUILT cards (${militaryFacts.cards.length} cards)`,
    );
  } catch (error) {
    const message = errorMessage(error);
    const diagnostics = await readDesktopDiagnostics(page).catch(
      (diagnosticError) => `unavailable (${errorMessage(diagnosticError)})`,
    );
    const browserErrors = pageErrors.length
      ? `\nWrapper/browser errors:\n${pageErrors.join("\n")}`
      : "";
    throw new Error(`${message}\nDesktop diagnostics: ${JSON.stringify(diagnostics)}${browserErrors}`);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});