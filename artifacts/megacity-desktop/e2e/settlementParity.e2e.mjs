// Desktop-wrapper regression for exact settlement fact parity between the
// embedded World Map and Diplomacy screens.
// Requires both the desktop wrapper and Expo game workflows.

import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

const BASE_URL = (process.env.E2E_BASE_URL || "http://localhost:80/desktop").replace(/\/$/, "");
const WORLD_MAP_URL = `${BASE_URL}/?demo=1&settlementparity=1&go=worldmap`;
const DIPLOMACY_URL = `${BASE_URL}/?demo=1&settlementparity=1&go=diplomacy`;
const WORLD_MAP_VIEWPORTS = [
  { name: "wide desktop", width: 1400, height: 900, deviceScaleFactor: 1 },
  { name: "compact desktop", width: 1024, height: 900, deviceScaleFactor: 1 },
  { name: "high-DPI desktop", width: 1400, height: 900, deviceScaleFactor: 2 },
  { name: "compact high-DPI desktop", width: 1024, height: 900, deviceScaleFactor: 2 },
];

const SETTLEMENTS = [
  {
    name: "Terminus Prime",
    marker: "Terminus Prime, megacity",
    expected: [
      "8,600,000",
      "Technocratic crater directorate",
      "Prime Directorate",
      "Closed orbital-recovery and precision manufacturing economy",
      "orbital salvage",
      "precision components",
      "reactor heat",
      "rare earth minerals",
      "reactor fuel",
      "MAJOR · OUT precision components, orbital salvage · IN food, medical supplies",
      "86 · Fortified perimeter with autonomous interception grids",
      "68 · Controlled but brittle",
    ],
  },
  {
    name: "Mexico City",
    marker: "Mexico City, township",
    expected: [
      "9,209,944",
      "Local authority",
      "township",
      "Government, manufacturing, services, and regional transit",
      "manufactured_goods",
      "food",
      "steel_ingots",
      "electronic_waste",
      "construction_debris",
      "MAJOR · OUT manufactured_goods, food, steel_ingots, electronic_waste, construction_debris · IN none",
      "0 · Local defense",
      "45 · Unassessed",
    ],
  },
];

