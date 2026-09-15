// Packaged Electron/Steam smoke coverage for mission-success mail dismissal.
// The first isolated Electron process dismisses and saves the message; a
// second process reloads that same disposable profile and replays completion.
//
// Run with:
//   pnpm run test:e2e:packaged-mission-mail-dismissal
//
// To exercise an unpacked Windows release instead of the local Electron
// runtime, set MEGACITY_RELEASE_EXECUTABLE to its game.exe path.
import { existsSync } from "node:fs";
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
const SAVE_QUERY = "demo=1&missionmail=1&missionMailReload=save&go=inbox";
const LOAD_QUERY = "demo=1&missionmail=1&missionMailReload=load&go=inbox";
// Keep representative queries for every packaged renderer fixture present
// while omitting all desktop capabilities. This proves a normal Steam launch
// cannot turn a deep link into demo state.
const NORMAL_QUERY_SUFFIX = [
  "demo=1",
  "boundarycomms=1",
  "militaryfoodpool=1",
  "utilityparity=1",
  "researchqueue=1",
  "railmodules=1",
  "districtcommands=1",
  "crime=1",
  "missionmail=1",
  "missionMailReload=save",
  "go=inbox",
].join("&");
const NORMAL_QUERIES = [
  ["save-and-quit", `fixture=save-and-quit&${NORMAL_QUERY_SUFFIX}`],
  ["retinue-succession", `fixture=retinue-succession&${NORMAL_QUERY_SUFFIX}`],
];
const DESKTOP_FIXTURE_CAPABILITIES = [
  "saveAndQuitFixture",
  "retinueSuccessionFixture",
  "communicationsBoundaryFixture",
  "militaryFoodPoolFixture",
  "utilityParityFixture",
  "researchQueueFixture",
  "railModulesFixture",
  "districtCommandsFixture",
  "crimeRecoveryFixture",
  "missionMailFixture",
  "simulateSaveFailure",
];
const MISSION_TITLE = "MISSION SUCCESS: TRADE NEGOTIATION";
const MISSION_ID = "mission-success-trade_negotiation-42-Ada Vance";
const ISOLATED_KEY = "@megacity_e2e_mission_mail_1";
const MISSION_PHASE_KEY = "@megacity_e2e_mission_mail_phase";
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

if (!existsSync(LAUNCH_EXECUTABLE)) {
  throw new Error(
    `${RELEASE_EXECUTABLE ? "Windows release executable" : "Electron runtime"} not found at ${LAUNCH_EXECUTABLE}. Install Steam shell dependencies or set MEGACITY_RELEASE_EXECUTABLE.`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function hasVisibleText(page, text) {
  try {
    return await page.evaluate((targetText) => {
      const needle = targetText.toUpperCase();
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      let node;
      while ((node = walker.nextNode())) {
        if (!(node.textContent ?? "").toUpperCase().includes(needle)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    }, text);
  } catch {
    // Electron can replace the document while app:// finishes loading.
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
    .evaluate(() => document.body?.innerText?.slice(0, 2000) ?? "(empty)")
    .catch(() => "(renderer unavailable)");
  throw new Error(`Timed out waiting for visible text "${text}". Visible text:\n${body}`);
}

async function waitForVisibleTextToDisappear(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await hasVisibleText(page, text))) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for visible text "${text}" to disappear`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((targetText) => {
    const needle = targetText.toUpperCase();
    const element = [...document.querySelectorAll("div, span, button, [role='button']")]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (candidate.innerText ?? candidate.textContent ?? "").trim().toUpperCase() === needle
        );
      });
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text "${text}"`);
}

async function clickDismissButton(page) {
  const clicked = await page.evaluate(() => {
    const element = [...document.querySelectorAll("[aria-label='Dismiss message']")]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  });
  if (!clicked) throw new Error("Could not find the visible mission mail dismiss button");
}

async function assertNoPlayerSaveStorage(page) {
  const playerKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) =>
      key.startsWith("@megacity_slot_") ||
      key === "@megacity_save" ||
      key === "@megacity_profiles_index" ||
      key.startsWith("@megacity_profile_") ||
      key === "@megacity_active_profile",
    ),
  );
  if (playerKeys.length) {
    throw new Error(
      `packaged mission mail fixture touched player save storage: ${JSON.stringify(playerKeys)}`,
    );
  }
}

