// Real-screen coverage for the unified storage plan on narrow, portrait-tablet,
// landscape-tablet, and wide layouts.
// The demo fixture is read-only and must not create or promote a player save.
//
// Requires the "artifacts/megacity: expo" workflow.

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const FIXTURE_URL = (route) =>
  `${BASE_URL}/?demo=1&medicalstorage=1&medicalstoragecase=economy&mode=turnbased&go=${route}`;
const PREVIEW_READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120_000;
const PREVIEW_REQUEST_TIMEOUT_MS = 10_000;
const BROWSER_BOOT_TIMEOUT_MS = Math.max(PREVIEW_READY_TIMEOUT_MS, 180_000);
const TABLET_VIEWPORT = { width: 768, height: 1024, deviceScaleFactor: 1 };
const LANDSCAPE_TABLET_VIEWPORT = { width: 1024, height: 768, deviceScaleFactor: 1 };
const ECONOMY_STORAGE_LABELS = [
  "STORAGE PLAN",
  "Food",
  "Steel",
  "Goods",
  "Fuel",
  "Medical Supplies",
  "Power",
  "Water, Credits, city Ammo",
];
const CONSTRUCTION_STORAGE_LABELS = [
  "ENERGY STORAGE VAULT",
  "FUEL RESERVE TANK",
  "AGRICULTURAL DOME",
];
const CONSTRUCTION_STORAGE_COPY = [
  "+200 power buffer",
  "+2,000 Fuel storage",
  "+1,000 Food storage",
];
const CONSTRUCTION_QUOTE_LABELS = [
  "CONSTRUCT 5x ENERGY STORAGE VAULT",
  "Requested quantity: 5",
  "Housing capacity: no direct gain",
  "Cost: 175,000 cr + 350 steel",
  "Build time:",
];

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

async function waitFor(page, predicate, label, timeout = BROWSER_BOOT_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${label}; current URL: ${page.url()}`);
}

async function visibleText(page, text) {
  return page.evaluate((needle) => {
    const wanted = needle.toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.toUpperCase().includes(wanted)) continue;
      const rect = node.parentElement?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }, text);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.trim().toUpperCase();
    const candidates = [...document.querySelectorAll("button, [role='button'], div, span")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (element.innerText ?? element.textContent ?? "").trim().toUpperCase() === needle
        );
      })
      .sort(
        (a, b) =>
          (a.innerText ?? a.textContent ?? "").length -
          (b.innerText ?? b.textContent ?? "").length,
      );
    const element = candidates[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function clickVisibleTestId(page, testId) {
  const clicked = await page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, testId);
  if (!clicked) throw new Error(`Could not click visible test id: ${testId}`);
}

async function clickVisibleAriaLabel(page, label) {
  const clicked = await page.evaluate((target) => {
    const element = [...document.querySelectorAll("[aria-label]")]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          candidate.getAttribute("aria-label")?.trim().toUpperCase() === target.toUpperCase();
      });
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not click visible aria-label: ${label}`);
}

async function navigate(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: BROWSER_BOOT_TIMEOUT_MS });
  } catch (error) {
    if (!String(error?.message ?? error).includes("Navigation timeout")) throw error;
  }
}

async function assertNoPlayerSaveStorage(page) {
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  const saveKeys = keys.filter((key) =>
    key.startsWith("@megacity_slot_") ||
    key === "@megacity_save" ||
    key === "@megacity_profiles_index" ||
    key.startsWith("@megacity_profile_") ||
    key === "@megacity_active_profile",
  );
  if (saveKeys.length) {
    throw new Error(`storage-plan fixture touched player save storage: ${JSON.stringify(saveKeys)}`);
  }
}

