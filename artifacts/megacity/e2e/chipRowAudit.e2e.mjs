// Task #570 audit: visit every demo-seeder tab at 1280x720 and report any
// visible flex-wrap containers whose clickable chip children render in 3+
// rows (the Task #568 "wasted vertical space" signature).
//   node e2e/chipRowAudit.e2e.mjs [startIdx] [endIdx]
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

const TABS = [
  "overview", "law", "economy", "worldmap", "construction", "diplomacy",
  "more", "districts", "atlas", "megaprojects", "military", "factions",
  "research", "codex", "inbox", "missions", "officers", "retinue",
  "logbook", "events", "achievements", "stats", "summary", "lore",
  "finances", "trade", "companies", "local-economy", "cybernetics",
  "blackmarket", "criminals", "challenges", "goals", "social",
  "scavenging", "wildlands", "mining", "space", "expansion",
  "propaganda", "recruitment", "upgrades", "prestige", "character",
  "journal", "inventory", "administration", "firsts", "contracts",
];

const startIdx = Number(process.argv[2] ?? 0);
const endIdx = Number(process.argv[3] ?? TABS.length);

function auditPage() {
  const out = [];
  const els = document.querySelectorAll("*");
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (cs.flexWrap !== "wrap") continue;
    if (!cs.display.includes("flex")) continue;
    if (!cs.flexDirection.startsWith("row")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const kids = Array.from(el.children).filter((k) => {
      const r = k.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (kids.length < 6) continue;
    const clickable = kids.filter((k) => {
      const kcs = getComputedStyle(k);
      return kcs.cursor === "pointer" || k.getAttribute("role") === "button" || k.tagName === "BUTTON";
    });
    if (clickable.length < 6) continue;
    // Count distinct rendered rows by clustering child top offsets.
    const tops = [...new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top / 10)))];
    if (tops.length < 3) continue;
    const sample = kids
      .slice(0, 4)
      .map((k) => (k.textContent || "").trim().slice(0, 24))
      .join(" | ");
    out.push({
      rows: tops.length,
      chips: clickable.length,
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      sample,
    });
  }
  return out;
}

const main = async () => {
  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,720"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const findings = [];
  for (const tab of TABS.slice(startIdx, endIdx)) {
    try {
      await page.goto(`${BASE_URL}/?demo=1&go=${tab}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await sleep(3500);
      const hits = await page.evaluate(auditPage);
      if (hits.length) {
        findings.push({ tab, hits });
        console.log(`FLAG ${tab}: ${JSON.stringify(hits)}`);
      } else {
        console.log(`ok   ${tab}`);
      }
    } catch (e) {
      console.log(`ERR  ${tab}: ${String(e).slice(0, 120)}`);
    }
  }
  await browser.close();
  console.log(`AUDIT_DONE flagged=${findings.length}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
