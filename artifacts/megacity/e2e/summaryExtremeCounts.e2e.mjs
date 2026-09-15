// Real-screen regression for extreme late-game infrastructure totals.
//
// The demo fixture is in-memory only. It gives the run summary million- and
// billion-scale building/unit totals so this check covers the actual React
// Native Web boxes rather than only the pure formatter and source-layout tests.
//
// Requires the "artifacts/megacity: expo" workflow.
// Run with:
//   node e2e/summaryExtremeCounts.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");

const BOOT_TIMEOUT_MS = 120_000;
const EXPECTED = {
  BUILDINGS: { compact: "1.5B", exact: "BUILDINGS: 1,501,234,567" },
  TYPES: { compact: "2", exact: "TYPES: 2" },
  DISTRICTS: { compact: "3", exact: "DISTRICTS: 3" },
  UNITS: { compact: "2B", exact: "UNITS: 2,002,345,678" },
  "INFRA HEALTH": { compact: "88%", exact: "INFRA HEALTH: 88%" },
  DEFENSE: { compact: "77%", exact: "DEFENSE: 77%" },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

async function waitForText(page, text, timeout = BOOT_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate((needle) => (
      (document.body?.innerText ?? "").toUpperCase().includes(needle.toUpperCase())
    ), text);
    if (found) return;
    await sleep(400);
  }
  throw new Error(`Timed out waiting for "${text}" at ${page.url()}`);
}

async function inspectVariant(page, name, { width, height, zoom }) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluate((nextZoom) => {
    document.documentElement.style.zoom = nextZoom ? String(nextZoom) : "";
  }, zoom);
  await waitForText(page, "INFRASTRUCTURE");
  await page.evaluate((expected) => {
    const firstExactLabel = Object.values(expected)[0].exact;
    const element = [...document.querySelectorAll("[aria-label]")]
      .find((candidate) => candidate.getAttribute("aria-label") === firstExactLabel);
    element?.scrollIntoView({ block: "center", inline: "nearest" });
  }, EXPECTED);
  await sleep(300);

  const result = await page.evaluate((expected) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const metrics = Object.entries(expected).map(([label, values]) => {
      const element = [...document.querySelectorAll("[aria-label]")]
        .find((candidate) => (
          candidate.getAttribute("aria-label") === values.exact && visible(candidate)
        ));
      if (!element) {
        return { label, error: `missing exact accessible label ${values.exact}` };
      }
      const rect = element.getBoundingClientRect();
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      return {
        label,
        exactAccessibleLabel: element.getAttribute("aria-label"),
        text,
        compactVisible: text.includes(values.compact),
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        withinViewport:
          rect.left >= -1 &&
          rect.right <= viewportWidth + 1 &&
          rect.top >= -1 &&
          rect.bottom <= viewportHeight + 1,
      };
    });
    return {
      metrics,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body?.scrollWidth ?? 0,
      clientWidth: document.documentElement.clientWidth,
      viewportWidth,
      viewportHeight,
      visibleBodyText: (document.body?.innerText ?? "").slice(0, 2500),
    };
  }, EXPECTED);

  const missing = result.metrics.filter((metric) => metric.error);
  if (missing.length) {
    throw new Error(`${name} missing exact accessible labels: ${JSON.stringify(missing)}`);
  }
  const compactMissing = result.metrics.filter((metric) => !metric.compactVisible);
  if (compactMissing.length) {
    throw new Error(`${name} missing compact visible values: ${JSON.stringify(compactMissing)}`);
  }
  const outOfBounds = result.metrics.filter((metric) => !metric.withinViewport);
  if (outOfBounds.length) {
    throw new Error(`${name} has infrastructure metrics outside the viewport: ${JSON.stringify(outOfBounds)}`);
  }
  if (
    result.documentWidth > result.clientWidth + 2 ||
    result.bodyWidth > result.clientWidth + 2
  ) {
    throw new Error(
      `${name} has horizontal overflow: ${JSON.stringify({
        documentWidth: result.documentWidth,
        bodyWidth: result.bodyWidth,
        clientWidth: result.clientWidth,
      })}`,
    );
  }

  console.log(
    `[e2e] PASS ${name}: ${result.metrics
      .map((metric) => `${metric.label}=${metric.exactAccessibleLabel}`)
      .join(", ")}`,
  );
}

async function run() {
  console.log(`[e2e] summary extreme-count fixture base URL: ${BASE_URL}`);
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
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!/favicon|net::|404|AbortError|NotAllowedError/i.test(text)) pageErrors.push(text);
  });

  try {
    await page.goto(`${BASE_URL}/?demo=1&summaryextreme=1&go=summary`, {
      waitUntil: "domcontentloaded",
      timeout: BOOT_TIMEOUT_MS,
    });
    await waitForText(page, "RUN SUMMARY");

    await inspectVariant(page, "phone", { width: 390, height: 844, zoom: 1 });
    await inspectVariant(page, "desktop", { width: 1440, height: 900, zoom: 1 });
    await inspectVariant(page, "xxxlarge text", { width: 390, height: 844, zoom: 1.5 });

    if (pageErrors.length > 0) {
      throw new Error(`Browser errors during summary extreme-count E2E:\n${pageErrors.join("\n")}`);
    }
    console.log("[e2e] PASS summary extreme-count fixture remained read-only in browser");
  } catch (error) {
    console.error(`[e2e] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    try {
      console.error(`[e2e] URL: ${page.url()}`);
      console.error(`[e2e] visible text:\n${await page.evaluate(() => document.body?.innerText ?? "")}`);
    } catch {
      // Preserve the original failure if the page detached during navigation.
    }
    process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run();