async function assertStorageLayout(page, layoutName, labels, { checkDocumentOverflow = true } = {}) {
  const result = await page.evaluate((needles) => {
    const viewportWidth = document.documentElement.clientWidth;
    const findVisibleMatch = (needle) => {
      const wanted = needle.toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.toUpperCase().includes(wanted)) continue;
        const element = node.parentElement;
        const rect = element?.getBoundingClientRect();
        if (!element || !rect || rect.width <= 0 || rect.height <= 0) continue;
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };
      }
      return null;
    };

    const matches = needles.map((needle) => ({ needle, match: findVisibleMatch(needle) }));
    return {
      missing: matches.filter(({ match }) => !match).map(({ needle }) => needle),
      outOfBounds: matches
        .filter(({ match }) => match && (match.left < -1 || match.right > viewportWidth + 1))
        .map(({ needle, match }) => ({ needle, ...match })),
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      viewportWidth,
    };
  }, labels);

  if (result.missing.length) {
    throw new Error(`${layoutName} is missing visible storage labels: ${result.missing.join(", ")}`);
  }
  if (result.outOfBounds.length) {
    throw new Error(`${layoutName} has clipped storage labels: ${JSON.stringify(result.outOfBounds)}`);
  }
  if (
    checkDocumentOverflow &&
    result.documentWidth > result.viewportWidth + 2 ||
    checkDocumentOverflow &&
    result.bodyWidth > result.viewportWidth + 2
  ) {
    throw new Error(
      `${layoutName} overflows horizontally: ${JSON.stringify({
        documentWidth: result.documentWidth,
        bodyWidth: result.bodyWidth,
        viewportWidth: result.viewportWidth,
      })}`,
    );
  }
}

async function assertEnlargedStorageLayout(page, layoutName, labels) {
  // React Native Web keeps most font sizes in fixed pixels. CSS zoom is the
  // browser equivalent of the enlarged-text accessibility path and exercises
  // the same wrapping, clipping, and horizontal bounds without mutating game
  // state.
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.5";
  });
  try {
    await assertStorageLayout(page, layoutName, labels, { checkDocumentOverflow: false });
  } finally {
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
  }
}

await ensurePreviewReady();

const browser = await puppeteer.launch({
  executablePath: chromiumPath(),
  protocolTimeout: BROWSER_BOOT_TIMEOUT_MS,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});

