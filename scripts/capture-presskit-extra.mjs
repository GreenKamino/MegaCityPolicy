// Capture 4 extra Steam screenshots (research, megaprojects, officers, atlas).
// Strategy: pre-seed AsyncStorage (web localStorage) with a valid PlayerProfile
// so the boot skips the "IDENTIFY YOURSELF" gate, then walk the NEW GAME →
// LAUNCH MEGACITY flow once and capture each route.
import { chromium } from "/home/runner/workspace/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs";
import path from "node:path";
import fs from "node:fs";

const BASE = process.env.EXPO_URL || `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const VIEWPORT = { width: 1920, height: 1080 };
const OUT_DIR = path.resolve("presskit/screenshots/landscape");
const CHROMIUM = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

const SHOTS = [
  { file: "11_research.png", path: "/(game)/research" },
  { file: "12_megaprojects.png", path: "/(game)/megaprojects" },
  { file: "13_officers.png", path: "/(game)/officers" },
  { file: "14_atlas.png", path: "/(game)/atlas" },
];

// Pre-seeded profile JSON. Mirrors createDefaultProfile() in
// artifacts/megacity/engine/profiles.ts. Static id so seed is deterministic.
const SEED_PROFILE_ID = "prof_seed_steam_capture";
const SEED_PROFILE = {
  id: SEED_PROFILE_ID,
  name: "MARSHAL VOSS",
  age: 42,
  sex: "male",
  portraitId: "player_male_1",
  backstory: "",
  createdAt: 1700000000000,
  lastPlayed: 1700000000000,
  commanderLevel: 1,
  commanderXP: 0,
  commanderXPToNext: 100,
  attributePoints: 0,
  skillPoints: 0,
  attributes: { authority: 5, intelligence: 4, charisma: 3, combat: 6, endurance: 5 },
  skills: {
    leadership: 1, tactics: 1, administration: 1, investigation: 0,
    intimidation: 0, diplomacy: 0, engineering: 0, medicine: 0,
    logistics: 0, surveillance: 0, propaganda: 0, blackOps: 0,
  },
  traits: [],
  decorations: [],
  augmentationSlots: [
    { id: "aug_head", label: "Cranial Implant", bodyRegion: "head", installed: null },
    { id: "aug_eyes", label: "Optic Enhancement", bodyRegion: "head", installed: null },
    { id: "aug_torso", label: "Torso Plating", bodyRegion: "torso", installed: null },
    { id: "aug_arms", label: "Arm Servos", bodyRegion: "arms", installed: null },
    { id: "aug_legs", label: "Leg Hydraulics", bodyRegion: "legs", installed: null },
    { id: "aug_spine", label: "Spinal Uplink", bodyRegion: "spine", installed: null },
  ],
  careerStats: {
    citiesRun: 0, totalPlayTime: 0, totalTicksAllCities: 0,
    totalPopulationGoverned: 0, totalCreditsEarned: 0,
    totalCriminalsSentenced: 0, totalRiotsQuelled: 0,
    totalContractsCompleted: 0, totalDecisions: 0,
    highestPopulation: 0, longestCityTicks: 0,
    totalOfficersAppointed: 0, totalFactionWars: 0,
    totalResearchCompleted: 0, totalBuildingsConstructed: 0,
    totalMissionsCompleted: 0,
  },
  unlockedAchievements: [],
  prestigeState: {
    totalLegacyPoints: 0, availableLegacyPoints: 0, timesReborn: 0, lastRebirthTick: 0,
    purchasedBonuses: {
      starting_credits: 0, resource_production: 0, starting_population: 0,
      research_speed: 0, starting_officers: 0, faction_reputation: 0,
      lucky_start: 0, patron_of_streets: 0, trust_buster: 0, industrialist_heritage: 0,
    },
    highestLPEarned: 0, totalEcologicalLegacy: 0, availableEcologicalLegacy: 0,
    highestEcologicalLegacyEarned: 0,
    purchasedEcologicalBonuses: {
      seeded_biomes: 0, starting_livestock: 0, tamed_cohort: 0, gene_archive: 0, druid_envoy: 0,
    },
  },
};

async function clickByText(page, predicateSrc, opts = {}) {
  const { timeoutMs = 8000, name = "?" } = opts;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const matched = await page.evaluate((preStr) => {
      const pre = new Function("t", `return (${preStr})(t);`);
      const all = Array.from(document.querySelectorAll("*"));
      for (const el of all) {
        const txt = (el.innerText || "").trim();
        if (!txt || txt.length > 80) continue;
        if (pre(txt)) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            el.click();
            return txt;
          }
        }
      }
      return null;
    }, predicateSrc);
    if (matched) {
      console.log(`  click[${name}] -> "${matched}"`);
      return matched;
    }
    await page.waitForTimeout(350);
  }
  console.log(`  click[${name}] TIMEOUT`);
  return null;
}

async function waitForText(page, regex, timeoutMs = 30000) {
  await page.waitForFunction(
    ({ src, flags }) => {
      const root = document.getElementById("root");
      if (!root) return false;
      return new RegExp(src, flags).test(root.innerText || "");
    },
    { src: regex.source, flags: regex.flags },
    { timeout: timeoutMs },
  );
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  // Seed localStorage BEFORE the SPA boots.
  const seedScript = `
    (function() {
      try {
        localStorage.setItem('@megacity_profiles_index', ${JSON.stringify(JSON.stringify([SEED_PROFILE_ID]))});
        localStorage.setItem('@megacity_active_profile', ${JSON.stringify(SEED_PROFILE_ID)});
        localStorage.setItem('@megacity_profile_${SEED_PROFILE_ID}', ${JSON.stringify(JSON.stringify(SEED_PROFILE))});
      } catch (e) { console.error('seed failed', e); }
    })();
  `;
  await context.addInitScript(seedScript);

  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message.slice(0, 120)}`));

  log(`Navigating ${BASE}/`);
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 60_000 });

  log("Waiting for main menu (profile seed should bypass IDENTIFY YOURSELF)...");
  await waitForText(page, /MAIN MENU|NEW GAME|MARSHAL VOSS/i, 60_000);

  const menuText = await page.evaluate(() => (document.getElementById("root")?.innerText || ""));
  log(`Menu text snippet: ${JSON.stringify(menuText.replace(/\n/g, " ").slice(0, 200))}`);

  // Open SAVE SLOTS modal (the main menu's "NEW GAME" entry point)
  log("Opening SAVE SLOTS...");
  await clickByText(page, "(t) => t === 'SAVE SLOTS' || /^SAVE SLOTS$/.test(t)", { name: "save-slots", timeoutMs: 8000 });
  await page.waitForTimeout(800);

  // Slot picker: empty slots show "NEW GAME"
  log("Selecting empty slot...");
  await clickByText(page, "(t) => t === 'NEW GAME'", { name: "empty-slot", timeoutMs: 8000 });
  await page.waitForTimeout(1200);

  // City/char creation: walk NEXT until LAUNCH MEGACITY
  log("Walking city/character creation...");
  for (let step = 0; step < 14; step++) {
    const haveLaunch = await page.evaluate(() => /LAUNCH MEGACITY/i.test(document.getElementById("root")?.innerText || ""));
    if (haveLaunch) {
      log(`  found LAUNCH at step ${step}`);
      await clickByText(page, "(t) => /LAUNCH MEGACITY/i.test(t)", { name: "launch", timeoutMs: 6000 });
      break;
    }
    const clicked = await clickByText(page, "(t) => t === 'NEXT' || /^NEXT(:|\\s)/.test(t)", { name: `step-${step}`, timeoutMs: 4000 });
    if (!clicked) {
      log(`  no NEXT at step ${step} — trying LAUNCH directly`);
      const launched = await clickByText(page, "(t) => /LAUNCH MEGACITY/i.test(t)", { name: "launch-fallback", timeoutMs: 4000 });
      if (launched) break;
      log("  giving up creation walk");
      break;
    }
    await page.waitForTimeout(500);
  }

  // Wait for in-game shell.
  log("Waiting for in-game shell...");
  try {
    await waitForText(page, /CITY OVERVIEW|OVERVIEW|ECONOMY|DISTRICTS/i, 45_000);
    log("In-game shell detected.");
  } catch {
    log("WARN: in-game shell text not detected; capturing anyway.");
  }
  await page.waitForTimeout(2000);

  // Capture each shot.
  for (const shot of SHOTS) {
    const url = `${BASE}${shot.path}`;
    log(`→ ${shot.file}  (${shot.path})`);
    try {
      await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    } catch (e) {
      log(`  goto warning: ${e.message}`);
    }
    await page.waitForTimeout(2500);
    const out = path.join(OUT_DIR, shot.file);
    await page.screenshot({ path: out, fullPage: false, timeout: 60_000 });
    log(`  saved ${out}`);
  }

  await browser.close();
  log("Done.");
})().catch((e) => {
  console.error("FATAL:", e?.message || e);
  process.exit(1);
});
