// Desktop-wrapper regression for the storage plan and storage catalog at
// tablet widths. The fixture is read-only and must not create or promote a
// player save.
//
// Requires both the "artifacts/megacity-desktop: web" and
// "artifacts/megacity: expo" workflows.

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const BASE_URL = (process.env.E2E_BASE_URL || "http://localhost:80/desktop").replace(/\/$/, "");
const FIXTURE_URL = (route) =>
  `${BASE_URL}/?demo=1&medicalstorage=1&medicalstoragecase=economy&mode=turnbased&go=${route}`;
const READY_TIMEOUT_MS =
  Number(process.env.E2E_DESKTOP_READY_TIMEOUT_MS) || 120_000;
const POLL_INTERVAL_MS = 300;
const TABLET_VIEWPORT = { width: 768, height: 1024, deviceScaleFactor: 1 };
const LANDSCAPE_TABLET_VIEWPORT = {
  width: 1024,
  height: 768,
  deviceScaleFactor: 1,
};
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

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return execSync("which chromium-browser", { encoding: "utf8" }).trim();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

async function waitFor(predicate, step, page, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let lastFailure = "";
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastFailure = errorMessage(error);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Timed out after ${timeout}ms while ${step}.${lastFailure ? ` Last probe error: ${lastFailure}.` : ""}`,
  );
}

function getGameFrame(page) {
  return page.frames().find((candidate) => candidate !== page.mainFrame()) ?? null;
}

async function frameHasVisibleText(page, text) {
  const frame = getGameFrame(page);
  if (!frame) return false;
  const expectedRoute =
    text === "STORAGE PLAN" ? "/economy" : text === "ENERGY STORAGE VAULT" ? "/construction" : null;
  if (expectedRoute && !frame.url().includes(expectedRoute)) return false;
  return frame.evaluate((needle) => {
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

async function navigate(page, route) {
  await page.goto(FIXTURE_URL(route), {
    waitUntil: "domcontentloaded",
    timeout: READY_TIMEOUT_MS,
  }).catch((error) => {
    if (!errorMessage(error).includes("Navigation timeout")) throw error;
  });
}

async function assertFixtureQueryForwarded(page) {
  const expected = {
    demo: "1",
    medicalstorage: "1",
    medicalstoragecase: "economy",
    mode: "turnbased",
    go: new URL(page.url()).searchParams.get("go"),
  };
  const forwarded = await waitFor(
    async () => {
      const rawSrc = await page.$eval(
        "iframe",
        (iframe) => iframe.getAttribute("src") ?? "",
      );
      if (!rawSrc) return false;
      const resolved = new URL(rawSrc, page.url());
      return Object.entries(expected).every(
        ([key, value]) => resolved.searchParams.get(key) === value,
      )
        ? resolved
        : false;
    },
    "the desktop wrapper to mount the game iframe",
    page,
  );
  assert.ok(forwarded, "desktop wrapper did not forward the storage fixture query to the game iframe");
}

async function assertStorageLayout(page, layoutName, labels) {
  const frame = getGameFrame(page);
  assert.ok(frame, `${layoutName} is missing the embedded game frame`);
  const result = await frame.evaluate((needles) => {
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
        return { left: rect.left, right: rect.right };
      }
      return null;
    };

    const matches = needles.map((needle) => ({
      needle,
      match: findVisibleMatch(needle),
    }));
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

  assert.deepEqual(
    result.missing,
    [],
    `${layoutName} is missing visible storage labels`,
  );
  assert.deepEqual(
    result.outOfBounds,
    [],
    `${layoutName} has clipped storage labels`,
  );
  assert.ok(
    result.documentWidth <= result.viewportWidth + 2 &&
      result.bodyWidth <= result.viewportWidth + 2,
    `${layoutName} overflows horizontally: ${JSON.stringify(result)}`,
  );
}

async function assertNoPlayerSaveStorage(page, layoutName) {
  const frame = getGameFrame(page);
  assert.ok(frame, `${layoutName} is missing the embedded game frame`);
  const keys = await frame.evaluate(() =>
    Object.keys(localStorage).filter(
      (key) =>
        key.startsWith("@megacity_slot_") ||
        key === "@megacity_save" ||
        key === "@megacity_profiles_index" ||
        key.startsWith("@megacity_profile_") ||
        key === "@megacity_active_profile",
    ),
  );
  assert.deepEqual(
    keys,
    [],
    `${layoutName} created or promoted player save storage`,
  );
}

async function assertEconomy(page, layoutName) {
  await waitFor(
    () => frameHasVisibleText(page, "STORAGE PLAN"),
    `${layoutName} Economy storage plan`,
    page,
  );
  await assertStorageLayout(page, `${layoutName} Economy storage plan`, ECONOMY_STORAGE_LABELS);
  await assertNoPlayerSaveStorage(page, `${layoutName} Economy`);
}

async function assertConstruction(page, layoutName) {
  await waitFor(
    () => frameHasVisibleText(page, "ENERGY STORAGE VAULT"),
    `${layoutName} Energy storage catalog`,
    page,
  );
  await assertStorageLayout(
    page,
    `${layoutName} Energy storage catalog`,
    [CONSTRUCTION_STORAGE_LABELS[0], CONSTRUCTION_STORAGE_COPY[0]],
  );

  const frame = getGameFrame(page);
  assert.ok(frame, `${layoutName} is missing the embedded game frame`);
  await frame.evaluate(() => {
    const target = [...document.querySelectorAll("button, [role='button'], div, span")]
      .find((element) => (element.innerText ?? "").trim().toUpperCase() === "INDUSTRIAL");
    if (!(target instanceof HTMLElement)) throw new Error("Industrial category is not available");
    target.click();
  });
  await waitFor(
    () => frameHasVisibleText(page, "FUEL RESERVE TANK"),
    `${layoutName} Industrial storage catalog`,
    page,
  );
  await assertStorageLayout(
    page,
    `${layoutName} Industrial storage catalog`,
    [CONSTRUCTION_STORAGE_LABELS[1], CONSTRUCTION_STORAGE_COPY[1]],
  );

  const currentFrame = getGameFrame(page);
  assert.ok(currentFrame, `${layoutName} is missing the embedded game frame`);
  await currentFrame.evaluate(() => {
    const target = [...document.querySelectorAll("button, [role='button'], div, span")]
      .find((element) => (element.innerText ?? "").trim().toUpperCase() === "EXPANSION");
    if (!(target instanceof HTMLElement)) throw new Error("Expansion category is not available");
    target.click();
  });
  await waitFor(
    () => frameHasVisibleText(page, "AGRICULTURAL DOME"),
    `${layoutName} Expansion storage catalog`,
    page,
  );
  await assertStorageLayout(
    page,
    `${layoutName} Expansion storage catalog`,
    [CONSTRUCTION_STORAGE_LABELS[2], CONSTRUCTION_STORAGE_COPY[2]],
  );
  await assertNoPlayerSaveStorage(page, `${layoutName} Construction`);
}

async function run() {
  await ensureDesktopWrapperReady();
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: "new",
    timeout: 120_000,
    protocolTimeout: 120_000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const pageErrors = [];

  try {
    for (const [viewport, name] of [
      [TABLET_VIEWPORT, "Tablet"],
      [LANDSCAPE_TABLET_VIEWPORT, "Landscape tablet"],
    ]) {
      for (const [route, check] of [
        ["economy", assertEconomy],
        ["construction", assertConstruction],
      ]) {
        const page = await browser.newPage();
        page.on("pageerror", (error) => pageErrors.push(String(error)));
        try {
          await page.setViewport(viewport);
          await navigate(page, route);
          await assertFixtureQueryForwarded(page);
          await check(page, name);
        } finally {
          await page.close();
        }
      }
    }

    assert.deepEqual(pageErrors, [], `Desktop wrapper browser errors:\n${pageErrors.join("\n")}`);
    console.log(
      "PASS: desktop tablet Economy and Construction storage layouts stay visible without overflow or player saves",
    );
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error("[e2e] FAIL:", errorMessage(error));
  process.exitCode = 1;
});