async function assertNoFixtureStorage(page) {
  const storage = await page.evaluate(() => ({
    local: Object.keys(window.localStorage).filter((key) =>
      key.startsWith("@megacity_e2e_"),
    ),
    session: Object.keys(window.sessionStorage).filter((key) =>
      key.startsWith("@megacity_e2e_"),
    ),
  }));
  if (storage.local.length || storage.session.length) {
    throw new Error(
      `normal packaged launch seeded fixture storage: ${JSON.stringify(storage)}`,
    );
  }
}

async function waitForDismissalSave(page, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), ISOLATED_KEY);
    if (raw) {
      try {
        const envelope = JSON.parse(raw);
        const json = typeof envelope.data === "string"
          ? decompressFromUTF16(envelope.data)
          : raw;
        const state = json ? JSON.parse(json) : null;
        if (
          state?.dismissedMessageIds?.includes(MISSION_ID) &&
          !state?.messages?.some((message) => message.id === MISSION_ID)
        ) {
          return;
        }
      } catch {
        // The atomic save may be between its temporary and primary writes.
      }
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for the isolated save to retain the mission dismissal");
}

function launchEnvironment(query, { missionMailFixture = true } = {}) {
  const launchEnv = {
    ...process.env,
    ELECTRON_DISABLE_SANDBOX: "1",
  };
  for (const key of Object.keys(launchEnv).filter((key) =>
    key.startsWith("MEGACITY_E2E_"),
  )) {
    delete launchEnv[key];
  }
  if (missionMailFixture) launchEnv.MEGACITY_E2E_FIXTURE = "mission-mail";
  if (query) launchEnv.MEGACITY_E2E_QUERY = query;
  return launchEnv;
}

