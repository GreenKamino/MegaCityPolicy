// Browser regression coverage for mission-success mail dismissal. The fixture
// uses a disposable save namespace, so it can exercise the real inbox delete
// and reload path without creating or mutating a player save.
//   node e2e/missionMailDismissal.e2e.mjs
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import LZString from "lz-string";

const { decompressFromUTF16 } = LZString;

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const SAVE_URL =
  `${BASE_URL}/?demo=1&missionmail=1&missionMailReload=save&go=inbox`;
const LOAD_URL =
  `${BASE_URL}/?demo=1&missionmail=1&missionMailReload=load&go=inbox`;
const MISSION_TITLE = "MISSION SUCCESS: TRADE NEGOTIATION";
const MISSION_ID = "mission-success-trade_negotiation-42-Ada Vance";
const ISOLATED_KEY = "@megacity_e2e_mission_mail_1";

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForVisibleText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate(
      (target) => document.body.innerText.toUpperCase().includes(target.toUpperCase()),
      text,
    );
    if (found) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForVisibleTextToDisappear(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate(
      (target) => document.body.innerText.toUpperCase().includes(target.toUpperCase()),
      text,
    );
    if (!found) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text to disappear: ${text}`);
}

async function clickVisibleText(page, text, occurrence = 0) {
  const clicked = await page.evaluate(({ target, occurrence }) => {
    const needle = target.toUpperCase();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const matches = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter((element) =>
        visible(element) &&
        (element.innerText ?? element.textContent ?? "").trim().toUpperCase() === needle,
      );
    const element = matches[occurrence];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, { target: text, occurrence });
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function clickDismissButton(page) {
  const clicked = await page.evaluate(() => {
    const element = [...document.querySelectorAll("[aria-label='Dismiss message']")]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  });
  if (!clicked) throw new Error("Could not find the visible mission mail dismiss button");
}

async function clickAccessibleLabel(page, label) {
  const clicked = await page.evaluate((target) => {
    const element = [...document.querySelectorAll(`[aria-label="${target}"]`)]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not find the visible control labeled: ${label}`);
}

async function assertNoPlayerSaveStorage(page) {
  const playerKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) =>
      key.startsWith("@megacity_slot_") ||
      key === "@megacity_save" ||
      key === "@megacity_profiles_index" ||
      key.startsWith("@megacity_profile_") ||
      key === "@megacity_active_profile",
    ),
  );
  if (playerKeys.length > 0) {
    throw new Error(`Mission mail fixture touched player storage: ${JSON.stringify(playerKeys)}`);
  }
}

async function waitForDismissalSave(page, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), ISOLATED_KEY);
    if (raw) {
      try {
        const envelope = JSON.parse(raw);
        const json = typeof envelope.data === "string"
          ? decompressFromUTF16(envelope.data)
          : raw;
        const state = json ? JSON.parse(json) : null;
        const dismissed = state?.dismissedMessageIds?.includes(MISSION_ID);
        const messageStillPresent = state?.messages?.some((message) => message.id === MISSION_ID);
        if (dismissed && !messageStillPresent) return;
      } catch {
        // The atomic save may be between its temporary and primary writes.
      }
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for the isolated save to retain the mission dismissal");
}

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});
const context =
  typeof browser.createBrowserContext === "function"
    ? await browser.createBrowserContext()
    : await browser.createIncognitoBrowserContext();
const page = await context.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
const pageErrors = [];
let replayMarkerResolve;
const replayMarker = new Promise((resolve) => {
  replayMarkerResolve = resolve;
});
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.text().includes("[missionMailE2E] replay preserved dismissed mission mail")) {
    replayMarkerResolve();
  }
  if (
    message.type() === "error" &&
    !/favicon|net::|404|NotAllowedError: play\(\) failed because the user didn't interact/i.test(message.text())
  ) {
    pageErrors.push(message.text());
  }
});

try {
  await page.goto(SAVE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForVisibleText(page, "INBOX");
  await waitForVisibleText(page, MISSION_TITLE);
  await waitForVisibleText(page, "1 MESSAGE");
  await waitForVisibleText(page, "1 UNREAD");
  await waitForVisibleText(page, "MISSION (1)");
  console.log("PASS: isolated mission-success mail appears unread in the inbox");

  await clickDismissButton(page);
  await waitForVisibleText(page, "DELETE MESSAGE?");
  await waitForVisibleText(page, "This message will be permanently deleted. This cannot be undone.");
  console.log("PASS: mission mail dismissal requires destructive confirmation");

  await clickVisibleText(page, "DELETE");
  await waitForVisibleTextToDisappear(page, MISSION_TITLE);
  await waitForVisibleText(page, "0 MESSAGE");
  await waitForVisibleText(page, "0 UNREAD");
  await waitForVisibleText(page, "MISSION (0)");
  await waitForVisibleText(page, "NO MESSAGES");
  console.log("PASS: dismissal immediately updates the message list, unread count, and filter count");
  await waitForDismissalSave(page);
  console.log("PASS: dismissed mission mail is persisted in the isolated save envelope");

  await clickAccessibleLabel(page, "Go back");
  await page.waitForFunction(() => !window.location.pathname.includes("inbox"), { timeout: 30000 });
  console.log("PASS: inbox navigation away completes after dismissal");

  await page.goto(LOAD_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForVisibleText(page, "INBOX");
  await waitForVisibleTextToDisappear(page, MISSION_TITLE);
  await waitForVisibleText(page, "0 MESSAGE");
  await waitForVisibleText(page, "0 UNREAD");
  await waitForVisibleText(page, "NO MESSAGES");
  await Promise.race([
    replayMarker,
    sleep(30000).then(() => {
      throw new Error("Timed out waiting for the repeated mission completion callback marker");
    }),
  ]);
  await assertNoPlayerSaveStorage(page);
  console.log("PASS: dismissed mission mail stays gone after reload and replayed completion");

  if (pageErrors.length > 0) {
    throw new Error(`Browser errors:\n${pageErrors.join("\n")}`);
  }
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}