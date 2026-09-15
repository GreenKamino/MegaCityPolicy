// Browser regression coverage for the research screen's breakdown and
// cross-category search.
//
// The search intentionally ignores the selected category while a query is
// present, then restores the selected category when the query is cleared.
// Requires the "artifacts/megacity: expo" workflow.
//
// Run with:
//   node e2e/researchSearch.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");

function resolveChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function hasVisibleText(page, text) {
  return page.evaluate((target) => {
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
}

async function waitForVisibleText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasVisibleText(page, text)) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickEnergyCategory(page) {
  const clicked = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll('div, span, button, [role="button"]'),
    );
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const textOf = (node) => ((node.innerText ?? node.textContent) || "").trim().toUpperCase();
    const matches = nodes.filter(
      (node) => isVisible(node) && /^ENERGY\s+\d+\/\d+$/.test(textOf(node)),
    );
    const element = matches.sort((a, b) => textOf(a).length - textOf(b).length)[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  });
  if (!clicked) throw new Error("Could not click the visible ENERGY category chip");
}

async function waitForInputValue(page, expected, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await page.$eval(
      'input[aria-label="SEARCH TECHNOLOGIES..."]',
      (input) => input.value,
    );
    if (value === expected) return;
    await sleep(200);
  }
  throw new Error(`Search input did not reach expected value: ${expected}`);
}

async function readResearchQueue(page) {
  return page.evaluate(() => {
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const exactTextNodes = (text) =>
      Array.from(document.querySelectorAll("div, span, p")).filter(
        (node) => isVisible(node) && (node.innerText ?? node.textContent ?? "").trim() === text,
      );
    const techNames = ["Magnetic Rail Transit", "Autonomous Freight Networks"];
    const rows = techNames.map((name) => {
      const nameNode = exactTextNodes(name).find((node) => {
        let current = node;
        for (let depth = 0; depth < 6 && current; depth += 1) {
          const text = current.innerText ?? current.textContent ?? "";
          if (text.includes("ETA ~") && text.includes(name)) return true;
          current = current.parentElement;
        }
        return false;
      });
      if (!nameNode) return null;
      let row = nameNode;
      for (let depth = 0; depth < 6 && row; depth += 1) {
        const text = row.innerText ?? row.textContent ?? "";
        if (text.includes("ETA ~") && text.includes(name)) {
          const match = text.match(/ETA ~(\d+) ticks \(([^)]+)\)/);
          return {
            name,
            etaText: match?.[0] ?? "",
            ticks: match ? Number(match[1]) : null,
            rowText: text,
            top: row.getBoundingClientRect().top,
          };
        }
        row = row.parentElement;
      }
      return null;
    });
    return rows.filter(Boolean).sort((a, b) => a.top - b.top);
  });
}

async function waitForQueueOrder(page, expectedNames, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const queue = await readResearchQueue(page);
    if (queue.map((item) => item.name).join("|") === expectedNames.join("|")) return queue;
    await sleep(200);
  }
  throw new Error(`Research queue did not reach expected order: ${expectedNames.join(", ")}`);
}

