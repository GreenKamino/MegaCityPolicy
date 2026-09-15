// Desktop-wrapper regression for the full food storage map reward result.
// Requires both the desktop wrapper and Expo game workflows.

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const BASE_URL = (process.env.E2E_BASE_URL || "http://localhost:80/desktop").replace(/\/$/, "");
const MAP_URL = `${BASE_URL}/?demo=1&mapfoodstorage=1&go=worldmap`;
const EXPECTED_RESULT = "+0 food stored; +20 rejected because the reserve is full";
const EXPECTED_GUIDANCE = "OPEN ECONOMY TO CHECK THE FOOD STORAGE READOUT";
const EXPECTED_CONSUMPTION = "FOOD CONSUMPTION STILL WORKS WHILE THE RESERVE IS FULL";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

async function waitFor(predicate, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await sleep(300);
  }
  throw new Error(`Timed out after ${timeout}ms`);
}

async function findGameFrame(page) {
  return waitFor(() => page.frames().find((frame) => frame !== page.mainFrame()) ?? null);
}

async function visibleText(page, text) {
  const frame = await findGameFrame(page);
  return frame.evaluate((target) => {
    const needle = target.toUpperCase();
    return (document.body?.innerText ?? "").toUpperCase().includes(needle);
  }, text);
}

async function clickAccessibleNode(page, label) {
  await waitFor(async () => {
    const frame = await findGameFrame(page);
    return frame.evaluate((target) => {
      const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      element.click();
      return true;
    }, label);
  });
}

async function clickVisibleText(page, text) {
  await waitFor(async () => {
    const frame = await findGameFrame(page);
    return frame.evaluate((target) => {
      const wanted = target.trim().toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if ((node.textContent ?? "").trim().toUpperCase() !== wanted) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) continue;
        node.parentElement.click();
        return true;
      }
      return false;
    }, text);
  });
}

async function frameText(page) {
  const frame = await findGameFrame(page);
  return frame.evaluate(() => document.body?.innerText ?? "");
}

async function assertNoPlayerSaveStorage(page) {
  const frame = await findGameFrame(page);
  const keys = await frame.evaluate(() =>
    Object.keys(localStorage).filter(
      (key) =>
        key.startsWith("@megacity_slot_") ||
        key === "@megacity_save" ||
        key === "@megacity_profiles_index" ||
        key.startsWith("@megacity_profile_") ||
        key === "@megacity_active_profile",
    ),
  );
  assert.deepEqual(keys, [], "Desktop map food-storage fixture created a player save");
}

async function run() {
  await ensureDesktopWrapperReady();
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: "new",
    timeout: 120_000,
    protocolTimeout: 120_000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    await page.goto(MAP_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitFor(() => visibleText(page, "WORLD MAP"));
    await clickAccessibleNode(page, "Mexico City, township");
    await waitFor(() => visibleText(page, "SEND SCOUTS"));
    const frame = await findGameFrame(page);
    await frame.evaluate(() => {
      const values = [0.99, 0.99, 0.99, 0.99, 0.001, 0.001];
      Math.random = () => values.shift() ?? 0.001;
    });
    await clickVisibleText(page, "SEND SCOUTS");
    await waitFor(() => visibleText(page, EXPECTED_RESULT));
    await waitFor(() => visibleText(page, EXPECTED_GUIDANCE));
    await waitFor(() => visibleText(page, EXPECTED_CONSUMPTION));

    const text = await frameText(page);
    assert.ok(text.includes("HIDDEN SUPPLY CACHE"), "Desktop map result did not show the deterministic food encounter");
    assert.ok(text.includes(EXPECTED_RESULT), "Desktop map result lost stored/rejected food amounts");
    const normalizedText = text.toUpperCase();
    assert.ok(normalizedText.includes(EXPECTED_GUIDANCE), "Desktop map result lost the Economy storage hint");
    assert.ok(normalizedText.includes(EXPECTED_CONSUMPTION), "Desktop map result lost the food consumption note");
    await assertNoPlayerSaveStorage(page);
    assert.deepEqual(pageErrors, [], `Desktop wrapper browser errors:\n${pageErrors.join("\n")}`);
    console.log("[e2e] PASS: desktop map food reward explains full-storage feedback without creating a save");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error("[e2e] FAIL:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});