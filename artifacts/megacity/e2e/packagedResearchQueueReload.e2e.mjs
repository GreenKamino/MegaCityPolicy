// Packaged Electron smoke coverage for research queue order and cumulative
// completion times. Each case saves through the isolated AsyncStorage slot,
// closes the packaged process, and reloads the same disposable profile.
//
// Run with:
//   pnpm run test:e2e:packaged-research-queue-reload
//
// To exercise an unpacked Windows release instead of the local Electron
// runtime, set MEGACITY_RELEASE_EXECUTABLE to its game.exe path.
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer";
import LZString from "lz-string";

const { decompressFromUTF16 } = LZString;
const STEAM_DIR = resolve(import.meta.dirname, "..", "steam");
const ELECTRON_PATH =
  process.env.ELECTRON_PATH ??
  resolve(STEAM_DIR, "node_modules", "electron", "dist", "electron");
const RELEASE_EXECUTABLE = process.env.MEGACITY_RELEASE_EXECUTABLE
  ? resolve(process.env.MEGACITY_RELEASE_EXECUTABLE)
  : null;
const LAUNCH_EXECUTABLE = RELEASE_EXECUTABLE ?? ELECTRON_PATH;
const FIXTURE_KEY = "@megacity_e2e_research_queue_reload_1";
const QUEUED_TECH_NAMES = ["Magnetic Rail Transit", "Autonomous Freight Networks"];
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
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
    throw new Error(
      `packaged release is missing its manifest entry bundle ${packagedManifest.entryBundle}`,
    );
  }
  console.log(`[e2e] verified packaged release manifest v${packagedManifest.appVersion}`);
}