async function assertResearchQueueFixture(page, viewportName) {
  await waitForVisibleText(page, "RESEARCH QUEUE");
  await waitForVisibleText(page, "ACTIVE RESEARCH");
  const initial = await readResearchQueue(page);
  if (initial.length !== 2) {
    throw new Error(`[${viewportName}] expected two visible queued technologies: ${JSON.stringify(initial)}`);
  }
  if (initial.some((item) => !item.etaText || item.ticks === null)) {
    throw new Error(`[${viewportName}] queued technologies are missing readable ETAs: ${JSON.stringify(initial)}`);
  }
  if (!(initial[0].ticks > 0 && initial[1].ticks > initial[0].ticks)) {
    throw new Error(`[${viewportName}] queue ETAs were not cumulative in visible order: ${JSON.stringify(initial)}`);
  }
  const activeTicks = await page.evaluate(() => {
    const text = document.body.innerText.match(/Estimated unlock\s+~(\d+) ticks/);
    return text ? Number(text[1]) : null;
  });
  if (activeTicks === null || initial[0].ticks <= activeTicks) {
    throw new Error(
      `[${viewportName}] active research was not the first timing segment: ` +
        `${JSON.stringify({ activeTicks, initial })}`,
    );
  }

  const moveDown = await page.$(
    '[aria-label="Move Magnetic Rail Transit down in research queue"]',
  );
  if (!moveDown) throw new Error(`[${viewportName}] queue reorder control was not visible`);
  await moveDown.click();
  const reordered = await waitForQueueOrder(page, [
    "Autonomous Freight Networks",
    "Magnetic Rail Transit",
  ]);
  if (reordered[0].ticks === null || reordered[1].ticks === null) {
    throw new Error(`[${viewportName}] reordered queue lost ETA values: ${JSON.stringify(reordered)}`);
  }
  const initialByName = Object.fromEntries(initial.map((item) => [item.name, item]));
  if (
    reordered.some(
      (item) =>
        item.ticks === initialByName[item.name]?.ticks ||
        item.etaText === initialByName[item.name]?.etaText,
    )
  ) {
    throw new Error(
      `[${viewportName}] reordering left a queued ETA stale: ` +
        `${JSON.stringify({ initial, reordered })}`,
    );
  }
  console.log(`PASS  [${viewportName}] reordering refreshes cumulative queue ETAs`);

  const readVariant = async (variant) => {
    await page.goto(
      `${BASE_URL}/?demo=1&researchqueue=1&researchqueuevariant=${variant}&go=research`,
      { waitUntil: "domcontentloaded", timeout: 120000 },
    );
    await waitForVisibleText(page, "RESEARCH QUEUE");
    const queue = await readResearchQueue(page);
    if (queue.length !== 2 || queue.some((item) => item.ticks === null)) {
      throw new Error(`[${viewportName}/${variant}] variant queue ETAs were not readable: ${JSON.stringify(queue)}`);
    }
    return queue;
  };

  const highOutput = await readVariant("high-output");
  if (!(highOutput[0].ticks < initial[0].ticks && highOutput[1].ticks < initial[1].ticks)) {
    throw new Error(
      `[${viewportName}] changing research output did not refresh cumulative ETAs: ` +
        `${JSON.stringify({ initial, highOutput })}`,
    );
  }
  const hard = await readVariant("hard");
  if (!(hard[0].ticks > initial[0].ticks && hard[1].ticks > initial[1].ticks)) {
    throw new Error(
      `[${viewportName}] changing difficulty did not refresh cumulative ETAs: ` +
        `${JSON.stringify({ initial, hard })}`,
    );
  }
  const slow = await readVariant("slow");
  if (
    slow.some(
      (item, index) =>
        item.etaText === initial[index].etaText ||
        !item.rowText.includes("h"),
    )
  ) {
    throw new Error(
      `[${viewportName}] changing tick interval did not refresh visible wall-clock ETAs: ` +
        `${JSON.stringify({ initial, slow })}`,
    );
  }
  console.log(`PASS  [${viewportName}] output, difficulty, and tick interval refresh visible ETAs`);
}

async function readResearchBreakdown(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const formula = text.match(
      /OUTPUT BREAKDOWN\s+([\d.]+) base pts\s+×\s+([\d.]+)\s*=\s*([\d.]+) applied/,
    );
    const researchRate = text.match(/Research Rate\s+([\d.]+) pts\/tick/);
    const facilities = text.match(/Research facilities\s+\+([\d.]+) pts/);
    const corporations = text.match(/Licensed corporations\s+\+([\d.]+) pts/);
    const specialists = text.match(/Research specialists\s+\+([\d.]+) pts/);
    if (!formula || !researchRate || !facilities || !corporations || !specialists) {
      return null;
    }
    return {
      rawPoints: Number(formula[1]),
      multiplier: Number(formula[2]),
      applied: Number(formula[3]),
      researchRate: Number(researchRate[1]),
      facilities: Number(facilities[1]),
      corporations: Number(corporations[1]),
      specialists: Number(specialists[1]),
    };
  });
}

