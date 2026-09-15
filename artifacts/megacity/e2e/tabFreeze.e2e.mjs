// Temp verification for the long-session flicker fix: blurred game screens
// are now frozen via react-freeze in withScreenBoundary. This drives the demo
// city through repeated top-nav tab switches (mount → blur/freeze → refocus/
// unfreeze cycles) and asserts each screen still renders its content and no
// page errors fire. Requires the "artifacts/megacity: expo" workflow.
//   node e2e/tabFreeze.e2e.mjs
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
  // The demo seeder client-side-redirects on boot, which can detach the frame
  // mid-evaluate; treat that as "not yet" and let the caller retry.
  try {
    return await page.evaluate(
      (t) => !!document.body && document.body.innerText.toUpperCase().includes(t.toUpperCase()),
      text,
    );
  } catch {
    return false;
  }
}

async function waitForText(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasText(page, text)) return;
    await sleep(500);
  }
  const body = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 1500) : "(none)"));
  throw new Error(`waitForText: "${text}" not found within ${timeout}ms. Page text:\n${body}`);
}

// Click the leaf-most VISIBLE element whose trimmed text matches. Frozen
// (blurred) screens keep their DOM in the document with display:none, so an
// unfiltered exact-text match can hit an invisible node and no-op.
async function clickText(page, text) {
  const ok = await page.evaluate((t) => {
    const target = t.toUpperCase();
    const all = Array.from(document.querySelectorAll("div, span"));
    const matches = all.filter((el) => {
      if (!el.innerText || el.innerText.trim().toUpperCase() !== target) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!matches.length) return false;
    let leaf = matches[0];
    for (const el of matches) if (leaf.contains(el) && el !== leaf) leaf = el;
    leaf.scrollIntoView({ block: "center", inline: "center" });
    leaf.click();
    return true;
  }, text);
  if (!ok) throw new Error(`clickText: "${text}" not found`);
}

async function run() {
  console.log(`[e2e] base URL: ${BASE_URL}`);
  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon|net::|404/.test(msg.text())) pageErrors.push(msg.text());
  });

  try {
    await page.goto(`${BASE_URL}/?demo=1&go=overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(page, "CITY STATUS MATRIX", 120000);
    console.log("[e2e] demo city loaded");

    // Top-nav labels → distinctive header text on the screen once focused
    // (must NOT be a substring of the nav bar itself).
    const tabs = [
      ["RESEARCH", "TECHNOLOGY TREE"],
      ["TRADE", "TRADE EXCHANGE"],
      ["SECTORS", "SECTOR STATUS"],
      ["BUILD", "CONSTRUCTION / INFRASTRUCTURE"],
      ["ECONOMY", "ECONOMY / INDUSTRY / TRADE"],
      ["CITY", "CITY STATUS MATRIX"],
    ];

    // Two full passes: pass 1 mounts each screen, pass 2 refocuses previously
    // frozen screens (the regression surface for the freeze change).
    for (let pass = 1; pass <= 2; pass++) {
      for (const [tab, expect] of tabs) {
        // Clicks can be dropped while the main thread is busy (tick loop,
        // hydration, throttled CPU) — click + short wait, retry a few times.
        let done = false;
        for (let attempt = 1; attempt <= 4 && !done; attempt++) {
          await clickText(page, tab);
          try {
            await waitForText(page, expect, 8000);
            done = true;
          } catch {
            if (attempt === 4) throw new Error(`nav to ${tab}: "${expect}" never appeared after 4 clicks`);
          }
        }
        await sleep(100);
      }
      console.log(`[e2e] pass ${pass}: all ${tabs.length} tabs rendered after switching`);
    }

    if (pageErrors.length) {
      console.error(`[e2e] page errors:\n${pageErrors.join("\n")}`);
      throw new Error(`${pageErrors.length} page error(s) during tab cycling`);
    }
    console.log("[e2e] PASS: tab freeze/unfreeze cycles clean, no page errors");
  } catch (err) {
    console.error(`[e2e] FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    // Chromium occasionally lingers after close(); don't let it hang the run.
    setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
  }
}

run();
