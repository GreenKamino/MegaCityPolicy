// Packaged Electron smoke coverage for world-map intel, renamed settlement
// labels, and quick actions.
//
// This launches the Steam shell around steam/web-build rather than the Expo
// browser workflow. The fixture is release-safe and only unlocks when the
// Electron preload explicitly opts into it.
//
// Run with:
//   pnpm run test:e2e:packaged-mexico-city-map
//
// To exercise an unpacked Windows release instead of the local Electron
// runtime, set MEGACITY_RELEASE_EXECUTABLE to its game.exe path.

import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer";

const STEAM_DIR = resolve(import.meta.dirname, "..", "steam");
const ELECTRON_PATH =
  process.env.ELECTRON_PATH ??
  resolve(STEAM_DIR, "node_modules", "electron", "dist", "electron");
const RELEASE_EXECUTABLE = process.env.MEGACITY_RELEASE_EXECUTABLE
  ? resolve(process.env.MEGACITY_RELEASE_EXECUTABLE)
  : null;
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const FIXTURE_QUERY = "demo=1&worldmaplog=1&go=worldmap";
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const RENAMED_SETTLEMENTS = [
  {
    id: "dusthaven",
    current: "Mexico City",
    retired: "Dusthaven",
    type: "township",
  },
  {
    id: "iron-khanate",
    current: "LA CITY",
    retired: "Iron Khanate",
    type: "megacity",
  },
  {
    id: "nova-pacifica",
    current: "Megacity Pacifica",
    retired: "Nova Pacifica",
    type: "megacity",
  },
  {
    id: "crimson-reach",
    current: "Red Mesa",
    retired: "Crimson Reach",
    type: "megacity",
  },
  {
    id: "cheyenne-mountain",
    current: "USR (United States Remnants)",
    retired: "Cheyenne Mountain",
    type: "notable",
  },
];
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (!existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}.`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function validateReleaseBundle() {
  if (!RELEASE_EXECUTABLE) return;

  const packagedAppDirectory = resolve(RELEASE_EXECUTABLE, "..", "resources", "app");
  const sourceManifest = JSON.parse(
    readFileSync(join(STEAM_DIR, "release-manifest.json"), "utf8"),
  );
  const packagedManifest = JSON.parse(
    readFileSync(join(packagedAppDirectory, "release-manifest.json"), "utf8"),
  );
  for (const field of ["appVersion", "entryBundle", "bundleSha256", "generatedAt"]) {
    if (packagedManifest[field] !== sourceManifest[field]) {
      throw new Error(
        `packaged release manifest drifted for ${field} (source=${sourceManifest[field]}, packaged=${packagedManifest[field]})`,
      );
    }
  }

  const entryPath = join(
    packagedAppDirectory,
    "web-build",
    "_expo",
    "static",
    "js",
    "web",
    packagedManifest.entryBundle,
  );
  if (!existsSync(entryPath)) {
    throw new Error(`packaged release is missing ${packagedManifest.entryBundle}`);
  }
  console.log(`[e2e] verified packaged release manifest v${packagedManifest.appVersion}`);
}

async function hasVisibleText(page, text) {
  try {
    return await page.evaluate((targetText) => {
      const needle = targetText.trim().toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    }, text);
  } catch {
    return false;
  }
}

async function waitForVisibleText(page, text, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasVisibleText(page, text)) return;
    await sleep(300);
  }
  const body = await page
    .evaluate(() => document.body?.innerText?.slice(0, 3000) ?? "(empty)")
    .catch(() => "(renderer unavailable)");
  throw new Error(`Timed out waiting for "${text}". Visible text:\n${body}`);
}

async function clickAccessibleNode(page, label) {
  const clicked = await page.evaluate((target) => {
    const element = document.querySelector(`[aria-label="${CSS.escape(target)}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Could not click visible accessibility label: ${label}`);
}

