// Browser regression coverage for the shared personal-interaction menu on
// named civic figures and rival faction leaders. The fixture is paused,
// zero-credit, and in-memory only so the browser can verify the disabled
// affordability copy without changing a playable city.
//
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/relationshipRoster.e2e.mjs

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";
import LZString from "lz-string";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const { compressToUTF16, decompressFromUTF16 } = LZString;
const FIXTURE_STORAGE_KEY = "@megacity_e2e_relationship_roster_1";
const VIEWPORTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 720 },
];

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

async function waitForText(page, text, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await visibleText(page, text)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function clickExactText(page, text, { last = false } = {}) {
  const clicked = await page.evaluate(({ targetText, lastMatch }) => {
    const target = targetText.trim().toUpperCase();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const matches = [...document.querySelectorAll("div, span, button, [role='button']")]
      .filter((element) => visible(element))
      .filter((element) => ((element.innerText ?? element.textContent) ?? "").trim().toUpperCase() === target);
    const element = lastMatch ? matches.at(-1) : matches[0];
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }, { targetText: text, lastMatch: last });
  if (!clicked) throw new Error(`Could not find visible exact text: ${text}`);
}

async function clickCardText(page, cardMarker, text) {
  const clicked = await page.evaluate(({ marker, targetText }) => {
    const heading = [...document.querySelectorAll("div, span")].find(
      (element) =>
        (element.innerText ?? "").trim() === marker &&
        element.getBoundingClientRect().width > 0 &&
        element.getBoundingClientRect().height > 0,
    );
    if (!heading) return false;
    let card = heading;
    while (card.parentElement) {
      const cardText = card.innerText ?? "";
      if (cardText.includes(marker) && cardText.includes(targetText)) {
        const target = [...card.querySelectorAll("div, span, button, [role='button']")].find(
          (element) =>
            (element.innerText ?? element.textContent ?? "").trim().toUpperCase() ===
            targetText.toUpperCase(),
        );
        if (!target) return false;
        target.scrollIntoView({ block: "center", inline: "center" });
        target.click();
        return true;
      }
      card = card.parentElement;
    }
    return false;
  }, { marker: cardMarker, targetText: text });
  if (!clicked) throw new Error(`Could not click ${text} in ${cardMarker} card`);
}

async function cardHasTexts(page, cardMarker, texts) {
  return page.evaluate(({ marker, requiredTexts }) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let heading = null;
    while ((node = walker.nextNode())) {
      const element = node.parentElement;
      if (
        element &&
        (node.textContent ?? "").trim() === marker &&
        element.getBoundingClientRect().width > 0 &&
        element.getBoundingClientRect().height > 0
      ) {
        heading = element;
        break;
      }
    }
    if (!heading) return false;
    let card = heading;
    while (card.parentElement) {
      const cardText = card.innerText ?? "";
      if (
        cardText.includes(marker) &&
        requiredTexts.every((text) => cardText.includes(text))
      ) {
        return true;
      }
      card = card.parentElement;
    }
    return false;
  }, { marker: cardMarker, requiredTexts: texts });
}

async function expandFactionMenu(page, factionName) {
  const expanded = await page.evaluate((name) => {
    const heading = [...document.querySelectorAll("div, span")].find(
      (element) =>
        (element.innerText ?? "").trim() === name &&
        element.getBoundingClientRect().width > 0 &&
        element.getBoundingClientRect().height > 0,
    );
    if (!heading) return false;
    let card = heading;
    while (card.parentElement) {
      const cardText = card.innerText ?? "";
      if (cardText.includes(name) && cardText.toUpperCase().includes("MORE ACTIONS")) {
        const toggle = [...card.querySelectorAll("div, span, button, [role='button']")].find(
          (element) => (element.innerText ?? "").trim().toUpperCase().startsWith("MORE ACTIONS"),
        );
        if (!toggle) return false;
        toggle.scrollIntoView({ block: "center", inline: "center" });
        toggle.click();
        return true;
      }
      card = card.parentElement;
    }
    return false;
  }, factionName);
  if (!expanded) throw new Error(`Could not expand ${factionName} interaction menu`);
}

async function assertNoPlayerSaveStorage(page) {
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  const saveKeys = keys.filter(
    (key) =>
      key.startsWith("@megacity_slot_") ||
      key === "@megacity_save" ||
      key === "@megacity_profiles_index" ||
      key.startsWith("@megacity_profile_") ||
      key === "@megacity_active_profile",
  );
  check("relationship roster fixture leaves player storage untouched", saveKeys.length === 0);
}

function decodePersistedState(raw) {
  const envelope = JSON.parse(raw);
  const json = typeof envelope.data === "string" ? decompressFromUTF16(envelope.data) : raw;
  return json ? JSON.parse(json) : null;
}

