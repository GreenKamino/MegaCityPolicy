// Browser regression coverage for the seeded Free-mode faction-demand path.
// Requires the "artifacts/megacity: expo" workflow.
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const PREVIEW_READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120000;
const PREVIEW_REQUEST_TIMEOUT_MS = 10000;

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures.push(name);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function ensurePreviewReady() {
  const deadline = Date.now() + PREVIEW_READY_TIMEOUT_MS;
  let lastFailure = "no response";

  while (Date.now() <= deadline) {
    try {
      const rootResponse = await fetchWithTimeout(BASE_URL, PREVIEW_REQUEST_TIMEOUT_MS);
      if (!rootResponse.ok) {
        throw new Error(`preview returned HTTP ${rootResponse.status}`);
      }

      const html = await rootResponse.text();
      const bundleMatch = html.match(/<script\b[^>]*\bsrc=["']([^"']*\.bundle[^"']*)["']/i);
      if (!bundleMatch) {
        throw new Error("preview HTML did not expose the Expo web bundle");
      }

      const bundleUrl = new URL(bundleMatch[1], BASE_URL).href;
      const bundleResponse = await fetchWithTimeout(bundleUrl, PREVIEW_REQUEST_TIMEOUT_MS);
      if (!bundleResponse.ok) {
        throw new Error(`Metro bundle returned HTTP ${bundleResponse.status}`);
      }
      await bundleResponse.arrayBuffer();

      console.log(`PASS  Expo preview ready at ${BASE_URL}`);
      return;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (Date.now() >= deadline) break;
    await sleep(Math.min(1000, deadline - Date.now()));
  }

  throw new Error(
    `Expected Expo preview URL ${BASE_URL} is unavailable or still starting (${lastFailure}). ` +
      'Start the "artifacts/megacity: expo" workflow, or wait for Metro to finish bundling, then retry.',
  );
}

async function visibleText(page, text) {
  return page.evaluate((target) => {
    const needle = target.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.toUpperCase().includes(needle)) continue;
      const el = node.parentElement;
      const rect = el?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }, text);
}

async function waitForText(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForTextToDisappear(page, text, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await visibleText(page, text))) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for visible text to disappear: ${text}`);
}

async function clickText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const nodes = [...document.querySelectorAll("div, span, button")].filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (el.innerText ?? "").trim().toUpperCase() === needle;
    });
    const el = nodes.sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function clickTextTwice(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const el = [...document.querySelectorAll("div, span, button")].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (candidate.innerText ?? "").trim().toUpperCase() === needle;
    });
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.click();
    el.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not double-click visible text: ${text}`);
}

async function factionStats(page, factionName) {
  await clickText(page, "FACTIONS");
  await waitForText(page, "FACTION OVERVIEW");
  await waitForText(page, "ADMINISTRATIVE BLOC");
  check("Administrative Bloc: shared institutional summary is visible", await visibleText(page, "OPERATIONAL TELEMETRY"));
  check("Administrative Bloc: known values are identified", await visibleText(page, "KNOWN"));
  check("Administrative Bloc: estimated values are identified", await visibleText(page, "EST."));
  return page.evaluate((targetName) => {
    const body = document.body.innerText;
    const list = body.slice(body.indexOf("FACTION OVERVIEW"));
    const target = list.slice(list.toUpperCase().indexOf(targetName.toUpperCase()));
    const match = target.match(/INFLUENCE\s+(\d+)%[\s\S]*?LOYALTY\s+(\d+)%[\s\S]*?THREAT\s+(\d+)%/i);
    if (!match) throw new Error("Could not read faction relationship stats");
    return match.slice(1).map(Number);
  }, factionName);
}

async function checkAdministrativeResponsiveLayout(page) {
  await page.setViewport({ width: 390, height: 844 });
  await sleep(300);
  check("Administrative Bloc: phone layout stays inside the viewport", await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 2,
  ));
  check("Administrative Bloc: phone layout keeps the panel visible", await visibleText(page, "ADMINISTRATIVE BLOC"));
  await page.setViewport({ width: 1400, height: 900 });
}

async function runChoice(choice, expectedDelta) {
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(`${BASE_URL}/?demo=1&factiondemand=1&go=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitForText(page, "A DEMAND", 120000);
    const demandTitle = await page.evaluate(() => {
      const match = document.body.innerText.match(/(?:^|\n)([^\n]+: A DEMAND)(?:\n|$)/i);
      return match?.[1]?.trim() ?? "";
    });
    check(`${choice}: event names the requesting faction`, demandTitle.length > ": A DEMAND".length);
    const factionName = demandTitle.replace(/:\s*A DEMAND$/i, "");
    await clickText(page, "RESPOND");
    await waitForText(page, "RESPONSE OPTIONS");
    for (const text of ["CONCEDE", "NEGOTIATE A COMPROMISE", "RESIST"]) await waitForText(page, text);
    check(`${choice}: all consequences are readable`, await visibleText(page, "FACTION LOYALTY"));
    const before = await factionStats(page, factionName);
    await checkAdministrativeResponsiveLayout(page);
    await clickText(page, "CITY");
    await waitForText(page, "A DEMAND");
    if (!(await visibleText(page, "RESPONSE OPTIONS"))) await clickText(page, "RESPOND");
    await waitForText(page, choice);
    await clickText(page, choice);
    await waitForText(page, "CONFIRM RESPONSE");
    await clickTextTwice(page, "COMMIT RESPONSE");
    await waitForTextToDisappear(page, "A DEMAND");
    check(`${choice}: event card resolves once`, !(await visibleText(page, "A DEMAND")));
    const after = await factionStats(page, factionName);
    check(`${choice}: loyalty changes by ${expectedDelta}`, after[1] - before[1] === expectedDelta);
    check(`${choice}: influence changes with loyalty`, after[0] - before[0] === (choice === "CONCEDE" ? 3 : choice === "NEGOTIATE A COMPROMISE" ? 1 : -2));
    check(`${choice}: threat changes with loyalty`, after[2] - before[2] === (choice === "CONCEDE" ? -5 : choice === "NEGOTIATE A COMPROMISE" ? -1 : 6));
    const afterDuplicate = await factionStats(page, factionName);
    check(`${choice}: stale response cannot apply twice`, afterDuplicate.join(",") === after.join(","));
    check(`${choice}: browser stays error-free`, pageErrors.length === 0);
  } finally {
    await browser.close().catch(() => {});
  }
}

try {
  await ensurePreviewReady();
} catch (error) {
  console.error(`\nPREVIEW CHECK FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

await runChoice("CONCEDE", 8);
await runChoice("NEGOTIATE A COMPROMISE", 3);
await runChoice("RESIST", -7);
if (failures.length) {
  console.error(`\nFAILURES:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("\nPASS: all faction-demand browser cases");
}