// Browser regression coverage for high-impact actions on the Officers and
// Black Market screens. Every action is exercised through the real RN-Web UI:
// the first attempt is cancelled, then the same action is confirmed once.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/highImpactReviewGuards.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const PROFILE_ID = "high-impact-review-guard";

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function hasVisibleText(page, text) {
  return page.evaluate((target) => {
    const needle = target.toUpperCase();
    return [...document.querySelectorAll("div, span, button, [role='button']")].some((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? element.textContent ?? "").toUpperCase().includes(needle)
      );
    });
  }, text);
}

async function waitForVisibleText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasVisibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForGone(page, text, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await hasVisibleText(page, text))) return;
    await sleep(250);
  }
  throw new Error(`Expected visible text to disappear: ${text}`);
}

async function waitForAnyVisibleText(page, texts, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const text of texts) {
      if (await hasVisibleText(page, text)) return text;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for one of: ${texts.join(", ")}`);
}

async function readCredits(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    const match = text.match(/\bCREDITS\s*\n\s*([\d,]+)/i);
    return match ? Number(match[1].replaceAll(",", "")) : null;
  });
}

// RN-Web Pressables are often divs nested inside other Pressables. Dispatch a
// complete gesture on the smallest visible exact-text match so the intended
// handler receives the press instead of a neighboring card.
async function pressExactText(page, text, { last = false } = {}) {
  const pressed = await page.evaluate(
    ({ targetText, lastMatch }) => {
      const target = targetText.trim().toUpperCase();
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const textOf = (element) =>
        (element.innerText ?? element.textContent ?? "").trim().toUpperCase();
      const matches = [...document.querySelectorAll("div, span, button, [role='button']")]
        .filter((element) => visible(element) && textOf(element) === target);
      const element = lastMatch ? matches.at(-1) : matches[0];
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
    },
    { targetText: text, lastMatch: last },
  );
  if (!pressed) throw new Error(`Could not find visible exact text: ${text}`);
}

async function seedCommander(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate((profileId) => {
    const profile = {
      id: profileId,
      name: "Review Guard",
      age: 40,
      sex: "male",
      portraitId: "player_male_1",
      commanderLevel: 1,
      xp: 0,
      attributes: { authority: 5, intelligence: 4, charisma: 3, combat: 6, endurance: 5 },
      attributePoints: 0,
      traits: [],
      backstory: "",
      careerStats: {},
    };
    localStorage.clear();
    localStorage.setItem(`@megacity_profile_${profileId}`, JSON.stringify(profile));
    localStorage.setItem("@megacity_profiles_index", JSON.stringify([profileId]));
    localStorage.setItem("@megacity_active_profile", profileId);
  }, PROFILE_ID);
}

async function openScreen(page, screen) {
  await seedCommander(page);
  await page.goto(`${BASE_URL}/?demo=1&go=${screen}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
}

async function assertNoPlayerSaveStorage(page) {
  const saveKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter(
      (key) =>
        key.startsWith("@megacity_slot_") ||
        key === "@megacity_save" ||
        key.startsWith("@megacity_profile_"),
    ),
  );
  // The commander seed is intentionally present; a demo game must not create
  // a city save or mutate the profile while these checks run.
  const citySaveKeys = saveKeys.filter(
    (key) => key.startsWith("@megacity_slot_") || key === "@megacity_save",
  );
  if (citySaveKeys.length) {
    throw new Error(`Demo review fixture touched city save storage: ${JSON.stringify(citySaveKeys)}`);
  }
}

