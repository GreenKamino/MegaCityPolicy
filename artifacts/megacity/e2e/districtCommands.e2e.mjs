// Browser regression coverage for district commands on the real Districts
// screen. Each viewport gets its own disposable browser context and isolated
// slot namespace, so this never reads or writes a player's save.
//
// Requires the "artifacts/megacity: expo" workflow.
//   pnpm --filter @workspace/megacity run test:e2e:district-commands

import { execSync } from "node:child_process";
import LZString from "lz-string";
import puppeteer from "puppeteer";

const { decompressFromUTF16 } = LZString;
const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const READY_TIMEOUT_MS = Number(process.env.E2E_PREVIEW_READY_TIMEOUT_MS) || 120000;
const FIXTURE_STORAGE_KEY = "@megacity_e2e_district_commands_reload_1";
const FIRST_DISTRICT = "Worker Housing Sector";
const SECOND_DISTRICT = "Water Processing District";
const COMMAND = "RELIEF ALLOCATION";
const LIVE_COMMAND = "GRID SWEEP";
const COOLDOWN_REASON = "Recently used — wait";
const BLOCKER_FIXTURE = "districtcommandscase=gates";
const LIVE_GATE_FIXTURE = "districtcommandscase=live-gates";
const HEAT_FIXTURE = "districtcommandscase=heat-sort";
const LAY_LOW_RELOAD_FIXTURE = "districtcommandscase=lay-low-reload";
const LAY_LOW_COMMAND = "LAY LOW";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return execSync("which chromium || which chromium-browser", { encoding: "utf8" }).trim();
}

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures.push(name);
}

async function visibleText(page, text) {
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

async function waitForText(page, text, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickVisibleText(page, text) {
  const clicked = await page.evaluate((target) => {
    const needle = target.trim().toUpperCase();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 &&
        styles.display !== "none" && styles.visibility !== "hidden";
    };
    const matches = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter(visible)
      .filter((element) => ((element.innerText ?? element.textContent) ?? "").trim().toUpperCase() === needle);
    const textElement = matches.sort((a, b) => (a.innerText ?? "").length - (b.innerText ?? "").length)[0];
    if (!textElement) return false;
    let element = textElement;
    while (
      element &&
      element !== document.body &&
      element.getAttribute("tabindex") !== "0" &&
      element.getAttribute("aria-disabled") !== "true" &&
      element.getAttribute("role") !== "button" &&
      element.tagName !== "BUTTON"
    ) {
      element = element.parentElement;
    }
    if (!element || element === document.body) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Could not click visible text: ${text}`);
}

async function clickAriaLabel(page, label) {
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

async function visibleDistrictCardIds(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="district-card-"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 &&
          style.display !== "none" && style.visibility !== "hidden";
      })
      .map((element) => element.getAttribute("data-testid")?.replace("district-card-", ""))
      .filter(Boolean),
  );
}

async function clickDistrictCard(page, districtName) {
  await clickVisibleText(page, districtName);
  await waitForText(page, "GANG INFLUENCE");
  await clickVisibleText(page, "OPEN DISTRICT COMMANDS");
  await waitForText(page, "DISTRICT COMMANDS");
  await waitForText(page, COMMAND);
}

async function districtCommandOption(page, label = COMMAND) {
  return page.evaluate((target) => {
    const exact = [...document.querySelectorAll("div, span, button")]
      .find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          ((element.innerText ?? "").trim().toUpperCase() === target.toUpperCase());
      });
    if (!exact) return null;
    let element = exact;
    for (let i = 0; i < 12 && element; i += 1, element = element.parentElement) {
      const style = getComputedStyle(element);
      const text = (element.innerText ?? "").replace(/\s+/g, " ").trim();
      const isInteractive =
        element.getAttribute("aria-disabled") === "true" ||
        element.getAttribute("role") === "button" ||
        element.getAttribute("tabindex") === "0";
      // React Native Web does not put a positive tab index on every disabled
      // Pressable, but its disabled row still carries aria-disabled. Prefer
      // that full option row so the reason subtitle is part of the assertion.
      if (isInteractive) {
        return {
          text,
          disabled: element.getAttribute("aria-disabled") === "true" ||
            Number.parseFloat(style.opacity) <= 0.5,
        };
      }
    }
    return { text: (exact.parentElement?.innerText ?? "").replace(/\s+/g, " ").trim(), disabled: false };
  }, label);
}

async function blockedDistrictCommandOptions(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 &&
        styles.display !== "none" && styles.visibility !== "hidden";
    };
    const options = [...document.querySelectorAll("[aria-disabled='true']")]
      .filter(visible)
      .map((element) => (element.innerText ?? element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((text) => text.includes("Needs"));
    return [...new Set(options)];
  });
}

async function waitForDistrictCommand(page, label, predicate, timeout = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await districtCommandOption(page, label);
    if (predicate(latest)) return latest;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for district command state: ${label}; latest=${JSON.stringify(latest)}`);
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string" ? decompressFromUTF16(envelope.data) : raw;
  return json ? JSON.parse(json) : null;
}

async function readPersistedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), FIXTURE_STORAGE_KEY);
  return raw ? decodePersistedState(raw) : null;
}