const RENAMED_SETTLEMENTS = [
  {
    name: "Mexico City",
    marker: "Mexico City, township",
    retired: "Dusthaven",
    tooltipTestId: "world-map-tooltip-dusthaven",
  },
  {
    name: "LA CITY",
    marker: "LA CITY, megacity",
    retired: "Iron Khanate",
    tooltipTestId: "world-map-tooltip-iron-khanate",
  },
  {
    name: "Megacity Pacifica",
    marker: "Megacity Pacifica, megacity",
    retired: "Nova Pacifica",
    tooltipTestId: "world-map-tooltip-nova-pacifica",
  },
  {
    name: "Red Mesa",
    marker: "Red Mesa, megacity",
    retired: "Crimson Reach",
    tooltipTestId: "world-map-tooltip-crimson-reach",
  },
  {
    name: "USR (United States Remnants)",
    marker: "USR (United States Remnants), notable",
    retired: "Cheyenne Mountain",
    tooltipTestId: "world-map-tooltip-cheyenne-mountain",
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

async function waitFor(predicate, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await sleep(300);
  }
  throw new Error(`Timed out after ${timeout}ms`);
}

async function visibleText(frame) {
  return frame.evaluate(() => document.body?.innerText ?? "");
}

async function waitForFrameText(frame, text) {
  await waitFor(async () => (await visibleText(frame)).includes(text));
}

async function waitForGameFrameText(page, text) {
  return waitFor(async () => {
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    if (!frame) return null;
    try {
      return (await visibleText(frame)).includes(text) ? frame : null;
    } catch {
      // The wrapper can replace the iframe while Expo finishes booting.
      return null;
    }
  });
}

async function clickVisibleExactText(frame, text) {
  const clicked = await frame.evaluate((targetText) => {
    const target = targetText.trim().toUpperCase();
    const candidates = [...document.querySelectorAll("div, span")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 &&
        (element.textContent ?? "").trim().toUpperCase() === target;
    });
    if (!candidates.length) return false;
    let leaf = candidates[0];
    for (const candidate of candidates) {
      if (leaf.contains(candidate) && candidate !== leaf) leaf = candidate;
    }
    leaf.scrollIntoView({ block: "center", inline: "center" });
    leaf.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Visible text not found in game frame: ${text}`);
}

async function clickAccessibleNode(frame, label) {
  const clicked = await frame.evaluate((target) => {
    const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Accessible node not found in game frame: ${label}`);
}

function escapeAttributeValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function hoverAccessibleNode(frame, label) {
  const selector = `[aria-label="${escapeAttributeValue(label)}"]`;
  const element = await frame.waitForSelector(
    selector,
    { visible: true, timeout: 30_000 },
  );
  if (!element) throw new Error(`Accessible node not found in game frame: ${label}`);
  await element.hover();
}

async function accessibleNodeRect(frame, label) {
  return frame.evaluate((target) => {
    const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    const viewport = document.querySelector('[data-testid="world-map-viewport"]');
    if (!(element instanceof HTMLElement) || !(viewport instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      viewport: {
        left: viewportRect.left,
        right: viewportRect.right,
        top: viewportRect.top,
        bottom: viewportRect.bottom,
      },
    };
  }, label);
}

async function panMarkerIntoViewport(frame, label) {
  const margin = 24;
  let panSteps = 0;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const geometry = await accessibleNodeRect(frame, label);
    if (!geometry) throw new Error(`Could not measure desktop map marker: ${label}`);

    const { viewport, centerX, centerY } = geometry;
    const insideViewport =
      centerX >= viewport.left + margin &&
      centerX <= viewport.right - margin &&
      centerY >= viewport.top + margin &&
      centerY <= viewport.bottom - margin;
    if (insideViewport && panSteps > 0) return geometry;

    let key;
    if (centerX > viewport.right - margin) key = "ArrowRight";
    else if (centerX < viewport.left + margin) key = "ArrowLeft";
    else if (centerY > viewport.bottom - margin) key = "ArrowDown";
    else if (centerY < viewport.top + margin) key = "ArrowUp";
    else key = "ArrowLeft";

    await frame.evaluate((panKey) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: panKey, bubbles: true }));
    }, key);
    panSteps += 1;
    await sleep(150);
  }
  throw new Error(`Could not pan ${label} into the desktop map viewport`);
}

