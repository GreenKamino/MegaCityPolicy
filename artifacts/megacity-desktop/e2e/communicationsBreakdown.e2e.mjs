// Desktop wrapper smoke test for the communications breakdown card.
//
// This intentionally starts at the desktop wrapper route rather than loading
// the Expo game directly. The wrapper's iframe is the packaged desktop
// surface whose query forwarding and presentation can regress independently.
//
// Run with:
//   E2E_BASE_URL=http://localhost:80/desktop node e2e/communicationsBreakdown.e2e.mjs
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:80/desktop";
const BASE_PATH = BASE_URL.replace(/\/$/, "");
const DESKTOP_VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1 };

function resolveChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return execSync("which chromium-browser", { encoding: "utf8" }).trim();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function waitFor(predicate, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch {
      // The Expo iframe can be replaced while a demo route boots. Retry with
      // the current frame rather than holding onto a detached frame handle.
    }
    await sleep(500);
  }
  throw new Error(`Timed out after ${timeout}ms`);
}

async function findGameFrame(page) {
  return waitFor(() => {
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    return frame ?? null;
  });
}

async function waitForVisibleText(page, text, timeout = 120000) {
  const needle = text.toUpperCase();
  await waitFor(async () => {
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    if (!frame) return false;
    const bodyText = await frame.evaluate(() => document.body?.innerText ?? "");
    return bodyText.toUpperCase().includes(needle);
  }, timeout);
}

async function readVisibleCommunicationsCard(page) {
  const frame = await findGameFrame(page);
  return frame.evaluate(() => {
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

async function assertCommunicationsBreakdown(page, route, screenTitle, fixture = null) {
  const fixtureQuery = fixture ? `&${fixture}=1` : "";
  const routeUrl = `${BASE_URL.replace(/\/$/, "")}/?demo=1&go=${route}${fixtureQuery}`;
  console.log(`[e2e] opening desktop ${route}: ${routeUrl}`);
  await page.goto(routeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForVisibleText(page, screenTitle);

  const card = await waitFor(
    async () => (await readVisibleCommunicationsCard(page)) ?? false,
  );
  if (!card.visible) {
    throw new Error(`${route} communications breakdown is not visible in the desktop wrapper`);
  }

  const expected = fixture === "criticalcomms"
    ? [
        "COMMUNICATIONS STRENGTH",
        "CRITICAL",
        "Below 30%: +1 corruption per tick.",
      ]
    : fixture === "boundarycomms"
      ? [
          "COMMUNICATIONS STRENGTH",
          "DEGRADED",
          "30% signal integrity",
          "No low-signal corruption penalty at 30% or higher.",
        ]
      : [
          "COMMUNICATIONS STRENGTH",
          "DEGRADED",
          "55%",
          "Deep Signal Towers × 0",
          "+0 (12/each)",
          "CONTRIBUTING ASSETS · 13/100 capacity",
          "No low-signal corruption penalty at 30% or higher.",
        ];
  for (const text of expected) {
    if (!card.text.includes(text)) {
      throw new Error(
        `${route} communications breakdown is missing "${text}". Card text:\n${card.text}`,
      );
    }
  }
  if (fixture === "criticalcomms") {
    const signalMatch = card.text.match(/(\d+)% signal integrity/);
    const signalStrength = signalMatch ? Number(signalMatch[1]) : Number.NaN;
    if (!Number.isFinite(signalStrength) || signalStrength < 0 || signalStrength >= 30) {
      throw new Error(
        `${route} critical communications signal is outside the expected below-30% range: ${signalMatch?.[0] ?? "missing signal percentage"}`,
      );
    }
    console.log(`[e2e] ${route}: critical communications percentage, band, and corruption consequence visible`);
  } else if (fixture === "boundarycomms") {
    const signalMatch = card.text.match(/(\d+)% signal integrity/);
    const signalStrength = signalMatch ? Number(signalMatch[1]) : Number.NaN;
    if (signalStrength !== 30) {
      throw new Error(
        `${route} boundary communications signal is not exactly 30%: ${signalMatch?.[0] ?? "missing signal percentage"}`,
      );
    }
    if (card.text.includes("CRITICAL") || card.text.includes("Below 30%: +1 corruption per tick.")) {
      throw new Error(
        `${route} exact-30% communications readout still shows a critical or corruption penalty: ${card.text}`,
      );
    }
    console.log(`[e2e] ${route}: exact-30% communications boundary remains degraded without corruption penalty`);
  } else {
    console.log(`[e2e] ${route}: communications percentage, band, tower contribution, cap, and consequence visible`);
  }
}

async function run() {
  console.log(`[e2e] desktop route: ${BASE_URL}`);
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
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
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
    await assertCommunicationsBreakdown(page, "overview", "CITY STATUS MATRIX");
    await assertCommunicationsBreakdown(page, "space", "SPACE PROGRAM STATUS");
    await assertCommunicationsBreakdown(page, "overview", "CITY STATUS MATRIX", "boundarycomms");
    await assertCommunicationsBreakdown(page, "space", "SPACE PROGRAM STATUS", "boundarycomms");
    await assertCommunicationsBreakdown(page, "overview", "CITY STATUS MATRIX", "criticalcomms");
    await assertCommunicationsBreakdown(page, "space", "SPACE PROGRAM STATUS", "criticalcomms");

    if (pageErrors.length) {
      throw new Error(`page errors during desktop communications smoke test:\n${pageErrors.join("\n")}`);
    }
    console.log("[e2e] PASS: desktop Overview and Space communications breakdowns are intact across degraded and critical fixtures");
  } catch (error) {
    console.error(`[e2e] FAIL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

run();