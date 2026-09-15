// Real-screen regression for settlement facts shared by Diplomacy and World Map.
// The settlementParity demo fixture is read-only and deliberately makes Mexico
// City use the legacy no-nested-operational fallback.
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

const SETTLEMENTS = [
  {
    name: "Terminus Prime",
    marker: "Terminus Prime, megacity",
    expected: [
      "8,600,000",
      "Technocratic crater directorate",
      "Prime Directorate",
      "Closed orbital-recovery and precision manufacturing economy",
      "orbital salvage",
      "precision components",
      "reactor heat",
      "rare earth minerals",
      "reactor fuel",
      "MAJOR · OUT precision components, orbital salvage · IN food, medical supplies",
      "86 · Fortified perimeter with autonomous interception grids",
      "68 · Controlled but brittle",
    ],
  },
  {
    name: "Mexico City",
    marker: "Mexico City, township",
    expected: [
      "9,209,944",
      "Local authority",
      "township",
      "Government, manufacturing, services, and regional transit",
      "manufactured_goods",
      "food",
      "steel_ingots",
      "electronic_waste",
      "construction_debris",
      "MAJOR · OUT manufactured_goods, food, steel_ingots, electronic_waste, construction_debris · IN none",
      "0 · Local defense",
      "45 · Unassessed",
    ],
  },
];

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

async function waitForAccessibleNode(page, label, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate((target) => {
      const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }, label);
    if (found) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for accessibility label: ${label}`);
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
  if (!clicked) throw new Error(`Could not click accessible node: ${label}`);
}

async function clickVisibleExactText(page, text) {
  const clicked = await page.evaluate((targetText) => {
    const target = targetText.trim().toUpperCase();
    const candidates = [...document.querySelectorAll("div, span")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 &&
        (element.textContent ?? "").trim().toUpperCase() === target;
    });
    if (!candidates.length) return false;
    let leaf = candidates[0];
    for (const candidate of candidates) {
      if (leaf.contains(candidate) && candidate !== leaf) leaf = candidate;
    }
    leaf.scrollIntoView({ block: "center", inline: "center" });
    leaf.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible exact text: ${text}`);
}

async function waitForSheet(page, ariaLabel) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const text = await page.$eval(
      `[aria-label="${ariaLabel}"]`,
      (element) => element.innerText,
    ).catch(() => "");
    if (text) return text;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for sheet: ${ariaLabel}`);
}

async function closeLocationDetails(page) {
  await clickAccessibleNode(page, "Close location details");
  await waitForVisibleText(page, "WORLD MAP");
  await sleep(200);
}

async function storageSnapshot(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(window.localStorage).sort().map((key) => [key, window.localStorage.getItem(key)]),
    ),
  );
}

async function assertNoPlayerSaveStorage(page, label) {
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
  assert.deepEqual(saveKeys, [], `${label} created or changed player save storage`);
}

async function assertExpectedFacts(text, settlement, screen) {
  for (const section of ["SETTING", "GOVERNANCE & CULTURE", "ECONOMY & TRADE", "CAPABILITY & CONDITION", "DIPLOMACY"]) {
    assert.ok(text.includes(section), `${settlement.name} ${screen} is missing shared operational section "${section}"\n${text}`);
  }
  assert.ok(!text.includes("SIMULATION PROFILE"), `${settlement.name} ${screen} still renders the legacy simulation profile`);
  assert.ok(!text.includes("OPERATIONAL FACTS"), `${settlement.name} ${screen} still renders a duplicate operational facts card`);
  for (const expected of settlement.expected) {
    assert.ok(
      text.includes(expected),
      `${settlement.name} ${screen} is missing exact fact "${expected}"\n${text}`,
    );
  }
}

async function runAtViewport(width) {
  const url = `${BASE_URL}/?demo=1&settlementparity=1&go=worldmap`;
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    timeout: 120_000,
    protocolTimeout: 120_000,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height: width < 600 ? 874 : 900 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404|AbortError/.test(message.text())) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForVisibleText(page, "WORLD MAP");
    await waitForAccessibleNode(page, SETTLEMENTS[0].marker);
    await waitForAccessibleNode(page, SETTLEMENTS[1].marker);
    const storageBeforeMap = await storageSnapshot(page);

    for (const settlement of SETTLEMENTS) {
      await clickAccessibleNode(page, settlement.marker);
      const sheet = await waitForSheet(page, `${settlement.name} operational sheet`);
      const modalText = await page.$eval(
        `[aria-label="${settlement.name} operational sheet"]`,
        (element) => element.closest('[role="dialog"]')?.innerText ?? document.body.innerText,
      );
      await assertExpectedFacts(`${modalText}\n${sheet}`, settlement, "World Map");
      await closeLocationDetails(page);
    }

    assert.deepEqual(
      await storageSnapshot(page),
      storageBeforeMap,
      `World Map at width ${width} mutated localStorage`,
    );

    await page.goto(
      `${BASE_URL}/?demo=1&settlementparity=1&go=diplomacy`,
      { waitUntil: "domcontentloaded", timeout: 120_000 },
    );
    await waitForVisibleText(page, "DIPLOMACY TERMINAL");
    const storageBeforeDiplomacy = await storageSnapshot(page);

    for (const [index, settlement] of SETTLEMENTS.entries()) {
      await clickVisibleExactText(page, index === 0 ? "MEGACITIES" : "SETTLEMENTS");
      await clickVisibleExactText(page, settlement.name);
      const facts = await waitForSheet(page, `${settlement.name} operational facts`);
      await assertExpectedFacts(facts, settlement, "Diplomacy");
      await clickVisibleExactText(page, "BACK TO LIST");
    }

    assert.deepEqual(
      await storageSnapshot(page),
      storageBeforeDiplomacy,
      `Diplomacy at width ${width} mutated localStorage`,
    );
    await assertNoPlayerSaveStorage(page, `Settlement parity width ${width}`);
    assert.deepEqual(
      browserErrors,
      [],
      `Browser errors at width ${width}:\n${browserErrors.join("\n")}`,
    );
    console.log(`[e2e] PASS: settlement parity at ${width}px`);
  } finally {
    await browser.close();
  }
}

const widths = process.env.E2E_VIEWPORT_WIDTH
  ? [Number(process.env.E2E_VIEWPORT_WIDTH)]
  : [402, 1400];

for (const width of widths) {
  await runAtViewport(width);
}