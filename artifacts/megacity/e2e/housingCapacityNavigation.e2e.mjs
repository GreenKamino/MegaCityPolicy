// Real Expo-screen regression for the housing warning -> recommended building
// flow. The read-only fixture starts in a deterministic shortfall, with enough
// resources for HIGH-DENSITY RESIDENTIAL to be the recommended card.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/housingCapacityNavigation.e2e.mjs

import { execSync } from "node:child_process";
import LZString from "lz-string";
import puppeteer from "puppeteer";

const { decompressFromUTF16 } = LZString;
const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const FIXTURE_STORAGE_KEY = "@megacity_e2e_housing_blocker_reload_1";
const fixtureUrl = (housingCase = "full", reload = null) =>
  `${BASE_URL}/overview?demo=1&housing=1&housingcase=${housingCase}` +
  (reload ? `&housingreload=${reload}` : "");
const FIXTURE_URL = fixtureUrl();
const EXPECTED_BUILDING = "HIGH-DENSITY RESIDENTIAL";
const EXPECTED_KEY = "highDensityResidentialPlatforms";

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  page,
  predicate,
  timeout = 120000,
  description = "screen state",
  ...args
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(predicate, ...args)) return;
    } catch {
      // The demo seeder replaces the root frame once; retry after it settles.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForVisibleText(page, text, timeout = 120000) {
  await waitFor(
    page,
    (needle) => {
      const target = needle.toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!(node.textContent ?? "").toUpperCase().includes(target)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    },
    timeout,
    `visible text "${text}"`,
  );
}

async function clickVisibleButton(page, label, { last = false } = {}) {
  const clicked = await page.evaluate(({ needle, last }) => {
    const target = needle.toUpperCase();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const candidates = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter(
        (element) =>
          visible(element) &&
          ((element.getAttribute("aria-label") ?? "").toUpperCase().includes(target) ||
            (element.innerText ?? "").toUpperCase().trim() === target),
      )
      .sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length);
    const button = last ? candidates?.at(-1) : candidates?.[0];
    if (!button) return false;
    button.scrollIntoView({ block: "center", inline: "nearest" });
    button.click();
    return true;
  }, { needle: label, last });
  if (!clicked) throw new Error(`Could not click visible button: ${label}`);
}

async function readHousingRecommendation(page) {
  return page.evaluate(() => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim().toUpperCase();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };
    const heading = [...document.querySelectorAll("*")].find(
      (element) =>
        element.children.length === 0 &&
        normalize(element.innerText ?? "") === "CAPACITY RECOMMENDATION",
    );
    if (!heading) return null;
    heading.scrollIntoView({ block: "center", inline: "nearest" });

    let panel = heading.parentElement;
    while (panel && panel !== document.body) {
      const style = getComputedStyle(panel);
      if (visible(panel) && parseFloat(style.borderTopWidth) >= 1) break;
      panel = panel.parentElement;
    }
    if (!panel || panel === document.body) return null;

    const panelRect = panel.getBoundingClientRect();
    const textLeaves = [...panel.querySelectorAll("*")].filter(
      (element) =>
        element.children.length === 0 &&
        visible(element) &&
        (element.innerText ?? "").trim().length > 0,
    );
    const outsidePanel = textLeaves.filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.left < panelRect.left - 1 ||
        rect.right > panelRect.right + 1 ||
        rect.top < panelRect.top - 1 ||
        rect.bottom > panelRect.bottom + 1
      );
    });
    const overlappingText = [];
    for (let i = 0; i < textLeaves.length; i += 1) {
      const a = textLeaves[i].getBoundingClientRect();
      for (let j = i + 1; j < textLeaves.length; j += 1) {
        const b = textLeaves[j].getBoundingClientRect();
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (width > 1 && height > 1) overlappingText.push([i, j]);
      }
    }
    const costText = textLeaves
      .map((element) => normalize(element.innerText ?? ""))
      .find((text) => text.startsWith("COST:") && text.includes("CREDITS") && text.includes("STEEL")) ?? null;
    return {
      text: normalize(panel.innerText ?? ""),
      costText,
      rect: {
        left: panelRect.left,
        right: panelRect.right,
        top: panelRect.top,
        bottom: panelRect.bottom,
        width: panelRect.width,
        height: panelRect.height,
      },
      outsidePanel: outsidePanel.length,
      overlappingText: overlappingText.length,
      horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
    };
  });
}

