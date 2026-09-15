// Browser regression coverage for production-chain facts at phone width,
// enlarged browser text scale, and a native-style large-text preview. Requires
// the "artifacts/megacity: expo" workflow.
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const PREVIEW_READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120000;
const PREVIEW_REQUEST_TIMEOUT_MS = 10000;
const NATIVE_LARGE_TEXT_SCALE = 2;

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      if (!rootResponse.ok) throw new Error(`preview returned HTTP ${rootResponse.status}`);
      const html = await rootResponse.text();
      const bundleMatch = html.match(/<script\b[^>]*\bsrc=["']([^"']*\.bundle[^"']*)["']/i);
      if (!bundleMatch) throw new Error("preview HTML did not expose the Expo web bundle");
      const bundleResponse = await fetchWithTimeout(
        new URL(bundleMatch[1], BASE_URL).href,
        PREVIEW_REQUEST_TIMEOUT_MS,
      );
      if (!bundleResponse.ok) throw new Error(`Metro bundle returned HTTP ${bundleResponse.status}`);
      await bundleResponse.arrayBuffer();
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

async function waitForVisibleText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate((target) => {
      const needle = target.toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.toUpperCase().includes(needle)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    }, text);
    if (found) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.toUpperCase();
    const matches = [...document.querySelectorAll("div, span, button")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (element.innerText ?? "").trim().toUpperCase() === needle;
    });
    const element = matches.sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function createIsolatedContext(browser) {
  if (typeof browser.createBrowserContext === "function") {
    return browser.createBrowserContext();
  }
  if (typeof browser.createIncognitoBrowserContext === "function") {
    return browser.createIncognitoBrowserContext();
  }
  throw new Error("Puppeteer does not support creating an isolated browser context");
}

async function assertNoPlayerSaveStorage(page) {
  const storage = await page.evaluate(() => {
    const keys = Object.keys(window.localStorage);
    return {
      keys,
      realSlot: Boolean(window.localStorage.getItem("@megacity_slot_1")),
      legacySlot: Boolean(window.localStorage.getItem("@megacity_save")),
      profileIndex: Boolean(window.localStorage.getItem("@megacity_profiles_index")),
      profileData: keys.some((key) => key.startsWith("@megacity_profile_")),
      activeProfile: Boolean(window.localStorage.getItem("@megacity_active_profile")),
    };
  });
  if (
    storage.realSlot ||
    storage.legacySlot ||
    storage.profileIndex ||
    storage.profileData ||
    storage.activeProfile
  ) {
    throw new Error(`Legacy production fixture touched player save storage: ${JSON.stringify(storage)}`);
  }
}

