// Browser regression coverage for the Law screen's crime recovery hints.
//
// The default high-crime fixture must keep the public-order hint as readable
// same-screen guidance, not a button that goes nowhere. Its construction and
// military hints must still deep-link to their destinations. A reloaded
// public-order variant puts the mining hint in the visible top-three list and
// verifies that destination too.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/crimeRecoveryNavigation.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");

const LAW_URL = `${BASE_URL}/?demo=1&crime=1&go=law`;
const MINING_URL = `${BASE_URL}/?demo=1&crime=1&crimeorder=1&go=law`;

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function visibleText(page, text) {
  return page.evaluate((needle) => {
    const target = needle.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").toUpperCase().includes(target)) continue;
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

async function waitForVisibleElementText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate((needle) => {
      const target = needle.toUpperCase();
      return [...document.querySelectorAll("*")].some((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (element.innerText ?? "").toUpperCase().includes(target)
        );
      });
    }, text);
    if (found) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible element text: ${text}`);
}

async function waitForPath(page, suffix, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith(suffix)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for path ${suffix}; current URL: ${page.url()}`);
}

async function scrollTextIntoView(page, text) {
  const found = await page.evaluate((needle) => {
    const target = needle.toUpperCase();
    const element = [...document.querySelectorAll("*")]
      .filter((candidate) => (candidate.innerText ?? "").toUpperCase().includes(target))
      .sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (element) {
      element.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
    }
    return false;
  }, text);
  if (!found) throw new Error(`Could not find rendered text to scroll into view: ${text}`);
  await sleep(250);
}

async function clickRecoveryHint(page, textFragment) {
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
  if (!clicked) throw new Error(`Could not click recovery hint containing: ${textFragment}`);
}

async function assertPublicOrderGuidance(page) {
  const result = await page.evaluate(() => {
    const target = "ENABLE A PUBLIC-ORDER POLICY";
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const matching = [...document.querySelectorAll("*")].filter(
      (element) => isVisible(element) && (element.innerText ?? "").toUpperCase().includes(target),
    );
    const smallest = matching.sort(
      (a, b) => (a.innerText ?? a.textContent ?? "").length - (b.innerText ?? b.textContent ?? "").length,
    )[0];
    if (!smallest) return null;
    const row = smallest.closest('[role="text"], [role="button"], button, div') ?? smallest;
    return {
      text: (smallest.innerText ?? smallest.textContent ?? "").trim(),
      role: row.getAttribute("role"),
      tag: row.tagName,
      label: row.getAttribute("aria-label"),
      guidanceVisible: (smallest.innerText ?? smallest.textContent ?? "").toUpperCase().includes(
        "THE PUBLIC-ORDER CONTROLS ARE BELOW",
      ),
    };
  });
  if (!result) throw new Error("Public-order recovery guidance was not rendered");
  if (result.role === "button" || result.tag === "BUTTON") {
    throw new Error(`Public-order recovery guidance became a dead button: ${JSON.stringify(result)}`);
  }
  if (!result.guidanceVisible) {
    throw new Error(`Public-order recovery guidance omitted its same-screen direction: ${JSON.stringify(result)}`);
  }
}

async function reloadLaw(page, url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (!/detached|lifecyclewatcher/i.test(String(error)) || attempt === 2) throw error;
      await sleep(1000);
    }
  }
  if (lastError) throw lastError;
  await waitForPath(page, "/law");
  await waitForVisibleText(page, "LAW / JUSTICE / SECURITY");
  await waitForVisibleText(page, "CRIME BREAKDOWN");
}

function attachBrowserErrorHandlers(page, browserErrors) {
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${String(error)}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      browserErrors.push(`console.error: ${message.text()}`);
    }
  });
}

async function openLawPage(browser, url, browserErrors) {
  const page = await browser.newPage();
  await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });
  attachBrowserErrorHandlers(page, browserErrors);
  await reloadLaw(page, url);
  return page;
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
  const browserErrors = [];
  let page;

  try {
    page = await openLawPage(browser, LAW_URL, browserErrors);
    await scrollTextIntoView(page, "Crime 80");
    await waitForVisibleElementText(page, "Crime 80");
    await waitForVisibleText(page, "Build enforcement infrastructure");
    await waitForVisibleText(page, "Deploy more enforcers");
    await waitForVisibleText(page, "Enable a public-order policy");
    await assertPublicOrderGuidance(page);
    console.log("[e2e] PASS: public-order recovery hint is readable same-screen guidance");

    await clickRecoveryHint(page, "Build enforcement infrastructure");
    await waitForPath(page, "/construction");
    const constructionUrl = new URL(page.url());
    if (
      constructionUrl.searchParams.get("category") !== "security" ||
      constructionUrl.searchParams.get("highlight") !== "sectorHouseHQ"
    ) {
      throw new Error(`Construction crime deep-link params were wrong: ${constructionUrl.href}`);
    }
    await waitForVisibleText(page, "CONSTRUCTION");
    console.log("[e2e] PASS: construction crime hint reaches the security destination");

    await page.close();
    page = await openLawPage(browser, LAW_URL, browserErrors);
    await clickRecoveryHint(page, "Deploy more enforcers");
    await waitForPath(page, "/military");
    await waitForVisibleText(page, "MILITARY");
    console.log("[e2e] PASS: military crime hint reaches the military destination");

    await page.close();
    page = await openLawPage(browser, MINING_URL, browserErrors);
    await waitForVisibleText(page, "Repeal the black-market ore mining policy");
    await clickRecoveryHint(page, "Repeal the black-market ore mining policy");
    await waitForPath(page, "/mining");
    await waitForVisibleText(page, "MINING");
    console.log("[e2e] PASS: mining crime hint reaches the mining destination after fixture reload");

    if (browserErrors.length) {
      throw new Error(`Browser emitted errors:\n${browserErrors.join("\n")}`);
    }
    console.log("[e2e] PASS: crime recovery hints stay clear across real-screen transitions");
  } finally {
    if (page && !page.isClosed()) await page.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});