async function assertReadableHousingRecommendation(page, expectedText) {
  await waitFor(
    page,
    (expected) => (document.body?.innerText ?? "").toUpperCase().includes(expected.toUpperCase()),
    120000,
    `housing recommendation copy "${expectedText}"`,
    expectedText,
  );
  const panel = await readHousingRecommendation(page);
  if (!panel) throw new Error(`Housing recommendation panel was not found for "${expectedText}"`);
  if (!panel.text.includes(expectedText.toUpperCase())) {
    throw new Error(`Housing recommendation copy was incomplete: ${JSON.stringify(panel)}`);
  }
  if (expectedText.toUpperCase().startsWith("COST:") && !panel.costText) {
    throw new Error(`Housing recommendation cost was not readable: ${JSON.stringify(panel)}`);
  }
  if (
    panel.rect.width <= 0 ||
    panel.rect.height <= 0 ||
    panel.outsidePanel !== 0 ||
    panel.overlappingText !== 0 ||
    panel.horizontalOverflow
  ) {
    throw new Error(`Housing recommendation layout was clipped or overlapping: ${JSON.stringify(panel)}`);
  }
  return panel;
}

async function readRecommendedCard(page) {
  return page.evaluate((buildingLabel) => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim().toUpperCase();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };
    let card = null;
    const textNodes = [...document.querySelectorAll("*")].filter(
      (element) => visible(element) && normalize(element.innerText ?? "") === buildingLabel,
    );
    for (const textNode of textNodes) {
      let candidate = textNode;
      while (candidate && candidate !== document.body) {
        const style = getComputedStyle(candidate);
        if (
          visible(candidate) &&
          (candidate.hasAttribute("tabindex") ||
            candidate.getAttribute("role") === "button" ||
            candidate.tagName === "BUTTON") &&
          normalize(candidate.innerText ?? "").includes(buildingLabel)
        ) {
          card = candidate;
          break;
        }
        candidate = candidate.parentElement;
      }
      if (card) break;
    }
    if (!card) return null;
    const rect = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    const count = [...card.querySelectorAll("*")].find((element) =>
      /^×\d+$/.test((element.innerText ?? "").trim()),
    )?.innerText?.trim() ?? null;
    return {
      count,
      highlighted: parseFloat(style.borderTopWidth) >= 2,
      rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
      viewportHeight: window.innerHeight,
      cardText: normalize(card.innerText ?? ""),
      creditText: [...card.querySelectorAll("*")]
        .filter((element) => element.children.length === 0)
        .map((element) => normalize(element.innerText ?? ""))
        .find((text) => /\bCR$/.test(text)) ?? null,
      steelText: [...card.querySelectorAll("*")]
        .filter((element) => element.children.length === 0)
        .map((element) => normalize(element.innerText ?? ""))
        .find((text) => /\bSTEEL$/.test(text)) ?? null,
    };
  }, EXPECTED_BUILDING);
}

function parseDisplayedResourceValue(text, resource) {
  const match = text.match(new RegExp(`([\\d,.]+)\\s*([KM])?\\s*${resource}\\b`, "i"));
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const multiplier = match[2]?.toUpperCase() === "M" ? 1_000_000 : match[2]?.toUpperCase() === "K" ? 1_000 : 1;
  return base * multiplier;
}

