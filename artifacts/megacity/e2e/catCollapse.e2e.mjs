// Temp verification for Task #568: wide-layout category strip on the
// Construction screen collapses to one scrollable row with a SHOW ALL /
// COLLAPSE toggle, and the choice is remembered for the session across tab
// switches. Requires the "artifacts/megacity: expo" workflow.
//   node e2e/catCollapse.e2e.mjs
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

async function hasVisibleText(page, text) {
  try {
    return await page.evaluate((t) => {
      const target = t.toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.textContent || !n.textContent.toUpperCase().includes(target)) continue;
        const el = n.parentElement;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
      return false;
    }, text);
  } catch {
    return false;
  }
}

async function waitForVisibleText(page, text, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await hasVisibleText(page, text)) return;
    await sleep(400);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

// Click the visible element whose own text matches exactly (frozen blurred
// screens stay in the DOM as display:none, so filter to visible rects).
async function clickVisibleText(page, text) {
  const ok = await page.evaluate((t) => {
    const target = t.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    const hits = [];
    while ((n = walker.nextNode())) {
      if (!n.textContent || n.textContent.trim().toUpperCase() !== target) continue;
      const el = n.parentElement;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) hits.push(el);
    }
    const el = hits[hits.length - 1];
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    el.click();
    return true;
  }, text);
  if (!ok) throw new Error(`No visible clickable text: ${text}`);
}

const failures = [];
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures.push(name);
}

const browser = await puppeteer.launch({
  executablePath: resolveChromium(),
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,720"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // Where the exact-text element sits relative to the viewport: "onscreen",
  // "offscreen" (rendered but clipped/scrolled out), or "missing".
  async function textPlacement(text) {
    return await page.evaluate((t) => {
      const target = t.toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.textContent || n.textContent.trim().toUpperCase() !== target) continue;
        const el = n.parentElement;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const on =
          r.left >= 0 && r.top >= 0 &&
          r.right <= window.innerWidth && r.bottom <= window.innerHeight;
        return on ? "onscreen" : "offscreen";
      }
      return "missing";
    }, text);
  }

  await page.goto(`${BASE_URL}/?demo=1&go=construction`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForVisibleText(page, "CONSTRUCTION / INFRASTRUCTURE");
  await waitForVisibleText(page, "SHOW ALL");
  check("collapsed by default: SHOW ALL toggle visible", true);
  // SEASONAL DEFENSE is the last category: in the collapsed single row it is
  // rendered but scrolled far off to the right.
  check("last category off-screen while collapsed", (await textPlacement("SEASONAL DEFENSE")) === "offscreen");

  await clickVisibleText(page, "SHOW ALL");
  await sleep(600);
  check("expanded: COLLAPSE toggle visible", await hasVisibleText(page, "COLLAPSE"));
  check("expanded: last category on-screen", (await textPlacement("SEASONAL DEFENSE")) === "onscreen");

  // Select the last category while expanded, then collapse — the strip should
  // auto-scroll so the active chip stays visible.
  await clickVisibleText(page, "SEASONAL DEFENSE");
  await sleep(600);
  await clickVisibleText(page, "COLLAPSE");
  await sleep(900);
  check("active chip scrolled into view after collapse", (await textPlacement("SEASONAL DEFENSE")) === "onscreen");
  await clickVisibleText(page, "SHOW ALL");
  await sleep(400);

  // Session memory: leave BUILD, come back — should still be expanded.
  await clickVisibleText(page, "ECONOMY");
  await sleep(1200);
  await clickVisibleText(page, "BUILD");
  await sleep(1200);
  check("still expanded after tab round-trip", await hasVisibleText(page, "COLLAPSE"));

  // Collapse again and confirm it sticks too.
  await clickVisibleText(page, "COLLAPSE");
  await sleep(600);
  check("collapse works: SHOW ALL back", await hasVisibleText(page, "SHOW ALL"));

  // Category selection still works in collapsed mode.
  await clickVisibleText(page, "HOUSING");
  await sleep(800);
  check("category switch works collapsed", await hasVisibleText(page, "HOUSING INFRASTRUCTURE"));

  check("no page errors", pageErrors.length === 0);
  if (pageErrors.length) console.log("Page errors:", pageErrors.slice(0, 5));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log(`\nRESULT: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nRESULT: all checks passed");