try {
  const page = await browser.newPage();
  const pageErrors = [];
  const recordPageError = (error) => {
    const message = String(error);
    // Audio can race with route cleanup in Chromium even with autoplay enabled.
    if (!/AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(message)) {
      pageErrors.push(message);
    }
  };
  page.on("pageerror", recordPageError);

  await page.setViewport({ width: 390, height: 844 });
  await navigate(page, FIXTURE_URL("economy"));
  await waitFor(page, () => visibleText(page, "STORAGE PLAN"), "Economy storage plan");
  for (const text of ECONOMY_STORAGE_LABELS.slice(1)) {
    if (!(await visibleText(page, text))) throw new Error(`Economy plan is missing visible text: ${text}`);
  }
  const narrowFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  if (!narrowFits) throw new Error("Economy storage plan overflows the narrow viewport");
  await assertEnlargedStorageLayout(
    page,
    "150% Economy storage plan",
    ECONOMY_STORAGE_LABELS.slice(1),
  );
  await assertNoPlayerSaveStorage(page);

  const tabletEconomyPage = await browser.newPage();
  tabletEconomyPage.on("pageerror", recordPageError);
  await tabletEconomyPage.setViewport(TABLET_VIEWPORT);
  await navigate(tabletEconomyPage, FIXTURE_URL("economy"));
  await waitFor(tabletEconomyPage, () => visibleText(tabletEconomyPage, "STORAGE PLAN"), "tablet Economy storage plan");
  await assertStorageLayout(tabletEconomyPage, "Tablet Economy storage plan", ECONOMY_STORAGE_LABELS);
  await assertNoPlayerSaveStorage(tabletEconomyPage);

  const landscapeEconomyPage = await browser.newPage();
  landscapeEconomyPage.on("pageerror", recordPageError);
  await landscapeEconomyPage.setViewport(LANDSCAPE_TABLET_VIEWPORT);
  await navigate(landscapeEconomyPage, FIXTURE_URL("economy"));
  await waitFor(
    landscapeEconomyPage,
    () => visibleText(landscapeEconomyPage, "STORAGE PLAN"),
    "landscape tablet Economy storage plan",
  );
  await assertStorageLayout(
    landscapeEconomyPage,
    "Landscape tablet Economy storage plan",
    ECONOMY_STORAGE_LABELS,
  );
  await assertNoPlayerSaveStorage(landscapeEconomyPage);

  // Expo Router keeps the document alive for same-tab route changes, so a
  // separate page gives each layout a real document load instead of waiting
  // for a DOMContentLoaded event that will never fire.
  const constructionPage = await browser.newPage();
  constructionPage.on("pageerror", recordPageError);
  await constructionPage.setViewport({ width: 1400, height: 900 });
  await navigate(constructionPage, FIXTURE_URL("construction"));
  await waitFor(
    constructionPage,
    () => visibleText(constructionPage, "ENERGY STORAGE VAULT"),
    "Energy storage catalog",
  );
  if (!(await visibleText(constructionPage, "ENERGY STORAGE VAULT"))) {
    throw new Error("Construction catalog is missing Energy Storage Vault capacity copy");
  }

  await clickVisibleText(constructionPage, "INDUSTRIAL");
  await waitFor(
    constructionPage,
    () => visibleText(constructionPage, "FUEL RESERVE TANK"),
    "Industrial storage catalog",
  );
  if (!(await visibleText(constructionPage, "FUEL RESERVE TANK"))) {
    throw new Error("Construction catalog is missing Fuel Reserve Tank Farm capacity copy");
  }

  await clickVisibleText(constructionPage, "EXPANSION");
  await waitFor(
    constructionPage,
    () => visibleText(constructionPage, "AGRICULTURAL DOME"),
    "Expansion storage catalog",
  );
  if (!(await visibleText(constructionPage, "AGRICULTURAL DOME"))) {
    throw new Error("Construction catalog is missing Agricultural Dome storage capacity copy");
  }
  await assertNoPlayerSaveStorage(constructionPage);

  // Keep a wide construction document for the enlarged-text pass. Each
  // storage building is in a different category, so validate its label and
  // capacity effect while that category is visible.
  await constructionPage.evaluate(() => {
    document.documentElement.style.zoom = "1.5";
  });
  try {
    await assertStorageLayout(
      constructionPage,
      "150% Construction expansion storage catalog",
      [CONSTRUCTION_STORAGE_LABELS[2], CONSTRUCTION_STORAGE_COPY[2]],
    );

    await clickVisibleText(constructionPage, "INDUSTRIAL");
    await waitFor(
      constructionPage,
      () => visibleText(constructionPage, "FUEL RESERVE TANK"),
      "150% Industrial storage catalog",
    );
    await assertStorageLayout(
      constructionPage,
      "150% Construction industrial storage catalog",
      [CONSTRUCTION_STORAGE_LABELS[1], CONSTRUCTION_STORAGE_COPY[1]],
    );

    await clickVisibleText(constructionPage, "ENERGY");
    await waitFor(
      constructionPage,
      () => visibleText(constructionPage, "ENERGY STORAGE VAULT"),
      "150% Energy storage catalog",
    );
    await assertStorageLayout(
      constructionPage,
      "150% Construction energy storage catalog",
      [CONSTRUCTION_STORAGE_LABELS[0], CONSTRUCTION_STORAGE_COPY[0]],
    );
  } finally {
    await constructionPage.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
  }

  const tabletConstructionPage = await browser.newPage();
  tabletConstructionPage.on("pageerror", recordPageError);
  await tabletConstructionPage.setViewport(TABLET_VIEWPORT);
  await navigate(tabletConstructionPage, FIXTURE_URL("construction"));
  await waitFor(
    tabletConstructionPage,
    () => visibleText(tabletConstructionPage, "ENERGY STORAGE VAULT"),
    "tablet Energy storage catalog",
  );
  await assertStorageLayout(
    tabletConstructionPage,
    "Tablet Construction energy storage catalog",
    CONSTRUCTION_STORAGE_LABELS.slice(0, 1),
  );

  await clickVisibleText(tabletConstructionPage, "INDUSTRIAL");
  await waitFor(
    tabletConstructionPage,
    () => visibleText(tabletConstructionPage, "FUEL RESERVE TANK"),
    "tablet Industrial storage catalog",
  );
  await assertStorageLayout(
    tabletConstructionPage,
    "Tablet Construction industrial storage catalog",
    CONSTRUCTION_STORAGE_LABELS.slice(1, 2),
  );

  await clickVisibleText(tabletConstructionPage, "EXPANSION");
  await waitFor(
    tabletConstructionPage,
    () => visibleText(tabletConstructionPage, "AGRICULTURAL DOME"),
    "tablet Expansion storage catalog",
  );
  await assertStorageLayout(
    tabletConstructionPage,
    "Tablet Construction expansion storage catalog",
    CONSTRUCTION_STORAGE_LABELS.slice(2),
  );
  await assertNoPlayerSaveStorage(tabletConstructionPage);

  const landscapeConstructionPage = await browser.newPage();
  landscapeConstructionPage.on("pageerror", recordPageError);
  await landscapeConstructionPage.setViewport(LANDSCAPE_TABLET_VIEWPORT);
  await navigate(landscapeConstructionPage, FIXTURE_URL("construction"));
  await waitFor(
    landscapeConstructionPage,
    () => visibleText(landscapeConstructionPage, "ENERGY STORAGE VAULT"),
    "landscape tablet Energy storage catalog",
  );
  await assertStorageLayout(
    landscapeConstructionPage,
    "Landscape tablet Construction energy storage catalog",
    [CONSTRUCTION_STORAGE_LABELS[0], CONSTRUCTION_STORAGE_COPY[0]],
  );

  await clickVisibleText(landscapeConstructionPage, "INDUSTRIAL");
  await waitFor(
    landscapeConstructionPage,
    () => visibleText(landscapeConstructionPage, "FUEL RESERVE TANK"),
    "landscape tablet Industrial storage catalog",
  );
  await assertStorageLayout(
    landscapeConstructionPage,
    "Landscape tablet Construction industrial storage catalog",
    [CONSTRUCTION_STORAGE_LABELS[1], CONSTRUCTION_STORAGE_COPY[1]],
  );

  await clickVisibleText(landscapeConstructionPage, "EXPANSION");
  await waitFor(
    landscapeConstructionPage,
    () => visibleText(landscapeConstructionPage, "AGRICULTURAL DOME"),
    "landscape tablet Expansion storage catalog",
  );
  await assertStorageLayout(
    landscapeConstructionPage,
    "Landscape tablet Construction expansion storage catalog",
    [CONSTRUCTION_STORAGE_LABELS[2], CONSTRUCTION_STORAGE_COPY[2]],
  );
  await assertNoPlayerSaveStorage(landscapeConstructionPage);

  const quotePage = await browser.newPage();
  quotePage.on("pageerror", recordPageError);
  await quotePage.setViewport({ width: 1400, height: 900 });
  await navigate(
    quotePage,
    `${BASE_URL}/?demo=1&constructionquote=1&mode=turnbased&go=construction&category=energy&highlight=energyStorageVaults`,
  );
  await waitFor(
    quotePage,
    () => visibleText(quotePage, "ENERGY STORAGE VAULT"),
    "construction quote fixture",
  );
  await clickVisibleAriaLabel(quotePage, "Build 5 buildings per order");
  await quotePage.evaluate(() => {
    document.documentElement.style.zoom = "1.5";
  });
  try {
    await clickVisibleTestId(quotePage, "construction-building-energyStorageVaults");
    await waitFor(
      quotePage,
      () => visibleText(quotePage, "CONSTRUCT 5x ENERGY STORAGE VAULT"),
      "enlarged construction quote modal",
    );
    await assertStorageLayout(quotePage, "150% construction storage quote", CONSTRUCTION_QUOTE_LABELS, {
      checkDocumentOverflow: false,
    });
    await assertNoPlayerSaveStorage(quotePage);
  } finally {
    await quotePage.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
  }

  if (pageErrors.length) throw new Error(`browser page errors: ${pageErrors.join(" | ")}`);
  console.log("PASS  storage plan renders on narrow, portrait tablet, landscape tablet, and wide screens");
} finally {
  await browser.close().catch(() => {});
}
