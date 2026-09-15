// Responsive real-screen contract for the status-aware More command menu.
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/moreCommandMenu.e2e.mjs
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

async function waitFor(page, predicate, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(predicate)) return;
    } catch {
      // Demo seeding replaces the root frame once; retry after it settles.
    }
    await sleep(500);
  }
  throw new Error("Timed out waiting for the More command menu");
}

async function inspectLayout(page, viewportWidth) {
  const result = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('[data-testid^="command-status-"]'));
    const rows = badges.map((badge) => badge.closest('[role="button"]')).filter(Boolean);
    return {
      badgeCount: badges.length,
      badges: badges.map((badge) => {
        const rect = badge.getBoundingClientRect();
        return { text: badge.textContent?.trim(), width: rect.width, height: rect.height };
      }),
      rows: rows.map((row) => {
        const rect = row.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
    };
  });

  if (result.badgeCount < 4) {
    throw new Error(`Expected at least four live status chips, found ${result.badgeCount}`);
  }
  for (const badge of result.badges) {
    if (!badge.text || badge.width < 35 || badge.height < 20) {
      throw new Error(`Unreadable status chip: ${JSON.stringify(badge)}`);
    }
  }
  for (const row of result.rows) {
    if (row.left < 0 || row.right > viewportWidth || row.width < 300) {
      throw new Error(`Status row overflows ${viewportWidth}px viewport: ${JSON.stringify(row)}`);
    }
  }
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
    await page.setViewport({ width: 402, height: 874 });
    await page.goto(`${BASE_URL}/?demo=1&go=more`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitFor(page, () => {
      const text = document.body?.innerText ?? "";
      return text.includes("COMMAND MENUS") &&
        text.includes("COMMAND & INTELLIGENCE") &&
        text.includes("OPERATIONS") &&
        text.includes("GOVERNANCE") &&
        text.includes("WORLD") &&
        text.includes("COMMANDER TOOLS");
    });

    await inspectLayout(page, 402);

    await page.setViewport({ width: 1440, height: 900 });
    await sleep(500);
    await inspectLayout(page, 1440);

    await page.evaluate(() => {
      const inbox = Array.from(document.querySelectorAll('[role="button"]')).find((node) =>
        node.getAttribute("aria-label")?.toLowerCase().startsWith("inbox"),
      );
      inbox?.click();
    });
    await waitFor(page, () => location.pathname.includes("inbox"), 30000);

    if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
    console.log("[e2e] PASS: More status chips fit phone/desktop and preserve navigation");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});