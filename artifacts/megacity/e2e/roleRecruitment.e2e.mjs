// Browser regression coverage for the recruitment screen's battlefield-role
// filter at desktop and phone widths. It uses the real Expo web screen and a
// read-only demo fixture, so no native screen rendering mocks are involved.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/roleRecruitment.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
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

async function waitForVisibleText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickRoleTab(page, role) {
  const clicked = await page.evaluate((targetRole) => {
    const target = targetRole.toUpperCase();
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const tabs = [...document.querySelectorAll('[role="tab"]')]
      .filter(isVisible)
      .filter((element) => (element.innerText ?? element.textContent ?? "").trim().toUpperCase() === target);
    const tab = tabs[0];
    if (!tab) return false;
    tab.scrollIntoView({ block: "center", inline: "center" });
    tab.click();
    return true;
  }, role);
  if (!clicked) throw new Error(`Could not click visible role filter: ${role}`);
}

async function readRecruitmentCards(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const roleLines = [...document.querySelectorAll("div, span")]
      .filter(isVisible)
      .filter((element) => /^ROLE · .+/i.test((element.innerText ?? "").trim()));
    return roleLines.map((roleLine) => {
      let card = roleLine;
      while (card.parentElement && !(card.innerText ?? "").toUpperCase().includes("HIRE COST")) {
        card = card.parentElement;
      }
      const name = [...card.querySelectorAll("div, span")]
        .filter(isVisible)
        .map((element) => (element.innerText ?? "").trim())
        .find((text) => text && !/^ROLE · /i.test(text) && !text.includes("HIRE COST"));
      return {
        name: name ?? "",
        role: (roleLine.innerText ?? "").trim().replace(/^ROLE · /i, ""),
      };
    });
  });
}

async function waitForCardsWithRole(page, role, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const cards = await readRecruitmentCards(page);
    if (cards.length > 0 && cards.every((card) => card.role === role)) return cards;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for recruit cards filtered to ${role}`);
}

async function waitForRestoredCards(page, expectedCount, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const cards = await readRecruitmentCards(page);
    const roles = new Set(cards.map((card) => card.role));
    if (cards.length === expectedCount && roles.has("FRONTLINE") && roles.size >= 2) return cards;
    await sleep(250);
  }
  throw new Error("Timed out waiting for ALL ROLES to restore the full recruit list");
}

async function readRoleFilterLayout(page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const visibleTabs = tabs.filter((tab) => {
      const rect = tab.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    let strip = visibleTabs[0]?.parentElement ?? null;
    while (strip && strip !== document.body) {
      const style = getComputedStyle(strip);
      if (
        strip.scrollWidth > strip.clientWidth + 1 &&
        /auto|scroll/.test(`${style.overflowX} ${style.overflow}`)
      ) {
        break;
      }
      strip = strip.parentElement;
    }
    return {
      labels: visibleTabs.map((tab) => (tab.innerText ?? tab.textContent ?? "").trim().toUpperCase()),
      clipped: visibleTabs.some((tab) => {
        const rect = tab.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1;
      }),
      scrollWidth: strip?.scrollWidth ?? 0,
      clientWidth: strip?.clientWidth ?? 0,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
}

async function assertNoPlayerSaveStorage(page) {
  const saveKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter(
      (key) =>
        key.startsWith("@megacity_slot_") ||
        key === "@megacity_save" ||
        key === "@megacity_profiles_index" ||
        key.startsWith("@megacity_profile_") ||
        key === "@megacity_active_profile",
    ),
  );
  if (saveKeys.length) {
    throw new Error(`Role-filter fixture touched player storage: ${saveKeys.join(", ")}`);
  }
}

async function runRoleFilterScenario(page, viewport, label) {
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.goto(`${BASE_URL}/?demo=1&rolefilter=1&go=recruitment`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await waitForVisibleText(page, "RECRUITMENT & PERSONNEL");
  await waitForVisibleText(page, "ALL ROLES");

  const initialCards = await readRecruitmentCards(page);
  if (initialCards.length < 2) {
    throw new Error(`${label}: expected multiple unfiltered recruit cards, found ${initialCards.length}`);
  }
  const roleLayout = await readRoleFilterLayout(page);
  if (!roleLayout.labels.includes("ALL ROLES") || !roleLayout.labels.includes("RECONNAISSANCE")) {
    throw new Error(`${label}: role filter tabs were not rendered: ${roleLayout.labels.join(", ")}`);
  }
  if (label === "phone") {
    if (roleLayout.documentWidth > roleLayout.viewportWidth + 2) {
      throw new Error(
        `phone: recruitment screen has page-level horizontal overflow (${roleLayout.documentWidth}/${roleLayout.viewportWidth})`,
      );
    }
    if (roleLayout.clipped && roleLayout.scrollWidth <= roleLayout.clientWidth + 1) {
      throw new Error(
        `phone: clipped role tabs are not horizontally scrollable (${roleLayout.scrollWidth}/${roleLayout.clientWidth})`,
      );
    }
  }
  console.log(`PASS ${label} role filter is usable with ${initialCards.length} unfiltered recruit cards`);

  await clickRoleTab(page, "RECONNAISSANCE");
  const reconCards = await waitForCardsWithRole(page, "RECONNAISSANCE");
  if (!reconCards.length) throw new Error(`${label}: RECONNAISSANCE filter rendered no recruit cards`);
  if (reconCards.some((card) => card.role !== "RECONNAISSANCE")) {
    throw new Error(`${label}: RECONNAISSANCE filter leaked other roles: ${JSON.stringify(reconCards)}`);
  }
  if (reconCards.length >= initialCards.length) {
    throw new Error(
      `${label}: RECONNAISSANCE filter did not narrow the list (${initialCards.length} → ${reconCards.length})`,
    );
  }
  console.log(`PASS ${label} RECONNAISSANCE filter shows only ${reconCards.length} matching recruit cards`);

  await clickRoleTab(page, "ALL ROLES");
  const restoredCards = await waitForRestoredCards(page, initialCards.length);
  if (restoredCards.length !== initialCards.length) {
    throw new Error(
      `${label}: ALL ROLES did not restore the full recruit list (${initialCards.length} → ${restoredCards.length})`,
    );
  }
  const restoredRoles = new Set(restoredCards.map((card) => card.role));
  if (restoredRoles.size < 2) {
    throw new Error(`${label}: ALL ROLES did not restore multiple role categories: ${[...restoredRoles].join(", ")}`);
  }
  console.log(`PASS ${label} ALL ROLES restores ${restoredCards.length} recruit cards across ${restoredRoles.size} roles`);
}

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: "new",
  args: [
    "--no-sandbox",
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
  const browserErrors = [];
  page.on("pageerror", (error) => {
    if (!/AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(String(error))) {
      browserErrors.push(String(error));
    }
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404|AbortError: The play\(\) request was interrupted by a call to pause\(\)|In HTML, %s cannot be a descendant of <%s>|cannot contain a nested/.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });

  await runRoleFilterScenario(page, { width: 1280, height: 900 }, "desktop");
  await runRoleFilterScenario(page, { width: 402, height: 874 }, "phone");

  await assertNoPlayerSaveStorage(page);
  if (browserErrors.length) {
    throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
  }
  console.log("PASS role-filter fixture stays read-only and browser-error free");
} finally {
  await context?.close().catch(() => {});
  await browser.close().catch(() => {});
}