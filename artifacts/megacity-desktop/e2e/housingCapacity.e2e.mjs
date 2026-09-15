// Desktop-wrapper regression for the housing diagnosis-to-construction action
// and the housing capacity detail readout.
//
// This starts at the desktop wrapper route rather than loading the Expo game
// directly. The fixture is read-only and must not promote the seeded city to a
// playable session or create a player save.
//
// Run with:
//   E2E_BASE_URL=http://localhost:80/desktop node e2e/housingCapacity.e2e.mjs
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:80/desktop";
const BASE_PATH = BASE_URL.replace(/\/$/, "");
const EXPECTED_LABELS = [
  "HOUSING CAPACITY DETAIL",
  "CURRENT TOTAL",
  "DEMAND TARGET",
  "RESERVE TARGET",
  "GAP TO DEMAND",
  "GAP TO RESERVE",
  "PERMANENT / STANDARD",
  "EMERGENCY SHELTER",
];
const HOUSING_ACTION_LABEL = "Open housing construction";
const VIEWPORTS = [
  { name: "narrow", width: 420, height: 900, deviceScaleFactor: 1 },
  { name: "desktop", width: 1400, height: 900, deviceScaleFactor: 1 },
];
const READY_TIMEOUT_MS =
  Number(process.env.E2E_DESKTOP_READY_TIMEOUT_MS) || 120000;
const POLL_INTERVAL_MS = 300;

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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isKnownDevBannerMimeWarning(message) {
  return (
    /dev.?banner/i.test(message) &&
    /mime|text\/html|stylesheet/i.test(message)
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    `Timed out after ${READY_TIMEOUT_MS}ms while ${step}.${
      lastFailure ? ` Last probe error: ${lastFailure}.` : ""
    }`,
  );
}

async function findGameFrame(page) {
  return waitFor(
    page,
    () => page.frames().find((frame) => frame !== page.mainFrame()) ?? null,
    "waiting for the embedded game frame",
  );
}

async function waitForVisibleText(page, text) {
  const needle = text.toUpperCase();
  return waitFor(
    page,
    async () => {
      const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
      if (!frame) return false;
      const bodyText = await frame.evaluate(() => document.body?.innerText ?? "");
      return bodyText.toUpperCase().includes(needle) ? frame : false;
    },
    `the visible "${text}" heading`,
  );
}

async function inspectHousingLabels(frame) {
  return frame.evaluate((expectedLabels) => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim().toUpperCase();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };
    const findLabel = (label) => {
      const candidates = [...document.querySelectorAll("*")]
        .filter((element) => normalize(element.innerText ?? element.textContent ?? "") === label)
        .filter(visible)
        .sort((a, b) => {
          const aRect = a.getBoundingClientRect();
          const bRect = b.getBoundingClientRect();
          return aRect.width * aRect.height - bRect.width * bRect.height;
        });
      const element = candidates[0];
      if (!element) return null;
      element.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = element.getBoundingClientRect();
      return {
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        text: element.innerText ?? element.textContent ?? "",
      };
    };

    return Object.fromEntries(
      expectedLabels.map((label) => [label, findLabel(label)]),
    );
  }, EXPECTED_LABELS);
}

async function assertHousingLabels(frame, viewportName, routeName) {
  const labels = await inspectHousingLabels(frame);
  for (const label of EXPECTED_LABELS) {
    const result = labels[label];
    if (!result) {
      throw new Error(
        `[${viewportName}/${routeName}] missing visible housing label "${label}"`,
      );
    }
    const { rect, viewport } = result;
    if (
      rect.left < -1 ||
      rect.right > viewport.width + 1 ||
      rect.top < -1 ||
      rect.bottom > viewport.height + 1
    ) {
      throw new Error(
        `[${viewportName}/${routeName}] housing label "${label}" is clipped or off-screen: ${JSON.stringify(
          result,
        )}`,
      );
    }
  }
  console.log(
    `[e2e] ${viewportName}/${routeName}: all housing capacity labels are visible and in bounds`,
  );
}

async function inspectHousingAction(frame) {
  return frame.evaluate((expectedLabel) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };
    const element = [...document.querySelectorAll("[aria-label]")]
      .find(
        (candidate) =>
          candidate.getAttribute("aria-label") === expectedLabel &&
          visible(candidate),
      );
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    return {
      label: element.getAttribute("aria-label"),
      rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }, HOUSING_ACTION_LABEL);
}

async function assertHousingAction(frame, viewportName) {
  const bodyText = await frame.evaluate(() => document.body?.innerText ?? "");
  if (
    !bodyText.includes("SHORTFALL") &&
    !bodyText.includes("RESERVE TIGHT")
  ) {
    throw new Error(
      `[${viewportName}/overview] housing fixture did not render a shortfall or reserve warning`,
    );
  }

  const action = await inspectHousingAction(frame);
  if (!action) {
    throw new Error(
      `[${viewportName}/overview] missing accessible housing action "${HOUSING_ACTION_LABEL}"`,
    );
  }
  const { rect, viewport } = action;
  if (
    rect.left < -1 ||
    rect.right > viewport.width + 1 ||
    rect.width < 100 ||
    rect.height < 28
  ) {
    throw new Error(
      `[${viewportName}/overview] housing action is clipped or too small: ${JSON.stringify(
        action,
      )}`,
    );
  }
}