async function clickVisibleExactText(page, text) {
  const clicked = await page.evaluate((targetText) => {
    const target = targetText.trim().toUpperCase();
    const candidates = [...document.querySelectorAll("div, span")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        (element.textContent ?? "").trim().toUpperCase() === target
      );
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
  if (!clicked) throw new Error(`Visible text not found: ${text}`);
}

async function rightClickAccessibleNode(page, label) {
  const element = await page.$(`[aria-label="${label.replaceAll('"', '\\"')}"]`);
  if (!element) throw new Error(`Accessible node not found: ${label}`);
  await element.click({ button: "right" });

  const expectedAction = `Open ${label.split(", ")[0]} Details`;
  const menuOpened = await readVisibleTestIdText(page, "context-menu");
  if (menuOpened?.includes(expectedAction)) return;

  // A transformed marker can sit beneath its hover tooltip at the exact
  // center Puppeteer chooses for a physical right-click. Re-dispatch the
  // same browser event at the accessible marker so the app's context-menu
  // handler remains covered without depending on overlay stacking.
  const dispatched = await page.evaluate((target) => {
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
}

async function findEdgeMarker(page, edge) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const marker = await page.evaluate((targetEdge) => {
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
        .filter(
          (candidate) =>
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
    }, edge);
    if (marker) return marker;
    await sleep(300);
  }
  throw new Error(`Timed out finding a world-map marker near the ${edge} edge`);
}

async function contextMenuRect(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const rect = await page
      .evaluate(() => {
        const element = document.querySelector('[data-testid="context-menu"]');
        if (!(element instanceof HTMLElement)) return null;
        const menuRect = element.getBoundingClientRect();
        return menuRect.width > 0 && menuRect.height > 0
          ? {
              left: menuRect.left,
              top: menuRect.top,
              right: menuRect.right,
              bottom: menuRect.bottom,
            }
          : null;
      })
      .catch(() => null);
    if (rect) return rect;
    await sleep(300);
  }
  throw new Error("Timed out waiting for the packaged world-map context menu");
}

async function assertEdgeContextMenu(page, edge) {
  const marker = await findEdgeMarker(page, edge);
  await rightClickAccessibleNode(page, marker);
  const action = `Open ${marker.split(", ")[0]} Details`;
  await waitForVisibleText(page, action, 30000);

  const [menu, viewport] = await Promise.all([
    contextMenuRect(page),
    page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    })),
  ]);
  if (menu.left < 0) throw new Error(`${edge} context menu is left of the packaged window: ${JSON.stringify(menu)}`);
  if (menu.top < 0) throw new Error(`${edge} context menu is above the packaged window: ${JSON.stringify(menu)}`);
  if (menu.right > viewport.width) {
    throw new Error(
      `${edge} context menu exceeds the packaged window right edge: ${JSON.stringify({ menu, viewport })}`,
    );
  }
  if (menu.bottom > viewport.height) {
    throw new Error(
      `${edge} context menu exceeds the packaged window bottom edge: ${JSON.stringify({ menu, viewport })}`,
    );
  }

  await clickVisibleExactText(page, action);
  await waitForVisibleText(page, `${marker.split(", ")[0]} operational sheet`, 30000);
  await clickAccessibleNode(page, "Close location details");
  await waitForVisibleText(page, "WORLD MAP", 30000);
}

async function readVisibleTestIdText(page, testId) {
  return page.evaluate((target) => {
    const element = document.querySelector(`[data-testid="${CSS.escape(target)}"]`);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? element.textContent ?? "" : null;
  }, testId);
}

async function readMapMarkerGeometry(page, label) {
  return page.evaluate((targetLabel) => {
    const viewport = document.querySelector('[data-testid="world-map-viewport"]');
    const marker = document.querySelector(`[aria-label="${CSS.escape(targetLabel)}"]`);
    if (!(viewport instanceof HTMLElement) || !(marker instanceof HTMLElement)) return null;
    const viewportRect = viewport.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    return {
      viewport: {
        left: viewportRect.left,
        top: viewportRect.top,
        right: viewportRect.right,
        bottom: viewportRect.bottom,
      },
      marker: {
        left: markerRect.left,
        top: markerRect.top,
        right: markerRect.right,
        bottom: markerRect.bottom,
        centerX: markerRect.left + markerRect.width / 2,
        centerY: markerRect.top + markerRect.height / 2,
        width: markerRect.width,
        height: markerRect.height,
      },
    };
  }, label);
}

