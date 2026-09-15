import { chromium } from "/home/runner/workspace/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs";
import path from "node:path";

const BASE = process.env.EXPO_URL || "https://beba5252-0c0c-47bc-ae9e-ed3d2d5945a0-00-3nwiw1auvmn9j.expo.picard.replit.dev";

const VIEWPORT = { width: 1920, height: 1080 };
const OUT_DIR = path.resolve("presskit/screenshots/landscape");

const SHOTS = [
  { file: "01_main_menu.png", path: "/", waitForText: /MEGACITY|NEW GAME|CONTINUE|COMMANDER/i },
  { file: "02_city_overview.png", path: "/(game)/overview", waitForText: /OVERVIEW|CITY|STATUS|POPULATION/i },
  { file: "03_economy.png", path: "/(game)/economy", waitForText: /ECONOMY|CREDITS|BUDGET|REVENUE|TAX/i },
  { file: "04_districts.png", path: "/(game)/districts", waitForText: /DISTRICT|SECTOR|UNREST|LOYALTY/i },
  { file: "05_law_and_order.png", path: "/(game)/law", waitForText: /LAW|POLICE|CRIME|ENFORCEMENT|ORDER/i },
  { file: "06_military.png", path: "/(game)/military", waitForText: /MILITARY|UNITS|SQUAD|FORCE|ARMY|GARRISON/i },
  { file: "07_world_map.png", path: "/(game)/worldmap", waitForText: /WORLD|MAP|LOCATION|REGION|CONTINENT|TERRAIN/i },
  { file: "08_construction.png", path: "/(game)/construction", waitForText: /CONSTRUCT|BUILD|FOUNDRY|FACTORY|QUEUE/i },
  { file: "09_character_dossier.png", path: "/(game)/character", waitForText: /DOSSIER|COMMANDER|CHARACTER|TRAIT|BACKGROUND|CAREER/i },
  { file: "10_factions.png", path: "/(game)/factions", waitForText: /FACTION|ALLIANCE|REPUTATION|RELATION|HOSTILE|FRIENDLY/i },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();

  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error") console.log(`[${t}]`, msg.text().slice(0, 200));
  });

  console.log(`Navigating to ${BASE}/...`);
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 60_000 });

  console.log("Waiting for app shell...");
  await page.waitForFunction(
    () => {
      const root = document.getElementById("root");
      if (!root) return false;
      return (root.innerText || "").trim().length > 20;
    },
    { timeout: 60_000 }
  );

  // Optional CLI filter: --only=06,07,08 captures only listed prefixes.
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const onlyPrefixes = onlyArg ? onlyArg.slice("--only=".length).split(",") : null;
  const filteredShots = onlyPrefixes
    ? SHOTS.filter((s) => onlyPrefixes.some((p) => s.file.startsWith(p)))
    : SHOTS;

  for (const shot of filteredShots) {
    const url = `${BASE}${shot.path}`;
    console.log(`\n→ ${shot.file}  (${url})`);
    try {
      await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    } catch (e) {
      console.log("  goto warning:", e.message);
    }
    try {
      await page.waitForFunction(
        (re) => {
          const root = document.getElementById("root");
          if (!root) return false;
          const text = root.innerText || "";
          return new RegExp(re.source, re.flags).test(text);
        },
        shot.waitForText,
        { timeout: 30_000 }
      );
      console.log("  matched");
    } catch {
      console.log("  WARN: text match timed out, capturing anyway");
    }
    await page.waitForTimeout(1500);
    const out = path.join(OUT_DIR, shot.file);
    // Bump timeout — the default 30s sometimes trips on font-loading via the
    // Replit dev tunnel. Retry once if the first attempt times out.
    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.screenshot({ path: out, fullPage: false, timeout: 90_000 });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.log(`  screenshot attempt ${attempt} failed:`, err.message);
        await page.waitForTimeout(2000);
      }
    }
    if (lastErr) throw lastErr;
    console.log("  saved:", out);
  }

  await browser.close();
  console.log("\nDone.");
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
