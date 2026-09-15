// Desktop wrapper smoke test for active-contract recovery guidance.
//
// This starts at the desktop wrapper route rather than the Expo game route
// directly. The wrapper's iframe is the desktop surface whose query forwarding,
// routing, and responsive layout can regress independently.
//
// Run with:
//   E2E_BASE_URL=http://localhost:80/desktop node e2e/contractRecoveryGuidance.e2e.mjs
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:80/desktop";
const BASE_PATH = BASE_URL.replace(/\/$/, "");
const CONTRACTS_URL = `${BASE_PATH}/?demo=1&contracts=1&go=contracts`;
const EXPECTED_RECOVERY = "+525 cr";
const DESKTOP_VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const READY_TIMEOUT_MS =
  Number(process.env.E2E_DESKTOP_READY_TIMEOUT_MS) || 120000;
const POLL_INTERVAL_MS = 300;

function resolveChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH)
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return execSync("which chromium-browser", { encoding: "utf8" }).trim();
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

async function findGameFrame(page) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const frame = page
      .frames()
      .find((candidate) => candidate !== page.mainFrame());
    if (frame) return frame;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Timed out waiting for the desktop game iframe. Current frames: ${page
      .frames()
      .map((frame) => frame.url())
      .join(", ")}`,
  );
}

async function waitForVisibleText(page, text, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  const needle = text.toUpperCase();
  while (Date.now() < deadline) {
    const frame = page
      .frames()
      .find((candidate) => candidate !== page.mainFrame());
    if (frame) {
      try {
        const visible = await frame.evaluate(
          (target) =>
            (document.body?.innerText ?? "").toUpperCase().includes(target),
          needle,
        );
        if (visible) return frame;
      } catch {
        // Expo can replace the iframe document while the route boots.
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for visible desktop game text: ${text}`);
}

async function scrollTextIntoView(frame, text) {
  const found = await frame.evaluate((target) => {
    const needle = target.toUpperCase();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
      node.parentElement?.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
      return true;
    }
    return false;
  }, text);
  if (!found) throw new Error(`Could not scroll contract guidance into view`);
}

async function readGuidance(frame) {
  return frame.evaluate((expectedRecovery) => {
    const targetFragment = "AT CURRENT PROGRESS";
    const candidates = [...document.querySelectorAll("div, span")].filter(
      (element) => {
        const text = (
          element.innerText ??
          element.textContent ??
          ""
        ).toUpperCase();
        const rect = element.getBoundingClientRect();
        return (
          text.includes(targetFragment) &&
          text.includes(expectedRecovery.toUpperCase()) &&
          text.includes("VOLUNTARY CANCELLATION REMAINS NON-REFUNDABLE") &&
          rect.width > 0 &&
          rect.height > 0
        );
      },
    );
    const element = candidates.sort(
      (a, b) =>
        (a.innerText ?? a.textContent ?? "").length -
        (b.innerText ?? b.textContent ?? "").length,
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
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  }, EXPECTED_RECOVERY);
}

async function assertNoPlayerSaveStorage(frame) {
  const saveKeys = await frame.evaluate(() =>
    Object.keys(window.localStorage).filter(
      (key) =>
        key.startsWith("@megacity_slot_") ||
        key === "@megacity_save" ||
        key === "@megacity_profiles_index" ||
        key.startsWith("@megacity_profile_") ||
        key === "@megacity_active_profile",
    ),
  );
  if (saveKeys.length) {
    throw new Error(
      `Desktop contracts fixture touched player save storage: ${JSON.stringify(
        saveKeys,
      )}`,
    );
  }
}

async function run() {
  console.log(`[e2e] desktop route: ${CONTRACTS_URL}`);
  try {
    await ensureDesktopWrapperReady();
  } catch (error) {
    console.error(`[e2e] FAIL: ${errorMessage(error)}`);
    process.exitCode = 1;
    return;
  }

  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const context =
    typeof browser.createBrowserContext === "function"
      ? await browser.createBrowserContext()
      : await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  await page.setViewport(DESKTOP_VIEWPORT);
  const browserErrors = [];
  const recordError = (value) => {
    const message = String(value);
    if (/favicon|net::|404/.test(message)) return;
    browserErrors.push(message);
  };
  page.on("pageerror", recordError);
  page.on("console", (message) => {
    if (message.type() === "error") recordError(message.text());
  });

  try {
    await page.goto(CONTRACTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitForVisibleText(page, "CONTRACTS / PROCUREMENT");
    await waitForVisibleText(page, "ACTIVE (2)");
    await waitForVisibleText(page, "STALLED — CREWS AWAITING MATERIALS");
    // Expo Router may replace the iframe document while the initial query
    // resolves. Reacquire the live frame before inspecting geometry/storage.
    const frame = await findGameFrame(page);

    const iframeSrc = await page.$eval("iframe", (iframe) =>
      iframe.getAttribute("src"),
    );
    if (!iframeSrc?.includes("demo=1") || !iframeSrc.includes("contracts=1")) {
      throw new Error(
        `Desktop wrapper did not forward the contract fixture query: ${iframeSrc}`,
      );
    }

    await scrollTextIntoView(frame, "At current progress, recovery would be");
    const guidance = await readGuidance(frame);
    if (!guidance) {
      throw new Error(
        "The stalled active-contract card did not render complete recovery guidance",
      );
    }
    if (
      guidance.rect.left < -1 ||
      guidance.rect.right > guidance.viewport.width + 1 ||
      guidance.rect.top < 0 ||
      guidance.rect.bottom > guidance.viewport.height
    ) {
      throw new Error(
        `Recovery guidance was clipped or off-screen: ${JSON.stringify(
          guidance,
        )}`,
      );
    }
    if (!guidance.text.includes(EXPECTED_RECOVERY)) {
      throw new Error(`Recovery projection was incorrect: ${guidance.text}`);
    }
    if (
      !/voluntary cancellation remains non-refundable/i.test(guidance.text)
    ) {
      throw new Error(`Cancellation guidance was missing: ${guidance.text}`);
    }
    await assertNoPlayerSaveStorage(frame);

    if (browserErrors.length) {
      throw new Error(
        `Browser errors during desktop contract guidance check:\n${browserErrors.join(
          "\n",
        )}`,
      );
    }
    console.log(
      `[e2e] PASS: desktop wrapper visibly shows ${EXPECTED_RECOVERY} projected scrap recovery and non-refundable cancellation without touching a player save`,
    );
  } catch (error) {
    console.error(`[e2e] FAIL: ${errorMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});