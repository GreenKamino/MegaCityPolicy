import { createRequire } from "node:module";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function resolvePlaywrightCore() {
  const candidates = [
    path.join(repoRoot, "node_modules", "playwright-core"),
    path.join(
      repoRoot,
      "artifacts",
      "megacity",
      "node_modules",
      "playwright-core",
    ),
  ];
  const pnpmDir = path.join(repoRoot, "node_modules", ".pnpm");
  try {
    const entries = await readdir(pnpmDir);
    for (const e of entries) {
      if (e.startsWith("playwright-core@")) {
        candidates.push(path.join(pnpmDir, e, "node_modules", "playwright-core"));
      }
    }
  } catch {}
  const require = createRequire(import.meta.url);
  for (const c of candidates) {
    try {
      return require(c);
    } catch {}
  }
  throw new Error("Could not locate playwright-core in workspace.");
}

const { chromium } = await resolvePlaywrightCore();

const BASE =
  process.env.MEGACITY_CAPTURE_BASE ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : null);

if (!BASE) {
  console.error(
    "Set MEGACITY_CAPTURE_BASE (e.g. https://<expo-dev-domain>) or REPLIT_EXPO_DEV_DOMAIN.",
  );
  process.exit(1);
}
const OUT_DIR = path.resolve("exports/screenshots");
const VIEWPORT = { width: 1920, height: 1080 };

const TARGETS = [
  { route: "/overview", file: "megacity-01-overview.jpg" },
  { route: "/construction", file: "megacity-02-construction.jpg" },
  { route: "/districts", file: "megacity-03-districts.jpg" },
  { route: "/military", file: "megacity-04-military.jpg" },
];

const SETTLE_MS = 1500;
const NAV_TIMEOUT_MS = 60000;
const READY_TIMEOUT_MS = 45000;

await mkdir(OUT_DIR, { recursive: true });

const executablePath =
  process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

if (!executablePath) {
  console.error("No chromium executable env var set");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });

  for (const { route, file } of TARGETS) {
    const url = `${BASE}${route}`;
    const out = path.join(OUT_DIR, file);
    console.log(`\n=> ${route}`);
    const page = await context.newPage();
    page.on("pageerror", (err) => console.log("  pageerror:", err.message));

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });

    try {
      await page.waitForFunction(
        () => {
          const text = document.body?.innerText || "";
          if (!text.includes("MEGACITY COMMAND SYSTEMS ONLINE")) return false;
          const sectorMarshalNodes = Array.from(
            document.querySelectorAll("*"),
          ).filter((el) => {
            const t = (el.textContent || "").trim();
            return t === "SECTOR MARSHAL";
          });
          return sectorMarshalNodes.length === 0;
        },
        { timeout: READY_TIMEOUT_MS, polling: 250 },
      );
      console.log(`   ready: in-game UI detected`);
    } catch (e) {
      console.log(`   timeout waiting for in-game UI; capturing anyway`);
    }

    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({
      path: out,
      type: "jpeg",
      quality: 92,
      fullPage: false,
    });
    console.log(`   saved: ${out}`);
    await page.close();
  }

  await context.close();
} finally {
  await browser.close();
}

console.log("\nAll screenshots captured.");
