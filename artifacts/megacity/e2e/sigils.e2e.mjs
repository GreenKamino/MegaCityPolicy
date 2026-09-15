// Temp verification for the megacity banner sigils: the diplomacy MEGACITIES
// list and detail header plus the world-map location panel should render the
// new sigil images (assets/sigils/*.webp) instead of vector icons for the 12
// sheet megacities. Requires the "artifacts/megacity: expo" workflow.
//   node e2e/sigils.e2e.mjs
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

async function waitForText(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasText(page, text)) return;
    await sleep(500);
  }
  const body = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 1500) : "(none)"));
  throw new Error(`waitForText: "${text}" not found within ${timeout}ms. Page text:\n${body}`);
}

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

// Count VISIBLE, successfully-loaded <img> tags whose src references the
// sigil assets. RN-web renders <Image> as an <img> (sometimes wrapped),
// so naturalWidth > 0 proves Metro actually served the .webp.
async function countLoadedSigilImages(page) {
  return page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    let loaded = 0;
    let broken = 0;
    for (const img of imgs) {
      const src = img.currentSrc || img.src || "";
      if (!/sigils/.test(src)) continue;
      const r = img.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (img.complete && img.naturalWidth > 0) loaded++;
      else if (img.complete) broken++;
    }
    return { loaded, broken };
  });
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
    await page.goto(`${BASE_URL}/?demo=1&go=diplomacy`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(page, "DIPLOMACY", 120000);
    console.log("[e2e] diplomacy loaded");

    // 1) Megacities list: switch to the MEGACITIES tab and expect sigils.
    await clickText(page, "MEGACITIES");
    await waitForText(page, "MEGACITY PACIFICA", 15000);
    await sleep(1500); // let images finish loading
    let counts = await countLoadedSigilImages(page);
    console.log(`[e2e] megacities list: ${counts.loaded} sigils loaded, ${counts.broken} broken`);
    if (counts.broken > 0) throw new Error(`megacities list: ${counts.broken} sigil <img> failed to load`);
    if (counts.loaded < 3) throw new Error(`megacities list: expected >=3 visible sigils, got ${counts.loaded}`);
    await page.screenshot({ path: "/tmp/sigils-list.png" });

    // 2) Detail header: open Megacity Pacifica and expect its sigil next to the name.
    await clickText(page, "MEGACITY PACIFICA");
    await waitForText(page, "BACK TO LIST", 15000);
    await sleep(1200);
    counts = await countLoadedSigilImages(page);
    console.log(`[e2e] detail header: ${counts.loaded} sigils loaded, ${counts.broken} broken`);
    if (counts.broken > 0) throw new Error(`detail: ${counts.broken} sigil <img> failed to load`);
    if (counts.loaded < 1) throw new Error("detail: expected the header sigil, got none");
    await page.screenshot({ path: "/tmp/sigils-detail.png" });

    // 3) Factions unaffected: their detail must still show no sigil art.
    await clickText(page, "BACK TO LIST");
    await waitForText(page, "MEGACITY DIRECTORY", 10000).catch(() => {});

    // 4) World map location panel: open the map and tap a megacity label.
    await clickText(page, "MAP");
    await waitForText(page, "WASTELAND", 20000);
    await sleep(1000);
    await clickText(page, "MEGACITY PACIFICA");
    await waitForText(page, "MEGACITY", 10000);
    await sleep(1200);
    counts = await countLoadedSigilImages(page);
    console.log(`[e2e] worldmap panel: ${counts.loaded} sigils loaded, ${counts.broken} broken`);
    if (counts.broken > 0) throw new Error(`worldmap: ${counts.broken} sigil <img> failed to load`);
    if (counts.loaded < 1) throw new Error("worldmap: expected the panel sigil, got none");
    await page.screenshot({ path: "/tmp/sigils-worldmap.png" });

    if (pageErrors.length) {
      throw new Error(`page errors:\n${pageErrors.join("\n")}`);
    }
    console.log("[e2e] PASS — sigils render in diplomacy list, detail, and world map panel");
  } finally {
    await browser.close();
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error("[e2e] FAIL:", err.message);
    process.exit(1);
  },
);