async function assertResearchBreakdown(page, viewportName) {
  await waitForVisibleText(page, "OUTPUT BREAKDOWN");
  const breakdown = await readResearchBreakdown(page);
  if (!breakdown) {
    throw new Error(`[${viewportName}] research breakdown labels or formula were not readable`);
  }

  const contributorTotal =
    breakdown.facilities + breakdown.corporations + breakdown.specialists;
  if (Math.abs(contributorTotal - breakdown.rawPoints) > 0.011) {
    throw new Error(
      `[${viewportName}] contributor rows do not match base output: ` +
        `${contributorTotal} !== ${breakdown.rawPoints}`,
    );
  }
  if (breakdown.applied !== breakdown.researchRate) {
    throw new Error(
      `[${viewportName}] applied output does not match Research Rate: ` +
        `${breakdown.applied} !== ${breakdown.researchRate}`,
    );
  }
  if (
    breakdown.rawPoints < 0 ||
    breakdown.multiplier < 0 ||
    breakdown.applied < 0 ||
    Math.abs(breakdown.rawPoints * breakdown.multiplier - breakdown.applied) >= 1.5
  ) {
    throw new Error(
      `[${viewportName}] displayed research formula is not numerically coherent: ` +
        `${breakdown.rawPoints} × ${breakdown.multiplier} != ${breakdown.applied}`,
    );
  }
  console.log(
    `PASS  [${viewportName}] research breakdown rows and applied rate are numerically coherent ` +
      `(${breakdown.rawPoints} × ${breakdown.multiplier} = ${breakdown.applied})`,
  );
  return breakdown;
}

