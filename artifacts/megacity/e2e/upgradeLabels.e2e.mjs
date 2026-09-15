// Browser regression coverage for friendly asset-upgrade requirement labels
// on the real Expo web screen and in its apply confirmation.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/upgradeLabels.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const FIXTURE_URL = `${BASE_URL}/?demo=1&upgradelabels=1&go=upgrades`;
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

async function waitForVisibleText(page, text, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickVisibleButton(page, label) {
  const clicked = await page.evaluate((target) => {
    const wanted = target.toUpperCase();
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const buttons = [...document.querySelectorAll('[role="button"], button, [tabindex="0"]')]
      .filter(isVisible)
      .filter((element) => ((element.innerText ?? element.textContent) || "").trim().toUpperCase() === wanted);
    const button = buttons[0];
    if (!button) return false;
    button.scrollIntoView({ block: "center", inline: "center" });
    button.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not click visible button: ${label}`);
}

async function assertNoRawIds(page, label) {
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  for (const rawId of ["tactical_exoskeleton_armor", "flak_vest"]) {
    if (body.includes(rawId)) {
      throw new Error(`${label} exposed raw upgrade requirement ID: ${rawId}`);
    }
  }
}

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });

try {
  await page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForVisibleText(page, "ASSET UPGRADES");
  await waitForVisibleText(page, "Ballistic Plating Refit");
  await waitForVisibleText(page, "RESEARCH: Tactical Exoskeleton Armor");
  await waitForVisibleText(page, "Flak Vest (2/2)");
  await assertNoRawIds(page, "requirements panel");

  await clickVisibleButton(page, "APPLY UPGRADE");
  await waitForVisibleText(page, "Consumes: 2× Flak Vest");
  await waitForVisibleText(page, "Research: Tactical Exoskeleton Armor");
  await assertNoRawIds(page, "apply confirmation");

  console.log("[e2e] PASS upgrade requirements and apply confirmation use friendly labels");
} finally {
  await browser.close();
}