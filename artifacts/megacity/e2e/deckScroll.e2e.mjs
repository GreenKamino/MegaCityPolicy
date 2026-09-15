// Verifies the Steam Deck fix: on the construction screen at Deck resolution
// (1280x800), repeated ArrowDown presses (same handler as gamepad D-pad) must
// scroll the building list once focus reaches the fold, and the vertical
// scrollbar is enabled on web.
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");

function resolveChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return execSync("which chromium-browser", { encoding: "utf8" }).trim();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hasText(page, text) {
  try {
    return await page.evaluate(
      (t) => !!document.body && document.body.innerText.toUpperCase().includes(t.toUpperCase()),
      text,
    );
  } catch {
    return false;
  }
}

async function waitForText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasText(page, text)) return;
    await sleep(500);
  }
  const body = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 1500) : "(none)"));
  throw new Error(`waitForText: "${text}" not found within ${timeout}ms. Page text:\n${body}`);
}

function maxScrollTop(page) {
  return page.evaluate(() => {
    let max = 0;
    for (const el of document.querySelectorAll("div")) {
      if (el.scrollHeight > el.clientHeight + 1 && el.scrollTop > max) max = el.scrollTop;
    }
    return max;
  });
}

const browser = await puppeteer.launch({
  executablePath: resolveChromium(),
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
  await page.goto(`${BASE_URL}/?demo=1&go=construction`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForText(page, "CONSTRUCTION / INFRASTRUCTURE");
  await waitForText(page, "INFRASTRUCTURE"); // list header present
  await sleep(1500);

  const before = await maxScrollTop(page);
  // Walk focus down the screen like a D-pad would. Enough presses to pass all
  // the chrome (tabs, chips, batch buttons) and hit the bottom of the list fold.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("ArrowDown");
    await sleep(120);
  }
  await sleep(800); // let smooth scroll settle
  const after = await maxScrollTop(page);
  console.log(`scrollTop before=${before} after=${after}`);
  if (after <= before) throw new Error("FAIL: ArrowDown walking did not scroll the building list");

  // ArrowUp should be able to scroll back up as well.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("ArrowUp");
    await sleep(120);
  }
  await sleep(800);
  const back = await maxScrollTop(page);
  console.log(`scrollTop after ArrowUp walk=${back}`);
  if (back >= after) throw new Error("FAIL: ArrowUp walking did not scroll back up");

  console.log("DECK_SCROLL_E2E_PASS");
} finally {
  await browser.close();
}
