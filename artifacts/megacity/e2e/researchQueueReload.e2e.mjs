// Browser regression for research queue order and derived completion times
// surviving the normal wrapped save/reload path.
//
// The fixture is read-only: its save uses a disposable storage namespace and
// the test verifies that no player/profile save keys are created.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/researchQueueReload.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import {
  assertNoPlayerSaveStorage,
  readFixtureState,
  removeFixtureStorage,
} from "./disposableSaveFixture.mjs";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120000;
const FIXTURE_STORAGE_KEY = "@megacity_e2e_research_queue_reload_1";
const QUEUED_TECH_NAMES = ["Magnetic Rail Transit", "Autonomous Freight Networks"];

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function navigate(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (error) {
    if (!String(error?.message ?? error).includes("Navigation timeout")) throw error;
  }
}

async function waitForPath(page, suffix, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith(suffix)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for path ${suffix}; current URL: ${page.url()}`);
}

async function waitForVisibleText(page, text, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate((target) => {
      const needle = target.toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    }, text);
    if (found) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function readPersistedState(page) {
  return readFixtureState(page, FIXTURE_STORAGE_KEY, "research queue fixture");
}

async function readQueueScreen(page) {
  return page.evaluate((names) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const records = names.map((name) => {
      const nameNode = [...document.querySelectorAll("div, span, p")]
        .find((element) => visible(element) && (element.innerText ?? "").trim() === name);
      let current = nameNode;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        const text = (current.innerText ?? "").replace(/\s+/g, " ").trim();
        if (text.includes("ETA ~") && text.includes("pts")) {
          const eta = text.match(/ETA ~(\d+) ticks/);
          const cost = text.match(/(\d+)pts/);
          if (eta && cost) return {
            name,
            ticks: Number(eta[1]),
            cost: Number(cost[1]),
            text,
            node: nameNode,
          };
        }
      }
      return null;
    });
    const rows = records
      .filter(Boolean)
      .sort((a, b) => {
        if (a.node === b.node) return 0;
        return a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      })
      .map(({ node, ...row }) => row);
    const bodyText = document.body.innerText.replace(/\s+/g, " ");
    const rate = bodyText.match(/Research Rate\s+([\d.]+) pts\/tick/);
    return { rows, researchRate: rate ? Number(rate[1]) : null };
  }, QUEUED_TECH_NAMES);
}

function expectedQueueTicks(savedState, screen) {
  if (!screen.researchRate || screen.researchRate <= 0) {
    throw new Error("Research queue fixture did not render a positive research rate");
  }
  const active = savedState.activeResearch;
  let cumulative = active
    ? Math.ceil(Math.max(0, active.cost - active.progress) / screen.researchRate)
    : 0;
  return screen.rows.map((row) => {
    if (!row) throw new Error("A queued research project did not render an ETA row");
    cumulative += Math.ceil(row.cost / screen.researchRate);
    return cumulative;
  });
}

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
});

try {
  for (const caseName of ["active", "empty"]) {
    await navigate(
      page,
      `${BASE_URL}/?demo=1&researchqueue=1&researchqueuecase=${caseName}&researchQueueReload=save&go=research`,
    );
    await waitForPath(page, "/research");
    await waitForVisibleText(page, "TECHNOLOGY TREE");
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: READY_TIMEOUT_MS },
      FIXTURE_STORAGE_KEY,
    );

    const savedState = await readPersistedState(page);
    const savedQueue = savedState.researchQueue ?? [];
    if (savedQueue.length !== 2) {
      throw new Error(`${caseName}: saved queue should contain two projects, got ${JSON.stringify(savedQueue)}`);
    }
    if (caseName === "active" && !savedState.activeResearch) {
      throw new Error("active: saved fixture lost its active project");
    }
    if (caseName === "empty" && savedState.activeResearch) {
      throw new Error("empty: saved fixture unexpectedly has an active project");
    }

    const beforeReload = await readQueueScreen(page);
    const expectedTicks = expectedQueueTicks(savedState, beforeReload);
    if (beforeReload.rows.some((row, index) => row?.ticks !== expectedTicks[index])) {
      throw new Error(`${caseName}: initial queue ETAs did not match cumulative calculation`);
    }

    await navigate(
      page,
      `${BASE_URL}/?demo=1&researchqueue=1&researchqueuecase=${caseName}&researchQueueReload=load&go=research`,
    );
    await waitForPath(page, "/research");
    await waitForVisibleText(page, "TECHNOLOGY TREE");
    const afterReload = await readQueueScreen(page);
    const reloadedOrder = afterReload.rows.map((row) => row?.name);
    if (reloadedOrder.join("|") !== beforeReload.rows.map((row) => row?.name).join("|")) {
      throw new Error(`${caseName}: queue order changed after reload`);
    }
    const reloadedTicks = afterReload.rows.map((row) => row?.ticks);
    if (reloadedTicks.join("|") !== expectedTicks.join("|")) {
      throw new Error(
        `${caseName}: reloaded ETAs ${reloadedTicks.join(",")} did not match ` +
        `fresh cumulative values ${expectedTicks.join(",")}`,
      );
    }
    await assertNoPlayerSaveStorage(page, `${caseName} research queue fixture`);
    console.log(
      `PASS [${caseName}] research queue order and cumulative ETAs survived save/reload ` +
      `(ticks ${reloadedTicks.join(",")})`,
    );
  }

  if (browserErrors.length) {
    throw new Error(`Browser errors during research queue reload check:\n${browserErrors.join("\n")}`);
  }
  console.log("[e2e] PASS: active and empty-active research queues rebuild correct completion times after save/reload");
} finally {
  await removeFixtureStorage(page, FIXTURE_STORAGE_KEY).catch(() => {});
  await browser.close().catch(() => {});
}