async function panMarkerIntoViewport(page, label) {
  const margin = 24;
  let panSteps = 0;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const geometry = await readMapMarkerGeometry(page, label);
    if (!geometry) throw new Error(`Could not measure packaged map marker: ${label}`);

    const { viewport, marker } = geometry;
    const insideViewport =
      marker.width > 0 &&
      marker.height > 0 &&
      marker.centerX >= viewport.left + margin &&
      marker.centerX <= viewport.right - margin &&
      marker.centerY >= viewport.top + margin &&
      marker.centerY <= viewport.bottom - margin;
    if (insideViewport && panSteps > 0) return geometry;

    let key;
    if (marker.centerX > viewport.right - margin) key = "ArrowLeft";
    else if (marker.centerX < viewport.left + margin) key = "ArrowRight";
    else if (marker.centerY > viewport.bottom - margin) key = "ArrowUp";
    else if (marker.centerY < viewport.top + margin) key = "ArrowDown";
    else key = "ArrowLeft";

    await page.evaluate((panKey) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: panKey, bubbles: true }));
    }, key);
    panSteps += 1;
    await sleep(150);
  }
  throw new Error(`Could not pan ${label} into the packaged map viewport`);
}

async function assertRenamedSettlementTransformedInteraction(page, settlement, verifyTransform) {
  const markerLabel = `${settlement.current}, ${settlement.type}`;
  const beforeZoom = await readMapMarkerGeometry(page, markerLabel);
  if (!beforeZoom) throw new Error(`Could not measure packaged map marker: ${markerLabel}`);

  if (verifyTransform) {
    await clickAccessibleNode(page, "Zoom in");
    await sleep(300);
    await clickAccessibleNode(page, "Zoom in");
    await sleep(300);
  }
  const afterZoom = await readMapMarkerGeometry(page, markerLabel);
  if (!afterZoom) throw new Error(`Could not measure zoomed packaged map marker: ${markerLabel}`);
  if (verifyTransform) {
    const zoomMoved =
      Math.abs(afterZoom.marker.centerX - beforeZoom.marker.centerX) > 20 ||
      Math.abs(afterZoom.marker.centerY - beforeZoom.marker.centerY) > 20;
    if (!zoomMoved) throw new Error(`${markerLabel} did not move after the packaged zoom interaction`);
  }

  const afterPan = await panMarkerIntoViewport(page, markerLabel);
  const panMoved =
    Math.abs(afterPan.marker.centerX - afterZoom.marker.centerX) > 20 ||
    Math.abs(afterPan.marker.centerY - afterZoom.marker.centerY) > 20;
  if (!panMoved) throw new Error(`${markerLabel} did not move after the packaged pan interaction`);

  await page.hover(`[aria-label="${markerLabel}"]`);
  const tooltipTestId = `world-map-tooltip-${settlement.id}`;
  let renamedTooltip = null;
  const tooltipDeadline = Date.now() + 30000;
  while (Date.now() < tooltipDeadline) {
    renamedTooltip = await readVisibleTestIdText(page, tooltipTestId);
    if (renamedTooltip) break;
    await sleep(100);
  }
  if (!renamedTooltip) {
    throw new Error(`Hovering the zoomed and panned ${markerLabel} marker did not show its tooltip`);
  }
  if (!renamedTooltip.includes(settlement.current) || renamedTooltip.includes(settlement.retired)) {
    throw new Error(`${settlement.current} tooltip has the wrong label: ${renamedTooltip}`);
  }

  await rightClickAccessibleNode(page, markerLabel);
  const action = `Open ${settlement.current} Details`;
  await waitForVisibleText(page, action, 30000);
  const contextMenu = await readVisibleTestIdText(page, "context-menu");
  if (!contextMenu?.includes(settlement.current) || contextMenu.includes(settlement.retired)) {
    throw new Error(`${settlement.current} context menu has the wrong label: ${contextMenu ?? "(empty)"}`);
  }
  await clickVisibleExactText(page, action);
  await waitForVisibleText(page, `${settlement.current} operational sheet`, 30000);
  await clickAccessibleNode(page, "Close location details");
  await waitForVisibleText(page, "WORLD MAP", 30000);
}

