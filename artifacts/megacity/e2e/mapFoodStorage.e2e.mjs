// Real-screen regression for map food rewards when the structural reserve is
// full. The fixture is deterministic, read-only, and must not create a save.
//
// Requires the "artifacts/megacity: expo" workflow.

import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const MAP_URL = `${BASE_URL}/?demo=1&mapfoodstorage=1&go=worldmap`;
const EXPECTED_RESULT = "+0 food stored; +20 rejected because the reserve is full";
const EXPECTED_GUIDANCE = "OPEN ECONOMY TO CHECK THE FOOD STORAGE READOUT";
const EXPECTED_CONSUMPTION = "FOOD CONSUMPTION STILL WORKS WHILE THE RESERVE IS FULL";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
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

async function waitForVisibleText(page, text, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}; current URL: ${page.url()}`);
}

async function clickAccessibleNode(page, label) {
  const clicked = await page.evaluate((target) => {
    const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not click visible accessibility label: ${label}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((targetText) => {
    const target = targetText.trim().toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if ((node.textContent ?? "").trim().toUpperCase() !== target) continue;
      const element = node.parentElement;
      const rect = element?.getBoundingClientRect();
      if (!element || !rect || rect.width <= 0 || rect.height <= 0) continue;
      element.click();
      return true;
    }
    return false;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function assertNoPlayerSaveStorage(page) {
  const keys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter(
      (key) =>
        key.startsWith("@megacity_slot_") ||
        key === "@megacity_save" ||
        key === "@megacity_profiles_index" ||
        key.startsWith("@megacity_profile_") ||
        key === "@megacity_active_profile",
    ),
  );
  assert.deepEqual(keys, [], "Map food-storage fixture created a player save");
}

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  timeout: 120_000,
  protocolTimeout: 120_000,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 402, height: 874 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404|AbortError/.test(message.text())) {
      pageErrors.push(message.text());
    }
  });

  await page.goto(MAP_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForVisibleText(page, "WORLD MAP");
  await clickAccessibleNode(page, "Mexico City, township");
  await waitForVisibleText(page, "SEND SCOUTS");

  // The fixture removes the discovery draw. Skip all preceding scout
  // encounters, then fire HIDDEN SUPPLY CACHE, which grants 20 food. The
  // Four preceding candidates are eligible for this urban target. Keep the
  // sequence explicit so the positive food encounter, rather than an
  // earlier intel result, is the one rendered.
  await page.evaluate(() => {
    const values = [0.99, 0.99, 0.99, 0.99, 0.001, 0.001];
    Math.random = () => values.shift() ?? 0.001;
  });
  await clickVisibleText(page, "SEND SCOUTS");
  await waitForVisibleText(page, EXPECTED_RESULT);
  await waitForVisibleText(page, EXPECTED_GUIDANCE);
  await waitForVisibleText(page, EXPECTED_CONSUMPTION);

  const visibleResult = await page.evaluate(() => document.body.innerText);
  assert.ok(visibleResult.includes("HIDDEN SUPPLY CACHE"), "Map result did not show the deterministic food encounter");
  assert.ok(visibleResult.includes(EXPECTED_RESULT), "Map result lost stored/rejected food amounts");
  const normalizedResult = visibleResult.toUpperCase();
  assert.ok(normalizedResult.includes(EXPECTED_GUIDANCE), "Map result lost the Economy storage hint");
  assert.ok(normalizedResult.includes(EXPECTED_CONSUMPTION), "Map result lost the food consumption note");
  await assertNoPlayerSaveStorage(page);
  assert.deepEqual(pageErrors, [], `Browser errors:\n${pageErrors.join("\n")}`);
  console.log("[e2e] PASS: full food storage map reward explains stored/rejected amounts, Economy guidance, and consumption");
} finally {
  await browser.close();
}