function parseRecommendationCosts(costText) {
  const match = costText.match(/^COST:\s*(.+?)\s+CREDITS\s+\+\s*(.+?)\s+STEEL$/i);
  if (!match) return null;
  return {
    creditsText: `${match[1]} CREDITS`,
    steelText: `${match[2]} STEEL`,
    credits: parseDisplayedResourceValue(`${match[1]} CREDITS`, "CREDITS"),
    steel: parseDisplayedResourceValue(`${match[2]} STEEL`, "STEEL"),
  };
}

function assertHousingCostParity(recommendation, card) {
  const overviewCosts = parseRecommendationCosts(recommendation.costText);
  const constructionCosts = card
    ? {
        creditsText: card.creditText,
        steelText: card.steelText,
        credits: card.creditText ? parseDisplayedResourceValue(card.creditText, "CR") : null,
        steel: card.steelText ? parseDisplayedResourceValue(card.steelText, "STEEL") : null,
      }
    : null;
  if (
    !overviewCosts ||
    !constructionCosts ||
    overviewCosts.credits === null ||
    overviewCosts.steel === null ||
    constructionCosts.credits === null ||
    constructionCosts.steel === null ||
    overviewCosts.credits !== constructionCosts.credits ||
    overviewCosts.steel !== constructionCosts.steel
  ) {
    throw new Error(
      [
        `Housing cost parity mismatch for ${EXPECTED_BUILDING}.`,
        `Overview displays: ${recommendation.costText ?? "missing cost"}.`,
        `Construction card displays: credits ${card?.creditText ?? "missing credits"}, steel ${card?.steelText ?? "missing steel"}.`,
      ].join(" "),
    );
  }
  console.log(
    `[e2e] PASS: housing costs match (${recommendation.costText} ↔ ${card.creditText}, ${card.steelText})`,
  );
}

async function clickRecommendedCard(page) {
  const clicked = await page.evaluate((buildingLabel) => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim().toUpperCase();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const textNodes = [...document.querySelectorAll("*")].filter(
      (element) => visible(element) && normalize(element.innerText ?? "") === buildingLabel,
    );
    for (const textNode of textNodes) {
      let card = textNode;
      while (card && card !== document.body) {
        if (
          visible(card) &&
          card.hasAttribute("tabindex") &&
          normalize(card.innerText ?? "").includes(buildingLabel)
        ) {
          card.scrollIntoView({ block: "center", inline: "nearest" });
          card.click();
          return true;
        }
        card = card.parentElement;
      }
    }
    return false;
  }, EXPECTED_BUILDING);
  if (!clicked) throw new Error("Could not click the recommended housing card");
}

async function clickBuildConfirmation(page) {
  const clicked = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("div,span,button,[role='button']")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.innerText ?? "").trim().toUpperCase() === "BUILD 1"
      );
    });
    const candidate = candidates.at(-1);
    candidate?.click();
    return Boolean(candidate);
  });
  if (!clicked) throw new Error("Could not click the Build confirmation button");
}

async function assertNoPlayerSaveStorage(page) {
  const storage = await page.evaluate(() => {
    const keys = Object.keys(window.localStorage);
    return keys.filter(
      (key) =>
        /^@megacity_slot_\d+$/.test(key) ||
        key === "@megacity_save",
    );
  });
  if (storage.length) {
    throw new Error(`Housing fixture touched player save storage: ${JSON.stringify(storage)}`);
  }
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string" ? decompressFromUTF16(envelope.data) : raw;
  return json ? JSON.parse(json) : null;
}

async function readPersistedHousingState(page) {
  await waitFor(
    page,
    (key) => Boolean(window.localStorage.getItem(key)),
    120000,
    "housing blocker fixture save",
    FIXTURE_STORAGE_KEY,
  );
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_STORAGE_KEY);
  if (!raw) throw new Error("Housing blocker fixture did not write its isolated save");
  const state = decodePersistedState(raw);
  if (!state) throw new Error("Housing blocker fixture save could not be decoded");
  return state;
}