function corruptRelationshipScores(raw) {
  const envelope = JSON.parse(raw);
  const state = decodePersistedState(raw);
  if (!state) throw new Error("Could not decode the relationship roster save fixture");

  const megacity = state.externalMegacities?.find((city) => city.id === "terminus-prime");
  const township = state.townships?.find((candidate) => candidate.id === "dusthaven");
  if (!megacity || !township) {
    throw new Error("Relationship roster save fixture is missing diplomacy entities");
  }

  Object.assign(megacity, {
    influence: 17,
    loyalty: 23,
    threat: 41,
    cityHealth: null,
    attrition: "corrupted",
  });
  Object.assign(township, {
    influence: Number.POSITIVE_INFINITY,
    loyalty: -12,
    threat: 999,
    cityHealth: -4,
    attrition: Number.NaN,
  });

  // Keep the old checksum deliberately: the normal loader recognizes intact
  // JSON with a mismatched checksum as an edited save, then still runs the
  // migration and sanitizer instead of falling back to the backup.
  return JSON.stringify({
    ...envelope,
    data: compressToUTF16(JSON.stringify(state)),
  });
}

async function visibleRelationshipScores(page) {
  return page.evaluate(() => {
    const labels = ["INFLUENCE", "LOYALTY", "THREAT"];
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    return labels.flatMap((label) =>
      [...document.querySelectorAll("div, span")]
        .filter((element) => visible(element) && (element.innerText ?? "").trim() === label)
        .map((element) => {
          const row = element.parentElement;
          const text = row?.innerText ?? "";
          const numeric = text
            .replace(label, "")
            .match(/-?\d+(?:\.\d+)?|NaN|Infinity/);
          return { label, value: numeric ? Number(numeric[0]) : Number.NaN };
        }),
    );
  });
}

