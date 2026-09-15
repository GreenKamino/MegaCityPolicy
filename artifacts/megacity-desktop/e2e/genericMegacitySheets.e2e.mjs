// Desktop-wrapper regression for the five standardized generic megacity sheets.
// Requires both the desktop wrapper and Expo game workflows.
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const BASE_URL = (process.env.E2E_BASE_URL || "http://localhost:80/desktop").replace(/\/$/, "");
const MAP_URL = `${BASE_URL}/?demo=1&go=worldmap`;

const MEGACITIES = [
  {
    name: "Terminus Prime",
    marker: "Terminus Prime, megacity",
    fragments: ["6,200 km²", "Wasteland crater", "Technocratic crater directorate", "Prime Directorate", "86 · Fortified perimeter with autonomous interception grids", "68 · Controlled but brittle"],
  },
  {
    name: "Olympus",
    marker: "Olympus, megacity",
    fragments: ["2,800 km²", "Mountain fortress", "Uploaded civic council", "Olympian Consensus Array", "91 · Defensive high-ground doctrine with elite autonomous units", "82 · Highly ordered"],
  },
  {
    name: "Panopticon City",
    marker: "Panopticon City, megacity",
    fragments: ["5,100 km²", "Urban surveillance basin", "Algorithmic surveillance state", "Compliance Directorate", "84 · Internal control first; drone-heavy border defense", "74 · Stable under coercion"],
  },
  {
    name: "Ashfall State",
    marker: "Ashfall State, megacity",
    fragments: ["4,300 km²", "Volcanic ash belt", "Hereditary geothermal dominion", "Ashfall Crown and Works", "78 · Hazard-adapted garrison with ash-screened approaches", "57 · Strained by the ashfall"],
  },
  {
    name: "The Recursion",
    marker: "The Recursion, megacity",
    fragments: ["3,900 km²", "Unmapped interior plain", "Unverified recursive administration", "Municipal Continuity Signal", "63 · Unconfirmed; no ground force has been observed", "49 · Unreadable"],
  },
];

function resolveChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return execSync("which chromium-browser", { encoding: "utf8" }).trim();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await sleep(400);
  }
  throw new Error(`Timed out after ${timeout}ms`);
}

async function findGameFrame(page) {
  return waitFor(() => page.frames().find((candidate) => candidate !== page.mainFrame()) ?? null);
}

async function visibleText(page) {
  const frame = await findGameFrame(page);
  return frame.evaluate(() => document.body?.innerText ?? "");
}

async function storageSnapshot(page) {
  const frame = await findGameFrame(page);
  return frame.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    ),
  );
}

async function clickAccessibleNode(page, label) {
  const clicked = await waitFor(async () => {
    const frame = await findGameFrame(page);
    try {
      return await frame.evaluate((target) => {
        const element = [...document.querySelectorAll("[aria-label]")].find(
          (candidate) => candidate.getAttribute("aria-label") === target,
        );
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        element.scrollIntoView({ block: "center", inline: "center" });
        element.click();
        return true;
      }, label);
    } catch {
      // Expo Router can replace the document between frame discovery and click.
      return false;
    }
  }, 30000);
  if (!clicked) throw new Error(`Visible map control not found: ${label}`);
}

async function closeLocationDetails(page) {
  const closed = await waitFor(async () => {
    const frame = await findGameFrame(page);
    try {
      return await frame.evaluate(() => {
    const button = document.querySelector('button[aria-label="Close location details"]');
    if (!(button instanceof HTMLElement)) return false;
    button.click();
    return true;
      });
    } catch {
      return false;
    }
  }, 15000);
  if (!closed) throw new Error("Close location details button not found");
  await waitFor(async () => !(await visibleText(page)).includes("OPERATIONAL SHEET"), 15000);
}

async function readOperationalSheet(page, name) {
  const label = `${name} operational sheet`;
  return waitFor(async () => {
    const frame = await findGameFrame(page);
    try {
      return await frame.evaluate((ariaLabel) => {
        const element = [...document.querySelectorAll("[aria-label]")].find(
          (candidate) => candidate.getAttribute("aria-label") === ariaLabel,
        );
        return element instanceof HTMLElement ? element.innerText : "";
      }, label);
    } catch {
      return "";
    }
  }, 20000);
}

async function assertNoPlayerSaveStorage(page) {
  const keys = await findGameFrame(page).then((frame) => frame.evaluate(() =>
    Object.keys(localStorage).filter(
      (key) =>
        key.startsWith("@megacity_slot_") ||
        key === "@megacity_save" ||
        key === "@megacity_profiles_index" ||
        key.startsWith("@megacity_profile_") ||
        key === "@megacity_active_profile",
    ),
  ));
  assert.deepEqual(keys, [], "Opening settlement sheets created player save storage");
}

async function run() {
  console.log(`[e2e] desktop route: ${MAP_URL}`);
  await ensureDesktopWrapperReady();

  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    timeout: 120000,
    protocolTimeout: 120000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    await page.goto(MAP_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitFor(async () => (await visibleText(page)).includes("WASTELAND"), 120000);
    const storageBefore = await storageSnapshot(page);

    for (const megacity of MEGACITIES) {
      await clickAccessibleNode(page, megacity.marker);
      const sheet = await readOperationalSheet(page, megacity.name);
      for (const label of ["TERRITORY", "SETTING", "GOVERNMENT", "INSTITUTION", "ECONOMY", "OUTPUTS", "RESOURCES", "TRADE", "INFRASTRUCTURE", "MILITARY", "STABILITY", "DIPLOMACY"]) {
        assert.ok(sheet.includes(label), `${megacity.name}: missing ${label}`);
      }
      for (const fragment of megacity.fragments) {
        assert.ok(sheet.includes(fragment), `${megacity.name}: missing canonical value "${fragment}"\n${sheet}`);
      }
      console.log(`[e2e] PASS: ${megacity.name} operational sheet`);
      await closeLocationDetails(page);
    }

    await assertNoPlayerSaveStorage(page);
    assert.deepEqual(await storageSnapshot(page), storageBefore, "Opening settlement sheets mutated iframe localStorage");
    assert.deepEqual(pageErrors, [], `Browser errors:\n${pageErrors.join("\n")}`);
    console.log("[e2e] PASS: five packaged desktop settlement sheets are canonical and read-only");
  } finally {
    await browser.close();
  }
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error("[e2e] FAIL:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);