async function clickHousingAction(frame) {
  const clicked = await frame.evaluate((expectedLabel) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const element = [...document.querySelectorAll("[aria-label]")]
      .find(
        (candidate) =>
          candidate.getAttribute("aria-label") === expectedLabel &&
          visible(candidate),
      );
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    element.click();
    return true;
  }, HOUSING_ACTION_LABEL);
  if (!clicked) {
    throw new Error(
      `Could not activate accessible housing action "${HOUSING_ACTION_LABEL}"`,
    );
  }
}

async function waitForHousingConstruction(page) {
  return waitFor(
    page,
    async () => {
      const frame = page.frames().find(
        (candidate) => candidate !== page.mainFrame(),
      );
      if (!frame) return false;
      const url = new URL(frame.url());
      if (
        !url.pathname.endsWith("/construction") ||
        url.searchParams.get("category") !== "housing"
      ) {
        return false;
      }
      const bodyText = await frame.evaluate(
        () => document.body?.innerText ?? "",
      );
      return bodyText.includes("HOUSING CAPACITY DETAIL") ? frame : false;
    },
    "housing action navigation to construction with category=housing",
  );
}

async function assertNoPlayerSaveStorage(frame, viewportName, routeName) {
  const storage = await frame.evaluate(() => {
    const keys = Object.keys(window.localStorage);
    return {
      keys,
      realSlot: keys.some((key) => /^@megacity_slot_\d+$/.test(key)),
      legacySlot: keys.includes("@megacity_save"),
      profileIndex: keys.includes("@megacity_profiles_index"),
      profileData: keys.some((key) => key.startsWith("@megacity_profile_")),
      activeProfile: keys.includes("@megacity_active_profile"),
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
      `[${viewportName}/${routeName}] housing fixture touched player save storage: ${JSON.stringify(
        storage,
      )}`,
    );
  }
}

async function runViewport(browser, viewport) {
  const context =
    typeof browser.createBrowserContext === "function"
      ? await browser.createBrowserContext()
      : await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  const browserErrors = [];
  const recordError = (value) => {
    const message = errorMessage(value);
    if (!isKnownDevBannerMimeWarning(message)) browserErrors.push(message);
  };
  page.on("pageerror", recordError);
  page.on("console", (message) => {
    if (message.type() === "error") recordError(message.text());
  });

  try {
    await page.setViewport(viewport);
    const routeUrl = `${BASE_PATH}/?demo=1&housing=1&go=overview`;
    console.log(`[e2e] opening ${viewport.name}/housing action: ${routeUrl}`);
    await page.goto(routeUrl, {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS,
    });
    const overviewFrame = await waitForVisibleText(page, "CITY STATUS MATRIX");
    await waitFor(
      page,
      async () => {
        const liveFrame = page.frames().find(
          (candidate) => candidate !== page.mainFrame(),
        );
        if (!liveFrame) return false;
        const bodyText = await liveFrame.evaluate(
          () => document.body?.innerText ?? "",
        );
        return (
          bodyText.includes("HOUSING CAPACITY DETAIL") &&
          Boolean(await inspectHousingAction(liveFrame))
        );
      },
      "the housing warning and accessible construction action",
    );
    const liveOverviewFrame = await findGameFrame(page);
    await assertHousingAction(liveOverviewFrame, viewport.name);
    const iframeSrc = await page.$eval("iframe", (iframe) =>
      iframe.getAttribute("src"),
    );
    if (
      !iframeSrc?.includes("demo=1") ||
      !iframeSrc.includes("housing=1")
    ) {
      throw new Error(
        `[${viewport.name}/overview] desktop wrapper did not forward the housing fixture query: ${iframeSrc}`,
      );
    }
    await clickHousingAction(liveOverviewFrame);

    const constructionFrame = await waitForHousingConstruction(page);
    await waitFor(
      page,
      async () => {
        const liveFrame = page.frames().find(
          (candidate) => candidate !== page.mainFrame(),
        );
        if (!liveFrame) return false;
        const labels = await inspectHousingLabels(liveFrame);
        return EXPECTED_LABELS.every((label) => labels[label]);
      },
      `the housing capacity detail after ${viewport.name} action navigation`,
    );
    const liveConstructionFrame = await findGameFrame(page);
    const constructionUrl = new URL(liveConstructionFrame.url());
    if (
      !constructionUrl.pathname.endsWith("/construction") ||
      constructionUrl.searchParams.get("category") !== "housing"
    ) {
      throw new Error(
        `[${viewport.name}/construction] housing action reached the wrong route: ${constructionUrl.href}`,
      );
    }
    await assertHousingLabels(
      liveConstructionFrame,
      viewport.name,
      "construction after housing action",
    );
    await assertNoPlayerSaveStorage(
      liveConstructionFrame,
      viewport.name,
      "construction after housing action",
    );
    void overviewFrame;
    void constructionFrame;

    if (browserErrors.length) {
      throw new Error(
        `[${viewport.name}] browser or wrapper runtime errors:\n${browserErrors.join(
          "\n",
        )}`,
      );
    }
  } finally {
    await context.close().catch(() => {});
  }
}

async function run() {
  console.log(`[e2e] desktop housing capacity fixture: ${BASE_URL}`);
  try {
    await ensureDesktopWrapperReady({ baseUrl: BASE_URL });
    const browser = await puppeteer.launch({
      executablePath: resolveChromium(),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    try {
      for (const viewport of VIEWPORTS) {
        await runViewport(browser, viewport);
      }
    } finally {
      await browser.close();
    }
    console.log(
      "[e2e] PASS: accessible housing action reaches category=housing construction and preserves capacity detail at narrow and desktop widths without creating a player save",
    );
  } catch (error) {
    console.error(`[e2e] FAIL: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

run();