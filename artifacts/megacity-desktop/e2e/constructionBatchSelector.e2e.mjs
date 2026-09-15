// Desktop-wrapper regression for the construction quantity selector.
//
// The check intentionally starts at the desktop wrapper route rather than the
// Expo game route directly. This catches regressions in the iframe handoff,
// query forwarding, responsive sizing, and accessibility attributes that a
// direct Expo check would miss.
//
// Run with:
//   E2E_BASE_URL=http://localhost:80/desktop node e2e/constructionBatchSelector.e2e.mjs
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:80/desktop";
const BASE_PATH = BASE_URL.replace(/\/$/, "");
const FIXTURE_URL = `${BASE_PATH}/?demo=1&go=construction`;
const VIEWPORTS = [
  { name: "narrow", width: 420, height: 900, deviceScaleFactor: 1 },
  { name: "desktop", width: 1400, height: 900, deviceScaleFactor: 1 },
];
const EXPECTED_QUANTITIES = [1, 5, 10, 50, 100];
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
  return page
    .evaluate(() => ({
      iframeSrc: document.querySelector("iframe")?.getAttribute("src") ?? null,
      frames: [...document.querySelectorAll("iframe")].length,
    }))
    .catch((error) => ({ outerError: errorMessage(error) }));
}

async function waitFor(page, predicate, step) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
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

  throw new Error(
    `Timed out after ${READY_TIMEOUT_MS}ms while ${step}.${lastFailure ? ` Last probe error: ${lastFailure}.` : ""} Diagnostics: ${JSON.stringify(await readDesktopDiagnostics(page))}`,
  );
}

async function findGameFrame(page) {
  return waitFor(
    page,
    () => page.frames().find((frame) => frame !== page.mainFrame()) ?? null,
    "waiting for the embedded game frame",
  );
}

async function waitForConstruction(page) {
  await waitFor(
    page,
    async () => {
      const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
      if (!frame) return false;
      const bodyText = await frame.evaluate(() => document.body?.innerText ?? "");
      return bodyText.toUpperCase().includes("BUILD QUANTITY");
    },
    "waiting for the construction quantity selector",
  );
}

async function inspectQuantitySelector(frame) {
  return frame.evaluate((expectedQuantities) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const radios = [...document.querySelectorAll('[role="radio"]')]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          label: element.getAttribute("aria-label"),
          checked:
            element.getAttribute("aria-checked") ??
            element.getAttribute("aria-selected"),
          width: rect.width,
          height: rect.height,
          borderWidth: Number.parseFloat(style.borderTopWidth) || 0,
        };
      })
      .filter((radio) => radio.label?.includes("building"));

    const labels = expectedQuantities.map(
      (quantity) =>
        `Build ${quantity} ${quantity === 1 ? "building" : "buildings"} per order`,
    );
    return {
      hint: document.body?.innerText.includes(
        "Choose how many buildings each timed order adds (up to 100).",
      ),
      selectedSummary: document.body?.innerText.includes("1× PER ORDER"),
      radios,
      labels,
    };
  }, EXPECTED_QUANTITIES);
}

async function selectQuantity(frame, quantity) {
  await frame.evaluate((expectedLabel) => {
    const element = [...document.querySelectorAll('[role="radio"]')].find(
      (candidate) => candidate.getAttribute("aria-label") === expectedLabel,
    );
    if (!element) throw new Error(`Missing quantity radio: ${expectedLabel}`);
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
  }, `Build ${quantity} buildings per order`);
}

async function assertNoPlayerSaveStorage(frame) {
  const storage = await frame.evaluate(() => {
    const keys = Object.keys(window.localStorage);
    return {
      slot: Boolean(window.localStorage.getItem("@megacity_slot_1")),
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
  if (Object.values(storage).some(Boolean)) {
    throw new Error(
      `Construction fixture touched player save storage: ${JSON.stringify(storage)}`,
    );
  }
}

async function runViewport(browser, viewport) {
  const context =
    typeof browser.createBrowserContext === "function"
      ? await browser.createBrowserContext()
      : await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  try {
    await page.setViewport(viewport);
    await page.goto(FIXTURE_URL, {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS,
    });
    await waitForConstruction(page);
    const frame = await findGameFrame(page);
    const initial = await inspectQuantitySelector(frame);

    if (!initial.hint || !initial.selectedSummary) {
      throw new Error(
        `${viewport.name} selector is missing its visible guidance or selected summary: ${JSON.stringify(initial)}`,
      );
    }
    if (
      initial.radios.length !== EXPECTED_QUANTITIES.length ||
      initial.radios.some(
        (radio, index) =>
          radio.label !== initial.labels[index] ||
          radio.width < 40 ||
          radio.height < 36,
      )
    ) {
      throw new Error(
        `${viewport.name} selector did not expose five usable quantity radios: ${JSON.stringify(initial)}`,
      );
    }

    const selectedInitially = initial.radios.filter(
      (radio) => radio.checked === "true",
    );
    if (
      selectedInitially.length !== 1 ||
      selectedInitially[0].label !== initial.labels[0] ||
      selectedInitially[0].borderWidth < 2
    ) {
      throw new Error(
        `${viewport.name} initial quantity is not visibly and accessibly selected: ${JSON.stringify(initial)}`,
      );
    }

    await selectQuantity(frame, 10);
    await waitFor(
      page,
      async () => {
        const current = await inspectQuantitySelector(frame);
        const selected = current.radios.filter(
          (radio) => radio.checked === "true",
        );
        return (
          selected.length === 1 &&
          selected[0].label === current.labels[2] &&
          selected[0].borderWidth >= 2
        );
      },
      `waiting for ${viewport.name} selector to select 10`,
    );

    await assertNoPlayerSaveStorage(frame);
    if (pageErrors.length || consoleErrors.length) {
      throw new Error(
        `${viewport.name} browser errors: ${JSON.stringify({ pageErrors, consoleErrors })}`,
      );
    }
    console.log(
      `PASS ${viewport.name} desktop wrapper shows 1/5/10/50/100 and selects 10 accessibly`,
    );
  } finally {
    await context.close();
  }
}

await ensureDesktopWrapperReady({ baseUrl: BASE_URL });
const browser = await puppeteer.launch({
  executablePath: resolveChromium(),
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const viewport of VIEWPORTS) {
    await runViewport(browser, viewport);
  }
} finally {
  await browser.close();
}

console.log("RESULT: construction quantity selector passed all desktop viewports");