async function runOfficerDismissal(page) {
  await openScreen(page, "officers");
  await waitForVisibleText(page, "OFFICER LOBBY");
  await waitForVisibleText(page, "0 APPOINTED");

  // The demo roster starts vacant. Appoint one real candidate so dismissal is
  // exercised on a real appointed officer rather than a mocked state.
  await pressExactText(page, "City Executive");
  await waitForVisibleText(page, "APPOINTMENT METHOD");
  await pressExactText(page, "Direct Appointment");
  await waitForVisibleText(page, "1 APPOINTED");
  await waitForVisibleText(page, "RELIEVE OF DUTY");

  await pressExactText(page, "RELIEVE OF DUTY");
  await waitForVisibleText(page, "RELIEVE OF DUTY");
  await waitForVisibleText(page, "from the position of");
  await pressExactText(page, "CANCEL", { last: true });
  await waitForGone(page, "from the position of");
  if (!(await hasVisibleText(page, "1 APPOINTED"))) {
    throw new Error("Officer roster changed after cancelling dismissal");
  }
  if (!(await hasVisibleText(page, "RELIEVE OF DUTY"))) {
    throw new Error("Appointed officer disappeared after cancelling dismissal");
  }
  console.log("[e2e] PASS: officer dismissal CANCEL kept the roster unchanged");

  await pressExactText(page, "RELIEVE OF DUTY");
  await waitForVisibleText(page, "from the position of");
  // Only the confirmation button is allowed to commit. A second dispatched
  // press must not find the closed modal or produce a second state mutation.
  await pressExactText(page, "RELIEVE OF DUTY", { last: true });
  await waitForGone(page, "from the position of");
  await waitForVisibleText(page, "0 APPOINTED");
  if (await hasVisibleText(page, "RELIEVE OF DUTY")) {
    throw new Error("Officer dismissal did not commit exactly once to a vacant seat");
  }
  console.log("[e2e] PASS: confirmed officer dismissal committed once");
}

async function runBlackMarketPurchase(page) {
  await openScreen(page, "blackmarket");
  await waitForVisibleText(page, "BLACK MARKET");
  await waitForVisibleText(page, "Weapons Cache");
  const creditsBefore = await readCredits(page);
  if (creditsBefore === null) throw new Error("Could not read the starting credit balance");

  await pressExactText(page, "Weapons Cache");
  await waitForVisibleText(page, "PURCHASE — 5,000 CR");
  await pressExactText(page, "PURCHASE — 5,000 CR");
  await waitForVisibleText(page, "PURCHASE: WEAPONS CACHE");
  await waitForVisibleText(page, "Spend 5,000 credits on Weapons Cache?");
  await pressExactText(page, "CANCEL", { last: true });
  await waitForGone(page, "PURCHASE: WEAPONS CACHE");
  if (!(await hasVisibleText(page, "PURCHASE — 5,000 CR"))) {
    throw new Error("Black-market item disappeared after cancelling purchase");
  }
  if (await hasVisibleText(page, "ACQUIRED") || await hasVisibleText(page, "SEIZED")) {
    throw new Error("Black-market purchase outcome appeared after cancelling purchase");
  }
  const creditsAfterCancel = await readCredits(page);
  if (creditsAfterCancel !== creditsBefore) {
    throw new Error(
      `Credits changed after cancelling black-market purchase: ${creditsBefore} -> ${creditsAfterCancel}`,
    );
  }
  console.log("[e2e] PASS: black-market purchase CANCEL kept credits and inventory unchanged");

  await pressExactText(page, "PURCHASE — 5,000 CR");
  await waitForVisibleText(page, "PURCHASE: WEAPONS CACHE");
  await pressExactText(page, "PURCHASE", { last: true });
  const outcome = await waitForAnyVisibleText(page, ["ACQUIRED", "SEIZED"]);
  await waitForGone(page, "PURCHASE: WEAPONS CACHE");
  const creditsAfterConfirm = await readCredits(page);
  if (creditsAfterConfirm !== creditsBefore - 5000) {
    throw new Error(
      `Confirmed black-market purchase did not debit exactly once: ${creditsBefore} -> ${creditsAfterConfirm}`,
    );
  }
  console.log(`[e2e] PASS: confirmed black-market purchase committed once (${outcome})`);
}

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
  typeof browser.createBrowserContext === "function"
    ? await browser.createBrowserContext()
    : await browser.createIncognitoBrowserContext();
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
    !/favicon|net::|404|AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(
      message.text(),
    )
  ) {
    browserErrors.push(message.text());
  }
});

try {
  await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });
  await runOfficerDismissal(page);
  await runBlackMarketPurchase(page);
  await assertNoPlayerSaveStorage(page);
  if (browserErrors.length) {
    throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
  }
  console.log("[e2e] PASS: high-impact review guards");
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}