async function assertNoPlayerSaveStorage(page, label) {
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  const playerKeys = keys.filter((key) =>
    key.startsWith("@megacity_slot_") ||
    key === "@megacity_save" ||
    key === "@megacity_profiles_index" ||
    key.startsWith("@megacity_profile_") ||
    key === "@megacity_active_profile",
  );
  check(`${label} leaves player storage untouched`, playerKeys.length === 0);
}

async function runViewport(browser, viewport) {
  const context =
    (await browser.createBrowserContext?.()) ??
    (await browser.createIncognitoBrowserContext?.());
  if (!context) throw new Error("Puppeteer could not create an isolated browser context");

  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404|AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    const fixture = (phase) =>
      `${BASE_URL}/?demo=1&districtcommands=1&districtcommandsreload=${phase}&go=districts`;

    await page.goto(fixture("save"), {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS,
    });
    await waitForText(page, "DISTRICTS");
    await clickDistrictCard(page, FIRST_DISTRICT);

    const before = await districtCommandOption(page);
    check(
      `${viewport.name}: first district command starts enabled`,
      before && !before.disabled && before.text.includes("4,000c"),
    );
    await clickVisibleText(page, COMMAND);
    await waitForText(page, "+7 loyalty");
    await waitForText(page, "-8 unrest");
    await waitForText(page, "+180 population");
    const after = await districtCommandOption(page);
    check(
      `${viewport.name}: command shows visible district consequences`,
      after && after.text.includes(COOLDOWN_REASON),
    );
    check(
      `${viewport.name}: command history records the intervention`,
      await visibleText(page, "RECENT REGIME COMMANDS") &&
        await visibleText(page, "RELIEF ALLOCATION"),
    );

    await clickAriaLabel(page, "Close district details");
    await clickDistrictCard(page, SECOND_DISTRICT);
    const second = await districtCommandOption(page);
    check(
      `${viewport.name}: same command is ready on another district`,
      second && !second.disabled && !second.text.includes(COOLDOWN_REASON),
    );
    await clickAriaLabel(page, "Close district details");

    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: READY_TIMEOUT_MS },
      FIXTURE_STORAGE_KEY,
    );
    const savedState = await readPersistedState(page);
    const firstSaved = savedState?.districts?.find((district) => district.name === FIRST_DISTRICT);
    const savedCooldown = savedState?.personalActionCooldowns?.[`district:${firstSaved?.id}:district-reassure`];
    check(
      `${viewport.name}: save contains the changed first district and scoped cooldown`,
      firstSaved?.population === 28180 &&
        firstSaved.loyalty === 32 &&
        firstSaved.unrest === 37 &&
        savedCooldown === savedState.totalTicks + 28,
    );

    await page.goto(fixture("load"), {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS,
    });
    await waitForText(page, "DISTRICTS");
    await clickDistrictCard(page, FIRST_DISTRICT);
    const reloaded = await districtCommandOption(page);
    check(
      `${viewport.name}: reload keeps the first district unavailable reason`,
      reloaded && reloaded.text.includes(COOLDOWN_REASON),
    );
    await clickAriaLabel(page, "Close district details");
    await clickDistrictCard(page, SECOND_DISTRICT);
    const secondReloaded = await districtCommandOption(page);
    check(
      `${viewport.name}: reload keeps cooldown scoped away from the second district`,
      secondReloaded && !secondReloaded.disabled && !secondReloaded.text.includes(COOLDOWN_REASON),
    );
    await assertNoPlayerSaveStorage(page, `${viewport.name} fixture`);
    check(`${viewport.name}: browser stays error-free`, browserErrors.length === 0);
  } finally {
    await page.evaluate((key) => {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(`${key}_backup`);
      window.localStorage.removeItem(`${key}.tmp`);
    }, FIXTURE_STORAGE_KEY).catch(() => {});
    await context.close().catch(() => {});
  }
}