async function removeFixtureStorage(page) {
  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}_backup`);
    window.localStorage.removeItem(`${key}.tmp`);
  }, FIXTURE_STORAGE_KEY);
}

async function assertHousingBlockerCase(page, housingCase, expectedText) {
  await page.goto(fixtureUrl(housingCase), { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitFor(
    page,
    () => {
      const body = document.body?.innerText ?? "";
      return body.includes("CITY STATUS MATRIX") && body.includes("HOUSING CAPACITY DETAIL");
    },
    120000,
    `housing ${housingCase} city screen`,
  );
  await assertReadableHousingRecommendation(page, expectedText);
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  if (body.includes("COMMANDER PROFILE")) {
    throw new Error(`Housing ${housingCase} fixture stopped at the commander profile gate`);
  }
  await assertNoPlayerSaveStorage(page);
  console.log(`[e2e] PASS: housing ${housingCase} blocker is visible and readable on the city screen`);
}

async function assertHousingBlockerReload(page, housingCase, expectedText, loadObserved) {
  // A same-tab Expo navigation can leave the provider mounted briefly. Reset
  // it without a reload phase before starting the save phase so an earlier
  // case cannot write its state into this case's isolated key.
  await page.goto(fixtureUrl(housingCase), {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await removeFixtureStorage(page);
  await page.goto(fixtureUrl(housingCase, "save"), {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await waitFor(
    page,
    () => {
      const body = document.body?.innerText ?? "";
      return body.includes("CITY STATUS MATRIX") &&
        body.includes("HOUSING CAPACITY DETAIL");
    },
    120000,
    `housing ${housingCase} blocker before save`,
  );
  await assertReadableHousingRecommendation(page, expectedText);
  const savedState = await readPersistedHousingState(page);
  if (housingCase === "queue") {
    if ((savedState.pendingConstructions?.length ?? 0) === 0) {
      throw new Error("Housing queue blocker save did not retain the full pending queue");
    }
  } else if ((savedState.resources?.credits ?? 0) !== 0) {
    throw new Error(`Housing credit blocker save retained unexpected credits: ${savedState.resources?.credits}`);
  }

  loadObserved.value = false;
  await page.goto(fixtureUrl(housingCase, "load"), {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const loadDeadline = Date.now() + 120000;
  while (!loadObserved.value && Date.now() < loadDeadline) await sleep(250);
  if (!loadObserved.value) throw new Error(`Timed out waiting for housing ${housingCase} fixture load`);
  await waitFor(
    page,
    (expected) => {
      const body = document.body?.innerText ?? "";
      return body.includes("CITY STATUS MATRIX") &&
        body.includes("HOUSING CAPACITY DETAIL");
    },
    120000,
    `housing ${housingCase} blocker after reload`,
    expectedText,
  );
  await assertReadableHousingRecommendation(page, expectedText);
  await assertNoPlayerSaveStorage(page);
  console.log(`[e2e] PASS: housing ${housingCase} blocker survived save/reload on the narrow phone layout`);
  await removeFixtureStorage(page);
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const page = await browser.newPage();
  const browserErrors = [];
  const loadObserved = { value: false };
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.text().includes("[housingBlockerReloadE2E] fixture load complete")) {
      loadObserved.value = true;
    }
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });
    await page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitFor(
      page,
      () => (document.body?.innerText ?? "").includes("CITY STATUS MATRIX"),
      120000,
      "housing fixture city screen",
    );
    await waitFor(
      page,
      () => {
        const body = document.body?.innerText ?? "";
        return (
          body.includes("HOUSING CAPACITY DETAIL") &&
          body.includes("SHORTFALL") &&
          body.includes("Prioritize HIGH-DENSITY RESIDENTIAL")
        );
      },
      120000,
      "housing warning and recommendation",
    );
    const overviewRecommendation = await assertReadableHousingRecommendation(
      page,
      "COST: 64,000 CREDITS + 140 STEEL",
    );
    console.log("[e2e] PASS: recommended housing card shows credit and steel costs");

    await assertHousingBlockerCase(
      page,
      "credits",
      "MORE CREDITS ARE REQUIRED",
    );
    await assertHousingBlockerCase(
      page,
      "steel",
      "MORE STEEL IS REQUIRED",
    );
    await assertHousingBlockerCase(
      page,
      "queue",
      "TIMED-ORDER QUEUE IS FULL",
    );
    await assertHousingBlockerReload(
      page,
      "credits",
      "MORE CREDITS ARE REQUIRED",
      loadObserved,
    );
    await assertHousingBlockerReload(
      page,
      "queue",
      "TIMED-ORDER QUEUE IS FULL",
      loadObserved,
    );
    await page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitFor(
      page,
      () => {
        const body = document.body?.innerText ?? "";
        return body.includes("CITY STATUS MATRIX") && body.includes("HOUSING CAPACITY DETAIL");
      },
      120000,
      "housing city screen after blocker checks",
    );
    await clickVisibleButton(page, "Open housing construction");

    await waitFor(
      page,
      () => location.pathname.endsWith("/construction") &&
        new URL(location.href).searchParams.get("category") === "housing",
      30000,
      "housing construction navigation",
    );
    const url = new URL(page.url());
    if (
      url.searchParams.get("highlight") !== EXPECTED_KEY ||
      !url.searchParams.get("hl")
    ) {
      throw new Error(`Housing deep-link params were wrong: ${url.href}`);
    }
    await waitFor(
      page,
      (expectedBuilding) => {
        const body = document.body?.innerText ?? "";
        return (
          body.includes("CONSTRUCTION / INFRASTRUCTURE") &&
          body.includes(expectedBuilding)
        );
      },
      120000,
      "housing construction card",
      EXPECTED_BUILDING,
    );

    const initialCard = await readRecommendedCard(page);
    if (!initialCard?.highlighted) {
      throw new Error(`Recommended housing card was not highlighted: ${JSON.stringify(initialCard)}`);
    }
    if (initialCard.count !== "×0") {
      throw new Error(`Recommended housing card changed before confirmation: ${JSON.stringify(initialCard)}`);
    }
    assertHousingCostParity(overviewRecommendation, initialCard);
    console.log("[e2e] PASS: housing warning opens Housing and highlights the recommended card");

    await sleep(3200);
    const clearedCard = await readRecommendedCard(page);
    if (!clearedCard || clearedCard.highlighted) {
      throw new Error(`Recommended housing highlight did not clear: ${JSON.stringify(clearedCard)}`);
    }
    if (clearedCard.count !== "×0") {
      throw new Error(`Recommended housing count changed before Build confirmation: ${JSON.stringify(clearedCard)}`);
    }
    console.log("[e2e] PASS: highlight expires without queuing construction");

    await clickRecommendedCard(page);
    await waitFor(
      page,
      () => (document.body?.innerText ?? "").includes("CONSTRUCT 1x HIGH-DENSITY RESIDENTIAL"),
      30000,
      "housing confirmation modal",
    );
    const beforeConfirm = await readRecommendedCard(page);
    if (!beforeConfirm || beforeConfirm.count !== "×0") {
      throw new Error(`Housing count changed while confirmation was open: ${JSON.stringify(beforeConfirm)}`);
    }
    await clickBuildConfirmation(page);
    await waitFor(
      page,
      () => (document.body?.innerText ?? "").includes("UNDER CONSTRUCTION"),
      30000,
      "confirmed housing order",
    );
    const afterConfirm = await readRecommendedCard(page);
    if (!afterConfirm || afterConfirm.count !== "×0" || !afterConfirm.cardText.includes("1 UNDER CONSTRUCTION")) {
      throw new Error(`Confirmed housing order was not visible without prematurely increasing count: ${JSON.stringify(afterConfirm)}`);
    }

    await assertNoPlayerSaveStorage(page);
    if (browserErrors.length) {
      throw new Error(`Browser errors during housing navigation:\n${browserErrors.join("\n")}`);
    }
    console.log("[e2e] PASS: housing construction remains explicit and read-only until Build is confirmed");
  } finally {
    await removeFixtureStorage(page).catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});