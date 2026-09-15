// Browser regression coverage for the player-facing personal relationship
// boost preview. The demo fixture represents a previous use at three points
// in the deterministic tick timeline: fresh, repeat-after-cooldown, and
// recovered-after-decay.
//
// Requires the "artifacts/megacity: expo" workflow.

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import LZString from "lz-string";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const PREVIEW_READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120000;
const PREVIEW_REQUEST_TIMEOUT_MS = 10000;
const FIXTURE_STORAGE_KEY = "@megacity_e2e_relationship_boosts_1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const { decompressFromUTF16 } = LZString;

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures.push(name);
}

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
      const response = await fetchWithTimeout(BASE_URL, PREVIEW_REQUEST_TIMEOUT_MS);
      if (!response.ok) throw new Error(`preview returned HTTP ${response.status}`);
      const html = await response.text();
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
      if (!node.textContent?.toUpperCase().includes(needle)) continue;
      const rect = node.parentElement?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }, text);
}

async function waitForText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickExactText(page, text) {
  const clicked = await page.evaluate((targetText) => {
    const target = targetText.trim().toUpperCase();
    const candidates = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter(
        (node) =>
          ((node.innerText ?? node.textContent) ?? "").trim().toUpperCase() === target,
      )
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    const element = candidates.at(-1);
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not find visible exact text: ${text}`);
}

async function assertNoVisibleText(page, text) {
  if (await visibleText(page, text)) {
    throw new Error(`Unexpected visible text: ${text}`);
  }
}

async function openFactionMenu(page) {
  await waitForText(page, "FACTIONS / CIVIC & EXTERNAL AFFAIRS");
  await waitForText(page, "The Authority");
  const expanded = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("div, span")].find(
      (element) => (element.innerText ?? "").trim() === "The Authority",
    );
    if (!heading) return false;
    let card = heading;
    while (card.parentElement) {
      const text = card.innerText ?? "";
      if (
        text.includes("The Authority") &&
        text.includes("NEGOTIATE") &&
        text.toUpperCase().includes("MORE ACTIONS")
      ) {
        const toggle = [...card.querySelectorAll("div, span, button")].find((element) =>
          (element.innerText ?? "").trim().toUpperCase().startsWith("MORE ACTIONS"),
        );
        if (!toggle) return false;
        toggle.scrollIntoView({ block: "center", inline: "center" });
        toggle.click();
        return true;
      }
      card = card.parentElement;
    }
    return false;
  });
  if (!expanded) throw new Error("Could not find The Authority interaction menu");
  await waitForText(page, "GIVE GIFT");
}

async function openCharacterMenu(page) {
  await waitForText(page, "DOSSIER");
  await waitForText(page, "CIRCLE");
  await clickExactText(page, "CIRCLE");
  await waitForText(page, "INNER CIRCLE");
  await clickExactText(page, "MORE ACTIONS (5)");
  await waitForText(page, "GIVE GIFT");
}

async function assertFullStrengthPreview(page, kind) {
  if (kind === "faction") {
    await waitForText(page, "+8 loyalty");
    await waitForText(page, "+2 influence");
    await waitForText(page, "1,500c");
  } else {
    await waitForText(page, "+8 loyalty");
    await waitForText(page, "1,500c");
  }
  await assertNoVisibleText(page, "Reduced effect:");
}

async function assertReducedPreview(page, kind) {
  await waitForText(page, "Reduced effect: 60%");
  await waitForText(page, "+4.8 loyalty");
  if (kind === "faction") await waitForText(page, "+1.2 influence");
  await assertNoVisibleText(page, "Recently used");
}

async function checkPhase(page, phase, expectsFullStrength, reloadPhase = null) {
  const base =
    `${BASE_URL}/?demo=1&relationshipboosts=1&relationshipboostsphase=${phase}` +
    (reloadPhase ? `&relationshipboostreload=${reloadPhase}` : "");

  await page.goto(`${base}&go=factions`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await openFactionMenu(page);
  if (expectsFullStrength) {
    await assertFullStrengthPreview(page, "faction");
  } else {
    await assertReducedPreview(page, "faction");
  }
  if (reloadPhase === "save") {
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      FIXTURE_STORAGE_KEY,
    );
    const savedEnvelopeRaw = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      FIXTURE_STORAGE_KEY,
    );
    let savedHistory = false;
    try {
      const envelope = JSON.parse(savedEnvelopeRaw ?? "");
      const json = decompressFromUTF16(envelope.data ?? "");
      const savedState = JSON.parse(json ?? "");
      const history = savedState.personalActionHistory ?? {};
      const expectedGiftTick = phase === "repeat" ? 180 : 103;
      savedHistory =
        history["faction:judges:give-gift"]?.includes(expectedGiftTick) &&
        Object.entries(history).some(
          ([key, uses]) =>
            key.startsWith("officer:") &&
            key.endsWith(":give-gift") &&
            Array.isArray(uses) &&
            uses.includes(expectedGiftTick),
        );
    } catch {
      savedHistory = false;
    }
    check(
      `${phase} save fixture stores both recent gifts in an isolated slot`,
      Boolean(savedEnvelopeRaw) && savedHistory,
    );
  }
  console.log(`[e2e] PASS ${phase} faction relationship preview`);

  await page.goto(`${base}&go=character`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await openCharacterMenu(page);
  if (expectsFullStrength) {
    await assertFullStrengthPreview(page, "officer");
  } else {
    await assertReducedPreview(page, "officer");
  }
  console.log(`[e2e] PASS ${phase} officer relationship preview`);
}

async function run() {
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
  const context =
    (await browser.createBrowserContext?.()) ??
    (await browser.createIncognitoBrowserContext?.());
  try {
    if (!context) throw new Error("Puppeteer could not create an isolated browser context");
    const page = await context.newPage();
    await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });
    const browserErrors = [];
    page.on("pageerror", (error) => {
      if (/AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(String(error))) {
        return;
      }
      browserErrors.push(String(error));
    });
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !/favicon|net::|404|AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(
          message.text(),
        )
      ) {
        browserErrors.push(message.text());
      }
    });

    await checkPhase(page, "full", true);
    await checkPhase(page, "repeat", false, "save");
    await page.goto(
      `${BASE_URL}/?demo=1&relationshipboosts=1&relationshipboostsphase=repeat&relationshipboostreload=load&go=factions`,
      { waitUntil: "domcontentloaded", timeout: 120000 },
    );
    await openFactionMenu(page);
    await assertReducedPreview(page, "faction");
    console.log("[e2e] PASS repeat faction relationship preview after save/reload");

    await page.goto(
      `${BASE_URL}/?demo=1&relationshipboosts=1&relationshipboostsphase=repeat&relationshipboostreload=load&go=character`,
      { waitUntil: "domcontentloaded", timeout: 120000 },
    );
    await openCharacterMenu(page);
    await assertReducedPreview(page, "officer");
    console.log("[e2e] PASS repeat officer relationship preview after save/reload");

    await checkPhase(page, "recovered", true, "save");
    await page.goto(
      `${BASE_URL}/?demo=1&relationshipboosts=1&relationshipboostsphase=recovered&relationshipboostreload=load&go=factions`,
      { waitUntil: "domcontentloaded", timeout: 120000 },
    );
    await openFactionMenu(page);
    await assertFullStrengthPreview(page, "faction");
    console.log("[e2e] PASS recovered faction relationship preview after save/reload");

    await page.goto(
      `${BASE_URL}/?demo=1&relationshipboosts=1&relationshipboostsphase=recovered&relationshipboostreload=load&go=character`,
      { waitUntil: "domcontentloaded", timeout: 120000 },
    );
    await openCharacterMenu(page);
    await assertFullStrengthPreview(page, "officer");
    console.log("[e2e] PASS recovered officer relationship preview after save/reload");

    check("relationship save/reload fixture stays browser-error free", browserErrors.length === 0);
    console.log("[e2e] PASS relationship menus show fading and recovered personal boosts");
  } finally {
    await context?.close().catch(() => {});
    await browser.close();
  }
}

try {
  await ensurePreviewReady();
  await run();
} catch (error) {
  console.error(`\nE2E FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (failures.length) {
  console.error(`\nFAILURES:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log("\nPASS: relationship boost browser cases");
}