async function runBlockerViewport(browser, viewport) {
  const context =
    (await browser.createBrowserContext?.()) ??
    (await browser.createIncognitoBrowserContext?.());
  if (!context) throw new Error("Puppeteer could not create an isolated browser context");

  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404|AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    const fixture = `${BASE_URL}/?demo=1&districtcommands=1&${BLOCKER_FIXTURE}&go=districts`;

    await page.goto(fixture, {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS,
    });
    await waitForText(page, "DISTRICTS");
    await clickDistrictCard(page, FIRST_DISTRICT);
    check(
      `${viewport.name}: district detail shows derived underworld heat`,
      await visibleText(page, "UNDERWORLD HEAT") &&
        await visibleText(page, "Derived from crime"),
    );

    const blockedReasons = [
      ["SEAL THE BLOCK", "Needs crime ≥ 60 or unrest ≥ 60 (current: crime 20, unrest 10)"],
      [
        "RELIEF ALLOCATION",
        "Needs unrest ≥ 30 or wealth ≤ 25 or loyalty ≤ 35 or infrastructure ≤ 40 (current: unrest 10, wealth 50, loyalty 50, infrastructure 49)",
      ],
      [
        "GRID SWEEP",
        "Needs infrastructure ≥ 50 (current: infrastructure 49); Needs crime ≥ 30 or gang influence ≥ 30 (current: crime 20, gang influence 29)",
      ],
      ["CASEFILE AMNESTY", "Needs crime ≥ 30 or unrest ≥ 30 (current: crime 20, unrest 10)"],
    ];
    for (const [label, reason] of blockedReasons) {
      const option = await districtCommandOption(page, label);
      check(
        `${viewport.name}: ${label} shows its local blocker and current value`,
        option?.disabled && option.text.includes(reason),
      );
    }
    const renderedBlockedOptions = await blockedDistrictCommandOptions(page);
    check(
      `${viewport.name}: every rendered district blocker has a current-value explanation`,
      renderedBlockedOptions.length >= blockedReasons.length &&
        renderedBlockedOptions.every((text) => {
          const clauses = text.split(/;\s*(?=Needs )/);
          return clauses.length > 0 &&
            clauses.every((clause) => /\(current:\s*[^)]+\)/.test(clause));
        }),
    );
    for (const text of renderedBlockedOptions) {
      const label = text.split(/\s+Needs\s+/)[0].trim() || "UNKNOWN DISTRICT COMMAND";
      check(
        `${viewport.name}: ${label} blocker names its command and current value`,
        text.startsWith(label) && text.includes("(current:"),
      );
    }

    await clickAriaLabel(page, "Close district details");
    await clickDistrictCard(page, SECOND_DISTRICT);
    const boundary = await districtCommandOption(page, "CASEFILE AMNESTY");
    check(
      `${viewport.name}: command enables at the unrest threshold boundary`,
      boundary && !boundary.disabled && !boundary.text.includes("Needs"),
    );

    // The relief command is eligible at the same boundary. It lowers unrest
    // below the pardon threshold while the detail modal stays open, modeling
    // a menu that was opened before a local condition changed.
    await clickVisibleText(page, "RELIEF ALLOCATION");
    await waitForText(page, "RECENT REGIME COMMANDS");
    await waitForText(page, "RELIEF ALLOCATION");
    const stale = await districtCommandOption(page, "CASEFILE AMNESTY");
    check(
      `${viewport.name}: open menu refreshes the now-blocked command with current values`,
      stale?.disabled &&
        stale.text.includes("current: crime 29, unrest 22"),
    );
    await clickVisibleText(page, "CASEFILE AMNESTY");
    const staleAfterClick = await districtCommandOption(page, "CASEFILE AMNESTY");
    check(
      `${viewport.name}: stale blocked command cannot be applied`,
      staleAfterClick?.disabled &&
        (await visibleText(page, "RELIEF ALLOCATION")) &&
        !(await page.evaluate(() => {
          const text = document.body.innerText ?? "";
          return text.includes("CASEFILE AMNESTY\nTICK");
        })),
    );

    await assertNoPlayerSaveStorage(page, `${viewport.name} blocker fixture`);
    check(`${viewport.name}: blocker fixture stays error-free`, browserErrors.length === 0);
  } finally {
    await context.close().catch(() => {});
  }
}