async function zoomAndPanWorldMap(frame, markerLabel) {
  const before = await waitFor(
    () => accessibleNodeRect(frame, markerLabel),
    30_000,
  );

  // Use the same controls and keyboard path exposed to desktop players. The
  // map keeps its marker hit targets accessible after the transformed layer
  // moves, so this deliberately avoids mutating game state or using fixture
  // internals.
  await clickAccessibleNode(frame, "Zoom in");
  await clickAccessibleNode(frame, "Zoom in");
  const afterZoom = await waitFor(async () => {
    const current = await accessibleNodeRect(frame, markerLabel);
    if (!current) return null;
    const moved =
      Math.abs(current.centerX - before.centerX) > 20 ||
      Math.abs(current.centerY - before.centerY) > 20;
    const insideViewport =
      current.centerX >= current.viewport.left &&
      current.centerX <= current.viewport.right &&
      current.centerY >= current.viewport.top &&
      current.centerY <= current.viewport.bottom;
    return moved && insideViewport ? current : null;
  }, 30_000);
  assert.ok(afterZoom, `${markerLabel} did not survive the zoom interaction`);
  await assertEdgeContextMenus(frame);

  await frame.evaluate(() => {
    for (const key of ["ArrowRight", "ArrowDown", "ArrowDown"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
  });

  const after = await waitFor(async () => {
    const current = await accessibleNodeRect(frame, markerLabel);
    if (!current) return null;
    const moved =
      Math.abs(current.centerX - afterZoom.centerX) > 20 ||
      Math.abs(current.centerY - afterZoom.centerY) > 20;
    const insideViewport =
      current.centerX >= current.viewport.left &&
      current.centerX <= current.viewport.right &&
      current.centerY >= current.viewport.top &&
      current.centerY <= current.viewport.bottom;
    return moved && insideViewport ? current : null;
  }, 30_000);

  assert.ok(after, `${markerLabel} did not survive the zoom-and-pan interaction`);
  await assertEdgeContextMenus(frame);
}

async function rightClickAccessibleNode(frame, label) {
  const selector = `[aria-label="${escapeAttributeValue(label)}"]`;
  const action = `Open ${label.split(", ")[0]} Details`;
  const element = await frame.waitForSelector(
    selector,
    { visible: true, timeout: 30_000 },
  );
  if (!element) throw new Error(`Accessible node not found in game frame: ${label}`);
  await element.click({ button: "right" });
  const opened = await frame.evaluate((expectedAction) => {
    const menu = document.querySelector('[data-testid="context-menu"]');
    if (!(menu instanceof HTMLElement)) return false;
    const rect = menu.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && menu.innerText.includes(expectedAction);
  }, action);
  if (opened) return;

  // A transformed marker can sit beneath its hover tooltip at the exact
  // center Puppeteer chooses for a physical right-click. Re-dispatch the same
  // browser event at the accessible marker so the app's onContextMenu handler
  // is still covered rather than making the smoke depend on overlay stacking.
  const dispatched = await frame.evaluate((target) => {
    const marker = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    if (!(marker instanceof HTMLElement)) return false;
    const rect = marker.getBoundingClientRect();
    marker.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
    return true;
  }, label);
  if (!dispatched) throw new Error(`Could not dispatch context menu for marker: ${label}`);
  await waitFor(
    () => frame.evaluate((expectedAction) =>
      (document.querySelector('[data-testid="context-menu"]')?.textContent ?? "").includes(expectedAction),
    action),
    30_000,
  );
}

async function findEdgeMarker(frame, edge) {
  return waitFor(async () => frame.evaluate((targetEdge) => {
    const viewport = document.querySelector('[data-testid="world-map-viewport"]');
    if (!(viewport instanceof HTMLElement)) return "";
    const viewportRect = viewport.getBoundingClientRect();
    const candidates = [...document.querySelectorAll("[aria-label]")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") ?? "",
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((candidate) =>
        candidate.width > 0 &&
        candidate.height > 0 &&
        candidate.centerX >= viewportRect.left &&
        candidate.centerX <= viewportRect.right &&
        candidate.centerY >= viewportRect.top &&
        candidate.centerY <= viewportRect.bottom &&
        candidate.label.includes(", ") &&
        !candidate.label.startsWith("CREDITS "),
      );
    if (!candidates.length) return "";
    candidates.sort((a, b) => {
      if (targetEdge === "left") return a.centerX - b.centerX;
      if (targetEdge === "right") return b.centerX - a.centerX;
      if (targetEdge === "top") return a.centerY - b.centerY;
      return b.centerY - a.centerY;
    });
    return candidates[0].label;
  }, edge), 30_000);
}

async function contextMenuRect(frame) {
  return waitFor(() => frame.evaluate(() => {
    const element = document.querySelector('[data-testid="context-menu"]');
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      ? {
          menu: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          iframe: { width: window.innerWidth, height: window.innerHeight },
        }
      : null;
  }), 30_000);
}

async function assertEdgeContextMenu(frame, edge) {
  const marker = await findEdgeMarker(frame, edge);
  await rightClickAccessibleNode(frame, marker);
  const { menu, iframe } = await contextMenuRect(frame);
  assert.ok(menu.left >= 0, `${edge} context menu is left of the iframe`);
  assert.ok(menu.top >= 0, `${edge} context menu is above the iframe`);
  assert.ok(menu.right <= iframe.width, `${edge} context menu exceeds the iframe right edge`);
  assert.ok(menu.bottom <= iframe.height, `${edge} context menu exceeds the iframe bottom edge`);
  const action = `Open ${marker.split(", ")[0]} Details`;
  await waitFor(async () => (await visibleText(frame)).includes(action), 30_000);
  await clickVisibleExactText(frame, action);
  await waitFor(
    () => frame.evaluate(() => Boolean(document.querySelector('[aria-label="Close location details"]'))),
    30_000,
  );
  await closeLocationDetails(frame);
}

async function assertEdgeContextMenus(frame) {
  for (const edge of ["left", "right", "top", "bottom"]) {
    await assertEdgeContextMenu(frame, edge);
  }
}

async function dismissContextMenu(frame) {
  const dismissed = await frame.evaluate(() => {
    const menu = document.querySelector('[data-testid="context-menu"]');
    const backdrop = menu?.parentElement;
    if (!(backdrop instanceof HTMLElement)) return false;
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  });
  if (!dismissed) throw new Error("Could not find the desktop world-map context menu backdrop");
  await waitFor(
    () => frame.evaluate(() => !document.querySelector('[data-testid="context-menu"]')),
    30_000,
  );
}

async function assertTransformedRenamedSettlement(frame, settlement) {
  const geometry = await panMarkerIntoViewport(frame, settlement.marker);
  assert.ok(
    geometry,
    `${settlement.name} marker did not remain reachable after map transforms`,
  );

  const markerLabel = await frame.evaluate((target) => {
    const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    return element?.getAttribute("aria-label") ?? "";
  }, settlement.marker);
  assert.equal(markerLabel, settlement.marker, `${settlement.name} marker lost its canonical label`);
  assert.ok(
    !markerLabel.includes(settlement.retired),
    `${settlement.name} marker exposes retired label ${settlement.retired}`,
  );

  await hoverAccessibleNode(frame, settlement.marker);
  const tooltip = await readVisibleTestIdText(frame, settlement.tooltipTestId);
  assert.ok(
    tooltip.includes(settlement.name),
    `${settlement.name} tooltip is missing its canonical label: ${tooltip}`,
  );
  assert.ok(
    !tooltip.includes(settlement.retired),
    `${settlement.name} tooltip exposes retired label ${settlement.retired}: ${tooltip}`,
  );

  await rightClickAccessibleNode(frame, settlement.marker);
  const contextMenu = await readVisibleTestIdText(frame, "context-menu");
  assert.ok(
    contextMenu.includes(`Open ${settlement.name} Details`),
    `${settlement.name} context menu is missing its canonical label: ${contextMenu}`,
  );
  assert.ok(
    !contextMenu.includes(settlement.retired),
    `${settlement.name} context menu exposes retired label ${settlement.retired}: ${contextMenu}`,
  );
  await dismissContextMenu(frame);
}

async function readVisibleTestIdText(frame, testId) {
  const selector = `[data-testid="${escapeAttributeValue(testId)}"]`;
  return waitFor(() => frame.evaluate((target) => {
    const element = document.querySelector(target);
    if (!(element instanceof HTMLElement)) return "";
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? element.innerText : "";
  }, selector), 30_000);
}

async function readAriaText(frame, label) {
  return waitFor(() => frame.evaluate((target) => {
    const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    return element instanceof HTMLElement ? element.innerText : "";
  }, label), 30_000);
}

async function closeLocationDetails(frame) {
  await clickAccessibleNode(frame, "Close location details");
  await waitForFrameText(frame, "WASTELAND");
}

async function storageSnapshot(frame) {
  return frame.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    ),
  );
}

async function assertNoPlayerSaveStorage(frame) {
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
  assert.deepEqual(keys, [], "Desktop parity fixture created player save storage");
}

function assertExpectedFacts(text, settlement, screen) {
  for (const expected of settlement.expected) {
    assert.ok(
      text.includes(expected),
      `${settlement.name} ${screen} is missing exact fact "${expected}"\n${text}`,
    );
  }
}

async function run() {
  await ensureDesktopWrapperReady();
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: true,
    timeout: 120_000,
    protocolTimeout: 120_000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  let page;
  const browserErrors = [];
  const attachBrowserErrorListeners = (nextPage) => {
    nextPage.on("pageerror", (error) => browserErrors.push(String(error)));
    nextPage.on("console", (message) => {
      if (message.type() === "error" && !/favicon|net::|404|AbortError/.test(message.text())) {
        browserErrors.push(message.text());
      }
    });
  };

  try {
    let frame;
    for (const viewport of WORLD_MAP_VIEWPORTS) {
      // Each wrapper navigation gets a fresh page so the embedded Expo
      // document cannot leave a detached frame behind for the next viewport.
      console.log(`[e2e] START: desktop world-map ${viewport.name}`);
      page = await browser.newPage();
      attachBrowserErrorListeners(page);
      await page.setViewport(viewport);
      await page.goto(WORLD_MAP_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
      assert.equal(
        await page.evaluate(() => window.devicePixelRatio),
        viewport.deviceScaleFactor,
        `${viewport.name} did not apply the requested device scale factor to the desktop wrapper`,
      );
      frame = await waitForGameFrameText(page, "WASTELAND");
      const storageBeforeWorldMap = await storageSnapshot(frame);
      await clickAccessibleNode(frame, SETTLEMENTS[0].marker);
      let sheet = await readAriaText(frame, `${SETTLEMENTS[0].name} operational sheet`);
      assertExpectedFacts(
        `${await visibleText(frame)}\n${sheet}`,
        SETTLEMENTS[0],
        `${viewport.name} Desktop World Map`,
      );
      await closeLocationDetails(frame);
      await clickAccessibleNode(frame, SETTLEMENTS[1].marker);
      sheet = await readAriaText(frame, `${SETTLEMENTS[1].name} operational sheet`);
      const modalText = await visibleText(frame);
      assertExpectedFacts(
        `${modalText}\n${sheet}`,
        SETTLEMENTS[1],
        `${viewport.name} Desktop World Map`,
      );
      await closeLocationDetails(frame);

      for (const edge of ["left", "right", "top", "bottom"]) {
        await assertEdgeContextMenu(frame, edge);
      }

      await zoomAndPanWorldMap(frame, RENAMED_SETTLEMENTS[0].marker);
      for (const settlement of RENAMED_SETTLEMENTS) {
        await assertTransformedRenamedSettlement(frame, settlement);
      }

      assert.deepEqual(
        await storageSnapshot(frame),
        storageBeforeWorldMap,
        `${viewport.name} Desktop World Map mutated iframe localStorage`,
      );
      console.log(
        `[e2e] PASS: desktop world-map edge actions remain visible at ${viewport.name} ` +
          `(${viewport.width}x${viewport.height})`,
      );
      await page.close();
      page = undefined;
    }

    console.log("[e2e] START: desktop diplomacy");
    page = await browser.newPage();
    attachBrowserErrorListeners(page);
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
    await page.goto(DIPLOMACY_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
    frame = await waitForGameFrameText(page, "DIPLOMACY TERMINAL");
    const storageBeforeDiplomacy = await storageSnapshot(frame);
    for (const [index, settlement] of SETTLEMENTS.entries()) {
      await clickVisibleExactText(frame, index === 0 ? "MEGACITIES" : "SETTLEMENTS");
      await clickVisibleExactText(frame, settlement.name);
      const facts = await readAriaText(frame, `${settlement.name} operational facts`);
      assertExpectedFacts(facts, settlement, "Desktop Diplomacy");
      await clickVisibleExactText(frame, "BACK TO LIST");
    }

    assert.deepEqual(
      await storageSnapshot(frame),
      storageBeforeDiplomacy,
      "Desktop Diplomacy mutated iframe localStorage",
    );
    await assertNoPlayerSaveStorage(frame);
    assert.deepEqual(browserErrors, [], `Desktop browser errors:\n${browserErrors.join("\n")}`);
    console.log("[e2e] PASS: desktop settlement parity is exact and read-only");
  } finally {
    if (page) await page.close();
    await browser.close();
  }
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error("[e2e] FAIL:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);