async function inspectProductionFacts(page, layoutName) {
  await page.evaluate(() => {
    const needle = "OUTPUT:";
    const lines = [...document.querySelectorAll("div, span")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (element.innerText ?? "").toUpperCase().includes(needle);
    });
    lines.sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0]?.scrollIntoView({
      block: "center",
      inline: "nearest",
    });
  });

  const facts = await page.evaluate(() => {
    const targets = ["CIVILIAN STOCKPILE BALANCE", "SUPPLY", "DEMAND", "OUTPUT:", "CYCLE:", "STAFFING:", "USES:"];
    const visibleElements = [...document.querySelectorAll("div, span")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const rows = targets.map((target) => {
      const matches = visibleElements
        .filter((element) => (element.innerText ?? "").toUpperCase().includes(target))
        .sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length);
      const element = matches[0];
      if (!element) return { target, rect: null, text: null };
      const rect = element.getBoundingClientRect();
      return {
        target,
        text: (element.innerText ?? "").trim(),
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      };
    });
    const cardDiagnostics = [...document.querySelectorAll('[data-testid$="-card"]')]
      .filter((card) => {
        const rect = card.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((card) => {
        const cardRect = card.getBoundingClientRect();
        const cardTargets = card.getAttribute("data-testid") === "production-balance-card"
          ? ["CIVILIAN STOCKPILE BALANCE", "SUPPLY", "DEMAND"]
          : ["OUTPUT:", "CYCLE:", "STAFFING:", "USES:"];
        const cardFacts = cardTargets.flatMap((target) => {
          const matches = [...card.querySelectorAll("div, span")]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 &&
                (element.innerText ?? "").toUpperCase().includes(target);
            })
            .sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length);
          const element = matches[0];
          if (!element) return [];
          const rect = element.getBoundingClientRect();
          return [{
            target,
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
          }];
        });
        return {
          rect: { left: cardRect.left, right: cardRect.right, top: cardRect.top, bottom: cardRect.bottom },
          facts: cardFacts,
          hasHorizontalOverflow: [...card.querySelectorAll("*")].some(
            (element) => element.scrollWidth > element.clientWidth + 1,
          ),
        };
      });
    return {
      facts: rows,
      cardDiagnostics,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasHorizontalOverflow: cardDiagnostics.some((card) => card.hasHorizontalOverflow),
    };
  });

  const missing = facts.facts.filter((fact) => !fact.rect);
  if (missing.length) throw new Error(`${layoutName} is missing: ${missing.map((fact) => fact.target).join(", ")}`);

  for (const fact of facts.facts) {
    if (fact.rect.left < -1 || fact.rect.right > facts.viewport.width + 1) {
      throw new Error(`${layoutName} ${fact.target} is clipped horizontally: ${JSON.stringify(fact)}`);
    }
  }
  if (facts.hasHorizontalOverflow) {
    throw new Error(`${layoutName} has horizontal overflow: ${JSON.stringify(facts)}`);
  }
  for (const card of facts.cardDiagnostics) {
    for (const fact of card.facts) {
      if (fact.rect.left < card.rect.left - 1 || fact.rect.right > card.rect.right + 1) {
        throw new Error(`${layoutName} ${fact.target} escapes its card: ${JSON.stringify(fact)}`);
      }
    }
    for (let i = 0; i < card.facts.length; i += 1) {
      for (let j = i + 1; j < card.facts.length; j += 1) {
        const first = card.facts[i];
        const second = card.facts[j];
        const overlapsHorizontally = first.rect.left < second.rect.right && second.rect.left < first.rect.right;
        const overlapsVertically = first.rect.top < second.rect.bottom && second.rect.top < first.rect.bottom;
        if (overlapsHorizontally && overlapsVertically) {
          throw new Error(
            `${layoutName} ${first.target} overlaps ${second.target}: ${JSON.stringify(card)}`,
          );
        }
      }
    }
  }
  return facts;
}

async function applyNativeLargeTextPreview(page) {
  await page.evaluate((scale) => {
    // Native Text keeps the card's width and lets each text node reflow at the
    // OS-selected size. This mirrors the largest in-app/native preview size
    // without using document zoom, which scales the layout as well as text.
    document.documentElement.style.zoom = "";
    const cards = [...document.querySelectorAll('[data-testid$="-card"]')];
    for (const card of cards) {
      for (const element of [card, ...card.querySelectorAll("*")]) {
        if (!(element instanceof HTMLElement) || !(element.textContent ?? "").trim()) continue;
        const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
        if (!Number.isFinite(fontSize) || fontSize <= 0) continue;
        element.style.fontSize = `${fontSize * scale}px`;
        element.style.lineHeight = "normal";
      }
    }
  }, NATIVE_LARGE_TEXT_SCALE);
}

async function inspectLegacyProductionFacts(page, economy) {
  const facts = await page.evaluate((expectedEconomy) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const balance = [...document.querySelectorAll('[data-testid="production-balance-card"]')]
      .find(visible);
    const cards = [
      ...document.querySelectorAll(
        '[data-testid="production-producer-card"], [data-testid="production-consumer-card"]',
      ),
    ]
      .filter(visible)
      .map((card) => (card.innerText ?? "").trim());
    return {
      expectedEconomy: expectedEconomy,
      balance: balance ? (balance.innerText ?? "").trim() : null,
      cards,
    };
  }, economy);

  if (facts.cards.length === 0) {
    throw new Error(`Legacy ${economy} fixture rendered no production cards: ${JSON.stringify(facts)}`);
  }
  if (facts.cards.some((text) => !text.includes("NOT BUILT"))) {
    throw new Error(`Legacy ${economy} fixture has a live production status: ${JSON.stringify(facts)}`);
  }
  if (facts.cards.some((text) => /(?:^|\n)\s*\d+ building(?:s)? built/i.test(text))) {
    throw new Error(`Legacy ${economy} fixture invented a built-building total: ${JSON.stringify(facts)}`);
  }

  if (economy === "civilian") {
    if (!facts.balance) {
      throw new Error(`Legacy civilian fixture is missing its balance card: ${JSON.stringify(facts)}`);
    }
    if (!/SUPPLY[\s\S]*~0\.0× per cycle/i.test(facts.balance) ||
        !/DEMAND[\s\S]*~0\.0× per cycle/i.test(facts.balance)) {
      throw new Error(`Legacy civilian fixture has non-zero supply/demand: ${JSON.stringify(facts)}`);
    }
  } else if (facts.balance) {
    throw new Error(`Legacy military fixture incorrectly rendered a civilian balance: ${JSON.stringify(facts)}`);
  }

  return facts;
}