async function runLiveGateViewport(browser, viewport) {
  const context =
    (await browser.createBrowserContext?.()) ??
    (await browser.createIncognitoBrowserContext?.());
  if (!context) throw new Error("Puppeteer could not create an isolated browser context");

  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404|AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    const fixture = `${BASE_URL}/?demo=1&districtcommands=1&${LIVE_GATE_FIXTURE}&go=districts`;

    await page.goto(fixture, {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS,
    });
    await waitForText(page, "DISTRICTS");
    await clickDistrictCard(page, FIRST_DISTRICT);

    const before = await districtCommandOption(page, LIVE_COMMAND);
    check(
      `${viewport.name}: live-gated command starts enabled at the prerequisite boundary`,
      before &&
        !before.disabled &&
        before.text.includes("6,000c") &&
        before.text.includes("GRID SWEEP"),
    );

    const afterTick = await waitForDistrictCommand(
      page,
      LIVE_COMMAND,
      (option) =>
        Boolean(option?.disabled) &&
        option.text.includes("gang influence") &&
        !/gang influence 30\b/.test(option.text),
      30000,
    );
    check(
      `${viewport.name}: live tick moves gang influence below the gate`,
      afterTick.text.includes("gang influence") &&
        !/gang influence 30\b/.test(afterTick.text),
    );

    await clickVisibleText(page, LIVE_COMMAND);
    const afterBlockedClick = await districtCommandOption(page, LIVE_COMMAND);
    check(
      `${viewport.name}: live-gated command stays blocked after a stale-menu click`,
      afterBlockedClick?.disabled &&
        afterBlockedClick.text.includes("Needs") &&
        !afterBlockedClick.text.includes(COOLDOWN_REASON),
    );
    check(
      `${viewport.name}: blocked live-gated command was not applied`,
      await page.evaluate(() => {
        const text = document.body.textContent ?? "";
        return text.includes("RECENT REGIME COMMANDS") &&
          text.includes("0/8") &&
          text.includes("No direct commands have been recorded");
      }),
    );
    await assertNoPlayerSaveStorage(page, `${viewport.name} live-gate fixture`);
    check(`${viewport.name}: live-gate fixture stays error-free`, browserErrors.length === 0);
  } finally {
    await context.close().catch(() => {});
  }
}