async function assertZeroCapacityResearch(page, viewportName) {
  await waitForVisibleText(page, "No research capacity");
  await waitForVisibleText(page, "ACTIVE RESEARCH");
  await waitForVisibleText(page, "STALLED — No research capacity");
  await waitForVisibleText(page, "ETA STALLED");

  const breakdown = await assertResearchBreakdown(page, `${viewportName}/zero-capacity`);
  if (
    breakdown.facilities !== 0 ||
    breakdown.corporations !== 0 ||
    breakdown.specialists !== 0 ||
    breakdown.rawPoints !== 0 ||
    breakdown.applied !== 0 ||
    breakdown.researchRate !== 0
  ) {
    throw new Error(
      `[${viewportName}/zero-capacity] expected every research contributor and applied rate to be zero: ` +
        `${JSON.stringify(breakdown)}`,
    );
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  if (/\b(?:NaN|Infinity|undefined)\b/.test(bodyText)) {
    throw new Error(`[${viewportName}/zero-capacity] invalid numeric text was rendered`);
  }
  if (!/0\.00 base pts × [\d.]+ = 0 applied/.test(bodyText)) {
    throw new Error(`[${viewportName}/zero-capacity] zero-output formula was malformed`);
  }
  const storageWrites = await page.evaluate(
    () => window.__researchStorageWrites ?? [],
  );
  if (storageWrites.length) {
    throw new Error(
      `[${viewportName}/zero-capacity] read-only research fixture wrote storage: ` +
        JSON.stringify(storageWrites),
    );
  }
  console.log(
    `PASS  [${viewportName}] zero-capacity research shows zero contributors, warning, and stalled estimates`,
  );
}

const browser = await puppeteer.launch({
  executablePath: resolveChromium(),
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const VIEWPORTS = [
  { name: "mobile", width: 400, height: 720 },
  { name: "desktop", width: 1440, height: 900 },
];

async function runResearchSearchCheck(viewport) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.evaluateOnNewDocument(() => {
    const writes = [];
    const record = (operation, key) => writes.push({ operation, key });
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalClear = Storage.prototype.clear;
    Storage.prototype.setItem = function (key, value) {
      record("setItem", key);
      return originalSetItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      record("removeItem", key);
      return originalRemoveItem.call(this, key);
    };
    Storage.prototype.clear = function () {
      record("clear", "");
      return originalClear.call(this);
    };
    window.__researchStorageWrites = writes;
  });

  try {
    await page.setViewport(viewport);

    await page.goto(`${BASE_URL}/?demo=1&go=research`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForVisibleText(page, "TECHNOLOGY TREE");
    await page.waitForSelector('input[aria-label="SEARCH TECHNOLOGIES..."]', { timeout: 30000 });
    const initialStorage = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    await assertResearchBreakdown(page, viewport.name);
    await page.goto(`${BASE_URL}/?demo=1&researchqueue=1&go=research`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForVisibleText(page, "TECHNOLOGY TREE");
    await assertResearchQueueFixture(page, viewport.name);
    await page.goto(`${BASE_URL}/?demo=1&go=research`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForVisibleText(page, "TECHNOLOGY TREE");

    await clickEnergyCategory(page);
    await waitForVisibleText(page, "Advanced Fusion Reactors");
    console.log(`PASS  [${viewport.name}] selected ENERGY category shows an energy technology`);

    const searchInput = await page.$('input[aria-label="SEARCH TECHNOLOGIES..."]');
    if (!searchInput) throw new Error("Research search input was not found");
    await searchInput.click();
    await searchInput.type("Magnetic Rail Transit");
    await waitForInputValue(page, "Magnetic Rail Transit");
    await waitForVisibleText(page, "Magnetic Rail Transit");
    await waitForVisibleText(page, "TRANSPORTATION");
    console.log(`PASS  [${viewport.name}] cross-category search shows the result and category label`);

    const clearButton = await page.$('[aria-label="Clear search"]');
    if (!clearButton) throw new Error("Clear search button did not appear");
    await clearButton.click();
    await waitForInputValue(page, "");
    await waitForVisibleText(page, "Advanced Fusion Reactors");

    const transportResultStillVisible = await hasVisibleText(page, "Magnetic Rail Transit");
    if (transportResultStillVisible) {
      throw new Error("Clearing search did not restore the selected ENERGY category");
    }
    console.log(`PASS  [${viewport.name}] clearing search restores ENERGY and removes the transport result`);

    const finalStorage = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    if (finalStorage !== initialStorage) {
      throw new Error(`[${viewport.name}] read-only research fixture changed localStorage`);
    }
    console.log(`PASS  [${viewport.name}] read-only research fixture did not write localStorage`);

    if (pageErrors.length || consoleErrors.length) {
      throw new Error(
        `Browser emitted errors (page: ${pageErrors.join(" | ") || "none"}; ` +
          `console: ${consoleErrors.join(" | ") || "none"})`,
      );
    }
    console.log(`PASS  [${viewport.name}] no browser console errors`);

    await page.goto(`${BASE_URL}/?demo=1&researchzero=1&go=research`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForVisibleText(page, "TECHNOLOGY TREE");
    await page.waitForSelector('input[aria-label="SEARCH TECHNOLOGIES..."]', { timeout: 30000 });
    await assertZeroCapacityResearch(page, viewport.name);
    if (pageErrors.length || consoleErrors.length) {
      throw new Error(
        `Zero-capacity browser emitted errors (page: ${pageErrors.join(" | ") || "none"}; ` +
          `console: ${consoleErrors.join(" | ") || "none"})`,
      );
    }
    console.log(`PASS  [${viewport.name}] zero-capacity fixture has no browser console errors`);
  } finally {
    await page.close();
  }
}

try {
  for (const viewport of VIEWPORTS) {
    await runResearchSearchCheck(viewport);
  }
  console.log("\nRESULT: all research search checks passed");
} finally {
  await browser.close();
}