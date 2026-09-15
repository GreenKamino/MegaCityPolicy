// Real-screen regression for completed rail operations:
// current research unlocks the route's capabilities, while a missing
// accountable role leaves the completed asset visible but non-operational.
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const READY_TIMEOUT_MS = 60_000;

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return execSync("which chromium-browser", { encoding: "utf8" }).trim();
  }
}

async function waitForVisibleText(page, text) {
  await page.waitForFunction(
    (expected) => [...document.querySelectorAll("body *")].some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? "").toUpperCase().includes(expected.toUpperCase());
    }),
    { timeout: READY_TIMEOUT_MS },
    text,
  );
}

async function visibleText(page, text) {
  return page.evaluate((expected) => [...document.querySelectorAll("body *")].some((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
      (element.innerText ?? "").toUpperCase().includes(expected.toUpperCase());
  }), text);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((expected) => {
    const element = [...document.querySelectorAll("button, [role='button'], div, span")]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          (candidate.innerText ?? "").trim().toUpperCase() === expected.toUpperCase();
      });
    if (!element) return false;
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function ensureDemoProfile(page) {
  await page.goto(`${BASE_URL}/?demo=1&go=overview`, {
    waitUntil: "domcontentloaded",
    timeout: READY_TIMEOUT_MS,
  });
  if (!(await visibleText(page, "NEW COMMANDER"))) return;
  await clickVisibleText(page, "NEW COMMANDER");
  await waitForVisibleText(page, "COMMANDER & CITY SETUP");
  const input = await page.$('input[aria-label="Commander name"]');
  if (!input) throw new Error("Commander name input was not rendered");
  await input.click({ clickCount: 3 });
  await input.type("E2E Rail Upgrade Marshal");
  await clickVisibleText(page, "VETERAN");
  await clickVisibleText(page, "CREATE COMMANDER & LAUNCH CITY");
  await waitForVisibleText(page, "RAIL NETWORK");
}

async function readDemoRow(page, label) {
  return page.evaluate((expected) => {
    const labelNode = [...document.querySelectorAll("div, span")].find(
      (element) => (element.textContent ?? "").trim() === expected,
    );
    return labelNode?.parentElement?.innerText?.replace(/\s+/g, " ").trim() ?? null;
  }, label);
}

function assertRow(rows, label, expectedValue) {
  const row = rows[label];
  if (!row || !new RegExp(`\\b${expectedValue}\\b`).test(row)) {
    throw new Error(`${label} expected ${expectedValue}, got ${row ?? "(missing)"}`);
  }
}

async function loadVariant(page, variant) {
  await page.goto(
    `${BASE_URL}/?demo=1&railcompletion=${variant}&go=overview`,
    { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS },
  );
  await waitForVisibleText(page, "RAIL NETWORK CONSTRAINTS & OPERATIONS");
  const demographicsClicked = await page.evaluate(() => {
    const element = [...document.querySelectorAll("div, span, button, [role='button']")]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 &&
          rect.height > 0 &&
          (candidate.innerText ?? "").trim().toUpperCase() === "DEMOGRAPHICS";
      });
    if (!element) return false;
    element.click();
    return true;
  });
  if (!demographicsClicked) throw new Error("Could not open the Overview demographics tab");
  await waitForVisibleText(page, "RAIL NETWORK & CORRIDORS");
  const labels = [
    "Completed Corridors",
    "Transit Capacity Bonus",
    "Trade Income Bonus",
    "Industrial Output Bonus",
    "Rail Engineers",
    "Rail Workers",
    "Rail Maintenance",
  ];
  return Object.fromEntries(
    await Promise.all(labels.map(async (label) => [label, await readDemoRow(page, label)])),
  );
}

async function installUpgrades(page) {
  await page.goto(
    `${BASE_URL}/?demo=1&railcompletion=upgrades&go=diplomacy`,
    { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS },
  );
  await waitForVisibleText(page, "DIPLOMACY TERMINAL");
  await clickVisibleText(page, "PACTS");
  await waitForVisibleText(page, "RAIL CORRIDORS");
  page.on("dialog", (dialog) => dialog.accept());
  for (const name of ["Armored train plating", "Troop-transport carriages", "Weaponized escort cars"]) {
    const clicked = await page.evaluate((expected) => {
      const button = [...document.querySelectorAll("button, [role='button']")]
        .find((candidate) => {
          const text = (candidate.innerText ?? "").toUpperCase();
          return text === "INSTALL" && candidate.parentElement?.innerText?.includes(expected);
        });
      if (!button) return false;
      button.click();
      return true;
    }, name);
    if (!clicked) throw new Error(`Could not find install control for ${name}`);
    await waitForVisibleText(page, "INSTALLED");
  }
}

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
    browserErrors.push(message.text());
  }
});

try {
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await ensureDemoProfile(page);

  const operational = await loadVariant(page, "full");
  assertRow(operational, "Completed Corridors", 1);
  assertRow(operational, "Transit Capacity Bonus", 120);
  assertRow(operational, "Trade Income Bonus", 12);
  assertRow(operational, "Industrial Output Bonus", 2);
  assertRow(operational, "Rail Engineers", 2);
  assertRow(operational, "Rail Workers", 10);
  assertRow(operational, "Rail Maintenance", 1);
  if (await page.evaluate(() => document.body.innerText.includes("STAFFING SHORTAGES"))) {
    throw new Error("fully staffed completed route reported a staffing shortage");
  }

  const understaffed = await loadVariant(page, "shortage");
  assertRow(understaffed, "Completed Corridors", 1);
  assertRow(understaffed, "Transit Capacity Bonus", 0);
  assertRow(understaffed, "Trade Income Bonus", 0);
  assertRow(understaffed, "Industrial Output Bonus", 0);
  assertRow(understaffed, "Rail Maintenance", 0);
  await waitForVisibleText(page, "STAFFING SHORTAGES");
  await waitForVisibleText(page, "Understaffed Corridor");

  await installUpgrades(page);
  await waitForVisibleText(page, "TRAIN MODULES");

  if (browserErrors.length) {
    throw new Error(`Browser errors during rail completion check:\n${browserErrors.join("\n")}`);
  }
  console.log("[e2e] PASS: completed rail route showed current research benefits with accountable crew and withheld operations when maintenance staffing was missing");
} finally {
  await browser.close().catch(() => {});
}