async function assertBoundedRelationshipScores(page, entityName) {
  const scores = await visibleRelationshipScores(page);
  check(
    `${entityName} diplomacy detail shows all repaired relationship scores`,
    scores.length >= 3 && scores.every(({ value }) => Number.isFinite(value) && value >= 0 && value <= 100),
  );
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
  const context =
    (await browser.createBrowserContext?.()) ??
    (await browser.createIncognitoBrowserContext?.());
  try {
    if (!context) throw new Error("Puppeteer could not create an isolated browser context");
    const page = await context.newPage();
    await page.setViewport({ ...VIEWPORTS[0], deviceScaleFactor: 1 });
    const browserErrors = [];
    page.on("pageerror", (error) => {
      if (!/AbortError: The play\(\) request was interrupted by a call to pause\(\)/.test(String(error))) {
        browserErrors.push(String(error));
      }
    });
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

    const fixture = (route, phase = "") =>
      `${BASE_URL}/?demo=1&relationshiproster=1${
        phase ? `&relationshiprosterphase=${phase}` : ""
      }&go=${route}`;

    await page.goto(fixture("character"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "DOSSIER");
    await clickExactText(page, "CIRCLE");
    await waitForText(page, "CIVIC FIGURES");
    await waitForText(page, "Director Mira Vale");
    await waitForText(page, "GIVE GIFT");
    await waitForText(page, "Need 1,500 credits");
    check("Character route renders the civic figure shared interaction menu", true);
    await clickCardText(page, "Director Mira Vale", "FLATTER");
    await waitForText(page, "FLATTER: Director Mira Vale");
    check("civic figure personal action opens its confirmation menu", true);
    await clickExactText(page, "Abort", { last: true });
    await waitForText(page, "Director Mira Vale");

    await page.goto(fixture("factions"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "FACTIONS / CIVIC & EXTERNAL AFFAIRS");
    await waitForText(page, "The Sector Syndicates");
    await waitForText(page, "Razor Vex");
    await expandFactionMenu(page, "The Sector Syndicates");
    await waitForText(page, "GIVE GIFT");
    await waitForText(page, "Need 1,500 credits");
    check("Factions route keeps paid personal actions visible with a broke reason", true);
    await clickCardText(page, "The Sector Syndicates", "FLATTER");
    await waitForText(page, "FLATTER: Razor Vex");
    check("named rival leader exposes a working personal action", true);
    await clickExactText(page, "Abort", { last: true });

    await page.goto(fixture("character", "save"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "DOSSIER");
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      FIXTURE_STORAGE_KEY,
    );
    const savedRaw = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      FIXTURE_STORAGE_KEY,
    );
    const decodedSavedState = savedRaw ? decodePersistedState(savedRaw) : null;
    const savedCooldowns = decodedSavedState?.personalActionCooldowns ?? {};
    check(
      "relationship roster save keeps the civic cooldown expiry",
      savedCooldowns["civic:urban-services-director:flatter"] === 128,
    );
    check(
      "relationship roster save keeps the rival cooldown expiry",
      savedCooldowns["leader:gangs:flatter"] === 127,
    );
    check(
      "relationship roster save keeps the officer cooldown expiry",
      savedCooldowns[`officer:${decodedSavedState?.officers?.[0]?.id}:flatter`] === 128,
    );
    const storageKeys = await page.evaluate(() => Object.keys(window.localStorage));
    check(
      "relationship roster save uses an isolated storage key",
      storageKeys.includes(FIXTURE_STORAGE_KEY) &&
        !storageKeys.some(
          (key) =>
            key.startsWith("@megacity_slot_") ||
            key === "@megacity_save" ||
            key === "@megacity_profiles_index" ||
            key.startsWith("@megacity_profile_") ||
            key === "@megacity_active_profile",
        ),
    );

    await page.goto(fixture("character", "load"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "DOSSIER");
    await clickExactText(page, "CIRCLE");
    await waitForText(page, "CIVIC FIGURES");
    await waitForText(page, "Chief Marshal Lysa Venn");
    await waitForText(page, "Director Mira Vale");
    for (const viewport of VIEWPORTS) {
      await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
      await waitForText(page, "Recently used — wait 8 ticks");
      check(
        `Character route keeps the appointed officer cooldown reason visible on ${viewport.name}`,
        await cardHasTexts(page, "Chief Marshal Lysa Venn", [
          "FLATTER",
          "Recently used — wait 8 ticks",
        ]),
      );
    }
    check("Character route keeps the saved cooldown explanation after reload", true);

    await page.goto(fixture("factions", "load"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "FACTIONS / CIVIC & EXTERNAL AFFAIRS");
    await waitForText(page, "The Sector Syndicates");
    await waitForText(page, "Razor Vex");
    await expandFactionMenu(page, "The Sector Syndicates");
    await waitForText(page, "Recently used — wait 7 ticks");
    check("Factions route keeps the saved cooldown explanation after reload", true);

    await page.goto(fixture("character", "cooldown"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "DOSSIER");
    await clickExactText(page, "CIRCLE");
    await waitForText(page, "CIVIC FIGURES");
    await waitForText(page, "Director Mira Vale");
    await waitForText(page, "FLATTER");
    await waitForText(page, "Recently used — wait 8 ticks");
    check("Character route keeps a cooling-down civic action visible with its wait reason", true);

    await page.goto(fixture("factions", "cooldown"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "FACTIONS / CIVIC & EXTERNAL AFFAIRS");
    await waitForText(page, "The Sector Syndicates");
    await waitForText(page, "Razor Vex");
    await expandFactionMenu(page, "The Sector Syndicates");
    await waitForText(page, "FLATTER");
    await waitForText(page, "Recently used — wait 7 ticks");
    check("Factions route keeps a cooling-down rival action visible with its wait reason", true);

    // Seed and save through the existing isolated slot, then replace only
    // that fixture payload with malformed relationship scores. Reloading the
    // diplomacy route exercises unwrap -> migrate -> sanitize -> UI before
    // the paused fixture can run a tick.
    await page.goto(fixture("diplomacy", "save"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "DIPLOMACY TERMINAL");
    await page.waitForFunction(
      (key) => Boolean(window.localStorage.getItem(key)),
      { timeout: 120000 },
      FIXTURE_STORAGE_KEY,
    );
    const savedDiplomacyRaw = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      FIXTURE_STORAGE_KEY,
    );
    const savedDiplomacyState = savedDiplomacyRaw ? decodePersistedState(savedDiplomacyRaw) : null;
    check(
      "malformed diplomacy fixture starts paused before its first tick",
      savedDiplomacyState?.tickPaused === true && savedDiplomacyState?.totalTicks === 120,
    );
    const malformedDiplomacyRaw = savedDiplomacyRaw
      ? corruptRelationshipScores(savedDiplomacyRaw)
      : null;
    if (!malformedDiplomacyRaw) throw new Error("Diplomacy fixture save was empty");
    await page.evaluate(
      ({ key, raw }) => window.localStorage.setItem(key, raw),
      { key: FIXTURE_STORAGE_KEY, raw: malformedDiplomacyRaw },
    );
    const malformedDiplomacyState = decodePersistedState(malformedDiplomacyRaw);
    check(
      "malformed diplomacy fixture contains both damaged entity records",
      malformedDiplomacyState?.externalMegacities?.some((city) => city.id === "terminus-prime") === true &&
        malformedDiplomacyState?.townships?.some((township) => township.id === "dusthaven") === true,
    );

    await page.goto(fixture("diplomacy", "load"), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForText(page, "DIPLOMACY TERMINAL");
    await clickExactText(page, "MEGACITIES");
    await waitForText(page, "Terminus Prime");
    await clickExactText(page, "Terminus Prime");
    await waitForText(page, "INFLUENCE");
    await assertBoundedRelationshipScores(page, "External megacity");

    await clickExactText(page, "SETTLEMENTS");
    await waitForText(page, "Mexico City");
    await clickExactText(page, "Mexico City");
    await waitForText(page, "INFLUENCE");
    await assertBoundedRelationshipScores(page, "Township");
    check("malformed save opens both diplomacy detail screens after reload", true);

    await assertNoPlayerSaveStorage(page);
    check("relationship roster fixture stays browser-error free", browserErrors.length === 0);
  } finally {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

try {
  await run();
} catch (error) {
  console.error(`\nE2E FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (failures.length) {
  console.error(`\nFAILURES:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log("\nPASS: civic and rival relationship browser cases");
}