async function runHeatSortViewport(browser, viewport) {
  const context =
    (await browser.createBrowserContext?.()) ??
    (await browser.createIncognitoBrowserContext?.());
  if (!context) throw new Error("Puppeteer could not create an isolated browser context");

  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404|AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.goto(`${BASE_URL}/?demo=1&districtcommands=1&${HEAT_FIXTURE}&go=districts`, {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS,
    });
    await waitForText(page, "DISTRICTS");
    await waitForText(page, "UNDERWORLD QUIET");
    await clickAriaLabel(page, "Sort districts by underworld heat");

    const sortedIds = await visibleDistrictCardIds(page);
    check(
      `${viewport.name}: heat sort puts the burning district first`,
      sortedIds[0] === "water-processing" && sortedIds.includes("worker-housing"),
    );

    await clickAriaLabel(page, "Underworld heat filter: WATCHED");
    const watchedIds = await visibleDistrictCardIds(page);
    check(
      `${viewport.name}: Watched filter isolates the watched district`,
      watchedIds.length === 1 && watchedIds[0] === "worker-housing",
    );

    await clickAriaLabel(page, "Underworld heat filter: BURNING");
    const burningIds = await visibleDistrictCardIds(page);
    check(
      `${viewport.name}: Burning filter isolates the burning district`,
      burningIds.length === 1 && burningIds[0] === "water-processing",
    );

    await clickAriaLabel(page, "Underworld heat filter: WATCHED");
    await clickVisibleText(page, "Worker Housing Sector");
    await waitForText(page, "OPEN DISTRICT COMMANDS");
    await clickVisibleText(page, "OPEN DISTRICT COMMANDS");
    await waitForText(page, "LAY LOW");
    await clickVisibleText(page, "LAY LOW");
    await waitForText(page, "RECENT REGIME COMMANDS");
    await clickAriaLabel(page, "Close district details");

    const watchedAfterLayLow = await visibleDistrictCardIds(page);
    check(
      `${viewport.name}: list removes the ward after crime and gang influence cool`,
      watchedAfterLayLow.length === 0 && await visibleText(page, "0 districts"),
    );

    await clickAriaLabel(page, "Underworld heat filter: ALL");
    await waitForText(page, "OPEN DISTRICT COMMANDS");
    await clickVisibleText(page, "OPEN DISTRICT COMMANDS");
    await waitForText(page, "UNDERWORLD HEAT · QUIET");
    check(
      `${viewport.name}: Lay Low updates the selected ward's derived heat`,
      await page.evaluate(() => {
        const badge = [...document.querySelectorAll("[aria-label]")]
          .find((element) => element.getAttribute("aria-label")?.startsWith("Underworld heat: Quiet"));
        const label = badge?.getAttribute("aria-label") ?? "";
        return label.includes("crime 29") && label.includes("gang influence 29");
      }),
    );

    await assertNoPlayerSaveStorage(page, `${viewport.name} heat-sort fixture`);
    check(`${viewport.name}: heat-sort fixture stays error-free`, browserErrors.length === 0);
  } finally {
    await context.close().catch(() => {});
  }
}

function layLowReloadSnapshot(state) {
  const district = state?.districts?.find((entry) => entry.name === FIRST_DISTRICT);
  if (!district) return null;
  const heatPeak = Math.max(district.crime, district.gangInfluence);
  const heat = heatPeak >= 60 ? "Burning" : heatPeak >= 30 ? "Watched" : "Quiet";
  const cooldownKey = `district:${district.id}:district-lay-low`;
  return {
    crime: district.crime,
    gangInfluence: district.gangInfluence,
    heat,
    credits: state.resources?.credits,
    history: (state.districtCommandHistory ?? []).filter(
      (entry) => entry.districtId === district.id && entry.actionId === "district-lay-low",
    ),
    cooldown: state.personalActionCooldowns?.[cooldownKey],
  };
}

