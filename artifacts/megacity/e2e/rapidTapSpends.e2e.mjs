// Browser regression coverage for rapid repeated taps on credit-spending flows.
//
// The event fixture provides a real response with a credit cost. The default
// demo city has enough resources for one Solar Tower Fields order, while a
// batch of 100 deliberately follows the existing insufficient-funds path.
// Requires the "artifacts/megacity: expo" workflow.
//
// Run with:
//   node e2e/rapidTapSpends.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const PREVIEW_READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120000;
const PREVIEW_REQUEST_TIMEOUT_MS = 10000;
const WIDTHS = [
  { name: "phone", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 720 },
];
const MULTI_RESPONSE_FIXTURE_KEY = "@megacity_e2e_multi_response_1";

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function ensurePreviewReady() {
  const deadline = Date.now() + PREVIEW_READY_TIMEOUT_MS;
  let lastFailure = "no response";

  while (Date.now() <= deadline) {
    try {
      const rootResponse = await fetchWithTimeout(BASE_URL, PREVIEW_REQUEST_TIMEOUT_MS);
      if (!rootResponse.ok) throw new Error(`preview returned HTTP ${rootResponse.status}`);
      const html = await rootResponse.text();
      const bundleMatch = html.match(/<script\b[^>]*\bsrc=["']([^"']*\.bundle[^"']*)["']/i);
      if (!bundleMatch) throw new Error("preview HTML did not expose the Expo web bundle");
      const bundleResponse = await fetchWithTimeout(
        new URL(bundleMatch[1], BASE_URL).href,
        PREVIEW_REQUEST_TIMEOUT_MS,
      );
      if (!bundleResponse.ok) throw new Error(`Metro bundle returned HTTP ${bundleResponse.status}`);
      await bundleResponse.arrayBuffer();
      console.log(`PASS  Expo preview ready at ${BASE_URL}`);
      return;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() >= deadline) break;
    await sleep(Math.min(1000, deadline - Date.now()));
  }

  throw new Error(
    `Expected Expo preview URL ${BASE_URL} is unavailable or still starting (${lastFailure}). ` +
      'Start the "artifacts/megacity: expo" workflow, or wait for Metro to finish bundling, then retry.',
  );
}

async function hasVisibleText(page, text) {
  return page.evaluate((target) => {
    const needle = target.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
      const rect = node.parentElement?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }, text);
}

async function waitForVisibleText(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasVisibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function countVisibleText(page, text) {
  return page.evaluate((target) => {
    const needle = target.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let count = 0;
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
      const rect = node.parentElement?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) count += 1;
    }
    return count;
  }, text);
}

async function hasBodyText(page, text) {
  return page.evaluate((target) => {
    const bodyText = document.body?.innerText ?? "";
    return bodyText.toUpperCase().includes(target.toUpperCase());
  }, text);
}

async function waitForBodyText(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasBodyText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for body text: ${text}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const matches = [...document.querySelectorAll("div, span, button, [role='button']")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (element.innerText ?? "").trim().toUpperCase() === needle;
    });
    const pressables = matches.filter((element) =>
      element.getAttribute("tabindex") === "0" ||
      element.getAttribute("role") === "button" ||
      element.tagName === "BUTTON",
    );
    const element = (pressables.length ? pressables : matches)
      .sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function clickVisiblePressableContainingText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const element = [...document.querySelectorAll("[tabindex='0'], button, [role='button']")]
      .filter((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (candidate.innerText ?? "").trim().toUpperCase().includes(needle)
        );
      })
      .sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible pressable containing text: ${text}`);
}

async function rapidClickVisiblePressableContainingText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const element = [...document.querySelectorAll("[tabindex='0'], button, [role='button']")]
      .filter((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (candidate.innerText ?? "").trim().toUpperCase().includes(needle)
        );
      })
      .sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not rapidly click visible pressable containing text: ${text}`);
}