await ensurePreviewReady();
const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await createIsolatedContext(browser);
const page = await context.newPage();
const pageErrors = [];
let legacyContext;
const legacyPageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !/favicon|net:|404/.test(message.text())) pageErrors.push(message.text());
});

try {
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await page.goto(`${BASE_URL}/?demo=1&go=production-chains`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitForVisibleText(page, "PRODUCTION CHAINS");
  await clickVisibleText(page, "Steel Ingot");
  await waitForVisibleText(page, "CIVILIAN STOCKPILE BALANCE");
  await waitForVisibleText(page, "OUTPUT:");
  await waitForVisibleText(page, "USES:");

  const phoneFacts = await inspectProductionFacts(page, "phone-sized layout");

  // RN-Web uses fixed pixel font sizes, so CSS zoom models a browser
  // accessibility/text-enlargement setting and exercises the same reflow path.
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.5";
  });
  const enlargedFacts = await inspectProductionFacts(page, "150% text-scale layout");

  await applyNativeLargeTextPreview(page);
  const nativeLargeTextFacts = await inspectProductionFacts(page, "native largest text layout");

  if (pageErrors.length) throw new Error(`Browser errors:\n${pageErrors.join("\n")}`);
  console.log(`PASS: production labels fit at 375px (${phoneFacts.facts.map((fact) => fact.target).join(", ")})`);
  console.log(`PASS: production labels fit at 150% text scale (${enlargedFacts.facts.map((fact) => fact.target).join(", ")})`);
  console.log(
    `PASS: production detail card fits at native largest text scale (${nativeLargeTextFacts.facts.map((fact) => fact.target).join(", ")})`,
  );

  // Use a fresh disposable context for the legacy-save case. The accessibility
  // pass above intentionally runs long enough for a demo autosave, so sharing
  // its context would make that unrelated slot look like the legacy fixture
  // wrote player storage.
  legacyContext = await createIsolatedContext(browser);
  const legacyPage = await legacyContext.newPage();
  legacyPage.on("pageerror", (error) => legacyPageErrors.push(String(error)));
  legacyPage.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net:|404/.test(message.text())) {
      legacyPageErrors.push(message.text());
    }
  });

  const legacyFixtureUrl = `${BASE_URL}/?demo=1&legacyproduction=1&go=production-chains`;
  await legacyPage.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await legacyPage.goto(legacyFixtureUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitForVisibleText(legacyPage, "PRODUCTION CHAINS");
  await assertNoPlayerSaveStorage(legacyPage);
  await clickVisibleText(legacyPage, "Steel Ingot");
  await waitForVisibleText(legacyPage, "CIVILIAN STOCKPILE BALANCE");
  await waitForVisibleText(legacyPage, "NOT BUILT");
  const legacyCivilianFacts = await inspectLegacyProductionFacts(legacyPage, "civilian");
  await assertNoPlayerSaveStorage(legacyPage);

  // Reload the same disposable fixture before checking army supply. This
  // keeps the two economies independent and avoids relying on a detail-view
  // back navigation implementation in the browser harness.
  await legacyPage.goto(legacyFixtureUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitForVisibleText(legacyPage, "PRODUCTION CHAINS");
  await clickVisibleText(legacyPage, "Ammunition (Army)");
  await waitForVisibleText(legacyPage, "PRODUCED BY");
  await waitForVisibleText(legacyPage, "NOT BUILT");
  const legacyMilitaryFacts = await inspectLegacyProductionFacts(legacyPage, "military");
  await assertNoPlayerSaveStorage(legacyPage);

  const browserErrors = [...pageErrors, ...legacyPageErrors];
  if (browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
  console.log(
    `PASS: legacy civilian production stays at zero with NOT BUILT cards (${legacyCivilianFacts.cards.length} cards)`,
  );
  console.log(
    `PASS: legacy military production stays at zero with NOT BUILT cards (${legacyMilitaryFacts.cards.length} cards)`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const browserErrors = [...pageErrors, ...legacyPageErrors];
  if (browserErrors.length && !message.includes("Browser errors:")) {
    throw new Error(`${message}\nBrowser errors:\n${browserErrors.join("\n")}`);
  }
  throw error;
} finally {
  await legacyContext?.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
