// Responsive real-screen contract for command-palette discovery, search, and navigation.
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/commandPalette.e2e.mjs
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
    await sleep(400);
  }
  throw new Error("Timed out waiting for the command palette");
}

async function assertPaletteFits(page, width, height) {
  const geometry = await page.$eval('[data-testid="command-palette"]', (node) => {
    const rect = node.getBoundingClientRect();
    const input = node.querySelector('[data-testid="command-palette-input"]');
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      activeIsInput: document.activeElement === input,
    };
  });
  if (
    geometry.left < 0 ||
    geometry.right > width ||
    geometry.top < 0 ||
    geometry.bottom > height ||
    !geometry.activeIsInput
  ) {
    throw new Error(`Palette does not fit/focus at ${width}x${height}: ${JSON.stringify(geometry)}`);
  }
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) errors.push(message.text());
  });

  try {
    await page.setViewport({ width: 402, height: 874 });
    await page.goto(`${BASE_URL}/?demo=1&go=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitFor(page, () => Boolean(document.querySelector('[data-testid="command-palette-trigger"]')));

    await page.click('[data-testid="command-palette-trigger"]');
    await waitFor(page, () => document.body?.innerText?.includes("COMMAND PALETTE"));
    await sleep(100);
    await assertPaletteFits(page, 402, 874);

    await page.type('[data-testid="command-palette-input"]', "sectors");
    await waitFor(page, () => document.body?.innerText?.includes("SECTOR MAP"));
    await page.keyboard.press("Enter");
    await waitFor(page, () => location.pathname.includes("districts"), 30000);

    await page.setViewport({ width: 1440, height: 900 });
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await waitFor(page, () => Boolean(document.querySelector('[data-testid="command-palette"]')));
    await assertPaletteFits(page, 1440, 900);

    await page.type('[data-testid="command-palette-input"]', "crises");
    await waitFor(page, () => document.body?.innerText?.includes("EVENTS & REPORTS"));
    await page.keyboard.press("Escape");
    await waitFor(page, () => !document.querySelector('[data-testid="command-palette"]'), 30000);
    if (!new URL(page.url()).pathname.includes("districts")) {
      throw new Error("Escape navigated away instead of closing the palette first");
    }

    if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
    console.log("[e2e] PASS: palette fits phone/desktop, searches aliases, focuses input, navigates, and closes first");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});