async function rapidClickVisibleText(page, text, { exact = true } = {}) {
  const clicked = await page.evaluate((target) => {
    const { text, exact } = target;
    const needle = text.toUpperCase();
    const matches = [...document.querySelectorAll("div, span, button, [role='button']")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const elementText = (element.innerText ?? "").trim().toUpperCase();
      return rect.width > 0 && rect.height > 0 && (exact ? elementText === needle : elementText.includes(needle));
    });
    const pressables = matches.filter((element) =>
      element.getAttribute("tabindex") === "0" ||
      element.getAttribute("role") === "button" ||
      element.tagName === "BUTTON",
    );
    const element = (pressables.length ? pressables : matches)
      .sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    element.click();
    return true;
  }, { text, exact });
  if (!clicked) throw new Error(`Could not rapidly tap visible text: ${text}`);
}

async function runEventCase(browser, layout) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404|In HTML, %s cannot be a descendant of <%s>|cannot contain a nested/.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.setViewport({ width: layout.width, height: layout.height, deviceScaleFactor: 1 });
    await page.goto(`${BASE_URL}/?demo=1&factiondemand=1&go=events`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitForVisibleText(page, "EVENTS / REPORTS / TICKER");
    await waitForVisibleText(page, "A DEMAND");
    // The fixture starts collapsed; expand the card before tapping its option.
    await clickVisibleText(page, "RESPOND");
    await waitForVisibleText(page, "CONCEDE");
    await rapidClickVisibleText(page, "CONCEDE");
    await waitForVisibleText(page, "ALL SYSTEMS NOMINAL");

    const activeEventTitleCount = await countVisibleText(page, "A DEMAND");
    const eventConfirmationCount = await countVisibleText(page, "spent");
    if (activeEventTitleCount !== 0) {
      throw new Error(`${layout.name}: rapid event response left ${activeEventTitleCount} active demand card(s)`);
    }
    if (eventConfirmationCount !== 1) {
      throw new Error(`${layout.name}: expected one event spend confirmation, found ${eventConfirmationCount}`);
    }
    if (browserErrors.length) {
      throw new Error(`${layout.name}: browser errors:\n${browserErrors.join("\n")}`);
    }
    console.log(`PASS ${layout.name}: rapid event response resolves once with one spend confirmation`);
  } finally {
    await context.close().catch(() => {});
  }
}