async function hasVisibleText(page, text) {
  try {
    return await page.evaluate((targetText) => {
      const needle = targetText.toUpperCase();
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

async function waitForRoute(page, suffix, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (new URL(page.url()).pathname.endsWith(suffix)) return;
    } catch {
      // Electron can briefly replace the app:// document during startup.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for route ${suffix}; current URL: ${page.url()}`);
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json =
    typeof envelope.data === "string"
      ? decompressFromUTF16(envelope.data)
      : raw;
  if (!json) throw new Error("The packaged research queue save payload could not be decompressed");
  return JSON.parse(json);
}

async function readPersistedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_KEY);
  if (!raw) throw new Error("The packaged research queue fixture did not write its isolated save");
  return decodePersistedState(raw);
}

async function readQueueScreen(page) {
  return page.evaluate((names) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const records = names.map((name) => {
      const nameNode = [...document.querySelectorAll("div, span, p")].find(
        (element) => visible(element) && (element.innerText ?? "").trim() === name,
      );
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
    throw new Error("Packaged research queue fixture did not render a positive research rate");
  }
  let cumulative = savedState.activeResearch
    ? Math.ceil(
        Math.max(0, savedState.activeResearch.cost - savedState.activeResearch.progress) /
          screen.researchRate,
      )
    : 0;
  return screen.rows.map((row) => {
    if (!row) throw new Error("A queued research project did not render an ETA row");
    cumulative += Math.ceil(row.cost / screen.researchRate);
    return cumulative;
  });
}

async function assertNoPlayerSaveStorage(page, stage) {
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  const playerKeys = keys.filter(
    (key) =>
      key.startsWith("@megacity_slot_") ||
      key === "@megacity_save" ||
      key === "@megacity_profiles_index" ||
      key.startsWith("@megacity_profile_") ||
      key === "@megacity_active_profile",
  );
  if (playerKeys.length) {
    throw new Error(
      `${stage}: packaged research queue fixture touched player save storage: ${JSON.stringify(playerKeys)}`,
    );
  }
}

async function launch(caseName, phase, userDataDirectory, rendererErrors) {
  const query =
    `demo=1&fixture=research-queue&researchqueue=1&researchqueuecase=${caseName}` +
    `&researchQueueReload=${phase}&go=research`;
  const browser = await puppeteer.launch({
    executablePath: LAUNCH_EXECUTABLE,
    headless: true,
    cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: "1",
      MEGACITY_E2E_FIXTURE: "research-queue",
      MEGACITY_E2E_QUERY: query,
      MEGACITY_E2E_ROUTE: "research",
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
  page.on("pageerror", (error) => rendererErrors.push(`pageerror: ${errorMessage(error)}`));
  page.on("error", (error) => rendererErrors.push(`renderer crashed: ${errorMessage(error)}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) {
      rendererErrors.push(`console.error: ${message.text()}`);
    }
  });
  await waitForRoute(page, "/research");
  await waitForVisibleText(page, "TECHNOLOGY TREE");
  return { browser, page };
}

async function runCase(caseName) {
  const userDataDirectory = await mkdtemp(
    join(tmpdir(), `megacity-packaged-research-queue-${caseName}-`),
  );
  let browser;
  let page;
  const rendererErrors = [];
  try {
    ({ browser, page } = await launch(caseName, "save", userDataDirectory, rendererErrors));
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      FIXTURE_KEY,
    );
    const savedState = await readPersistedState(page);
    if ((savedState.researchQueue ?? []).length !== 2) {
      throw new Error(
        `${caseName}: saved queue should contain two projects, got ${JSON.stringify(savedState.researchQueue)}`,
      );
    }
    if (caseName === "active" && !savedState.activeResearch) {
      throw new Error("active: packaged save lost its active project");
    }
    if (caseName === "empty" && savedState.activeResearch) {
      throw new Error("empty: packaged save unexpectedly has an active project");
    }
    const beforeReload = await readQueueScreen(page);
    const expectedTicks = expectedQueueTicks(savedState, beforeReload);
    if (beforeReload.rows.length !== 2) {
      throw new Error(`${caseName}: packaged save screen did not render both queued projects`);
    }
    if (beforeReload.rows.map((row) => row.name).join("|") !== QUEUED_TECH_NAMES.join("|")) {
      throw new Error(
        `${caseName}: packaged save screen queue order drifted: ` +
          `${beforeReload.rows.map((row) => row.name).join("|")}`,
      );
    }
    if (beforeReload.rows.some((row, index) => row.ticks !== expectedTicks[index])) {
      throw new Error(`${caseName}: initial packaged queue ETAs did not match cumulative calculation`);
    }
    await assertNoPlayerSaveStorage(page, `${caseName} save`);
    await browser.close();
    browser = null;

    ({ browser, page } = await launch(caseName, "load", userDataDirectory, rendererErrors));
    const afterReload = await readQueueScreen(page);
    const reloadedOrder = afterReload.rows.map((row) => row.name);
    const expectedOrder = beforeReload.rows.map((row) => row.name);
    if (reloadedOrder.join("|") !== expectedOrder.join("|")) {
      throw new Error(`${caseName}: packaged reload changed queue order`);
    }
    const reloadedTicks = afterReload.rows.map((row) => row.ticks);
    if (reloadedTicks.join("|") !== expectedTicks.join("|")) {
      throw new Error(
        `${caseName}: packaged reload ETAs ${reloadedTicks.join(",")} did not match ` +
          `cumulative values ${expectedTicks.join(",")}`,
      );
    }
    await assertNoPlayerSaveStorage(page, `${caseName} reload`);
    if (rendererErrors.length) {
      throw new Error(`Packaged renderer emitted errors:\n${rendererErrors.join("\n")}`);
    }
    console.log(
      `PASS [${caseName}] packaged research queue order and cumulative ETAs survived reload ` +
        `(ticks ${reloadedTicks.join(",")})`,
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    await rm(userDataDirectory, { recursive: true, force: true });
    if (existsSync(userDataDirectory)) {
      throw new Error(
        `packaged research queue smoke left temporary profile behind: ${userDataDirectory}`,
      );
    }
  }
}

async function run() {
  validateReleaseBundle();
  await runCase("active");
  await runCase("empty");
  console.log(
    "[e2e] PASS: packaged active and empty-active research queues preserve order and cumulative ETAs",
  );
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});