async function launch(
  query,
  userDataDirectory,
  rendererErrors,
  onConsole,
  { missionMailFixture = true, readyText = "INBOX" } = {},
) {
  const browser = await puppeteer.launch({
    executablePath: LAUNCH_EXECUTABLE,
    headless: true,
    cwd: RELEASE_EXECUTABLE ? resolve(RELEASE_EXECUTABLE, "..") : STEAM_DIR,
    env: launchEnvironment(query, { missionMailFixture }),
    args: [
      ...(RELEASE_EXECUTABLE ? [] : [STEAM_DIR]),
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      `--user-data-dir=${userDataDirectory}`,
    ],
    dumpio: false,
  });
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());
  await page.setViewport(VIEWPORT);
  page.on("pageerror", (error) => {
    rendererErrors.push(`pageerror: ${errorMessage(error)}`);
  });
  page.on("error", (error) => {
    rendererErrors.push(`renderer crashed: ${errorMessage(error)}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      rendererErrors.push(`console.error: ${message.text()}`);
    }
    onConsole?.(message);
  });
  await waitForVisibleText(page, readyText);
  return { browser, page };
}

async function run() {
  let userDataDirectory;
  const normalUserDataDirectories = [];
  let browser;
  let normalBrowser;
  let page;
  let normalPage;
  const rendererErrors = [];
  let replayMarkerSeen = false;

  try {
    for (const [scenario, normalQuery] of NORMAL_QUERIES) {
      const normalUserDataDirectory = await mkdtemp(
        join(tmpdir(), `megacity-packaged-normal-${scenario}-`),
      );
      normalUserDataDirectories.push(normalUserDataDirectory);
      ({ browser: normalBrowser, page: normalPage } = await launch(
        normalQuery,
        normalUserDataDirectory,
        rendererErrors,
        undefined,
        { missionMailFixture: false, readyText: "NEW GAME" },
      ));
      const normalBridge = await normalPage.evaluate((capabilityNames) => ({
        capabilities: Object.fromEntries(
          capabilityNames.map((name) => [name, window.desktop?.[name]]),
        ),
        missionTitleVisible: [...document.querySelectorAll("*")].some((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            (element.innerText ?? element.textContent ?? "")
              .toUpperCase()
              .includes("MISSION SUCCESS: TRADE NEGOTIATION")
          );
        }),
      }), DESKTOP_FIXTURE_CAPABILITIES);
      const enabledCapabilities = Object.entries(normalBridge.capabilities)
        .filter(([, enabled]) => enabled !== false);
      if (enabledCapabilities.length) {
        throw new Error(
          `${scenario} normal packaged launch exposed fixture capabilities: ${JSON.stringify(enabledCapabilities)}`,
        );
      }
      if (normalBridge.missionTitleVisible) {
        throw new Error(`${scenario} normal packaged launch seeded the mission-success inbox message`);
      }
      await assertNoFixtureStorage(normalPage);
      await assertNoPlayerSaveStorage(normalPage);
      console.log(
        `[e2e] PASS: normal ${scenario} launch keeps all packaged fixtures disabled and storage untouched`,
      );
      await normalBrowser.close();
      normalBrowser = null;
      normalPage = null;
    }

    userDataDirectory = await mkdtemp(
      join(tmpdir(), "megacity-packaged-mission-mail-"),
    );

    ({ browser, page } = await launch(SAVE_QUERY, userDataDirectory, rendererErrors));
    console.log(
      `[e2e] launched packaged mission-mail save fixture (${RELEASE_EXECUTABLE ? "release executable" : "Steam Electron shell"})`,
    );
    await waitForVisibleText(page, MISSION_TITLE);
    await waitForVisibleText(page, "1 MESSAGE");
    await waitForVisibleText(page, "1 UNREAD");
    await waitForVisibleText(page, "MISSION (1)");
    console.log("[e2e] mission-success mail appears unread in the packaged inbox");

    await clickDismissButton(page);
    await waitForVisibleText(page, "DELETE MESSAGE?");
    await waitForVisibleText(
      page,
      "This message will be permanently deleted. This cannot be undone.",
    );
    await clickVisibleText(page, "DELETE");
    await waitForVisibleTextToDisappear(page, MISSION_TITLE);
    await waitForVisibleText(page, "0 MESSAGE");
    await waitForVisibleText(page, "0 UNREAD");
    await waitForVisibleText(page, "NO MESSAGES");
    await waitForDismissalSave(page);
    await assertNoPlayerSaveStorage(page);
    console.log(
      "[e2e] destructive dismissal updates the packaged inbox and persists only to the isolated fixture save",
    );
    await browser.close();
    browser = null;

    ({ browser, page } = await launch(
      LOAD_QUERY,
      userDataDirectory,
      rendererErrors,
      (message) => {
        if (message.text().includes("[missionMailE2E] replay preserved dismissed mission mail")) {
          replayMarkerSeen = true;
        }
      },
    ));
    await waitForVisibleTextToDisappear(page, MISSION_TITLE);
    await waitForVisibleText(page, "0 MESSAGE");
    await waitForVisibleText(page, "0 UNREAD");
    await waitForVisibleText(page, "NO MESSAGES");
    const deadline = Date.now() + 30000;
    while (!replayMarkerSeen && Date.now() < deadline) await sleep(250);
    if (!replayMarkerSeen) {
      throw new Error("Timed out waiting for repeated mission completion callback marker");
    }
    await assertNoPlayerSaveStorage(page);
    if (rendererErrors.length) {
      throw new Error(`Packaged browser/desktop errors:\n${rendererErrors.join("\n")}`);
    }
    console.log(
      "[e2e] PASS: packaged reload keeps dismissed mission mail gone and repeated completion does not recreate it",
    );
  } catch (error) {
    const details = rendererErrors.length
      ? `\nBrowser/desktop errors:\n${rendererErrors.join("\n")}`
      : "";
    console.error(`[e2e] FAIL: ${errorMessage(error)}${details}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (normalBrowser) await normalBrowser.close().catch(() => {});
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
      if (existsSync(userDataDirectory)) {
        console.error(
          `[e2e] FAIL: packaged mission mail smoke left temporary profile behind: ${userDataDirectory}`,
        );
        process.exitCode = 1;
      }
    }
    for (const normalUserDataDirectory of normalUserDataDirectories) {
      await rm(normalUserDataDirectory, { recursive: true, force: true });
      if (existsSync(normalUserDataDirectory)) {
        console.error(
          `[e2e] FAIL: normal packaged mission mail smoke left temporary profile behind: ${normalUserDataDirectory}`,
        );
        process.exitCode = 1;
      }
    }
  }
}

run().catch((error) => {
  console.error(`[e2e] FAIL: ${errorMessage(error)}`);
  process.exitCode = 1;
});
