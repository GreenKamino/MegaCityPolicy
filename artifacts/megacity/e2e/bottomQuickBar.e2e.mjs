// Real-screen contract for the compact, promoted bottom quick bar.
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/bottomQuickBar.e2e.mjs
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const found = await page.evaluate(
        (target) => document.body?.innerText.toUpperCase().includes(target.toUpperCase()),
        text,
      );
      if (found) return;
    } catch {
      // Demo seeding can replace the root frame; retry after it settles.
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for "${text}"`);
}

async function readLayout(page) {
  return page.evaluate(() => {
    const bottom = Array.from(document.querySelectorAll('[data-testid^="bottom-nav-"]'));
    const top = document.querySelector('[data-testid="top-nav-overview"]');
    const first = bottom[0];
    const scroll = first?.parentElement?.parentElement;
    const style = first ? getComputedStyle(first) : null;
    const topStyle = top ? getComputedStyle(top) : null;
    return {
      count: bottom.length,
      ids: bottom.map((node) => node.getAttribute("data-testid")),
      bottom: style ? {
        minWidth: style.minWidth,
        paddingLeft: style.paddingLeft,
        paddingTop: style.paddingTop,
        fontSize: getComputedStyle(first.querySelector("div:last-of-type") ?? first).fontSize,
        height: first.getBoundingClientRect().height,
      } : null,
      top: topStyle ? {
        minWidth: topStyle.minWidth,
        paddingLeft: topStyle.paddingLeft,
        paddingTop: topStyle.paddingTop,
        height: top.getBoundingClientRect().height,
      } : null,
      scrollsHorizontally: !!scroll && scroll.scrollWidth > scroll.clientWidth,
      scrollWidth: scroll?.scrollWidth ?? 0,
      clientWidth: scroll?.clientWidth ?? 0,
    };
  });
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) errors.push(message.text());
  });

  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${BASE_URL}/?demo=1&go=overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(page, "CITY STATUS MATRIX");

    const desktop = await readLayout(page);
    if (desktop.count !== 14) throw new Error(`Expected 14 desktop bottom tabs, found ${desktop.count}`);
    for (const id of ["bottom-nav-missions", "bottom-nav-finances", "bottom-nav-officers", "bottom-nav-districts", "bottom-nav-trade", "bottom-nav-stats", "bottom-nav-codex"]) {
      if (!desktop.ids.includes(id)) throw new Error(`Missing promoted tab ${id}`);
    }
    for (const key of ["minWidth", "paddingLeft", "paddingTop", "height"]) {
      if (desktop.bottom?.[key] !== desktop.top?.[key]) {
        throw new Error(`Top/bottom ${key} mismatch: ${desktop.top?.[key]} vs ${desktop.bottom?.[key]}`);
      }
    }

    await page.setViewport({ width: 402, height: 874 });
    await sleep(500);
    const phone = await readLayout(page);
    if (phone.count !== 14) throw new Error(`Expected 14 phone bottom tabs, found ${phone.count}`);
    if (!phone.scrollsHorizontally) {
      throw new Error(`Phone row should overflow horizontally (${phone.scrollWidth}/${phone.clientWidth})`);
    }

    await page.evaluate(() => {
      const target = document.querySelector('[data-testid="bottom-nav-finances"]');
      target?.scrollIntoView({ inline: "center", block: "nearest" });
      target?.click();
    });
    await waitForText(page, "FINANCES & BANKING", 30000);

    if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
    console.log("[e2e] PASS: bottom tabs match top sizing, expose 14 routes, scroll on phone, and navigate");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});