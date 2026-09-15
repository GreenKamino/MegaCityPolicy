// Browser regression coverage for squad assignment previews across reload.
//
// The disposable retinue fixture starts with an infantry + heavy gunner
// squad and a ready marksman in the roster. The preview must show the
// Combined Arms synergy and the expected +14 power delta (15 → 29), then the
// confirmed assignment is saved through GameContext and restored after reload.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/retinueAssignmentReload.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const FIXTURE_URL = `${BASE_URL}/?demo=1&retinue=1&retinueReload=save&go=retinue`;
const RELOAD_URL = `${BASE_URL}/?demo=1&retinue=1&retinueReload=load&go=retinue`;
const ISOLATED_SAVE_KEY = "@megacity_e2e_retinue_assignment_1";
const EXPECTED_PREVIEW = "2/4 troops → 3/4 · Power 15 → 29";
const EXPECTED_CARD_POWER = "38 × 1 doctrine × 0.75 leaderless = 29 combat power";

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForVisibleText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await page.evaluate((target) => {
      const needle = target.toUpperCase();
      return [...document.querySelectorAll("div, span, button, [role='button']")].some((element) => {
        const rect = element.getBoundingClientRect();
        return (
          (element.innerText ?? element.textContent ?? "").toUpperCase().includes(needle) &&
          rect.width > 0 &&
          rect.height > 0
        );
      });
    }, text);
    if (visible) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function readRoleCoverage(page, title) {
  return page.evaluate((targetTitle) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const titleNode = [...document.querySelectorAll("div, span")]
      .filter(isVisible)
      .find((element) => (element.innerText ?? element.textContent ?? "").trim().toUpperCase() === targetTitle);
    if (!titleNode) return null;

    let coverage = titleNode;
    while (
      coverage.parentElement &&
      ![...coverage.querySelectorAll("div, span")].some((element) =>
        /^(FRONTLINE|RANGED|RECON|ENGINEERING|MEDICAL|LOGISTICS|MOBILITY|CIVIC|SPEC-OPS) ×\d+$/.test(
          (element.innerText ?? element.textContent ?? "").trim().toUpperCase(),
        ),
      )
    ) {
      coverage = coverage.parentElement;
    }

    const counts = {};
    for (const element of [...coverage.querySelectorAll("div, span")].filter(isVisible)) {
      const label = (element.innerText ?? element.textContent ?? "").trim().toUpperCase();
      const match = label.match(
        /^(FRONTLINE|RANGED|RECON|ENGINEERING|MEDICAL|LOGISTICS|MOBILITY|CIVIC|SPEC-OPS) ×(\d+)$/,
      );
      if (match) counts[match[1]] = Number(match[2]);
    }
    return counts;
  }, title.toUpperCase());
}

async function waitForRoleCoverage(page, title, expected, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const actual = await readRoleCoverage(page, title);
    if (
      actual &&
      Object.entries(expected).every(([role, count]) => actual[role] === count)
    ) {
      return actual;
    }
    await sleep(250);
  }
  const actual = await readRoleCoverage(page, title);
  throw new Error(
    `Timed out waiting for ${title} role coverage ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}`,
  );
}

async function waitForPath(page, suffix, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith(suffix)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for path ${suffix}; current URL: ${page.url()}`);
}

async function pressAriaLabel(page, label) {
  const pressed = await page.evaluate((targetLabel) => {
    const target = targetLabel.trim().toUpperCase();
    const element = [...document.querySelectorAll("[aria-label]")].find(
      (node) => (node.getAttribute("aria-label") ?? "").trim().toUpperCase() === target,
    );
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    };
    element.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
    element.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    element.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
    return true;
  }, label);
  if (!pressed) throw new Error(`Could not find aria-label: ${label}`);
}

async function pressExactText(page, text) {
  const pressed = await page.evaluate((targetText) => {
    const target = targetText.trim().toUpperCase();
    const nodes = [...document.querySelectorAll("div, span, button, [role='button']")];
    const element = nodes.find(
      (node) =>
        ((node.innerText ?? node.textContent) ?? "").trim().toUpperCase() === target &&
        node.getBoundingClientRect().width > 0 &&
        node.getBoundingClientRect().height > 0,
    );
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    };
    element.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
    element.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    element.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
    return true;
  }, text);
  if (!pressed) throw new Error(`Could not find visible text control: ${text}`);
}

async function waitForIsolatedSave(page, timeout = 90000) {
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    { timeout },
    ISOLATED_SAVE_KEY,
  );
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
  await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForPath(page, "/retinue");
    await waitForVisibleText(page, "RETINUE");
    await pressExactText(page, "ROSTER");
    await waitForVisibleText(page, "ALL TROOPS (3)");
    await pressAriaLabel(page, "Assign Marksman to a squad");
    await waitForVisibleText(page, "PREVIEW SQUAD ASSIGNMENT");
    await waitForVisibleText(page, EXPECTED_PREVIEW);
    await waitForVisibleText(page, "+14");
    await waitForVisibleText(page, "COMBINED ARMS");
    await pressAriaLabel(page, "Preview assigning troop to COMBINED ARMS");
    await waitForVisibleText(page, "NEW COMBINATIONS");
    await waitForVisibleText(page, "CONFIRM ASSIGNMENT");
    await pressAriaLabel(page, "Confirm assigning troop to COMBINED ARMS");
    await pressExactText(page, "SQUADS");
    await waitForVisibleText(page, "COMBINED ARMS");
    await waitForVisibleText(page, "3/4 troops");
    await waitForVisibleText(page, "COMBAT POWER: 29");
    await waitForVisibleText(page, EXPECTED_CARD_POWER);
    await waitForRoleCoverage(page, "BATTLEFIELD ROLE COVERAGE", {
      FRONTLINE: 1,
      RANGED: 2,
    });
    await waitForRoleCoverage(page, "RESERVE ROLE COVERAGE", {
      FRONTLINE: 0,
      RANGED: 0,
    });
    await waitForIsolatedSave(page);

    await page.goto(RELOAD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForPath(page, "/retinue");
    await pressExactText(page, "SQUADS");
    await waitForVisibleText(page, "3/4 troops");
    await waitForVisibleText(page, "COMBAT POWER: 29");
    await waitForVisibleText(page, EXPECTED_CARD_POWER);
    await waitForVisibleText(page, "Infantry");
    await waitForVisibleText(page, "Heavy Gunner");
    await waitForVisibleText(page, "Marksman");

    await pressExactText(page, "ROSTER");
    await waitForVisibleText(page, "ALL TROOPS (3)");
    await pressAriaLabel(page, "Unassign Marksman from squad");
    await pressExactText(page, "SQUADS");
    await waitForRoleCoverage(page, "BATTLEFIELD ROLE COVERAGE", {
      FRONTLINE: 1,
      RANGED: 1,
    });
    await waitForRoleCoverage(page, "RESERVE ROLE COVERAGE", {
      FRONTLINE: 0,
      RANGED: 1,
    });

    if (browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
    console.log("[e2e] PASS: role coverage updates after assignment and unassignment; save/reload preserves assignment");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});