// Browser regression coverage for the persistent training-speed banner.
// It verifies that route transitions do not lose the active doctrine notice,
// that the doctrine countdown clears at zero, and that permanent facility
// boosts do not incorrectly show expiry text.
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/trainingBoostRoutes.e2e.mjs
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const PREVIEW_READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120000;
const PREVIEW_REQUEST_TIMEOUT_MS = 10000;

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

async function visibleText(page, text) {
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
    if (await visibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForEndTurn(page, timeout = 30000) {
  try {
    await waitForVisibleText(page, "END TURN", timeout);
  } catch (error) {
    const blocker = await page.evaluate(() => {
      const visible = [...document.querySelectorAll("div, span, button")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((element) => (element.innerText ?? "").trim())
        .filter(Boolean);
      const crisisPrompt = visible.find((value) => /RESOLVE CRISIS TO CONTINUE/i.test(value));
      const turnHeader = visible.find((value) => /TURN-BASED COMMAND/i.test(value));
      return crisisPrompt
        ? `turn blocked by an unresolved crisis (${crisisPrompt})`
        : turnHeader
          ? `turn control missing while the turn-based command panel is visible (${turnHeader})`
          : "turn-based command panel is not visible";
    });
    throw new Error(`Could not find End Turn: ${blocker}. ${error.message}`);
  }
}

async function clickVisibleExactText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const matches = [...document.querySelectorAll("div, span, button")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? "").trim().toUpperCase() === needle
      );
    });
    const element = matches.sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible navigation tab: ${text}`);
}

async function assertVisibleRouteBanner(page, route, expectedSource, expectsExpiry) {
  await waitForVisibleText(page, expectedSource);
  await waitForVisibleText(page, "TRAINING PROGRAMS");
  const result = await page.evaluate(({ source, expiry }) => {
    const text = [...document.querySelectorAll("div, span")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.innerText ?? "").trim())
      .find((value) => value.toUpperCase().includes("TRAINING PROGRAMS"));
    return {
      text: text ?? "",
      hasSource: (text ?? "").toUpperCase().includes(source.toUpperCase()),
      hasExpiry: (text ?? "").toUpperCase().includes("EXPIRES IN"),
      expectsExpiry: expiry,
    };
  }, { source: expectedSource, expiry: expectsExpiry });
  if (!result.hasSource) throw new Error(`${route} banner lost source label: ${result.text}`);
  if (result.hasExpiry !== expectsExpiry) {
    throw new Error(`${route} expiry wording mismatch: ${result.text}`);
  }
  console.log(`PASS ${route}: ${result.text}`);
}

async function readTrainingBanner(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("div, span")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.innerText ?? "").trim())
      .find((value) => value.toUpperCase().includes("TRAINING PROGRAMS")) ?? "",
  );
}

async function assertDoctrineCountdown(page) {
  await waitForVisibleText(page, "Accelerated Training Doctrine");
  const initialBanner = await readTrainingBanner(page);
  if (!/\bdoctrine expires in 12 ticks\b/i.test(initialBanner)) {
    throw new Error(`Initial doctrine countdown mismatch: ${initialBanner}`);
  }
  if (/facility.*expires in|expires in.*facility/i.test(initialBanner)) {
    throw new Error(`Initial banner used facility expiry wording: ${initialBanner}`);
  }

  await clickVisibleExactText(page, "CITY");
  await waitForEndTurn(page);
  await clickVisibleExactText(page, "END TURN");

  await clickVisibleExactText(page, "MORE");
  await waitForVisibleText(page, "RECRUITMENT & PERSONNEL");
  await clickVisibleExactText(page, "RECRUITMENT & PERSONNEL");
  await waitForVisibleText(page, "Accelerated Training Doctrine");
  const updatedBanner = await readTrainingBanner(page);
  if (!/\bdoctrine expires in 8 ticks\b/i.test(updatedBanner)) {
    throw new Error(`Doctrine countdown did not advance from 12 to 8: ${updatedBanner}`);
  }
  if (/facility.*expires in|expires in.*facility/i.test(updatedBanner)) {
    throw new Error(`Updated banner used facility expiry wording: ${updatedBanner}`);
  }
  console.log(`PASS doctrine countdown: ${initialBanner} → ${updatedBanner}`);
}

async function advanceTurnFromRecruitment(page) {
  await clickVisibleExactText(page, "CITY");
  try {
    await waitForEndTurn(page, 2000);
  } catch (error) {
    if (/turn blocked by an unresolved crisis/i.test(error.message)) throw error;
    await clickVisibleExactText(page, "CITY");
    await waitForEndTurn(page);
  }
  await clickVisibleExactText(page, "END TURN");

  // MILITARY is a top-level tab and renders the same shared banner. Its
  // hotkey avoids the recruitment page's nested "MILITARY" section heading.
  await page.keyboard.press("e");
  await sleep(500);
}

async function assertDoctrineExpiryClears(page) {
  // The doctrine has 8 ticks left after assertDoctrineCountdown. Day-boundary
  // turns can advance fewer than four ticks depending on the seeded clock, so
  // continue through the supported UI flow until the banner reaches zero.
  let finalBanner = await readTrainingBanner(page);
  for (let turn = 0; turn < 4 && /doctrine expires in/i.test(finalBanner); turn += 1) {
    await advanceTurnFromRecruitment(page);
    finalBanner = await readTrainingBanner(page);
  }
  if (/doctrine expires in|expires in.*doctrine/i.test(finalBanner)) {
    throw new Error(`Expired doctrine left stale expiry wording: ${finalBanner}`);
  }
  if (finalBanner && !/training facilities/i.test(finalBanner)) {
    throw new Error(`Unexpected training banner after doctrine expiry: ${finalBanner}`);
  }
  console.log(`PASS doctrine expiry clears cleanly: ${finalBanner || "(banner cleared)"}`);
}

async function assertCombinedDoctrineExpiryKeepsFacilities(page) {
  // The combined fixture starts with 12 doctrine ticks and permanent
  // facilities. Advance only through the supported turn-based UI flow until
  // the temporary doctrine expires, then verify the permanent source remains.
  let finalBanner = await readTrainingBanner(page);
  for (let turn = 0; turn < 4 && /doctrine expires in/i.test(finalBanner); turn += 1) {
    await advanceTurnFromRecruitment(page);
    finalBanner = await readTrainingBanner(page);
  }
  if (!/training facilities/i.test(finalBanner)) {
    throw new Error(`Permanent training-facility banner disappeared after doctrine expiry: ${finalBanner}`);
  }
  if (/expires in/i.test(finalBanner)) {
    throw new Error(`Expired doctrine left expiry wording beside permanent facilities: ${finalBanner}`);
  }
  console.log(`PASS combined doctrine expiry keeps facilities: ${finalBanner}`);
}

async function createIsolatedContext(browser) {
  if (typeof browser.createBrowserContext === "function") {
    return browser.createBrowserContext();
  }
  if (typeof browser.createIncognitoBrowserContext === "function") {
    return browser.createIncognitoBrowserContext();
  }
  throw new Error("Puppeteer does not support creating an isolated browser context");
}

async function runFixtureOnPage(page, query, expectedSource, expectsExpiry) {
  const turnBasedQuery = /(?:^|&)mode=turnbased(?:&|$)/.test(query)
    ? query
    : `${query}&mode=turnbased`;
  await page.goto(`${BASE_URL}/?demo=1&${turnBasedQuery}&go=recruitment`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitForVisibleText(page, "TRAINING PROGRAMS");
  // Recruitment is the seeded starting route and may be hidden from the
  // compact top bar when the viewport cannot fit every extended tab.
  await assertVisibleRouteBanner(page, "RECRUITMENT", expectedSource, expectsExpiry);
  for (const route of ["MILITARY", "LAW"]) {
    await clickVisibleExactText(page, route);
    await assertVisibleRouteBanner(page, route, expectedSource, expectsExpiry);
  }
}

async function runFixture(browser, query, expectedSource, expectsExpiry) {
  const context = await createIsolatedContext(browser);
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  try {
    await runFixtureOnPage(page, query, expectedSource, expectsExpiry);
  } finally {
    await context.close().catch(() => {});
  }
}

await ensurePreviewReady();

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,720"],
});

const primaryContext = await createIsolatedContext(browser);
const page = await primaryContext.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  // Event cards currently render nested RN-Web buttons, which React reports
  // as a hydration warning. Keep surfacing other browser errors without
  // making this focused banner regression depend on that unrelated warning.
  if (
    message.type() === "error" &&
     !/favicon|net::|404|AbortError|In HTML, %s cannot be a descendant of <%s>|cannot contain a nested/.test(
       message.text(),
     )
  ) {
    pageErrors.push(message.text());
  }
});

try {
  await page.goto(`${BASE_URL}/?demo=1&mode=turnbased&traindoctrine=1&go=recruitment`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitForVisibleText(page, "TRAINING PROGRAMS");
  await assertDoctrineCountdown(page);
  await assertDoctrineExpiryClears(page);
  await runFixture(browser, "traindoctrine=1", "Accelerated Training Doctrine", true);
  await runFixture(browser, "trainboost=1", "training facilities", false);
  const combinedContext = await createIsolatedContext(browser);
  const combinedPage = await combinedContext.newPage();
  await combinedPage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await runFixtureOnPage(
    combinedPage,
    "mode=turnbased&trainboost=1&traindoctrine=1",
    "training facilities + Accelerated Training Doctrine",
    true,
  );
  await clickVisibleExactText(combinedPage, "MORE");
  await waitForVisibleText(combinedPage, "RECRUITMENT & PERSONNEL");
  await clickVisibleExactText(combinedPage, "RECRUITMENT & PERSONNEL");
  await waitForVisibleText(combinedPage, "training facilities + Accelerated Training Doctrine");
  await assertCombinedDoctrineExpiryKeepsFacilities(combinedPage);
  await combinedContext.close();
  if (pageErrors.length) throw new Error(`Browser errors:\n${pageErrors.join("\n")}`);
  console.log("PASS: training notices survive countdown and recruitment → military → law transitions");
} finally {
  await primaryContext.close().catch(() => {});
  await browser.close().catch(() => {});
}
