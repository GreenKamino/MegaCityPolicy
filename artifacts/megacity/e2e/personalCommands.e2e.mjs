// Browser smoke coverage for the personal-command menus on real Character,
// Factions, and Overview > Demographics screens.
//
// The fixture is paused, broke, and read-only. It confirms free actor and
// population commands, keeps paid-action reasons visible, and survives a
// full route refresh without creating a player save.
//
// Requires the "artifacts/megacity: expo" workflow.
//   pnpm --filter @workspace/megacity run test:e2e:personal-commands

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures.push(name);
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

async function waitForText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickExactText(page, text, { last = false } = {}) {
  const clicked = await page.evaluate(({ targetText, lastMatch }) => {
    const target = targetText.trim().toUpperCase();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        styles.display !== "none" &&
        styles.visibility !== "hidden"
      );
    };
    const matches = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter(visible)
      .filter((element) => ((element.innerText ?? element.textContent) ?? "").trim().toUpperCase() === target);
    const element = lastMatch ? matches.at(-1) : matches[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, { targetText: text, lastMatch: last });
  if (!clicked) throw new Error(`Could not find visible exact text: ${text}`);
}

async function clickCardText(page, cardMarker, text) {
  const clicked = await page.evaluate(({ marker, targetText }) => {
    const heading = [...document.querySelectorAll("div, span")].find(
      (element) =>
        (element.innerText ?? "").trim() === marker &&
        element.getBoundingClientRect().width > 0 &&
        element.getBoundingClientRect().height > 0,
    );
    if (!heading) return false;
    let card = heading;
    while (card.parentElement) {
      const cardText = card.innerText ?? "";
      if (cardText.includes(marker) && cardText.includes(targetText)) {
        const target = [...card.querySelectorAll("div, span, button, [role='button']")].find(
          (element) =>
            (element.innerText ?? element.textContent ?? "").trim().toUpperCase() ===
            targetText.toUpperCase(),
        );
        if (!target) return false;
        target.scrollIntoView({ block: "center", inline: "center" });
        target.click();
        return true;
      }
      card = card.parentElement;
    }
    return false;
  }, { marker: cardMarker, targetText: text });
  if (!clicked) throw new Error(`Could not click ${text} in ${cardMarker} card`);
}

async function expandFactionMenu(page, factionName) {
  const expanded = await page.evaluate((name) => {
    const heading = [...document.querySelectorAll("div, span")].find(
      (element) =>
        (element.innerText ?? "").trim() === name &&
        element.getBoundingClientRect().width > 0 &&
        element.getBoundingClientRect().height > 0,
    );
    if (!heading) return false;
    let card = heading;
    while (card.parentElement) {
      const cardText = card.innerText ?? "";
      if (cardText.includes(name) && cardText.toUpperCase().includes("MORE ACTIONS")) {
        const toggle = [...card.querySelectorAll("div, span, button, [role='button']")].find(
          (element) => (element.innerText ?? "").trim().toUpperCase().startsWith("MORE ACTIONS"),
        );
        if (!toggle) return false;
        toggle.scrollIntoView({ block: "center", inline: "center" });
        toggle.click();
        return true;
      }
      card = card.parentElement;
    }
    return false;
  }, factionName);
  if (!expanded) throw new Error(`Could not expand ${factionName} interaction menu`);
}

async function assertNoPlayerSaveStorage(page) {
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  const playerKeys = keys.filter(
    (key) =>
      key.startsWith("@megacity_slot_") ||
      key === "@megacity_save" ||
      key === "@megacity_profiles_index" ||
      key.startsWith("@megacity_profile_") ||
      key === "@megacity_active_profile",
  );
  check("personal-command fixture leaves player storage untouched", playerKeys.length === 0);
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
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(String(error)));
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

    const fixture = (route) =>
      `${BASE_URL}/?demo=1&personalcommands=1&go=${route}`;

    await page.goto(fixture("character"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "DOSSIER");
    await clickExactText(page, "CIRCLE");
    await waitForText(page, "CIVIC FIGURES");
    await waitForText(page, "Director Mira Vale");
    await waitForText(page, "GIVE GIFT");
    await waitForText(page, "Need 1,500 credits");
    check("Character shows the paid actor command with its insufficient-credit reason", true);
    await clickCardText(page, "Director Mira Vale", "FLATTER");
    await waitForText(page, "FLATTER: Director Mira Vale");
    await clickExactText(page, "FLATTER", { last: true });
    await waitForText(page, "Recently used — wait 16 ticks");
    check("Character confirms an actor command and shows its cooldown", true);

    await page.goto(fixture("factions"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "FACTIONS / CIVIC & EXTERNAL AFFAIRS");
    await waitForText(page, "The Sector Syndicates");
    await waitForText(page, "Razor Vex");
    await expandFactionMenu(page, "The Sector Syndicates");
    await waitForText(page, "GIVE GIFT");
    await waitForText(page, "Need 1,500 credits");
    check("Factions shows the paid leader command with its insufficient-credit reason", true);
    await clickCardText(page, "The Sector Syndicates", "FLATTER");
    await waitForText(page, "FLATTER: Razor Vex");
    await clickExactText(page, "FLATTER", { last: true });
    await waitForText(page, "Recently used — wait 16 ticks");
    check("Factions confirms a leader command and shows its cooldown", true);

    await page.goto(fixture("overview"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "CITY STATUS MATRIX");
    await clickExactText(page, "DEMOGRAPHICS");
    await waitForText(page, "COMMAND THE POPULATION");
    await waitForText(page, "ADDRESS THE MASSES");
    await waitForText(page, "RATION & REASSURE");
    await waitForText(page, "Need 2,000 credits");
    check("Demographics shows the population command panel and paid-action gate", true);
    await clickExactText(page, "ADDRESS THE MASSES");
    await waitForText(page, "ADDRESS THE MASSES: THE POPULATION");
    await clickExactText(page, "ADDRESS THE MASSES", { last: true });
    await waitForText(page, "Recently used — wait 24 ticks");
    check("Demographics confirms a population command and shows its cooldown", true);

    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForText(page, "CITY STATUS MATRIX");
    await clickExactText(page, "DEMOGRAPHICS");
    await waitForText(page, "COMMAND THE POPULATION");
    await waitForText(page, "ADDRESS THE MASSES");
    await assertNoPlayerSaveStorage(page);
    check("Demographics command smoke survives a full refresh", true);
    check("personal-command fixture stays browser-error free", browserErrors.length === 0);
  } finally {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

try {
  await run();
} catch (error) {
  console.error(`\nE2E FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (failures.length) {
  console.error(`\nFAILURES:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log("\nPASS: personal commands work on real screens");
}