async function runMultiResponseCase(browser, layout, { persisted = false } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404|In HTML, %s cannot be a descendant of <%s>|cannot contain a nested/.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.setViewport({ width: layout.width, height: layout.height, deviceScaleFactor: 1 });
    const fixtureBase = `${BASE_URL}/?demo=1&multiresponse=1&go=events`;
    if (persisted) {
      // First exercise the real save path, then recreate GameProvider with a
      // full navigation so the event is restored through loadSlot rather than
      // merely using the fresh in-memory seeder.
      await page.goto(`${fixtureBase}&multiresponseload=save`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await waitForVisibleText(page, "DEBUG: MULTI-CHOICE DECISION");
      await page.waitForFunction(
        (key) => Boolean(window.localStorage.getItem(key)),
        { timeout: 120000 },
        MULTI_RESPONSE_FIXTURE_KEY,
      );
      await page.goto(`${fixtureBase}&multiresponseload=load`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await waitForVisibleText(page, "DEBUG: MULTI-CHOICE DECISION");
      // loadSlot is intentionally deferred until after the demo route mounts.
      // Let that async restoration finish before selecting the persisted
      // response options.
      await sleep(750);
    } else {
      await page.goto(`${fixtureBase}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
      });
    }
    await waitForVisibleText(page, "EVENTS / REPORTS / TICKER");
    await waitForVisibleText(page, "DEBUG: MULTI-CHOICE DECISION");

    // The fixture starts collapsed. Pick both costly responses before testing
    // the separate confirmation button's rapid-tap guard.
    await clickVisibleText(page, "RESPOND (UP TO 2)");
    await waitForVisibleText(page, "SELECT UP TO 2 RESPONSES");
    await waitForVisibleText(page, "FUND THE RELAY");
    await clickVisiblePressableContainingText(page, "FUND THE RELAY");
    await sleep(150);
    await waitForBodyText(page, "CONFIRM 1 RESPONSE");
    await clickVisiblePressableContainingText(page, "SUPPLY THE CLINIC");
    await sleep(150);
    await waitForBodyText(page, "CONFIRM 2 RESPONSES");
    await rapidClickVisiblePressableContainingText(page, "CONFIRM 2 RESPONSES");
    await waitForVisibleText(page, "3,000c spent");

    const activeEventTitleCount = await countVisibleText(page, "DEBUG: MULTI-CHOICE DECISION");
    const eventConfirmationCount = await countVisibleText(page, "spent");
    if (activeEventTitleCount !== 0) {
      throw new Error(`${layout.name}: rapid multi-response confirmation left ${activeEventTitleCount} active event card(s)`);
    }
    if (eventConfirmationCount !== 1) {
      throw new Error(`${layout.name}: expected one multi-response spend confirmation, found ${eventConfirmationCount}`);
    }
    if (browserErrors.length) {
      throw new Error(`${layout.name}: browser errors:\n${browserErrors.join("\n")}`);
    }
    console.log(
      `PASS ${layout.name}: ${persisted ? "reopened" : "fresh"} rapid multi-response confirmation resolves once with one spend confirmation`,
    );
  } finally {
    await context.close().catch(() => {});
  }
}

async function runConstructionCase(browser, layout) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404|In HTML, %s cannot be a descendant of <%s>|cannot contain a nested/.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.setViewport({ width: layout.width, height: layout.height, deviceScaleFactor: 1 });
    await page.goto(`${BASE_URL}/?demo=1&go=construction`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitForVisibleText(page, "CONSTRUCTION / INFRASTRUCTURE");
    await waitForVisibleText(page, "SOLAR TOWER FIELDS");

    await rapidClickVisibleText(page, "SOLAR TOWER FIELDS");
    await waitForVisibleText(page, "CONSTRUCT 1X SOLAR TOWER FIELDS");
    await rapidClickVisibleText(page, "BUILD 1");
    await waitForVisibleText(page, "UNDER CONSTRUCTION");
    if (!(await hasBodyText(page, "1 UNDER CONSTRUCTION"))) {
      throw new Error(`${layout.name}: pending construction count did not settle at one`);
    }

    const constructionConfirmationCount = await countVisibleText(page, "spent");
    if (constructionConfirmationCount !== 1) {
      throw new Error(`${layout.name}: expected one construction cost confirmation, found ${constructionConfirmationCount}`);
    }

    // A failed attempt must stay retryable. Batch 100 is visibly unaffordable
    // in the seeded city, so both attempts must show the existing failure modal
    // rather than silently entering the success cooldown.
    await sleep(800);
    await clickVisibleText(page, "100");
    await waitForBodyText(page, "100× SOLAR TOWER FIELDS");
    await rapidClickVisibleText(page, "SOLAR TOWER FIELDS", { exact: false });
    await waitForVisibleText(page, "INSUFFICIENT FUNDS");
    await clickVisibleText(page, "OK");
    await waitForVisibleText(page, "CONSTRUCTION / INFRASTRUCTURE");
    await waitForBodyText(page, "100× SOLAR TOWER FIELDS");
    await rapidClickVisibleText(page, "SOLAR TOWER FIELDS", { exact: false });
    await waitForVisibleText(page, "INSUFFICIENT FUNDS");

    if (browserErrors.length) {
      throw new Error(`${layout.name}: browser errors:\n${browserErrors.join("\n")}`);
    }
    console.log(`PASS ${layout.name}: rapid construction queues once and failed purchase remains retryable`);
  } finally {
    await context.close().catch(() => {});
  }
}

await ensurePreviewReady();
const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const layout of WIDTHS) {
    await runEventCase(browser, layout);
    await runMultiResponseCase(browser, layout);
    await runMultiResponseCase(browser, layout, { persisted: true });
    await runConstructionCase(browser, layout);
  }
  console.log("PASS: rapid single-response, fresh/reopened multi-response, and construction spend coverage at phone and desktop widths");
} finally {
  await browser.close().catch(() => {});
}