async function runLayLowReloadViewport(browser, viewport) {
  const context =
    (await browser.createBrowserContext?.()) ??
    (await browser.createIncognitoBrowserContext?.());
  if (!context) throw new Error("Puppeteer could not create an isolated browser context");

  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/favicon|net::|404|AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    const fixture = (phase) =>
      `${BASE_URL}/?demo=1&districtcommands=1&${LAY_LOW_RELOAD_FIXTURE}&districtcommandsreload=${phase}&go=districts`;

    await page.goto(fixture("save"), {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS,
    });
    await waitForText(page, "DISTRICTS");
    await clickDistrictCard(page, FIRST_DISTRICT);

    const before = await districtCommandOption(page, LAY_LOW_COMMAND);
    check(
      `${viewport.name}: Lay Low starts eligible in the isolated district fixture`,
      before && !before.disabled && before.text.includes("3,500c"),
    );

    await clickVisibleText(page, LAY_LOW_COMMAND);
    await waitForText(page, "RECENT REGIME COMMANDS");
    await waitForText(page, LAY_LOW_COMMAND);
    await waitForText(page, "UNDERWORLD HEAT · QUIET");
    await waitForDistrictCommand(
      page,
      LAY_LOW_COMMAND,
      (option) => Boolean(option?.disabled) && option.text.includes(COOLDOWN_REASON),
    );

    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: READY_TIMEOUT_MS },
      FIXTURE_STORAGE_KEY,
    );
    const savedState = await readPersistedState(page);
    const savedSnapshot = layLowReloadSnapshot(savedState);
    check(
      `${viewport.name}: saved Lay Low state has reduced heat and durable command data`,
      savedSnapshot &&
        savedSnapshot.crime === 29 &&
        savedSnapshot.gangInfluence === 29 &&
        savedSnapshot.heat === "Quiet" &&
        savedSnapshot.credits === 21_500 &&
        savedSnapshot.history.length === 1 &&
        savedSnapshot.history[0].effects.crime === -6 &&
        savedSnapshot.history[0].effects.gangInfluence === -8 &&
        savedSnapshot.cooldown === savedState.totalTicks + 32,
    );

    await page.goto(fixture("load"), {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS,
    });
    await waitForText(page, "DISTRICTS");
    await clickDistrictCard(page, FIRST_DISTRICT);
    await waitForText(page, "UNDERWORLD HEAT · QUIET");
    await waitForText(page, "RECENT REGIME COMMANDS");
    const reloadedState = await readPersistedState(page);
    const reloadedSnapshot = layLowReloadSnapshot(reloadedState);
    check(
      `${viewport.name}: reload preserves Lay Low crime, gang influence, heat, credits, history, and cooldown`,
      JSON.stringify(reloadedSnapshot) === JSON.stringify(savedSnapshot),
    );
    const reloadedOption = await districtCommandOption(page, LAY_LOW_COMMAND);
    check(
      `${viewport.name}: reload keeps Lay Low on its district cooldown`,
      reloadedOption?.disabled && reloadedOption.text.includes(COOLDOWN_REASON),
    );
    await assertNoPlayerSaveStorage(page, `${viewport.name} Lay Low reload fixture`);
    check(`${viewport.name}: Lay Low reload fixture stays error-free`, browserErrors.length === 0);
  } finally {
    await page.evaluate((key) => {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(`${key}_backup`);
      window.localStorage.removeItem(`${key}.tmp`);
    }, FIXTURE_STORAGE_KEY).catch(() => {});
    await context.close().catch(() => {});
  }
}

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

try {
  for (const viewport of [
    { name: "phone", width: 390, height: 844 },
    { name: "desktop", width: 1280, height: 900 },
  ]) {
    await runViewport(browser, viewport);
    await runBlockerViewport(browser, viewport);
    await runLiveGateViewport(browser, viewport);
    await runHeatSortViewport(browser, viewport);
    await runLayLowReloadViewport(browser, viewport);
  }
} catch (error) {
  console.error(`\nE2E FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}

if (failures.length) {
  console.error(`\nFAILURES:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log("\nPASS: district commands work, scope cooldowns, and survive reload at phone and desktop widths");
}