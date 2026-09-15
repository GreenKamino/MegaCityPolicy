// Renders the MEGACITY game manual to a printer-friendly PDF.
//
// Two-step flow (the manual content lives in TypeScript with a "@/" alias, which
// plain Node cannot import directly):
//   1) `cd artifacts/megacity && GEN_MANUAL_JSON=1 ./node_modules/.bin/vitest run engine/__tests__/_manualExport.gen.test.ts`
//      -> writes /tmp/megacity-manual.json from data/manualContent.ts
//   2) `node scripts/generate-manual-pdf.mjs`
//      -> reads that JSON and renders exports/MEGACITY-Game-Manual.pdf
//
// Uses the root puppeteer package with the system chromium binary.

import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const DATA_PATH = "/tmp/megacity-manual.json";
const OUT_DIR = "exports";
const OUT_PATH = `${OUT_DIR}/MEGACITY-Game-Manual.pdf`;

function findChromium() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  try {
    const which = execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
    if (which) return which;
  } catch {
    // fall through
  }
  try {
    const found = execSync("ls -d /nix/store/*chromium*/bin/chromium 2>/dev/null | head -1", {
      encoding: "utf8",
    }).trim();
    if (found) return found;
  } catch {
    // fall through
  }
  return undefined;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtml(data) {
  const sections = data.sections
    .map((section) => {
      const isInfo = section.color === "info";
      const items = section.items.map((it) => `<li>${esc(it)}</li>`).join("\n");
      return `
        <section class="manual-section${isInfo ? " info" : ""}">
          <h2>${esc(section.title)}</h2>
          <ul>${items}</ul>
        </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root {
    --ink: #1b1f22;
    --muted: #5c6670;
    --green: #0b6e2e;
    --green-soft: #d6e9dc;
    --blue: #1d4ed8;
    --rule: #d9dee3;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: var(--ink);
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 11.5px;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { padding: 0 6mm; }

  .cover {
    height: 247mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    border-left: 4px solid var(--green);
    padding-left: 14mm;
    page-break-after: always;
  }
  .cover .kicker {
    font-size: 12px;
    letter-spacing: 6px;
    color: var(--green);
    font-weight: 700;
    margin-bottom: 10px;
  }
  .cover h1 {
    font-size: 64px;
    letter-spacing: 4px;
    margin: 0;
    font-weight: 800;
    color: var(--ink);
  }
  .cover .sub {
    font-size: 22px;
    letter-spacing: 8px;
    color: var(--muted);
    margin-top: 6px;
    font-weight: 600;
  }
  .cover .meta {
    margin-top: 26px;
    font-size: 12px;
    color: var(--muted);
    letter-spacing: 1px;
  }
  .cover .tagline {
    margin-top: 34px;
    max-width: 130mm;
    font-size: 13px;
    color: var(--ink);
    line-height: 1.7;
  }

  .intro {
    margin: 4mm 0 6mm 0;
    font-size: 12.5px;
    line-height: 1.7;
    color: var(--ink);
  }
  .intro .welcome {
    display: block;
    color: var(--green);
    font-weight: 800;
    letter-spacing: 3px;
    margin-bottom: 6px;
    font-size: 14px;
  }

  .manual-section {
    page-break-inside: avoid;
    margin-bottom: 6mm;
  }
  .manual-section h2 {
    font-size: 13px;
    letter-spacing: 2px;
    color: var(--green);
    text-transform: uppercase;
    margin: 0 0 4px 0;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--green-soft);
  }
  .manual-section.info h2 {
    color: var(--blue);
    border-bottom-color: #d5deff;
  }
  .manual-section ul {
    margin: 0;
    padding-left: 5mm;
  }
  .manual-section li {
    margin-bottom: 2.5px;
  }

  .outro {
    margin-top: 8mm;
    padding-top: 4mm;
    border-top: 1px solid var(--rule);
    font-size: 10.5px;
    color: var(--muted);
    text-align: center;
    line-height: 1.6;
  }
</style>
</head>
<body>
  <div class="page">
    <div class="cover">
      <div class="kicker">CITY COMMANDER FIELD GUIDE</div>
      <h1>MEGACITY</h1>
      <div class="sub">GAME MANUAL</div>
      <div class="meta">Version ${esc(data.version)}</div>
      <div class="tagline">${esc(data.intro)}</div>
    </div>

    <div class="intro">
      <span class="welcome">WELCOME, COMMANDER</span>
      ${esc(data.intro)}
    </div>

    ${sections}

    <div class="outro">${esc(data.outro)}</div>
  </div>
</body>
</html>`;
}

async function main() {
  if (!existsSync(DATA_PATH)) {
    console.error(
      `Missing ${DATA_PATH}. First run:\n  cd artifacts/megacity && GEN_MANUAL_JSON=1 ./node_modules/.bin/vitest run engine/__tests__/_manualExport.gen.test.ts`
    );
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const html = buildHtml(data);

  const executablePath = findChromium();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    await page.pdf({
      path: OUT_PATH,
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="width:100%; font-size:8px; color:#8a939b; padding:0 14mm; display:flex; justify-content:space-between; font-family:Arial,sans-serif;">' +
        `<span>MEGACITY — Game Manual (v${esc(data.version)})</span>` +
        '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>' +
        "</div>",
    });
    console.log(`Wrote ${OUT_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