async function assertNoPlayerSaveStorage(page) {
  const saveKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter(
      (key) =>
        key.startsWith("@megacity_slot_") ||
        key === "@megacity_save" ||
        key === "@megacity_profiles_index" ||
        key.startsWith("@megacity_profile_") ||
        key === "@megacity_active_profile",
    ),
  );
  if (saveKeys.length) {
    throw new Error(
      `packaged world-intel fixture touched player save storage: ${JSON.stringify(saveKeys)}`,
    );
  }
}

async function run() {
  validateReleaseBundle();
  const userDataDirectory = await mkdtemp(join(tmpdir(), "megacity-packaged-world-map-"));
  let browser;
  const rendererErrors = [];

  try {
    browser = await puppeteer.launch({
      executablePath: LAUNCH_EXECUTABLE,
      headless: true,
      cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SANDBOX: "1",
        MEGACITY_E2E_FIXTURE: "world-map-event-log",
        MEGACITY_E2E_QUERY: FIXTURE_QUERY,
        MEGACITY_E2E_ROUTE: "worldmap",
      },
      args: [
        ...(RELEASE_EXECUTABLE ? [] : [STEAM_DIR]),
        "--no-sandbox",
        "--disable-dev-shm-usage",
        `--user-data-dir=${userDataDirectory}`,
      ],
      dumpio: false,
    });
    const page = (await browser.pages())[0] ?? (await browser.newPage());
    await page.setViewport(VIEWPORT);
    page.on("pageerror", (error) => {
      rendererErrors.push(`pageerror: ${errorMessage(error)}`);
    });
    page.on("error", (error) => {
      rendererErrors.push(`renderer crashed: ${errorMessage(error)}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon|net::|404|AbortError/.test(message.text())) {
        rendererErrors.push(`console.error: ${message.text()}`);
      }
    });

    console.log(
      `[e2e] launching packaged world-intel fixture (${RELEASE_EXECUTABLE ? "Windows release executable" : "Steam Electron shell"})`,
    );
    await waitForVisibleText(page, "WORLD MAP");
    await clickAccessibleNode(page, "Open world intel log");
    await waitForVisibleText(page, "WORLD INTEL LOG");

    for (const settlement of RENAMED_SETTLEMENTS) {
      const revealedRowTestId = `world-map-event-log-revealed-${settlement.id}`;
      const deadline = Date.now() + 30000;
      let revealedRow = null;
      while (Date.now() < deadline) {
        revealedRow = await readVisibleTestIdText(page, revealedRowTestId);
        if (revealedRow) break;
        await sleep(300);
      }
      if (!revealedRow) {
        throw new Error(`Packaged world-intel log did not reveal ${revealedRowTestId}`);
      }
      if (!revealedRow.includes(settlement.current) || revealedRow.includes(settlement.retired)) {
        throw new Error(
          `Packaged world-intel row has the wrong label for ${settlement.current}: ${revealedRow}`,
        );
      }
    }

    await clickAccessibleNode(page, "Close world intel log");
    await waitForVisibleText(page, "WORLD MAP");
    for (const [index, settlement] of RENAMED_SETTLEMENTS.entries()) {
      await assertRenamedSettlementTransformedInteraction(page, settlement, index === 0);
    }
    for (const edge of ["left", "right", "top", "bottom"]) {
      await assertEdgeContextMenu(page, edge);
    }

    await assertNoPlayerSaveStorage(page);
    if (rendererErrors.length) {
      throw new Error(`Packaged renderer emitted errors:\n${rendererErrors.join("\n")}`);
    }
    console.log(
      "[e2e] PASS: packaged world-map intel, renamed settlement labels, and edge quick actions stay reachable without creating a player save",
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    await rm(userDataDirectory, { recursive: true, force: true });
    if (existsSync(userDataDirectory)) {
      throw new Error(
        `packaged world-intel smoke test left temporary profile behind: ${userDataDirectory}`,
      );
    }
  }
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});