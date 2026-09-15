// Browser regression coverage for biosphere recovery tips on the real Expo
// screens. It deliberately revisits the same construction tip after returning
// to Wildlands and scrolling away, proving the fresh route signal re-runs the
// category selection, list scroll, and temporary building highlight.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/biosphereRecoveryNavigation.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const RECOVERY_URL = `${BASE_URL}/?demo=1&recovery=1&go=wildlands`;

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function waitForVisibleText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForPath(page, suffix, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith(suffix)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for path ${suffix}; current URL: ${page.url()}`);
}

async function clickRecoveryTip(page, textFragment) {
  const clicked = await page.evaluate((fragment) => {
    const needle = fragment.toUpperCase();
    const candidates = [...document.querySelectorAll('[role="button"], button')].filter((element) => {
      const rect = element.getBoundingClientRect();
      const label = (element.getAttribute("aria-label") ?? "").toUpperCase();
      return rect.width > 0 && rect.height > 0 && label.includes(needle);
    });
    const target = candidates[0];
    if (!target) return false;
    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
    return true;
  }, textFragment);
  if (!clicked) throw new Error(`Could not click recovery tip containing: ${textFragment}`);
}

async function readConstructionLanding(page) {
  return page.evaluate(() => {
    const targetText = "BIOSPHERE RECLAMATION DOME";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(targetText)) continue;
      let element = node.parentElement;
      while (element && element !== document.body) {
        const rect = element.getBoundingClientRect();
        const role = element.getAttribute("role");
        if (rect.width > 0 && rect.height > 0 && (role === "button" || element.tagName === "BUTTON" || getComputedStyle(element).cursor === "pointer")) {
          const style = getComputedStyle(element);
          if (parseFloat(style.borderTopWidth) >= 2) {
            return {
              visible: true,
              top: Math.round(rect.top),
              bottom: Math.round(rect.bottom),
              borderColor: style.borderColor,
              backgroundColor: style.backgroundColor,
              viewportHeight: window.innerHeight,
            };
          }
        }
        element = element.parentElement;
      }
    }
    return null;
  });
}

async function waitForHighlightedLanding(page, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const landing = await readConstructionLanding(page);
    if (
      landing &&
      landing.top >= 0 &&
      landing.bottom <= landing.viewportHeight &&
      landing.borderColor !== "rgba(0, 0, 0, 0)" &&
      landing.backgroundColor !== "rgba(0, 0, 0, 0)"
    ) {
      return landing;
    }
    await sleep(250);
  }
  throw new Error(`Highlighted construction target did not land in view: ${JSON.stringify(await readConstructionLanding(page))}`);
}

async function scrollWildlandsAway(page) {
  await page.evaluate((tipFragment) => {
    const scrollable = [...document.querySelectorAll("div")].find(
      (element) => element.scrollHeight > element.clientHeight + 20,
    );
    if (!scrollable) throw new Error("Wildlands screen has no scrollable container");
    scrollable.scrollTop = scrollable.scrollHeight;
    scrollable.dispatchEvent(new Event("scroll", { bubbles: true }));
    const tip = [...document.querySelectorAll('[role="button"], button')].find((element) =>
      (element.getAttribute("aria-label") ?? "").toUpperCase().includes(tipFragment.toUpperCase()),
    );
    if (!tip) throw new Error("Construction recovery tip disappeared from the Wildlands DOM");
    const rect = tip.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) {
      throw new Error("Wildlands scroll-away step did not move the construction tip off-screen");
    }
  }, "Build more green infrastructure");
  await sleep(500);
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
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 720, deviceScaleFactor: 1 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.goto(RECOVERY_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForPath(page, "/wildlands");
    await waitForVisibleText(page, "BIOSPHERE BREAKDOWN");
    await waitForVisibleText(page, "Build more green infrastructure");

    const constructionTip = "Build more green infrastructure";
    const expectedBuilding = "BIOSPHERE RECLAMATION DOME";

    await clickRecoveryTip(page, constructionTip);
    await waitForPath(page, "/construction");
    let url = new URL(page.url());
    if (
      url.searchParams.get("category") !== "biosphere" ||
      url.searchParams.get("highlight") !== "biosphereReclamationDomes" ||
      !url.searchParams.get("hl")
    ) {
      throw new Error(`First construction deep-link params were wrong: ${url.href}`);
    }
    const firstNonce = url.searchParams.get("hl");
    await waitForVisibleText(page, "BIOSPHERE INFRASTRUCTURE");
    await waitForVisibleText(page, expectedBuilding);
    const firstLanding = await waitForHighlightedLanding(page);
    console.log(`[e2e] first construction tip landed and highlighted target at y=${firstLanding.top}`);

    await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForPath(page, "/wildlands");
    await waitForVisibleText(page, "BIOSPHERE BREAKDOWN");
    await scrollWildlandsAway(page);
    await clickRecoveryTip(page, constructionTip);
    await waitForPath(page, "/construction");
    url = new URL(page.url());
    if (
      url.searchParams.get("category") !== "biosphere" ||
      url.searchParams.get("highlight") !== "biosphereReclamationDomes" ||
      url.searchParams.get("hl") === null
    ) {
      throw new Error(`Second construction deep-link params were wrong: ${url.href}`);
    }
    if (url.searchParams.get("hl") === firstNonce) {
      throw new Error("Second construction deep-link did not carry a fresh highlight nonce");
    }
    await waitForVisibleText(page, "BIOSPHERE INFRASTRUCTURE");
    await waitForVisibleText(page, expectedBuilding);
    const secondLanding = await waitForHighlightedLanding(page);
    console.log(`[e2e] second construction tip re-landed and highlighted target at y=${secondLanding.top}`);

    // Check the other actionable biosphere destinations from the same real
    // breakdown card. These should remain ordinary route transitions.
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForPath(page, "/wildlands");
    await waitForVisibleText(page, "BIOSPHERE BREAKDOWN");
    await clickRecoveryTip(page, "Repair failing infrastructure");
    await waitForPath(page, "/construction");
    url = new URL(page.url());
    if (
      url.searchParams.get("category") !== "infrastructure" ||
      url.searchParams.get("highlight") !== null
    ) {
      throw new Error(`Infrastructure recovery destination params were wrong: ${url.href}`);
    }
    await waitForVisibleText(page, "INFRA INFRASTRUCTURE");

    await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForPath(page, "/wildlands");
    await waitForVisibleText(page, "BIOSPHERE BREAKDOWN");
    await clickRecoveryTip(page, "Enact ecology policies");
    await waitForPath(page, "/law");
    await waitForVisibleText(page, "LAW / JUSTICE / SECURITY");

    if (browserErrors.length) {
      throw new Error(`Browser errors during biosphere recovery navigation:\n${browserErrors.join("\n")}`);
    }
    console.log("[e2e] PASS: biosphere recovery tips re-guide on both construction taps and preserve other destinations");
  } finally {
    await browser.close().catch(() => {});
  }
}

await run();